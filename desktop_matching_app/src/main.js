const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { machineIdSync } = require('node-machine-id');
const {
  normalizeRefString,
  sortByNumericRef,
} = require('./utils/refUtils');

let mainWindow;
let sessionData = null;
let bundleData = null;
let extractedPath = null;
let bundleType = 'legacy'; // 'legacy' or 'hierarchical'
let hierarchyConfig = null; // For hierarchical bundles
let currentSubBundlePath = null; // Track which sub-bundle is currently loaded

function getSessionPath() {
  try {
    return path.join(app.getPath('userData'), 'desktop_matching_session.json');
  } catch {
    return path.join(process.cwd(), 'desktop_matching_session.json');
  }
}

function getExtractedBundlePath() {
  try {
    return path.join(app.getPath('userData'), 'extracted_bundle');
  } catch {
    return path.join(process.cwd(), 'extracted_bundle');
  }
}

function loadSession() {
  const p = getSessionPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    sessionData = JSON.parse(raw);
  } catch {
    sessionData = null;
  }
}

function saveSession() {
  try {
    const p = getSessionPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(sessionData || {}, null, 2), 'utf8');
    console.log('[desktop_matching] Session saved to', p);
  } catch (e) {
    console.warn('Failed to save session:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('public/index.html');
}

app.whenReady().then(() => {
  loadSession();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

ipcMain.handle('select-bundle-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Tone Bundles', extensions: ['tncmp', 'tnset'] },
      { name: 'Legacy Bundle', extensions: ['tncmp'] },
      { name: 'Hierarchical Macro-Bundle', extensions: ['tnset'] },
    ],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('load-bundle', async (event, filePath) => {
  try {
    // Detect bundle type from file extension
    const ext = path.extname(filePath).toLowerCase();
    bundleType = ext === '.tnset' ? 'hierarchical' : 'legacy';
    
    console.log(`[desktop_matching] Loading ${bundleType} bundle from:`, filePath);
    
    if (bundleType === 'hierarchical') {
      return await loadHierarchicalBundle(filePath);
    } else {
      return await loadLegacyBundle(filePath);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

async function loadLegacyBundle(filePath) {
  try {
    const zip = new AdmZip(filePath);
    extractedPath = getExtractedBundlePath();
    
    // Clear old extraction
    if (fs.existsSync(extractedPath)) {
      fs.rmSync(extractedPath, { recursive: true, force: true });
    }
    fs.mkdirSync(extractedPath, { recursive: true });
    
    zip.extractAllTo(extractedPath, true);
    
    // Load settings.json
    const settingsPath = path.join(extractedPath, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Bundle missing settings.json');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    // Find XML file (prefer data_updated.xml for re-imports, else data.xml)
    let xmlPath = path.join(extractedPath, 'data_updated.xml');
    const isReimport = fs.existsSync(xmlPath);
    if (!isReimport) {
      xmlPath = path.join(extractedPath, 'data.xml');
    }
    if (!fs.existsSync(xmlPath)) {
      throw new Error('Bundle missing data.xml');
    }
    
    // Parse XML with encoding detection
    const xmlBuffer = fs.readFileSync(xmlPath);
    const probe = xmlBuffer.slice(0, 200).toString('utf8');
    const declMatch = probe.match(/encoding\s*=\s*"([^"]+)"/i);
    const declared = declMatch ? declMatch[1].toLowerCase() : null;
    let xmlData;
    if ((declared && declared.includes('utf-16')) || probe.includes('\u0000')) {
      xmlData = xmlBuffer.toString('utf16le');
    } else {
      xmlData = xmlBuffer.toString('utf8');
    }
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    const xmlResult = parser.parse(xmlData);
    
    const phonData = xmlResult.phon_data;
    const dataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    // Build bundle data structure
    bundleData = {
      settings,
      records: dataForms,
      extractedPath,
      bundleId: settings.bundleId || null,
      isReimport,
    };
    
    // Check if session matches this bundle
    let needNewSession = true;
    if (sessionData && sessionData.bundleId === bundleData.bundleId) {
      // Session matches, use it
      needNewSession = false;
    }
    
    if (needNewSession) {
      // Create new session
      const queue = dataForms.map(df => normalizeRefString(df.Reference));
      sessionData = {
        bundleId: bundleData.bundleId,
        queue,
        selectedAudioVariantIndex: 0,
        groups: [],
        records: {}, // { [ref]: { userSpelling: string } }
        locale: sessionData?.locale || 'en',
      };
      
      // If reimporting, reconstruct groups from XML tone assignments
      if (isReimport) {
        const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
        const tgIdKey = settings.toneGroupIdElement || 'SurfaceMelodyGroupId';
        const userSpellingKey = settings.userSpellingElement || 'Orthographic';
        
        // Build group map from records
        const groupMap = new Map(); // groupNumber -> { id, members[], image }
        
        dataForms.forEach(record => {
          const ref = normalizeRefString(record.Reference);
          const toneGroup = record[tgKey];
          const groupId = record[tgIdKey];
          
          if (toneGroup) {
            const groupNum = parseInt(toneGroup);
            if (!groupMap.has(groupNum)) {
              groupMap.set(groupNum, {
                id: groupId || `group_reimport_${groupNum}`,
                groupNumber: groupNum,
                members: [],
                image: null,
                additionsSinceReview: 0,
                requiresReview: false,
              });
            }
            groupMap.get(groupNum).members.push(ref);
            
            // Remove from queue
            const qIdx = sessionData.queue.indexOf(ref);
            if (qIdx !== -1) {
              sessionData.queue.splice(qIdx, 1);
            }
          }
          
          // Import user spelling if present
          if (record[userSpellingKey]) {
            sessionData.records[ref] = {
              userSpelling: record[userSpellingKey],
            };
          }
        });
        
        // Convert to array and sort by group number
        sessionData.groups = Array.from(groupMap.values()).sort((a, b) => a.groupNumber - b.groupNumber);
        
        // Try to load images from images/ folder if present
        const imagesPath = path.join(extractedPath, 'images');
        if (fs.existsSync(imagesPath)) {
          sessionData.groups.forEach(group => {
            // Look for image files matching group number pattern
            const files = fs.readdirSync(imagesPath);
            const groupImageFile = files.find(f => 
              f.match(new RegExp(`^(group[_\\s-]?)?${group.groupNumber}[._]`, 'i'))
            );
            if (groupImageFile) {
              group.image = path.join(imagesPath, groupImageFile);
            }
          });
        }
      }
      
      saveSession();
    }
    
    return {
      success: true,
      settings: bundleData.settings,
      recordCount: dataForms.length,
      session: sessionData,
      isReimport,
      importedGroups: isReimport ? sessionData.groups.length : 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function loadHierarchicalBundle(filePath) {
  try {
    const zip = new AdmZip(filePath);
    extractedPath = getExtractedBundlePath();
    
    // Clear old extraction
    if (fs.existsSync(extractedPath)) {
      fs.rmSync(extractedPath, { recursive: true, force: true });
    }
    fs.mkdirSync(extractedPath, { recursive: true });
    
    zip.extractAllTo(extractedPath, true);
    
    // Load manifest.json
    const manifestPath = path.join(extractedPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Hierarchical bundle missing manifest.json');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Verify it's a hierarchical bundle
    if (manifest.bundleType !== 'hierarchical') {
      throw new Error('Invalid bundle type in manifest');
    }
    
    // Load hierarchy.json
    const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
    if (!fs.existsSync(hierarchyPath)) {
      throw new Error('Hierarchical bundle missing hierarchy.json');
    }
    hierarchyConfig = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
    
    // Load settings.json
    const settingsPath = path.join(extractedPath, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Bundle missing settings.json');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    // Build sub-bundle list
    const subBundlesDir = path.join(extractedPath, 'sub_bundles');
    const subBundles = [];
    
    if (fs.existsSync(subBundlesDir)) {
      const scanSubBundles = (dir, pathPrefix = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
            const subDir = path.join(dir, entry.name);
            const metadataPath = path.join(subDir, 'metadata.json');
            
            if (fs.existsSync(metadataPath)) {
              // This is a leaf sub-bundle
              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
              subBundles.push({
                path: subPath,
                categoryPath: metadata.categoryPath || subPath,
                recordCount: metadata.recordCount || 0,
                audioConfig: metadata.audioConfig || { includeAudio: true, suffix: '' },
                fullPath: subDir,
              });
            } else {
              // Recurse into subdirectory
              scanSubBundles(subDir, subPath);
            }
          }
        }
      };
      
      scanSubBundles(subBundlesDir);
    }
    
    console.log(`[desktop_matching] Found ${subBundles.length} sub-bundles in hierarchical bundle`);
    
    // Build bundle data structure
    bundleData = {
      settings,
      manifest,
      hierarchy: hierarchyConfig,
      subBundles,
      extractedPath,
      bundleId: settings.bundleId || manifest.bundleId || null,
      bundleType: 'hierarchical',
    };
    
    // Check if session matches this bundle
    let needNewSession = true;
    if (sessionData && sessionData.bundleId === bundleData.bundleId && sessionData.bundleType === 'hierarchical') {
      // Session matches, use it
      needNewSession = false;
    }
    
    if (needNewSession) {
      // Create new session for hierarchical bundle
      sessionData = {
        bundleId: bundleData.bundleId,
        bundleType: 'hierarchical',
        hierarchyConfig: hierarchyConfig,
        subBundles: subBundles.map(sb => ({
          path: sb.path,
          categoryPath: sb.categoryPath,
          recordCount: sb.recordCount,
          assignedCount: 0,
          reviewed: false,
          queue: [],
          groups: [],
        })),
        currentSubBundle: null, // null means navigation screen
        selectedAudioVariantIndex: 0,
        records: {}, // { [ref]: { userSpelling: string, ... } }
        locale: sessionData?.locale || 'en',
      };
      
      saveSession();
    }
    
    return {
      success: true,
      bundleType: 'hierarchical',
      settings: bundleData.settings,
      manifest: manifest,
      hierarchy: hierarchyConfig,
      subBundleCount: subBundles.length,
      session: sessionData,
      requiresNavigation: true, // Signal to UI to show navigation screen
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

ipcMain.handle('get-current-word', async () => {
  if (!bundleData || !sessionData) {
    return null;
  }
  
  // For hierarchical bundles, check if we're in a sub-bundle
  if (bundleType === 'hierarchical' && !sessionData.currentSubBundle) {
    return null; // No current word when in navigation view
  }
  
  if (sessionData.queue.length === 0) {
    return null;
  }
  
  const ref = sessionData.queue[0];
  const record = bundleData.records.find(r => normalizeRefString(r.Reference) === ref);
  if (!record) return null;
  
  // Merge with user edits
  const edits = sessionData.records[ref] || {};
  return { ...record, ...edits };
});

ipcMain.handle('get-session', async () => {
  return sessionData;
});

ipcMain.handle('update-session', async (event, updates) => {
  if (!sessionData) return null;
  
  // Apply updates
  if (updates.selectedAudioVariantIndex != null) {
    sessionData.selectedAudioVariantIndex = updates.selectedAudioVariantIndex;
  }
  if (updates.queue) {
    sessionData.queue = updates.queue;
  }
  if (updates.groups) {
    sessionData.groups = updates.groups;
  }
  if (updates.records) {
    sessionData.records = { ...sessionData.records, ...updates.records };
  }
  if (updates.locale) {
    sessionData.locale = updates.locale;
  }
  
  // For hierarchical bundles, also update the current sub-bundle session
  if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
    const subBundleSession = sessionData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
    if (subBundleSession) {
      if (updates.queue) {
        subBundleSession.queue = [...updates.queue];
      }
      if (updates.groups) {
        subBundleSession.groups = updates.groups.map(g => ({ ...g }));
      }
      // Update assigned count
      const totalRecords = subBundleSession.recordCount;
      subBundleSession.assignedCount = totalRecords - subBundleSession.queue.length;
    }
  }
  
  saveSession();
  return sessionData;
});

ipcMain.handle('confirm-spelling', async (event, ref, userSpelling) => {
  if (!sessionData) return null;
  
  if (!sessionData.records[ref]) {
    sessionData.records[ref] = {};
  }
  sessionData.records[ref].userSpelling = userSpelling;
  
  saveSession();
  return sessionData;
});

ipcMain.handle('add-word-to-group', async (event, ref, groupId) => {
  if (!sessionData) return null;
  
  // Remove from queue
  sessionData.queue = sessionData.queue.filter(r => r !== ref);
  
  // Add to group
  const group = sessionData.groups.find(g => g.id === groupId);
  if (group) {
    if (!group.members) group.members = [];
    if (!group.members.includes(ref)) {
      group.members.push(ref);
      group.additionsSinceReview = (group.additionsSinceReview || 0) + 1;
    }
  }
  
  saveSession();
  return sessionData;
});

ipcMain.handle('remove-word-from-group', async (event, ref, groupId) => {
  if (!sessionData) return null;
  
  // Remove from group
  const group = sessionData.groups.find(g => g.id === groupId);
  if (group) {
    group.members = (group.members || []).filter(m => m !== ref);
  }
  
  // Add to front of queue
  if (!sessionData.queue.includes(ref)) {
    sessionData.queue.unshift(ref);
  }
  
  saveSession();
  return sessionData;
});

ipcMain.handle('create-group', async (event, groupData) => {
  if (!sessionData) return null;
  
  const newGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    groupNumber: sessionData.groups.length + 1,
    image: groupData.image || null,
    additionsSinceReview: 0,
    requiresReview: false,
    members: [],
  };
  
  sessionData.groups.push(newGroup);
  saveSession();
  return newGroup;
});

ipcMain.handle('update-group', async (event, groupId, updates) => {
  if (!sessionData) return null;
  
  const group = sessionData.groups.find(g => g.id === groupId);
  if (group) {
    if (updates.image !== undefined) group.image = updates.image;
    if (updates.additionsSinceReview !== undefined) group.additionsSinceReview = updates.additionsSinceReview;
    if (updates.requiresReview !== undefined) group.requiresReview = updates.requiresReview;
    
    // Enhanced group fields
    if (updates.pitchTranscription !== undefined) group.pitchTranscription = updates.pitchTranscription;
    if (updates.toneAbbreviation !== undefined) group.toneAbbreviation = updates.toneAbbreviation;
    if (updates.exemplarWord !== undefined) group.exemplarWord = updates.exemplarWord;
    if (updates.exemplarWordRef !== undefined) group.exemplarWordRef = updates.exemplarWordRef;
  }
  
  saveSession();
  return sessionData;
});

ipcMain.handle('select-image-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-audio-path', async (event, soundFile, suffix) => {
  if (!extractedPath) return null;
  
  const audioDir = path.join(extractedPath, 'audio');
  if (!fs.existsSync(audioDir)) return null;
  
  // Try with suffix first
  let fileName = soundFile;
  if (suffix && suffix !== '') {
    const lastDot = soundFile.lastIndexOf('.');
    if (lastDot !== -1) {
      fileName = soundFile.substring(0, lastDot) + suffix + soundFile.substring(lastDot);
    } else {
      fileName = soundFile + suffix;
    }
  }

  const candidates = new Set();
  const addCandidate = (name) => candidates.add(name);
  const replaceExt = (name, newExt) => {
    const i = name.lastIndexOf('.');
    return i === -1 ? `${name}${newExt}` : `${name.substring(0, i)}${newExt}`;
  };

  // Primary candidates
  addCandidate(fileName);
  addCandidate(soundFile);

  // Extension fallbacks (support FLAC-processed bundles)
  const maybeFlac1 = replaceExt(fileName, '.flac');
  const maybeFlac2 = replaceExt(soundFile, '.flac');
  addCandidate(maybeFlac1);
  addCandidate(maybeFlac2);

  // Try exact matches first
  for (const name of candidates) {
    const p = path.join(audioDir, name);
    if (fs.existsSync(p)) return p;
  }

  // Case-insensitive lookup across all candidates
  try {
    const files = fs.readdirSync(audioDir);
    const lowerSet = new Set(Array.from(candidates).map((n) => n.toLowerCase()));
    const match = files.find((f) => lowerSet.has(f.toLowerCase()));
    if (match) return path.join(audioDir, match);
  } catch {}

  return null;
});

ipcMain.handle('get-record-by-ref', async (event, ref) => {
  if (!bundleData) return null;
  
  const record = bundleData.records.find(r => normalizeRefString(r.Reference) === ref);
  if (!record) return null;
  
  // Merge with user edits
  const edits = sessionData?.records?.[ref] || {};
  return { ...record, ...edits };
});

ipcMain.handle('reset-session', async () => {
  if (!bundleData || !sessionData) {
    return { success: false, error: 'No active session' };
  }
  
  // Confirm dialog
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Reset'],
    defaultId: 0,
    title: 'Reset Session',
    message: 'Are you sure you want to reset all tone groupings?',
    detail: 'This will clear all groups and start over. This action cannot be undone.',
  });
  
  if (result.response !== 1) {
    return { success: false, cancelled: true };
  }
  
  // Reset session but keep bundle and locale
  const queue = bundleData.records.map(df => normalizeRefString(df.Reference));
  sessionData = {
    bundleId: bundleData.bundleId,
    queue,
    selectedAudioVariantIndex: sessionData.selectedAudioVariantIndex || 0,
    groups: [],
    records: {},
    locale: sessionData.locale || 'en',
  };
  
  saveSession();
  
  return {
    success: true,
    session: sessionData,
  };
});

// Hierarchical bundle IPC handlers

ipcMain.handle('get-hierarchy', async () => {
  if (bundleType !== 'hierarchical' || !bundleData) {
    return null;
  }
  
  return {
    hierarchy: bundleData.hierarchy,
    subBundles: sessionData?.subBundles || bundleData.subBundles,
    currentSubBundle: sessionData?.currentSubBundle || null,
  };
});

ipcMain.handle('load-sub-bundle', async (event, subBundlePath) => {
  try {
    if (bundleType !== 'hierarchical' || !bundleData) {
      throw new Error('Not a hierarchical bundle');
    }
    
    // Find sub-bundle
    const subBundle = bundleData.subBundles.find(sb => sb.path === subBundlePath);
    if (!subBundle) {
      throw new Error(`Sub-bundle not found: ${subBundlePath}`);
    }
    
    // Find XML file (prefer data_updated.xml for re-imports, else data.xml)
    let xmlPath = path.join(subBundle.fullPath, 'data_updated.xml');
    const isReimport = fs.existsSync(xmlPath);
    if (!isReimport) {
      xmlPath = path.join(subBundle.fullPath, 'data.xml');
    }
    if (!fs.existsSync(xmlPath)) {
      throw new Error('Sub-bundle missing data.xml');
    }
    
    // Parse XML with encoding detection
    const xmlBuffer = fs.readFileSync(xmlPath);
    const probe = xmlBuffer.slice(0, 200).toString('utf8');
    const declMatch = probe.match(/encoding\s*=\s*"([^"]+)"/i);
    const declared = declMatch ? declMatch[1].toLowerCase() : null;
    let xmlData;
    if ((declared && declared.includes('utf-16')) || probe.includes('\u0000')) {
      xmlData = xmlBuffer.toString('utf16le');
    } else {
      xmlData = xmlBuffer.toString('utf8');
    }
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    const xmlResult = parser.parse(xmlData);
    
    const phonData = xmlResult.phon_data;
    const dataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    // Update bundleData with current sub-bundle records
    bundleData.records = dataForms;
    bundleData.currentSubBundlePath = subBundlePath;
    currentSubBundlePath = subBundlePath;
    
    // Update or create session data for this sub-bundle
    const subBundleSession = sessionData.subBundles.find(sb => sb.path === subBundlePath);
    if (!subBundleSession) {
      throw new Error('Sub-bundle session not found');
    }
    
    // Check if this sub-bundle has been loaded before
    if (!subBundleSession.queue || subBundleSession.queue.length === 0) {
      // First time loading - initialize queue and groups
      const queue = dataForms.map(df => normalizeRefString(df.Reference));
      subBundleSession.queue = queue;
      subBundleSession.groups = [];
      
      // If reimporting, reconstruct groups from XML tone assignments
      if (isReimport) {
        const tgKey = bundleData.settings.toneGroupElement || 'SurfaceMelodyGroup';
        const tgIdKey = bundleData.settings.toneGroupIdElement || 'SurfaceMelodyGroupId';
        const userSpellingKey = bundleData.settings.userSpellingElement || 'Orthographic';
        
        // Build group map from records
        const groupMap = new Map();
        
        dataForms.forEach(record => {
          const ref = normalizeRefString(record.Reference);
          const toneGroup = record[tgKey];
          const groupId = record[tgIdKey];
          
          if (toneGroup) {
            const groupNum = parseInt(toneGroup);
            if (!groupMap.has(groupNum)) {
              groupMap.set(groupNum, {
                id: groupId || `group_reimport_${subBundlePath}_${groupNum}`,
                groupNumber: groupNum,
                members: [],
                image: null,
                additionsSinceReview: 0,
                requiresReview: false,
              });
            }
            groupMap.get(groupNum).members.push(ref);
            
            // Remove from queue
            const qIdx = subBundleSession.queue.indexOf(ref);
            if (qIdx !== -1) {
              subBundleSession.queue.splice(qIdx, 1);
            }
          }
          
          // Import user spelling if present
          if (record[userSpellingKey]) {
            if (!sessionData.records[ref]) {
              sessionData.records[ref] = {};
            }
            sessionData.records[ref].userSpelling = record[userSpellingKey];
          }
        });
        
        // Convert to array and sort by group number
        subBundleSession.groups = Array.from(groupMap.values()).sort((a, b) => a.groupNumber - b.groupNumber);
        
        // Try to load images from images/ folder if present
        const imagesPath = path.join(subBundle.fullPath, 'images');
        if (fs.existsSync(imagesPath)) {
          subBundleSession.groups.forEach(group => {
            // Look for image files matching group number pattern
            const files = fs.readdirSync(imagesPath);
            const groupImageFile = files.find(f => 
              f.match(new RegExp(`^(group[_\\s-]?)?${group.groupNumber}[._]`, 'i'))
            );
            if (groupImageFile) {
              group.image = path.join(imagesPath, groupImageFile);
            }
          });
        }
      }
      
      // Update assigned count
      const assignedCount = dataForms.length - subBundleSession.queue.length;
      subBundleSession.assignedCount = assignedCount;
    }
    
    // Set current sub-bundle in session
    sessionData.currentSubBundle = subBundlePath;
    
    // Create compatibility layer - populate session.queue and session.groups from current sub-bundle
    sessionData.queue = [...subBundleSession.queue];
    sessionData.groups = subBundleSession.groups.map(g => ({ ...g }));
    
    saveSession();
    
    return {
      success: true,
      subBundle: {
        path: subBundlePath,
        categoryPath: subBundle.categoryPath,
        recordCount: dataForms.length,
        audioConfig: subBundle.audioConfig,
      },
      recordCount: dataForms.length,
      session: sessionData,
      isReimport,
      importedGroups: isReimport ? subBundleSession.groups.length : 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('get-sub-bundle-progress', async () => {
  if (bundleType !== 'hierarchical' || !sessionData) {
    return null;
  }
  
  return {
    subBundles: sessionData.subBundles,
    currentSubBundle: sessionData.currentSubBundle,
  };
});

ipcMain.handle('navigate-to-hierarchy', async () => {
  if (bundleType !== 'hierarchical' || !sessionData) {
    return { success: false, error: 'Not a hierarchical bundle' };
  }
  
  // Save current sub-bundle state back to session if we were in one
  if (sessionData.currentSubBundle) {
    const subBundleSession = sessionData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
    if (subBundleSession) {
      subBundleSession.queue = [...sessionData.queue];
      subBundleSession.groups = sessionData.groups.map(g => ({ ...g }));
      
      // Update assigned count
      const totalRecords = subBundleSession.recordCount;
      subBundleSession.assignedCount = totalRecords - subBundleSession.queue.length;
    }
  }
  
  // Clear current sub-bundle
  sessionData.currentSubBundle = null;
  currentSubBundlePath = null;
  bundleData.currentSubBundlePath = null;
  
  saveSession();
  
  return {
    success: true,
    hierarchy: bundleData.hierarchy,
    subBundles: sessionData.subBundles,
  };
});

ipcMain.handle('export-bundle', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Tone Bundle', extensions: ['zip'] },
    ],
    defaultPath: 'tone_matching_result.zip',
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Export cancelled' };
  }

  try {
    const outputPath = result.filePath;
    
    // Build updated XML
    const tgKey = bundleData.settings.toneGroupElement || 'SurfaceMelodyGroup';
    const tgIdKey = bundleData.settings.toneGroupIdElement || 'SurfaceMelodyGroupId';
    const userSpellingKey = bundleData.settings.userSpellingElement || 'Orthographic';
    
    // Create a map of ref -> tone group data
    const refToGroup = new Map();
    sessionData.groups.forEach(group => {
      (group.members || []).forEach(ref => {
        refToGroup.set(ref, {
          groupNumber: group.groupNumber,
          groupId: group.id,
        });
      });
    });
    
    // Update records with tone group assignments and user spelling
    const updatedRecords = bundleData.records.map(record => {
      const ref = normalizeRefString(record.Reference);
      const updated = { ...record };
      
      // Apply user spelling if present
      const edits = sessionData.records[ref];
      if (edits && edits.userSpelling) {
        updated[userSpellingKey] = edits.userSpelling;
      }
      
      // Apply tone group assignment if present
      const groupData = refToGroup.get(ref);
      if (groupData) {
        updated[tgKey] = String(groupData.groupNumber);
        updated[tgIdKey] = groupData.groupId;
      }
      
      return updated;
    });
    
    // Build XML
    const escapeXml = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const buildDataForm = (rec) => {
      const keys = Object.keys(rec).filter((k) => !k.startsWith('@_'));
      const parts = [];
      for (const k of keys) {
        const v = rec[k];
        if (v == null) continue;
        parts.push(`  <${k}>${escapeXml(v)}</${k}>`);
      }
      return ['<data_form>', ...parts, '</data_form>'].join('\n');
    };

    const updatedXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<phon_data>',
      ...updatedRecords.map((r) => buildDataForm(r)),
      '</phon_data>',
      '',
    ].join('\n');
    
    // Read original XML
    let originalXmlPath = path.join(extractedPath, 'data.xml');
    const originalXml = fs.readFileSync(originalXmlPath, 'utf8');
    
    // Get unique machine ID
    let machineId;
    try {
      machineId = machineIdSync();
    } catch (error) {
      console.error('Failed to get machine ID:', error);
      machineId = 'unknown-desktop';
    }
    
    // Create meta.json
    const meta = {
      bundleId: bundleData.bundleId,
      bundleDescription: bundleData.settings.bundleDescription || '',
      generatedAt: new Date().toISOString(),
      platform: 'desktop',
      deviceId: machineId,
    };
    
    // Create archive
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    
    // Add XML files
    archive.append(originalXml, { name: 'data.xml' });
    archive.append(updatedXml, { name: 'data_updated.xml' });
    
    // Add meta.json
    archive.append(JSON.stringify(meta, null, 2), { name: 'meta.json' });
    
    // Add updated settings (with legacy audioFileSuffix)
    const exportSettings = { ...bundleData.settings };
    if (Array.isArray(exportSettings.audioFileVariants) && exportSettings.audioFileVariants.length > 0) {
      const firstSuf = exportSettings.audioFileVariants[0]?.suffix || '';
      exportSettings.audioFileSuffix = firstSuf === '' ? null : firstSuf;
    }
    archive.append(JSON.stringify(exportSettings, null, 2), { name: 'settings.json' });
    
    // Add images folder with exemplar images
    const imagesDir = path.join(extractedPath, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Copy group images to images folder
    for (const group of sessionData.groups) {
      if (group.image && fs.existsSync(group.image)) {
        const imageName = `group_${group.groupNumber}${path.extname(group.image)}`;
        const destPath = path.join(imagesDir, imageName);
        fs.copyFileSync(group.image, destPath);
        archive.file(destPath, { name: `images/${imageName}` });
      }
    }
    
    await archive.finalize();
    
    return { success: true, outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
