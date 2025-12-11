/**
 * Tone Matching IPC Handlers
 * Ported from desktop_matching_app to unified_desktop_app
 */

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const { normalizeRefString } = require('./utils/refUtils');

let changeTracker, ChangeTracker;
try {
  const ct = require('./utils/changeTracker');
  changeTracker = ct.changeTracker;
  ChangeTracker = ct.ChangeTracker;
} catch (e) {
  console.warn('[matching-handlers] changeTracker not available:', e.message);
  // Stub
  changeTracker = {
    initialize: () => {},
    logSpellingChange: () => {},
    logToneGroupAssignment: () => {},
    logToneGroupRemoval: () => {},
    logFieldChange: () => {},
  };
  ChangeTracker = { loadChangeHistory: () => [] };
}

/**
 * Initialize tone matching handlers
 * @param {Object} state - Shared state object containing:
 *   - mainWindow, sessionData, bundleData, extractedPath, bundleType, hierarchyConfig, currentSubBundlePath
 *   - saveSession, findMostCommonGroupMetadata functions
 * @param {Electron.App} app - Electron app instance
 */
function initializeMatchingHandlers(state, app) {
  
  // ============================================================================
  // Bundle Loading
  // ============================================================================
  
  ipcMain.handle('load-bundle', async (event, filePath) => {
    try {
      // Detect bundle type from file extension
      const ext = path.extname(filePath).toLowerCase();
      state.bundleType = ext === '.tnset' ? 'hierarchical' : 'legacy';
      
      console.log(`[load-bundle] Loading ${state.bundleType} bundle from:`, filePath);
      
      if (state.bundleType === 'hierarchical') {
        return await loadHierarchicalBundle(filePath, state, app);
      } else {
        return await loadLegacyBundle(filePath, state, app);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  });
  
  // ============================================================================
  // Session Management
  // ============================================================================
  
  ipcMain.handle('get-current-word', async () => {
    if (!state.bundleData || !state.sessionData) {
      return null;
    }
    
    if (state.bundleType === 'hierarchical' && !state.sessionData.currentSubBundle) {
      return null;
    }
    
    if (state.sessionData.queue.length === 0) {
      return null;
    }
    
    const ref = state.sessionData.queue[0];
    const recordsList = state.bundleData.records || state.bundleData.allDataForms || [];
    const record = recordsList.find(r => normalizeRefString(r.Reference) === ref);
    if (!record) return null;
    
    const edits = state.sessionData.records[ref] || {};
    return { ...record, ...edits };
  });
  
  ipcMain.handle('get-session', async () => {
    return state.sessionData;
  });
  
  ipcMain.handle('check-restored-bundle', async () => {
    if (!state.bundleData || !state.sessionData) {
      return { restored: false };
    }
    
    const result = {
      restored: true,
      bundleType: state.bundleType,
      settings: state.bundleData.settings,
      session: state.sessionData,
    };
    
    if (state.bundleType === 'hierarchical') {
      result.hierarchy = state.bundleData.hierarchy;
      result.subBundleCount = state.bundleData.subBundles?.length || 0;
      result.requiresNavigation = !state.sessionData.currentSubBundle;
    } else {
      result.recordCount = state.bundleData.records?.length || 0;
    }
    
    return result;
  });
  
  ipcMain.handle('update-session', async (event, updates) => {
    if (!state.sessionData) return null;
    
    if (updates.selectedAudioVariantIndex != null) {
      state.sessionData.selectedAudioVariantIndex = updates.selectedAudioVariantIndex;
    }
    if (updates.queue) {
      state.sessionData.queue = updates.queue;
    }
    if (updates.groups) {
      state.sessionData.groups = updates.groups;
    }
    if (updates.records) {
      state.sessionData.records = { ...state.sessionData.records, ...updates.records };
    }
    if (updates.locale) {
      state.sessionData.locale = updates.locale;
    }
    
    if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle) {
      const subBundleSession = state.sessionData.subBundles.find(sb => sb.path === state.sessionData.currentSubBundle);
      if (subBundleSession) {
        if (updates.queue) {
          subBundleSession.queue = [...updates.queue];
        }
        if (updates.groups) {
          subBundleSession.groups = updates.groups.map(g => ({ ...g }));
        }
        const totalRecords = subBundleSession.recordCount;
        subBundleSession.assignedCount = totalRecords - subBundleSession.queue.length;
      }
    }
    
    state.saveSession();
    return state.sessionData;
  });
  
  // ============================================================================
  // Word Management
  // ============================================================================
  
  ipcMain.handle('confirm-spelling', async (event, ref, userSpelling) => {
    if (!state.sessionData) return null;
    
    const oldSpelling = state.sessionData.records[ref]?.userSpelling || '';
    
    if (!state.sessionData.records[ref]) {
      state.sessionData.records[ref] = {};
    }
    state.sessionData.records[ref].userSpelling = userSpelling;
    
    if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle && oldSpelling !== userSpelling) {
      const settings = state.bundleData?.settings || {};
      const fieldName = settings.userSpellingElement || 'Orthographic';
      changeTracker.logSpellingChange(
        state.sessionData.currentSubBundle,
        ref,
        fieldName,
        oldSpelling,
        userSpelling
      );
    }
    
    state.saveSession();
    return state.sessionData;
  });
  
  ipcMain.handle('toggle-word-flag', async (event, ref, flagged) => {
    if (!state.sessionData) return null;
    
    if (!state.sessionData.records[ref]) {
      state.sessionData.records[ref] = {};
    }
    state.sessionData.records[ref].flagged = flagged;
    
    state.saveSession();
    return state.sessionData;
  });
  
  ipcMain.handle('get-record-by-ref', async (event, ref) => {
    if (!state.bundleData) return null;
    
    const recordsList = state.bundleData.records || state.bundleData.allDataForms || [];
    const record = recordsList.find(r => normalizeRefString(r.Reference) === ref);
    if (!record) return null;
    
    const edits = state.sessionData?.records?.[ref] || {};
    return { ...record, ...edits };
  });
  
  // ============================================================================
  // Group Management
  // ============================================================================
  
  ipcMain.handle('add-word-to-group', async (event, ref, groupId) => {
    if (!state.sessionData) return null;
    
    const oldGroup = state.sessionData.groups.find(g => g.members?.includes(ref));
    const oldGroupId = oldGroup?.id || '';
    
    state.sessionData.queue = state.sessionData.queue.filter(r => r !== ref);
    
    const group = state.sessionData.groups.find(g => g.id === groupId);
    if (group) {
      if (!group.members) group.members = [];
      if (!group.members.includes(ref)) {
        group.members.push(ref);
        group.additionsSinceReview = (group.additionsSinceReview || 0) + 1;
      }
      
      const recordsList = state.bundleData.records || state.bundleData.allDataForms || [];
      const record = recordsList.find(r => normalizeRefString(r.Reference) === normalizeRefString(ref));
      if (record) {
        const settings = state.bundleData.settings;
        const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
        const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
        const pitchKey = settings.pitchField;
        const abbreviationKey = settings.abbreviationField;
        const exemplarKey = settings.exemplarField;
        
        record[tgKey] = String(group.groupNumber);
        record[tgIdKey] = group.id;
        
        if (pitchKey) {
          record[pitchKey] = group.pitchTranscription || '';
        }
        
        if (abbreviationKey) {
          record[abbreviationKey] = group.toneAbbreviation || '';
        }
        
        if (exemplarKey) {
          record[exemplarKey] = group.exemplarWord || '';
        }
      }
    }
    
    if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle) {
      const subBundleId = state.sessionData.currentSubBundle;
      changeTracker.logToneGroupAssignment(subBundleId, ref, groupId, {
        oldGroupId,
        groupSize: group?.members?.length || 1
      });
    }
    
    state.saveSession();
    return state.sessionData;
  });
  
  ipcMain.handle('remove-word-from-group', async (event, ref, groupId) => {
    if (!state.sessionData) return null;
    
    const group = state.sessionData.groups.find(g => g.id === groupId);
    if (group) {
      group.members = (group.members || []).filter(m => m !== ref);
      
      if (group.members.length === 0) {
        state.sessionData.groups = state.sessionData.groups.filter(g => g.id !== groupId);
        console.log(`[remove-word-from-group] Deleted empty group ${groupId}`);
        
        if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle) {
          const subBundleSession = state.sessionData.subBundles.find(sb => sb.path === state.sessionData.currentSubBundle);
          if (subBundleSession) {
            subBundleSession.groups = subBundleSession.groups.filter(g => g.id !== groupId);
          }
        }
      }
    }
    
    const recordsList = state.bundleData.records || state.bundleData.allDataForms || [];
    const record = recordsList.find(r => normalizeRefString(r.Reference) === normalizeRefString(ref));
    if (record) {
      const settings = state.bundleData.settings;
      const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
      const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
      const pitchKey = settings.pitchField;
      const abbreviationKey = settings.abbreviationField;
      const exemplarKey = settings.exemplarField;
      
      record[tgKey] = '';
      record[tgIdKey] = '';
      
      if (pitchKey) {
        record[pitchKey] = '';
      }
      
      if (abbreviationKey) {
        record[abbreviationKey] = '';
      }
      
      if (exemplarKey) {
        record[exemplarKey] = '';
      }
    }
    
    if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle) {
      const subBundleId = state.sessionData.currentSubBundle;
      changeTracker.logToneGroupRemoval(subBundleId, ref, groupId);
    }
    
    if (!state.sessionData.queue.includes(ref)) {
      state.sessionData.queue.unshift(ref);
    }
    
    state.saveSession();
    return state.sessionData;
  });
  
  ipcMain.handle('create-group', async (event, groupData) => {
    if (!state.sessionData) return null;
    
    const newGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      groupNumber: state.sessionData.groups.length + 1,
      image: groupData.image || null,
      additionsSinceReview: 0,
      requiresReview: false,
      members: [],
    };
    
    state.sessionData.groups.push(newGroup);
    state.saveSession();
    return newGroup;
  });
  
  ipcMain.handle('update-group', async (event, groupId, updates) => {
    if (!state.sessionData) return null;
    
    const group = state.sessionData.groups.find(g => g.id === groupId);
    if (group) {
      const trackFieldChange = (field, newValue, action) => {
        if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle && newValue !== undefined) {
          const oldValue = group[field];
          if (oldValue !== newValue) {
            const ref = group.exemplarWordRef || (group.members?.[0] || 'group');
            changeTracker.logFieldChange(
              state.sessionData.currentSubBundle,
              ref,
              field,
              oldValue || '',
              newValue,
              action
            );
          }
        }
      };
      
      if (updates.image !== undefined) group.image = updates.image;
      if (updates.additionsSinceReview !== undefined) group.additionsSinceReview = updates.additionsSinceReview;
      if (updates.requiresReview !== undefined) group.requiresReview = updates.requiresReview;
      if (updates.members !== undefined) group.members = updates.members;
      
      if (updates.pitchTranscription !== undefined) {
        trackFieldChange('pitchTranscription', updates.pitchTranscription, 'added_pitch_transcription');
        group.pitchTranscription = updates.pitchTranscription;
      }
      if (updates.toneAbbreviation !== undefined) {
        trackFieldChange('toneAbbreviation', updates.toneAbbreviation, 'added_tone_abbreviation');
        group.toneAbbreviation = updates.toneAbbreviation;
      }
      if (updates.exemplarWord !== undefined) {
        trackFieldChange('exemplarWord', updates.exemplarWord, 'marked_as_exemplar');
        group.exemplarWord = updates.exemplarWord;
      }
      if (updates.exemplarWordRef !== undefined) {
        group.exemplarWordRef = updates.exemplarWordRef;
      }
      
      if (state.bundleType === 'hierarchical' && state.sessionData.currentSubBundle) {
        const subBundleSession = state.sessionData.subBundles.find(sb => sb.path === state.sessionData.currentSubBundle);
        if (subBundleSession && subBundleSession.groups) {
          const subGroup = subBundleSession.groups.find(g => g.id === groupId);
          if (subGroup) {
            Object.assign(subGroup, updates);
          }
        }
      }
    }
    
    state.saveSession();
    return state.sessionData;
  });
  
  // ============================================================================
  // File Selection
  // ============================================================================
  
  ipcMain.handle('select-image-file', async () => {
    const result = await dialog.showOpenDialog(state.mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });
  
  // ============================================================================
  // Audio Path Resolution
  // ============================================================================
  
  ipcMain.handle('get-audio-path', async (event, soundFile, suffix) => {
    if (!state.extractedPath && !state.bundleData) return null;
    
    let audioDir;
    
    if (state.bundleData && state.bundleData.audioFolder) {
      audioDir = state.bundleData.audioFolder;
    } else if (state.bundleType === 'hierarchical') {
      audioDir = path.join(state.extractedPath, 'audio');
    } else {
      audioDir = path.join(state.extractedPath, 'audio');
    }
    
    if (!audioDir || !fs.existsSync(audioDir)) {
      console.log('[get-audio-path] Audio directory not found:', audioDir);
      return null;
    }
    
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

    addCandidate(fileName);
    addCandidate(soundFile);
    const maybeFlac1 = replaceExt(fileName, '.flac');
    const maybeFlac2 = replaceExt(soundFile, '.flac');
    addCandidate(maybeFlac1);
    addCandidate(maybeFlac2);

    for (const name of candidates) {
      const p = path.join(audioDir, name);
      if (fs.existsSync(p)) return p;
    }

    try {
      const files = fs.readdirSync(audioDir);
      const lowerSet = new Set(Array.from(candidates).map((n) => n.toLowerCase()));
      const match = files.find((f) => lowerSet.has(f.toLowerCase()));
      if (match) return path.join(audioDir, match);
    } catch {}

    return null;
  });
  
  // ============================================================================
  // Hierarchical Bundle Handlers
  // ============================================================================
  
  ipcMain.handle('get-hierarchy', async () => {
    if (state.bundleType !== 'hierarchical' || !state.bundleData) {
      return null;
    }
    return state.bundleData.hierarchy;
  });
  
  ipcMain.handle('load-sub-bundle', async (event, subBundlePath) => {
    if (state.bundleType !== 'hierarchical' || !state.bundleData) {
      return { success: false, error: 'Not a hierarchical bundle' };
    }
    
    const subBundle = state.bundleData.subBundles.find(sb => sb.path === subBundlePath);
    if (!subBundle) {
      return { success: false, error: 'Sub-bundle not found' };
    }
    
    // Find records for this sub-bundle
    const refSet = new Set(subBundle.references.map(r => normalizeRefString(r)));
    state.bundleData.records = state.bundleData.allDataForms.filter(df => {
      const ref = normalizeRefString(df.Reference);
      return refSet.has(ref);
    });
    
    state.currentSubBundlePath = subBundlePath;
    
    // Get or create sub-bundle session
    let subBundleSession = state.sessionData.subBundles.find(sb => sb.path === subBundlePath);
    if (!subBundleSession) {
      subBundleSession = {
        path: subBundlePath,
        queue: [...subBundle.references],
        groups: [],
        recordCount: subBundle.recordCount,
        assignedCount: 0,
        reviewed: false,
      };
      state.sessionData.subBundles.push(subBundleSession);
    }
    
    state.sessionData.currentSubBundle = subBundlePath;
    state.sessionData.queue = [...subBundleSession.queue];
    state.sessionData.groups = subBundleSession.groups || [];
    
    state.saveSession();
    
    return {
      success: true,
      subBundle: {
        ...subBundle,
        ...subBundleSession,
      },
      settings: state.bundleData.settings,
    };
  });
  
  ipcMain.handle('navigate-to-hierarchy', async () => {
    if (state.bundleType !== 'hierarchical') {
      return { success: false };
    }
    
    state.sessionData.currentSubBundle = null;
    state.sessionData.queue = [];
    state.sessionData.groups = [];
    state.currentSubBundlePath = null;
    state.bundleData.records = [];
    
    state.saveSession();
    
    return { success: true };
  });
  
  console.log('[matching-handlers] Tone matching handlers initialized');
}

// ============================================================================
// Bundle Loading Functions
// ============================================================================

async function loadLegacyBundle(filePath, state, app) {
  try {
    const zip = new AdmZip(filePath);
    state.extractedPath = getExtractedBundlePath(app);
    
    if (fs.existsSync(state.extractedPath)) {
      fs.rmSync(state.extractedPath, { recursive: true, force: true });
    }
    fs.mkdirSync(state.extractedPath, { recursive: true });
    
    zip.extractAllTo(state.extractedPath, true);
    
    const settingsPath = path.join(state.extractedPath, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Bundle missing settings.json');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    let xmlPath = path.join(state.extractedPath, 'data_updated.xml');
    const isReimport = fs.existsSync(xmlPath);
    if (!isReimport) {
      xmlPath = path.join(state.extractedPath, 'data.xml');
    }
    if (!fs.existsSync(xmlPath)) {
      throw new Error('Bundle missing data.xml');
    }
    
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
    
    state.bundleData = {
      settings,
      records: dataForms,
      extractedPath: state.extractedPath,
      bundleId: settings.bundleId || null,
      isReimport,
    };
    
    let needNewSession = true;
    if (state.sessionData && state.sessionData.bundleId === state.bundleData.bundleId) {
      needNewSession = false;
    }
    
    if (needNewSession) {
      const queue = dataForms.map(df => normalizeRefString(df.Reference));
      state.sessionData = {
        bundleId: state.bundleData.bundleId,
        queue,
        selectedAudioVariantIndex: 0,
        groups: [],
        records: {},
        locale: state.sessionData?.locale || 'en',
      };
      
      state.saveSession();
    }
    
    return {
      success: true,
      settings: state.bundleData.settings,
      recordCount: dataForms.length,
      session: state.sessionData,
      isReimport,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function loadHierarchicalBundle(filePath, state, app) {
  try {
    const zip = new AdmZip(filePath);
    state.extractedPath = getExtractedBundlePath(app);
    
    if (fs.existsSync(state.extractedPath)) {
      fs.rmSync(state.extractedPath, { recursive: true, force: true });
    }
    fs.mkdirSync(state.extractedPath, { recursive: true });
    
    zip.extractAllTo(state.extractedPath, true);
    
    const linkMetadataPath = path.join(state.extractedPath, 'link_metadata.json');
    const isLinkedBundle = fs.existsSync(linkMetadataPath);
    
    let xmlPath, audioFolder;
    let linkMetadata = null;
    
    if (isLinkedBundle) {
      console.log('[load-bundle] Loading LINKED hierarchical bundle');
      linkMetadata = JSON.parse(fs.readFileSync(linkMetadataPath, 'utf8'));
      
      xmlPath = linkMetadata.linkedXmlPath;
      audioFolder = linkMetadata.linkedAudioFolder;
      
      if (!fs.existsSync(xmlPath)) {
        throw new Error(`Linked XML file not found: ${xmlPath}`);
      }
      if (!fs.existsSync(audioFolder)) {
        throw new Error(`Linked audio folder not found: ${audioFolder}`);
      }
    } else {
      console.log('[load-bundle] Loading EMBEDDED hierarchical bundle');
      const xmlFolder = path.join(state.extractedPath, 'xml');
      audioFolder = path.join(state.extractedPath, 'audio');
      
      const hasNewStructure = fs.existsSync(xmlFolder) && fs.existsSync(audioFolder);
      
      if (!hasNewStructure) {
        throw new Error('Invalid hierarchical bundle structure');
      }
      
      const workingXmlPath = path.join(xmlFolder, 'working_data.xml');
      const originalXmlPath = path.join(xmlFolder, 'original_data.xml');
      xmlPath = fs.existsSync(workingXmlPath) ? workingXmlPath : originalXmlPath;
      
      if (!fs.existsSync(xmlPath)) {
        throw new Error('Hierarchical bundle missing XML data');
      }
    }
    
    const hierarchyPath = path.join(state.extractedPath, 'hierarchy.json');
    if (!fs.existsSync(hierarchyPath)) {
      throw new Error('Hierarchical bundle missing hierarchy.json');
    }
    state.hierarchyConfig = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
    
    const settingsPath = path.join(state.extractedPath, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Bundle missing settings.json');
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    const xmlBuffer = fs.readFileSync(xmlPath);
    const xmlData = xmlBuffer.toString('utf16le');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    const xmlResult = parser.parse(xmlData);
    const phonData = xmlResult.phon_data;
    const allDataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    const subBundles = [];
    
    function extractSubBundlesFromTree(node, pathPrefix = '', parentAudioVariants = []) {
      if (!node) return;
      
      const values = node.values || [];
      
      for (const valueNode of values) {
        const subPath = pathPrefix ? `${pathPrefix}/${valueNode.value}` : valueNode.value;
        
        if (valueNode.children && valueNode.children.length > 0) {
          const audioVariants = valueNode.audioVariants || parentAudioVariants;
          for (const child of valueNode.children) {
            extractSubBundlesFromTree(
              { field: child.field || node.field, values: [child] },
              subPath,
              audioVariants
            );
          }
        } else if (valueNode.references && valueNode.references.length > 0) {
          subBundles.push({
            path: subPath,
            categoryPath: subPath,
            label: valueNode.label || valueNode.value,
            references: valueNode.references,
            recordCount: valueNode.recordCount || valueNode.references.length,
            audioVariants: valueNode.audioVariants || parentAudioVariants,
            organizationalGroup: valueNode.organizationalGroup || null,
            usesNewStructure: true,
          });
        }
      }
    }
    
    if (state.hierarchyConfig.tree) {
      extractSubBundlesFromTree(state.hierarchyConfig.tree);
    }
    
    console.log(`[load-bundle] Found ${subBundles.length} sub-bundles`);
    
    const existingHistory = ChangeTracker.loadChangeHistory(state.extractedPath);
    
    state.bundleData = {
      settings,
      hierarchy: state.hierarchyConfig,
      subBundles,
      extractedPath: state.extractedPath,
      bundleId: settings.bundleId || null,
      bundleType: 'hierarchical',
      xmlPath: xmlPath,
      audioFolder: audioFolder,
      allDataForms: allDataForms,
      usesNewStructure: true,
      isLinkedBundle: isLinkedBundle,
      linkMetadata: linkMetadata,
    };
    
    let needNewSession = true;
    if (state.sessionData && state.sessionData.bundleId === state.bundleData.bundleId && state.sessionData.bundleType === 'hierarchical') {
      needNewSession = false;
    }
    
    if (needNewSession) {
      state.sessionData = {
        bundleId: state.bundleData.bundleId,
        bundleType: 'hierarchical',
        hierarchyConfig: state.hierarchyConfig,
        subBundles: subBundles.map(sb => ({
          path: sb.path,
          categoryPath: sb.categoryPath,
          label: sb.label,
          recordCount: sb.recordCount,
          assignedCount: 0,
          reviewed: false,
          queue: [...(sb.references || [])],
          groups: [],
          organizationalGroup: sb.organizationalGroup || null,
        })),
        currentSubBundle: null,
        selectedAudioVariantIndex: 0,
        records: {},
        locale: state.sessionData?.locale || 'en',
      };
      
      state.saveSession();
    }
    
    changeTracker.initialize(state.extractedPath, existingHistory);
    console.log('[load-bundle] Change tracker initialized');
    
    return {
      success: true,
      bundleType: 'hierarchical',
      settings: state.bundleData.settings,
      hierarchy: state.hierarchyConfig,
      subBundleCount: subBundles.length,
      session: state.sessionData,
      requiresNavigation: true,
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function getExtractedBundlePath(app) {
  try {
    return path.join(app.getPath('userData'), 'extracted_bundle');
  } catch {
    return path.join(process.cwd(), 'extracted_bundle');
  }
}

module.exports = { initializeMatchingHandlers };
