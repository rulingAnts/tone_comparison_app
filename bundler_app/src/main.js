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
const { validateBundleAudio } = require('./validator');
const pathResolve = (...p) => path.resolve(...p);

// Prefer embedded normalizer to avoid brittle path resolution
const liteNormalizer = (() => {
  try {
    const mod = require('./utils/lite-normalizer.js');
    if (mod && (mod.normalizeBatch || mod.normalizeFile)) {
      console.log('[bundler] lite-normalizer loaded (embedded)');
      return mod;
    }
  } catch (e) {
    console.warn('[bundler] lite-normalizer not available:', e.message);
  }
  return null;
})();

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
      audioProcessing: {
        autoTrim: false,
        autoNormalize: false,
        convertToFlac: false,
      },
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
    
    console.log('[bundler] Filtered records:', filteredRecords.length);
    console.log('[bundler] Variants:', (settingsWithMeta.audioFileVariants || []).map(v => v.suffix));
    console.log('[bundler] Collecting candidate audio files...');
    console.log('[bundler] Found audio files:', soundFiles.size, 'Missing:', missingSoundFiles.length);

    // Optionally process audio (trim/normalize/convert)
    const ap = settingsWithMeta.audioProcessing || {};
    const wantsProcessing = !!ap.autoTrim || !!ap.autoNormalize || !!ap.convertToFlac;
    const outputFormat = ap.convertToFlac ? 'flac' : 'wav16';
    let processedDir = null;
    const processedNameMap = new Map(); // original filename -> processed filename (may change extension)

    if (wantsProcessing && liteNormalizer) {
      try {
        // Build list of absolute inputs we intend to include (any extension)
        const inputAbsList = Array.from(soundFiles)
          .map((name) => path.join(audioFolder, name))
          .filter((abs) => fs.existsSync(abs));

        console.log('[bundler] Processing enabled. autoTrim:', !!ap.autoTrim, 'autoNormalize:', !!ap.autoNormalize, 'convertToFlac:', !!ap.convertToFlac);
        console.log('[bundler] Files to process:', inputAbsList.length, 'Output format:', outputFormat);

        if (inputAbsList.length > 0) {
          processedDir = path.join(app.getPath('userData'), 'bundler-processed-audio', String(Date.now()));
          fs.mkdirSync(processedDir, { recursive: true });

          const tStart = Date.now();
          mainWindow?.webContents?.send('audio-processing-progress', { type: 'start', total: inputAbsList.length, startTime: tStart });
          let completedCount = 0;

          const procResult = await liteNormalizer.normalizeBatch({
            input: audioFolder,
            output: processedDir,
            files: inputAbsList,
            autoNormalize: !!ap.autoNormalize,
            autoTrim: !!ap.autoTrim,
            outputFormat,
            onProgress: (info) => {
              if (info.type === 'file-done' || info.type === 'file-error') {
                completedCount = info.completed ?? (completedCount + 1);
                if (info.type === 'file-error') {
                  console.warn('[bundler] ffmpeg error for', info.inFile, '->', info.error);
                }
                mainWindow?.webContents?.send('audio-processing-progress', {
                  type: info.type,
                  completed: info.completed ?? completedCount,
                  total: info.total ?? inputAbsList.length,
                  index: info.index,
                  inFile: info.inFile,
                  outFile: info.outFile,
                  error: info.error,
                  startTime: tStart,
                });
              }
            }
          });

          // Build map of expected processed names for fast lookup when packaging
          for (const abs of inputAbsList) {
            const rel = path.relative(audioFolder, abs);
            const outExt = outputFormat === 'wav16' ? '.wav' : `.${outputFormat}`;
            const outName = /\.[^\/\.]+$/.test(rel)
              ? rel.replace(/\.[^\/\.]+$/, outExt)
              : (rel + outExt);
            processedNameMap.set(rel.replace(/\\/g, '/'), outName.replace(/\\/g, '/'));
          }

          mainWindow?.webContents?.send('audio-processing-progress', {
            type: 'done',
            total: inputAbsList.length,
            completed: inputAbsList.length,
            elapsedMs: Date.now() - tStart,
          });
          console.log('[bundler] Processing complete. Output dir:', processedDir);
          // Attach a simple processing report into archive later
          var processingReport = {
            outputFormat,
            options: { autoTrim: !!ap.autoTrim, autoNormalize: !!ap.autoNormalize },
            total: procResult.total,
            completed: procResult.completed,
            errors: procResult.errors,
            results: (procResult.results || []).map((r) => ({
              input: r.inputFile || r.input,
              output: r.outputFile || r.output,
              error: r.error ? String(r.error.message || r.error) : null,
              stats: r.loudnormStats || null,
            }))
          };
        }
      } catch (procErr) {
        console.warn('[bundler] Audio processing failed, falling back to originals:', procErr.message);
        mainWindow?.webContents?.send('audio-processing-progress', { type: 'skipped' });
        processedDir = null;
      }
    } else {
      if (!liteNormalizer) {
        console.warn('[bundler] Processing disabled because normalizer unavailable. enabled=', wantsProcessing);
      } else {
        console.log('[bundler] Processing disabled by user options.');
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
  // Add processing report if available
  if (typeof processingReport !== 'undefined') {
    archive.append(JSON.stringify(processingReport, null, 2), { name: 'processing_report.json' });
  }
    
    // Add audio files (prefer processed if available)
    for (const soundFile of soundFiles) {
      const srcPath = path.join(audioFolder, soundFile);
      let addPath = srcPath;
      let addName = `audio/${soundFile}`; // default

      if (processedDir && processedNameMap.has(soundFile)) {
        const processedName = processedNameMap.get(soundFile);
        const cand = path.join(processedDir, processedName);
        if (fs.existsSync(cand)) {
          addPath = cand;
          addName = `audio/${processedName}`;
        }
      }

      archive.file(addPath, { name: addName });
    }
    
    await archive.finalize();
    
    // Post-build validation with extension fallbacks & variants
    let finalMissing = missingSoundFiles;
    try {
      const variantsForCheck = settingsWithMeta.audioFileVariants || [{ suffix: '' }];
      const validation = await validateBundleAudio({
        records: filteredRecords,
        audioFolder,
        processedDir,
        processedNameMap,
        variants: variantsForCheck,
      });
      finalMissing = validation.missing || [];
    } catch (vErr) {
      console.warn('[bundler] validation failed:', vErr.message);
    }

    return {
      success: true,
      recordCount: filteredRecords.length,
      audioFileCount: soundFiles.size,
      missingSoundFiles: finalMissing.length > 0 ? finalMissing : null,
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
