/**
 * Tone Matching Suite - Unified Desktop App
 * 
 * Combines bundler and matching functionality into a single application.
 * Phase 2: Porting bundler backend
 */

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const {
  normalizeRefString,
  toNumericRef,
  sortByNumericRef,
} = require('./utils/refUtils');
const { validateBundleAudio, checkDuplicateReferences } = require('./validator');
const { applyFilters } = require('./filter-engine');
const { createLegacyBundle, createHierarchicalBundle } = require('./bundler-creator');
const { initializeMatchingHandlers } = require('./matching-handlers');

// Import bundler utility modules
const liteNormalizer = (() => {
  try {
    const mod = require('./utils/lite-normalizer.js');
    if (mod && (mod.normalizeBatch || mod.normalizeFile)) {
      console.log('[bundler] lite-normalizer loaded');
      return mod;
    }
  } catch (e) {
    console.warn('[bundler] lite-normalizer not available:', e.message);
  }
  return null;
})();

// Constants
const BLANK_VALUE = '(blank)';

// Utility functions
function normalizeBlankValue(value) {
  if (value === null || value === undefined || value === '') {
    return BLANK_VALUE;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return BLANK_VALUE;
  }
  return value;
}

function isBlankValue(value) {
  return value === null || value === undefined || value === '' || 
         (typeof value === 'string' && value.trim() === '') ||
         value === BLANK_VALUE;
}

function generateUuid() {
  try {
    return require('crypto').randomUUID();
  } catch {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }
}

// Global state
let mainWindow;
let currentView = 'bundler';
let bundlerSettings = null;
let activeBundleMetadata = null; // Store active bundle for Tone Analysis

// ============================================================================
// Tone Matching State (from desktop_matching_app)
// ============================================================================
let sessionData = null;
let bundleData = null;
let extractedPath = null;
let bundleType = 'legacy'; // 'legacy' or 'hierarchical'
let hierarchyConfig = null; // For hierarchical bundles
let currentSubBundlePath = null; // Track which sub-bundle is currently loaded

// Import change tracker after we have the utility
const AdmZip = require('adm-zip');
const { changeTracker, ChangeTracker } = (() => {
  try {
    return require('./utils/changeTracker');
  } catch (e) {
    console.warn('[unified] changeTracker not available:', e.message);
    // Return stub if not available
    return {
      changeTracker: {
        initialize: () => {},
        trackChange: () => {},
        getHistory: () => [],
      },
      ChangeTracker: {
        loadChangeHistory: () => [],
      },
    };
  }
})();

function getSessionPath() {
  try {
    return path.join(app.getPath('userData'), 'unified_matching_session.json');
  } catch {
    return path.join(process.cwd(), 'unified_matching_session.json');
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
    console.log('[unified] Session saved to', p);
  } catch (e) {
    console.warn('Failed to save session:', e.message);
  }
}

// Find most common metadata values in a group
function findMostCommonGroupMetadata(members, dataForms, pitchKey, abbreviationKey, exemplarKey) {
  const pitchCounts = new Map();
  const abbrevCounts = new Map();
  const exemplarCounts = new Map();
  
  members.forEach(ref => {
    const record = dataForms.find(df => normalizeRefString(df.Reference) === ref);
    if (!record) return;
    
    if (pitchKey && record[pitchKey]) {
      const val = record[pitchKey];
      pitchCounts.set(val, (pitchCounts.get(val) || 0) + 1);
    }
    if (abbreviationKey && record[abbreviationKey]) {
      const val = record[abbreviationKey];
      abbrevCounts.set(val, (abbrevCounts.get(val) || 0) + 1);
    }
    if (exemplarKey && record[exemplarKey]) {
      const val = record[exemplarKey];
      exemplarCounts.set(val, (exemplarCounts.get(val) || 0) + 1);
    }
  });
  
  const getMostCommon = (countMap) => {
    if (countMap.size === 0) return undefined;
    let maxCount = 0;
    let mostCommon = undefined;
    countMap.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = value;
      }
    });
    return mostCommon;
  };
  
  return {
    pitchTranscription: getMostCommon(pitchCounts),
    toneAbbreviation: getMostCommon(abbrevCounts),
    exemplarWord: getMostCommon(exemplarCounts),
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset', // macOS style
    show: false, // Don't show until ready
  });

  mainWindow.loadFile(path.join(__dirname, '../public/views/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in debug mode
  if (process.env.ELECTRON_ENABLE_LOGGING) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  loadSession(); // Load tone matching session if it exists
  createWindow();
  
  // Initialize tone matching handlers with shared state
  const matchingState = {
    get mainWindow() { return mainWindow; },
    get sessionData() { return sessionData; },
    set sessionData(val) { sessionData = val; },
    get bundleData() { return bundleData; },
    set bundleData(val) { bundleData = val; },
    get extractedPath() { return extractedPath; },
    set extractedPath(val) { extractedPath = val; },
    get bundleType() { return bundleType; },
    set bundleType(val) { bundleType = val; },
    get hierarchyConfig() { return hierarchyConfig; },
    set hierarchyConfig(val) { hierarchyConfig = val; },
    get currentSubBundlePath() { return currentSubBundlePath; },
    set currentSubBundlePath(val) { currentSubBundlePath = val; },
    saveSession,
    findMostCommonGroupMetadata,
  };
  
  initializeMatchingHandlers(matchingState, app);
  console.log('[unified] Matching handlers initialized');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// Bundler Settings Management
// ============================================================================

function getSettingsPath() {
  try {
    return path.join(app.getPath('userData'), 'bundler-settings.json');
  } catch {
    return path.join(process.cwd(), 'bundler-settings.json');
  }
}

function defaultBundlerSettings() {
  return {
    xmlPath: null,
    audioFolder: null,
    outputPath: null,
    settings: {
      writtenFormElements: ['Phonetic'],
      showWrittenForm: true,
      audioFileSuffix: null,
      audioFileVariants: [
        { description: 'Default', suffix: '' },
      ],
      referenceNumbers: [],
      requireUserSpelling: false,
      userSpellingElement: 'Orthographic',
      toneGroupElement: 'SurfaceMelodyGroup',
      toneGroupIdElement: 'SurfaceMelodyGroupId',
      showGloss: false,
      glossElement: null,
      audioProcessing: {
        autoTrim: false,
        autoNormalize: false,
        convertToFlac: false,
      },
    },
  };
}

function loadBundlerSettings() {
  const p = getSettingsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    bundlerSettings = JSON.parse(raw);
  } catch {
    bundlerSettings = defaultBundlerSettings();
  }
}

function saveBundlerSettings() {
  try {
    const p = getSettingsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(bundlerSettings || defaultBundlerSettings(), null, 2), 'utf8');
    console.log('[bundler] Settings saved to', p);
  } catch (e) {
    console.warn('[bundler] Failed to save settings:', e.message);
  }
}

// Load bundler settings on startup
app.whenReady().then(loadBundlerSettings);

// ============================================================================
// IPC Handlers - Phase 1: View Management
// ============================================================================

ipcMain.handle('switch-view', async (event, viewName) => {
  console.log('[main] Switching to view:', viewName);
  currentView = viewName;
  return { success: true, view: viewName };
});

ipcMain.handle('get-current-view', async () => {
  return { view: currentView };
});

// ============================================================================
// IPC Handlers - Clipboard Operations
// ============================================================================

ipcMain.handle('clipboard:read-text', async () => {
  try {
    const text = clipboard.readText();
    console.log('[main] Clipboard read, length:', text?.length || 0);
    return text;
  } catch (error) {
    console.error('[main] Error reading clipboard:', error);
    throw error;
  }
});

ipcMain.handle('clipboard:write-text', async (event, text) => {
  try {
    clipboard.writeText(text);
    console.log('[main] Clipboard written, length:', text?.length || 0);
    return true;
  } catch (error) {
    console.error('[main] Error writing clipboard:', error);
    throw error;
  }
});

// ============================================================================
// IPC Handlers - Bundle Metadata for Tone Analysis
// ============================================================================

ipcMain.handle('bundler:set-active-bundle', async (event, metadata) => {
  console.log('[main] Setting active bundle metadata for Tone Analysis');
  activeBundleMetadata = metadata;
  return { success: true };
});

ipcMain.handle('bundler:get-active-bundle', async () => {
  console.log('[main] Getting active bundle metadata');
  return activeBundleMetadata;
});

// ============================================================================
// IPC Handlers - Bundler (Phase 2: Full Implementation)
// ============================================================================

ipcMain.handle('bundler:get-settings', async () => {
  if (!bundlerSettings) loadBundlerSettings();
  console.log('[main] get-settings called, hierarchyTree:', !!bundlerSettings?.settings?.hierarchyTree, 'filterGroups:', bundlerSettings?.settings?.filterGroups?.length || 0);
  return bundlerSettings;
});

ipcMain.handle('bundler:set-settings', async (event, patch) => {
  if (!bundlerSettings) loadBundlerSettings();
  const next = { ...(bundlerSettings || defaultBundlerSettings()) };
  if (patch && typeof patch === 'object') {
    for (const k of Object.keys(patch)) {
      if (k === 'settings' && typeof patch.settings === 'object') {
        next.settings = { ...(next.settings || {}), ...patch.settings };
        console.log('[main] Merged settings, hierarchyTree:', !!next.settings.hierarchyTree, 'filterGroups:', next.settings.filterGroups?.length || 0);
      } else {
        next[k] = patch[k];
      }
    }
  }
  bundlerSettings = next;
  saveBundlerSettings();
  return bundlerSettings;
});

ipcMain.handle('bundler:select-xml-file', async () => {
  console.log('[bundler] select-xml-file called, mainWindow:', !!mainWindow);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'XML Files', extensions: ['xml'] }],
  });
  console.log('[bundler] dialog result:', result);
  
  if (!result.canceled && result.filePaths.length > 0) {
    console.log('[bundler] returning path:', result.filePaths[0]);
    return result.filePaths[0];
  }
  console.log('[bundler] returning null (canceled or no selection)');
  return null;
});

ipcMain.handle('bundler:select-audio-folder', async () => {
  console.log('[bundler] select-audio-folder called, mainWindow:', !!mainWindow);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  console.log('[bundler] dialog result:', result);
  
  if (!result.canceled && result.filePaths.length > 0) {
    console.log('[bundler] returning path:', result.filePaths[0]);
    return result.filePaths[0];
  }
  console.log('[bundler] returning null (canceled or no selection)');
  return null;
});

ipcMain.handle('bundler:select-output-file', async (event, bundleType = 'legacy') => {
  const isHierarchical = bundleType === 'hierarchical';
  const extension = isHierarchical ? 'tnset' : 'tncmp';
  const typeName = isHierarchical ? 'Hierarchical Macro-Bundle' : 'Tone Bundle';
  const defaultName = isHierarchical ? 'tone_matching_macro_bundle.tnset' : 'tone_matching_bundle.tncmp';
  
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: typeName, extensions: [extension] },
    ],
    defaultPath: defaultName,
  });

  if (!result.canceled && result.filePath) {
    let out = result.filePath;
    // Ensure correct extension
    if (path.extname(out).toLowerCase() !== `.${extension}`) {
      out = out + `.${extension}`;
    }
    return out;
  }
  return null;
});

ipcMain.handle('bundler:parse-xml', async (event, xmlPath) => {
  try {
    const xmlData = fs.readFileSync(xmlPath, 'utf16le');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    const result = parser.parse(xmlData);
    
    if (!result.phon_data || !result.phon_data.data_form) {
      return {
        success: false,
        error: 'Invalid XML structure: missing phon_data or data_form elements',
      };
    }
    
    const phonData = result.phon_data;
    const dataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    if (dataForms.length === 0) {
      return {
        success: false,
        error: 'No records found in XML file',
      };
    }
    
    // Extract available fields from first record
    const firstRecord = dataForms[0];
    const availableFields = Object.keys(firstRecord)
      .filter(k => !k.startsWith('@_'))
      .sort();
    
    // Return parsed data
    return {
      success: true,
      fields: availableFields,
      recordCount: dataForms.length,
      records: dataForms, // Full records for hierarchy analysis
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('bundler:check-conflicts', async (event, { xmlPath, settings }) => {
  try {
    if (!xmlPath || !fs.existsSync(xmlPath)) {
      return { success: false, error: 'XML file not selected or not found' };
    }
    
    if (!settings.groupingField || settings.groupingField === 'none') {
      return { 
        success: true, 
        hasConflicts: false, 
        message: 'No grouping field selected. Groups will not be pre-populated from existing data.' 
      };
    }
    
    // Parse XML
    const xmlData = fs.readFileSync(xmlPath, 'utf16le');
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
    
    // Get field keys
    const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
    const pitchKey = settings.pitchField;
    const abbreviationKey = settings.abbreviationField;
    const exemplarKey = settings.exemplarField;
    
    // Determine grouping key
    const groupingField = settings.groupingField;
    let groupingKey = null;
    
    if (groupingField === 'id' && tgIdKey) {
      groupingKey = tgIdKey;
    } else if (groupingField === 'pitch' && pitchKey) {
      groupingKey = pitchKey;
    } else if (groupingField === 'abbreviation' && abbreviationKey) {
      groupingKey = abbreviationKey;
    } else if (groupingField === 'exemplar' && exemplarKey) {
      groupingKey = exemplarKey;
    }
    
    if (!groupingKey) {
      return {
        success: true,
        hasConflicts: false,
        message: `Grouping field "${groupingField}" is selected but the corresponding XML field is not configured.`
      };
    }
    
    // Build groups based on single field
    const groupMap = new Map();
    
    dataForms.forEach(record => {
      const ref = normalizeRefString(record.Reference);
      const groupValue = record[groupingKey];
      
      if (groupValue) {
        if (!groupMap.has(groupValue)) {
          const groupId = (groupingField === 'id') 
            ? groupValue 
            : `group_${groupValue.replace(/[^a-zA-Z0-9]/g, '_')}`;
          
          groupMap.set(groupValue, {
            id: groupId,
            groupNumber: groupMap.size + 1,
            members: [],
            groupingValue: groupValue,
          });
        }
        
        groupMap.get(groupValue).members.push(ref);
      }
    });
    
    // Convert to array
    const groups = Array.from(groupMap.values()).sort((a, b) => a.groupNumber - b.groupNumber);
    
    return {
      success: true,
      hasConflicts: false,
      conflicts: [],
      groupCount: groups.length,
      fieldNames: {
        pitch: pitchKey,
        abbreviation: abbreviationKey,
        exemplar: exemplarKey,
      },
      groupingField: groupingField,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('bundler:create-bundle', async (event, config) => {
  try {
    const {
      xmlPath,
      audioFolder,
      outputPath,
      settings,
    } = config;
    
    // Determine bundle type
    const bundleType = settings?.bundleType || 'legacy';
    console.log('[create-bundle] Received bundleType:', bundleType);
    
    if (bundleType === 'hierarchical') {
      console.log('[create-bundle] Creating HIERARCHICAL bundle');
      return await createHierarchicalBundle(config, mainWindow, liteNormalizer, app);
    } else {
      console.log('[create-bundle] Creating LEGACY bundle');
      return await createLegacyBundle(config, mainWindow, liteNormalizer, app);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

// Profile management helpers
function profilesDir() {
  try {
    return path.join(app.getPath('userData'), 'profiles');
  } catch {
    return path.join(process.cwd(), 'profiles');
  }
}

function ensureProfilesDir() {
  const dir = profilesDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('bundler:save-profile', async (event, profile) => {
  try {
    const dir = ensureProfilesDir();
    const name = (profile && profile.name ? String(profile.name) : `profile_${Date.now()}`)
      .replace(/[^a-z0-9-_\. ]/gi, '_');
    const filePath = path.join(dir, `${name}.json`);
    const data = profile.data || {};
    if (!data.settings) data.settings = {};
    if (!data.settings.bundleId) data.settings.bundleId = generateUuid();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, filePath, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('bundler:open-profile', async () => {
  const dir = ensureProfilesDir();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Profiles', extensions: ['json'] }],
    defaultPath: dir,
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0];
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data.settings) data.settings = {};
      if (!data.settings.bundleId) data.settings.bundleId = generateUuid();
      return { success: true, filePath, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'No file selected' };
});

ipcMain.handle('bundler:create-and-open', async (event, options) => {
  console.log('[main] Create bundle and open in matching:', options);
  // Stub - will implement in Phase 4
  return {
    success: false,
    error: 'Direct bundle-to-matching flow not yet implemented',
  };
});

// ============================================================================
// IPC Handlers - Matching (Stubs for Phase 3)
// ============================================================================

ipcMain.handle('matching:load-bundle', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Tone Bundle', extensions: ['tnset', 'tncmp', 'zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  console.log('[main] Load bundle requested:', result.filePaths[0]);
  // Stub - will implement in Phase 3
  return {
    success: false,
    error: 'Bundle loading not yet implemented',
  };
});

// Get filtered records for tone matching
ipcMain.handle('bundler:get-filtered-records', async (event, config) => {
  try {
    const { xmlPath, filterGroups } = config;
    
    // Read and parse XML
    const xmlData = fs.readFileSync(xmlPath, 'utf16le');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    const result = parser.parse(xmlData);
    
    const phonData = result.phon_data;
    const dataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    // Apply filters if provided
    let filteredRecords = dataForms;
    if (filterGroups && filterGroups.length > 0) {
      filteredRecords = applyFilters(dataForms, filterGroups);
    }
    
    return filteredRecords;
  } catch (error) {
    console.error('[bundler:get-filtered-records] Error:', error);
    return [];
  }
});

// ============================================================================
// Logging
// ============================================================================

console.log('[main] Tone Matching Suite starting...');
console.log('[main] Electron version:', process.versions.electron);
console.log('[main] Node version:', process.versions.node);
console.log('[main] App path:', app.getAppPath());
