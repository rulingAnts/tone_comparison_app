const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { v4: uuidv4 } = require('uuid');
const { normalizeRefString, sortByNumericRef } = require('../src/utils/refUtils');
const { ChangeTracker } = require('../src/utils/changeTracker');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// In-memory session storage (replace with Redis in production)
const sessions = new Map();
const changeTrackers = new Map();

// Helper to get/create session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      bundleId: null,
      bundleType: 'legacy',
      locale: 'en',
      groups: [],
      showReferenceNumbers: true,
      selectedAudioVariantIndex: 0,
      currentWordIndex: 0,
      bundleData: null,
      extractedPath: null,
      hierarchyConfig: null,
      currentSubBundlePath: null
    });
    changeTrackers.set(sessionId, new ChangeTracker());
  }
  return sessions.get(sessionId);
}

// Get session
router.get('/session', (req, res) => {
  const sessionId = req.headers['x-session-id'] || uuidv4();
  const session = getSession(sessionId);
  res.json({ ...session, sessionId });
});

// Update session
router.patch('/session', express.json(), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  Object.assign(session, req.body);
  res.json({ success: true, session });
});

// Reset session
router.post('/session/reset', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const newSession = {
    sessionId,
    bundleId: null,
    bundleType: 'legacy',
    locale: session.locale || 'en',
    groups: [],
    showReferenceNumbers: true,
    selectedAudioVariantIndex: 0,
    currentWordIndex: 0,
    bundleData: null,
    extractedPath: null,
    hierarchyConfig: null,
    currentSubBundlePath: null
  };
  sessions.set(sessionId, newSession);
  changeTrackers.set(sessionId, new ChangeTracker());
  
  res.json({ success: true, session: newSession });
});

// Load bundle file
router.post('/bundle/load', upload.single('bundle'), async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  try {
    const session = getSession(sessionId);
    const bundlePath = req.file.path;
    const zip = new AdmZip(bundlePath);
    
    // Extract to session-specific directory
    const extractPath = path.join('uploads', 'extracted', sessionId);
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true });
    }
    zip.extractAllTo(extractPath, true);
    
    // Check bundle type
    const xmlFolder = path.join(extractPath, 'xml');
    const audioFolder = path.join(extractPath, 'audio');
    const hierarchyPath = path.join(extractPath, 'hierarchy.json');
    const settingsPath = path.join(extractPath, 'settings.json');
    
    let bundleType = 'legacy';
    let hierarchyConfig = null;
    let bundleData = null;
    
    if (fs.existsSync(hierarchyPath) && fs.existsSync(xmlFolder) && fs.existsSync(audioFolder)) {
      // Hierarchical bundle
      bundleType = 'hierarchical';
      hierarchyConfig = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
      
      session.bundleType = bundleType;
      session.hierarchyConfig = hierarchyConfig;
      session.extractedPath = extractPath;
      session.bundleId = path.basename(bundlePath, '.tnset');
      
      // Load settings if available
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        session.groups = settings.groups || [];
      }
      
      res.json({
        success: true,
        bundleType: 'hierarchical',
        hierarchy: hierarchyConfig,
        session
      });
    } else {
      // Legacy bundle
      const xmlPath = path.join(extractPath, 'tone_matching_data.xml');
      if (!fs.existsSync(xmlPath)) {
        return res.status(400).json({ error: 'Invalid bundle: missing tone_matching_data.xml' });
      }
      
      const xmlContent = fs.readFileSync(xmlPath, 'utf8');
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const parsed = parser.parse(xmlContent);
      bundleData = parsed.ToneMatchingData?.Records || [];
      if (!Array.isArray(bundleData)) {
        bundleData = [bundleData];
      }
      
      session.bundleType = 'legacy';
      session.bundleData = bundleData;
      session.extractedPath = extractPath;
      session.bundleId = path.basename(bundlePath, '.tnset');
      session.currentWordIndex = 0;
      
      // Load settings if available
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        session.groups = settings.groups || [];
      }
      
      res.json({
        success: true,
        bundleType: 'legacy',
        wordCount: bundleData.length,
        session
      });
    }
    
    // Cleanup uploaded file
    fs.unlinkSync(bundlePath);
  } catch (error) {
    console.error('Error loading bundle:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current word
router.get('/word/current', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  if (!session.bundleData || session.bundleData.length === 0) {
    return res.status(400).json({ error: 'No bundle loaded' });
  }
  
  const word = session.bundleData[session.currentWordIndex];
  res.json({ word, index: session.currentWordIndex, total: session.bundleData.length });
});

// Get record by reference
router.get('/record/:ref', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const ref = req.params.ref;
  
  if (session.bundleType === 'hierarchical' && session.currentSubBundlePath) {
    // Load from sub-bundle
    const xmlPath = path.join(session.extractedPath, session.currentSubBundlePath, 'tone_matching_data.xml');
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const parsed = parser.parse(xmlContent);
    let records = parsed.ToneMatchingData?.Records || [];
    if (!Array.isArray(records)) records = [records];
    
    const record = records.find(r => normalizeRefString(r.Ref) === normalizeRefString(ref));
    return res.json({ record });
  }
  
  const record = session.bundleData?.find(r => normalizeRefString(r.Ref) === normalizeRefString(ref));
  res.json({ record });
});

// Confirm spelling
router.post('/word/confirm-spelling', express.json(), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { ref, userSpelling } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const changeTracker = changeTrackers.get(sessionId);
  
  if (session.bundleType === 'hierarchical' && session.currentSubBundlePath) {
    const xmlPath = path.join(session.extractedPath, session.currentSubBundlePath, 'tone_matching_data.xml');
    const xmlContent = fs.readFileSync(xmlPath, 'utf8');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const parsed = parser.parse(xmlContent);
    let records = parsed.ToneMatchingData?.Records || [];
    if (!Array.isArray(records)) records = [records];
    
    const record = records.find(r => normalizeRefString(r.Ref) === normalizeRefString(ref));
    if (record) {
      const oldValue = record.Lexeme;
      record.Lexeme = userSpelling;
      changeTracker.pushChange({
        type: 'spelling',
        ref,
        subBundle: session.currentSubBundlePath,
        oldValue,
        newValue: userSpelling
      });
      
      // Save back
      const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', format: true });
      const newXml = builder.build(parsed);
      fs.writeFileSync(xmlPath, newXml, 'utf8');
    }
  } else {
    const record = session.bundleData?.find(r => normalizeRefString(r.Ref) === normalizeRefString(ref));
    if (record) {
      const oldValue = record.Lexeme;
      record.Lexeme = userSpelling;
      changeTracker.pushChange({
        type: 'spelling',
        ref,
        oldValue,
        newValue: userSpelling
      });
    }
  }
  
  res.json({ success: true });
});

// Create group
router.post('/groups', express.json(), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const groupId = uuidv4();
  const newGroup = {
    id: groupId,
    words: [],
    image: req.body.image || null,
    requiresReview: false,
    ...req.body
  };
  
  session.groups.push(newGroup);
  res.json({ success: true, group: newGroup });
});

// Update group
router.patch('/groups/:groupId', express.json(), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { groupId } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const group = session.groups.find(g => g.id === groupId);
  
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  Object.assign(group, req.body);
  res.json({ success: true, group });
});

// Add word to group
router.post('/groups/:groupId/words', express.json(), (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { groupId } = req.params;
  const { ref } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const changeTracker = changeTrackers.get(sessionId);
  const group = session.groups.find(g => g.id === groupId);
  
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  // Remove from other groups
  session.groups.forEach(g => {
    const idx = g.words.indexOf(ref);
    if (idx !== -1) {
      g.words.splice(idx, 1);
    }
  });
  
  // Add to target group
  if (!group.words.includes(ref)) {
    group.words.push(ref);
    changeTracker.pushChange({
      type: 'grouping',
      ref,
      groupId,
      action: 'add'
    });
  }
  
  res.json({ success: true, group });
});

// Remove word from group
router.delete('/groups/:groupId/words/:ref', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { groupId, ref } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  const changeTracker = changeTrackers.get(sessionId);
  const group = session.groups.find(g => g.id === groupId);
  
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  
  const idx = group.words.indexOf(ref);
  if (idx !== -1) {
    group.words.splice(idx, 1);
    changeTracker.pushChange({
      type: 'grouping',
      ref,
      groupId,
      action: 'remove'
    });
  }
  
  res.json({ success: true, group });
});

// Get audio file
router.get('/audio/:soundFile', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const { soundFile } = req.params;
  const { suffix } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const session = getSession(sessionId);
  if (!session.extractedPath) {
    return res.status(400).json({ error: 'No bundle loaded' });
  }
  
  let audioPath;
  if (session.bundleType === 'hierarchical' && session.currentSubBundlePath) {
    audioPath = path.join(session.extractedPath, session.currentSubBundlePath, 'audio', soundFile);
  } else {
    audioPath = path.join(session.extractedPath, 'audio', soundFile);
  }
  
  if (suffix && audioPath.endsWith('.wav')) {
    audioPath = audioPath.replace('.wav', `${suffix}.wav`);
  }
  
  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }
  
  res.sendFile(path.resolve(audioPath));
});

// Export bundle
router.post('/bundle/export', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  try {
    const session = getSession(sessionId);
    if (!session.extractedPath) {
      return res.status(400).json({ error: 'No bundle loaded' });
    }
    
    // Update settings.json with groups
    const settingsPath = path.join(session.extractedPath, 'settings.json');
    const settings = {
      groups: session.groups,
      bundleId: session.bundleId,
      exportDate: new Date().toISOString()
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    // Create zip
    const outputPath = path.join('uploads', 'exports', `${session.bundleId}_modified.tnset`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    archive.directory(session.extractedPath, false);
    await archive.finalize();
    
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    
    res.download(outputPath, `${session.bundleId}_modified.tnset`);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Undo/Redo
router.post('/undo', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const changeTracker = changeTrackers.get(sessionId);
  const change = changeTracker.undo();
  
  if (change) {
    // Apply undo logic
    res.json({ success: true, change });
  } else {
    res.json({ success: false, message: 'Nothing to undo' });
  }
});

router.post('/redo', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const changeTracker = changeTrackers.get(sessionId);
  const change = changeTracker.redo();
  
  if (change) {
    // Apply redo logic
    res.json({ success: true, change });
  } else {
    res.json({ success: false, message: 'Nothing to redo' });
  }
});

router.get('/undo-redo-state', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const changeTracker = changeTrackers.get(sessionId);
  res.json({
    canUndo: changeTracker.canUndo(),
    canRedo: changeTracker.canRedo()
  });
});

module.exports = router;
