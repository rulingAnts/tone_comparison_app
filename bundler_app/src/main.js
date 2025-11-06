const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { XMLParser } = require('fast-xml-parser');
const {
  normalizeRefString,
  toNumericRef,
  sortByNumericRef,
} = require('./utils/refUtils');

let mainWindow;
let bundlerSettings = null; // persist UI selections and settings

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
      audioFileSuffix: null, // backward-compat: equals first variant suffix
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
    },
  };
}

function loadSettings() {
  const p = getSettingsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    bundlerSettings = JSON.parse(raw);
  } catch {
    bundlerSettings = defaultBundlerSettings();
  }
}

function saveSettings() {
  try {
    const p = getSettingsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(bundlerSettings || defaultBundlerSettings(), null, 2), 'utf8');
    console.log('[bundler] Settings saved to', p);
  } catch (e) {
    console.warn('[bundler] Failed to save settings:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('public/index.html');
}

app.whenReady().then(createWindow);
app.whenReady().then(loadSettings);

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

ipcMain.handle('get-settings', async () => {
  if (!bundlerSettings) loadSettings();
  return bundlerSettings;
});

ipcMain.handle('set-settings', async (event, patch) => {
  if (!bundlerSettings) loadSettings();
  const next = { ...(bundlerSettings || defaultBundlerSettings()) };
  if (patch && typeof patch === 'object') {
    // shallow merge top-level
    for (const k of Object.keys(patch)) {
      if (k === 'settings' && typeof patch.settings === 'object') {
        next.settings = { ...(next.settings || {}), ...patch.settings };
      } else {
        next[k] = patch[k];
      }
    }
  }
  bundlerSettings = next;
  saveSettings();
  return bundlerSettings;
});

ipcMain.handle('select-xml-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'XML Files', extensions: ['xml'] }],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});
// Profiles helpers
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

function generateUuid() {
  try {
    return require('crypto').randomUUID();
  } catch {
    // fallback simple uuid
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }
}

ipcMain.handle('save-profile', async (event, profile) => {
  try {
    const dir = ensureProfilesDir();
    const name = (profile && profile.name ? String(profile.name) : `profile_${Date.now()}`)
      .replace(/[^a-z0-9-_\. ]/gi, '_');
    const filePath = path.join(dir, `${name}.json`);
    const data = profile.data || {};
    // Ensure bundleId exists and stays stable in the profile
    if (!data.settings) data.settings = {};
    if (!data.settings.bundleId) data.settings.bundleId = generateUuid();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, filePath, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-profile', async () => {
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
      // Backfill bundleId if missing
      if (!data.settings) data.settings = {};
      if (!data.settings.bundleId) data.settings.bundleId = generateUuid();
      return { success: true, filePath, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'No file selected' };
});

ipcMain.handle('select-audio-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('parse-xml', async (event, xmlPath) => {
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
    
    // Extract available fields from first data_form
    const phonData = result.phon_data;
    if (!phonData || !phonData.data_form) {
      throw new Error('Invalid XML structure - missing phon_data or data_form elements');
    }
    
    const dataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    if (dataForms.length === 0) {
      throw new Error('No data_form elements found');
    }
    
    const firstForm = dataForms[0];
    const fields = Object.keys(firstForm).filter(key => !key.startsWith('@_'));
    
    return {
      success: true,
      fields,
      recordCount: dataForms.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('create-bundle', async (event, config) => {
  try {
    const {
      xmlPath,
      audioFolder,
      outputPath,
      settings,
    } = config;
    // Inject defaults for new metadata
    const settingsWithMeta = { ...(settings || {}) };
    if (!settingsWithMeta.bundleId) settingsWithMeta.bundleId = generateUuid();
    if (settingsWithMeta.bundleDescription == null) settingsWithMeta.bundleDescription = '';
    // Ensure audio variants exist; backfill from single suffix if needed
    if (!Array.isArray(settingsWithMeta.audioFileVariants) || settingsWithMeta.audioFileVariants.length === 0) {
      const suf = (settingsWithMeta.audioFileSuffix || '');
      settingsWithMeta.audioFileVariants = [
        { description: 'Default', suffix: suf },
      ];
    }
    // Keep legacy audioFileSuffix equal to first variant for older apps
    const firstSuf = (settingsWithMeta.audioFileVariants[0]?.suffix || '');
    settingsWithMeta.audioFileSuffix = firstSuf === '' ? null : firstSuf;
    
    // Parse XML to get record information
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
    
    // Filter records by reference numbers
  const referenceNumbers = (settingsWithMeta.referenceNumbers || []).map((r) => normalizeRefString(r));
    const refSet = new Set(referenceNumbers);
    let filteredRecords = referenceNumbers.length > 0
      ? dataForms.filter(df => {
          const ref = df && df.Reference != null ? normalizeRefString(df.Reference) : '';
          return refSet.has(ref);
        })
      : dataForms;

    // Optional: keep a stable numeric order without changing stored strings
    filteredRecords = sortByNumericRef(filteredRecords);
    
    // Collect sound files for ALL variants
    const soundFiles = new Set();
    const missingSoundFiles = [];
    
    for (const record of filteredRecords) {
      if (record.SoundFile) {
        for (const variant of settingsWithMeta.audioFileVariants) {
          let soundFile = record.SoundFile;
          const suffix = (variant && typeof variant.suffix === 'string') ? variant.suffix : '';
          if (suffix && suffix.length > 0) {
            const lastDot = soundFile.lastIndexOf('.');
            if (lastDot !== -1) {
              soundFile = soundFile.substring(0, lastDot) + suffix + soundFile.substring(lastDot);
            } else {
              soundFile = soundFile + suffix;
            }
          }
          const audioPath = path.join(audioFolder, soundFile);
          if (fs.existsSync(audioPath)) {
            soundFiles.add(soundFile);
          } else {
            missingSoundFiles.push(soundFile);
          }
        }
      }
    }
    
    // Create minimized XML with only filtered records and no prior tone grouping
  const tgKey = settingsWithMeta.toneGroupElement || 'SurfaceMelodyGroup';
  const tgIdKey = settingsWithMeta.toneGroupIdElement || 'SurfaceMelodyGroupId';
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
        if (k === tgKey || k === tgIdKey) continue; // strip previous tone grouping
        const v = rec[k];
        if (v == null) continue;
        parts.push(`  <${k}>${escapeXml(v)}</${k}>`);
      }
      return ['<data_form>', ...parts, '</data_form>'].join('\n');
    };

    const subsetXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<phon_data>',
      ...filteredRecords.map((r) => buildDataForm(r)),
      '</phon_data>',
      '',
    ].join('\n');

    // Create zip bundle
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    
  // Add minimized XML file
  archive.append(subsetXml, { name: 'data.xml' });
    
  // Add settings file (now includes audioFileVariants and legacy audioFileSuffix)
  archive.append(JSON.stringify(settingsWithMeta, null, 2), { name: 'settings.json' });
    
    // Add audio files
    for (const soundFile of soundFiles) {
      const audioPath = path.join(audioFolder, soundFile);
      archive.file(audioPath, { name: `audio/${soundFile}` });
    }
    
    await archive.finalize();
    
    return {
      success: true,
      recordCount: filteredRecords.length,
      audioFileCount: soundFiles.size,
      missingSoundFiles: missingSoundFiles.length > 0 ? missingSoundFiles : null,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('select-output-file', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Tone Bundle', extensions: ['tncmp'] },
    ],
    defaultPath: 'tone_matching_bundle.tncmp',
  });

  if (!result.canceled && result.filePath) {
    let out = result.filePath;
    // Ensure .tncmp extension
    if (path.extname(out).toLowerCase() !== '.tncmp') {
      out = out + '.tncmp';
    }
    return out;
  }
  return null;
});
