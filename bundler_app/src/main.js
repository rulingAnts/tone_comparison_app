const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
    
    // Extract record data for hierarchy analysis (only non-attribute fields)
    const records = dataForms.map(form => {
      const record = {};
      fields.forEach(field => {
        record[field] = form[field] || '';
      });
      return record;
    });
    
    return {
      success: true,
      fields,
      recordCount: dataForms.length,
      records, // Include full record data for hierarchy analysis
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

// Helper function: Find most common values for group metadata
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

// Helper function: Detect conflicts in group metadata
function detectGroupConflicts(groups, dataForms, pitchKey, abbreviationKey, exemplarKey) {
  const conflicts = [];
  
  groups.forEach(group => {
    const groupConflicts = {
      groupNumber: group.groupNumber,
      groupId: group.id,
      groupingValue: group.groupingValue,
      pitchConflicts: [],
      abbreviationConflicts: [],
      exemplarConflicts: [],
    };
    
    group.members.forEach(ref => {
      const record = dataForms.find(df => normalizeRefString(df.Reference) === ref);
      if (!record) return;
      
      if (pitchKey && group.pitchTranscription !== undefined) {
        const recordValue = record[pitchKey];
        if (recordValue && recordValue !== group.pitchTranscription) {
          groupConflicts.pitchConflicts.push({
            reference: ref,
            currentValue: recordValue,
            willBecome: group.pitchTranscription,
          });
        }
      }
      
      if (abbreviationKey && group.toneAbbreviation !== undefined) {
        const recordValue = record[abbreviationKey];
        if (recordValue && recordValue !== group.toneAbbreviation) {
          groupConflicts.abbreviationConflicts.push({
            reference: ref,
            currentValue: recordValue,
            willBecome: group.toneAbbreviation,
          });
        }
      }
      
      if (exemplarKey && group.exemplarWord !== undefined) {
        const recordValue = record[exemplarKey];
        if (recordValue && recordValue !== group.exemplarWord) {
          groupConflicts.exemplarConflicts.push({
            reference: ref,
            currentValue: recordValue,
            willBecome: group.exemplarWord,
          });
        }
      }
    });
    
    if (groupConflicts.pitchConflicts.length > 0 ||
        groupConflicts.abbreviationConflicts.length > 0 ||
        groupConflicts.exemplarConflicts.length > 0) {
      conflicts.push(groupConflicts);
    }
  });
  
  return conflicts;
}

// Check for conflicts in source XML data
ipcMain.handle('check-conflicts', async (event, { xmlPath, settings }) => {
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
    
    // Determine most common metadata for each group
    groups.forEach(group => {
      const commonMetadata = findMostCommonGroupMetadata(
        group.members,
        dataForms,
        pitchKey,
        abbreviationKey,
        exemplarKey
      );
      
      group.pitchTranscription = commonMetadata.pitchTranscription;
      group.toneAbbreviation = commonMetadata.toneAbbreviation;
      group.exemplarWord = commonMetadata.exemplarWord;
    });
    
    // Detect conflicts
    const conflicts = detectGroupConflicts(
      groups,
      dataForms,
      pitchKey,
      abbreviationKey,
      exemplarKey
    );
    
    return {
      success: true,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts,
      groupCount: groups.size,
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

ipcMain.handle('create-bundle', async (event, config) => {
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
    console.log('[create-bundle] settings.bundleType:', settings?.bundleType);
    console.log('[create-bundle] settings.hierarchyTree exists:', !!settings?.hierarchyTree);
    
    if (bundleType === 'hierarchical') {
      console.log('[create-bundle] Creating HIERARCHICAL bundle');
      return await createHierarchicalBundle(config, event);
    } else {
      console.log('[create-bundle] Creating LEGACY bundle');
      return await createLegacyBundle(config, event);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

async function createLegacyBundle(config, event) {
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

    // Check if output path exists and is a directory
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.isDirectory()) {
        throw new Error(`Output path "${outputPath}" already exists as a directory. Please delete it or choose a different filename.`);
      }
      // If it's a file, we'll overwrite it (normal behavior)
      console.log('[bundler] Output file exists, will overwrite');
    }

    // Create zip bundle with user-selected compression level
    const compressionLevel = settingsWithMeta?.compressionLevel !== undefined ? settingsWithMeta.compressionLevel : 6;
    console.log('[bundler] Using compression level:', compressionLevel);
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: compressionLevel } });
    
    // Track archive progress for UI feedback
    let lastProgressPercent = 0;
    archive.on('progress', (progress) => {
      const percent = Math.round((progress.fs.processedBytes / progress.fs.totalBytes) * 100);
      // Only send updates when percentage changes to avoid flooding
      if (percent !== lastProgressPercent && percent >= 0 && percent <= 100) {
        lastProgressPercent = percent;
        mainWindow?.webContents?.send('archive-progress', {
          type: 'progress',
          percent: percent,
          processedBytes: progress.fs.processedBytes,
          totalBytes: progress.fs.totalBytes
        });
      }
    });
    
    // Error handling for archive
    archive.on('error', (err) => {
      throw err;
    });
    
    output.on('error', (err) => {
      throw err;
    });
    
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
    
    // Send progress event and ensure UI has time to update before starting finalization
    mainWindow?.webContents?.send('archive-progress', { type: 'start' });
    await new Promise(resolve => setTimeout(resolve, 100)); // Give UI time to show progress
    console.log('[bundler] Finalizing archive...');
    
    // Monitor finalization progress with polling since archiver doesn't emit progress during finalize
    let finalizeDone = false;
    const progressInterval = setInterval(() => {
      if (!finalizeDone) {
        const currentBytes = archive.pointer();
        mainWindow?.webContents?.send('archive-progress', {
          type: 'finalizing',
          bytesWritten: currentBytes
        });
      }
    }, 500); // Update every 500ms
    
    try {
      await archive.finalize();
      finalizeDone = true;
      clearInterval(progressInterval);
      mainWindow?.webContents?.send('archive-progress', { 
        type: 'done',
        totalBytes: archive.pointer() 
      });
    } catch (error) {
      finalizeDone = true;
      clearInterval(progressInterval);
      throw error;
    }
    
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
    
    // Clean up processed audio cache after bundle creation
    if (processedDir && fs.existsSync(processedDir)) {
      try {
        fs.rmSync(processedDir, { recursive: true, force: true });
        console.log('[bundler] Cleaned up processed audio cache:', processedDir);
      } catch (cleanupErr) {
        console.warn('[bundler] Failed to clean up processed audio cache:', cleanupErr.message);
      }
    }

    return {
      success: true,
      recordCount: filteredRecords.length,
      audioFileCount: soundFiles.size,
      missingSoundFiles: finalMissing.length > 0 ? finalMissing : null,
    };
  } catch (error) {
    // Clean up on error too
    if (typeof processedDir !== 'undefined' && processedDir && fs.existsSync(processedDir)) {
      try {
        fs.rmSync(processedDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors on error path
      }
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

async function createHierarchicalBundle(config, event) {
  try {
    const {
      xmlPath,
      audioFolder,
      outputPath,
      settings,
    } = config;
    
    const settingsWithMeta = { ...(settings || {}) };
    if (!settingsWithMeta.bundleId) settingsWithMeta.bundleId = generateUuid();
    if (settingsWithMeta.bundleDescription == null) settingsWithMeta.bundleDescription = '';
    
    // Read original XML file (preserve exact encoding and format)
    const xmlBuffer = fs.readFileSync(xmlPath);
    const xmlData = xmlBuffer.toString('utf16le');
    
    // Parse XML
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
    
    // Check for duplicate References
    const duplicates = checkDuplicateReferences(dataForms);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate Reference values found: ${duplicates.join(', ')}. Please fix the source XML before creating bundle.`);
    }
    
    // For hierarchical bundles, use all data_forms (hierarchy filtering happens in sub-bundle generation)
    // Reference number filtering is only for legacy bundles
    let filteredRecords = sortByNumericRef(dataForms);
    
    console.log('[hierarchical] Starting with', filteredRecords.length, 'total records (hierarchy will filter)');
    
    // Get hierarchy tree from settings (new tree format or legacy levels format)
    const settingsTree = settingsWithMeta.hierarchyTree;
    const hierarchyLevels = settingsWithMeta.hierarchyLevels; // Legacy support
    
    console.log('[hierarchical] settingsTree:', settingsTree ? 'EXISTS' : 'NULL');
    console.log('[hierarchical] hierarchyLevels:', hierarchyLevels ? 'EXISTS' : 'NULL');
    if (settingsTree) {
      console.log('[hierarchical] settingsTree.field:', settingsTree.field);
      console.log('[hierarchical] settingsTree.values length:', settingsTree.values?.length);
    }
    
    if (!settingsTree && (!hierarchyLevels || hierarchyLevels.length === 0)) {
      throw new Error('Hierarchical bundle requires hierarchy configuration');
    }
    
    // Generate sub-bundles from tree structure (temporary - will be replaced with hierarchy.json approach)
    const subBundles = settingsTree 
      ? generateSubBundlesFromTree(filteredRecords, settingsTree, '', [])
      : generateSubBundles(filteredRecords, hierarchyLevels, 0, '', settingsWithMeta); // Legacy fallback
    
    console.log('[hierarchical] Generated', subBundles.length, 'sub-bundles');
    
    if (subBundles.length === 0) {
      throw new Error('No sub-bundles were generated. Please check your hierarchy configuration.');
    }
    
    // Collect sound files ONLY from records in sub-bundles (after hierarchy filtering)
    // Track which files exist and which are missing
    const soundFiles = new Set();
    const missingSoundFiles = []; // Array of { file, ref, suffix }
    const audioVariantConfigs = settingsWithMeta.audioFileVariants || [];
    
    // Count records included vs total
    const includedRecords = new Set();
    for (const subBundle of subBundles) {
      for (const record of subBundle.records) {
        const ref = normalizeRefString(record.Reference);
        if (ref) includedRecords.add(ref);
        
        if (record.SoundFile) {
          const baseSoundFile = record.SoundFile;
          const lastDot = baseSoundFile.lastIndexOf('.');
          const basename = lastDot !== -1 ? baseSoundFile.substring(0, lastDot) : baseSoundFile;
          const ext = lastDot !== -1 ? baseSoundFile.substring(lastDot) : '';
          const refNum = record.Ref || ref || 'unknown';
          
          // Check base file
          const baseFilePath = path.join(audioFolder, baseSoundFile);
          if (fs.existsSync(baseFilePath)) {
            soundFiles.add(baseSoundFile);
          } else {
            missingSoundFiles.push({
              file: baseSoundFile,
              ref: refNum,
              suffix: '(no suffix)'
            });
          }
          
          // Check variant files
          for (const variant of audioVariantConfigs) {
            if (variant.suffix) {
              const variantFile = `${basename}${variant.suffix}${ext}`;
              const variantPath = path.join(audioFolder, variantFile);
              if (fs.existsSync(variantPath)) {
                soundFiles.add(variantFile);
              } else {
                missingSoundFiles.push({
                  file: variantFile,
                  ref: refNum,
                  suffix: variant.suffix
                });
              }
            }
          }
        }
      }
    }
    
    const recordsIncluded = includedRecords.size;
    const recordsExcluded = filteredRecords.length - recordsIncluded;
    
    console.log('[hierarchical] Records: included=', recordsIncluded, ', excluded=', recordsExcluded, ', total=', filteredRecords.length);
    console.log('[hierarchical] Audio files: found=', soundFiles.size, ', missing=', missingSoundFiles.length);
    if (missingSoundFiles.length > 0) {
      console.log('[hierarchical] First 5 missing:', missingSoundFiles.slice(0, 5));
    }
    
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

        console.log('[hierarchical] Processing enabled. autoTrim:', !!ap.autoTrim, 'autoNormalize:', !!ap.autoNormalize, 'convertToFlac:', !!ap.convertToFlac);
        console.log('[hierarchical] Files to process:', inputAbsList.length, 'Output format:', outputFormat);

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
                  console.warn('[hierarchical] ffmpeg error for', info.inFile, '->', info.error);
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
          console.log('[hierarchical] Processing complete. Output dir:', processedDir);
          
          // Create processing report for archive
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
        console.warn('[hierarchical] Audio processing failed, falling back to originals:', procErr.message);
        mainWindow?.webContents?.send('audio-processing-progress', { type: 'skipped' });
        processedDir = null;
      }
    } else {
      if (!liteNormalizer) {
        console.warn('[hierarchical] Processing disabled because normalizer unavailable. enabled=', wantsProcessing);
      } else {
        console.log('[hierarchical] Processing disabled by user options.');
      }
    }
    
    // Check if output path exists and is a directory
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.isDirectory()) {
        throw new Error(`Output path "${outputPath}" already exists as a directory. Please delete it or choose a different filename.`);
      }
      console.log('[hierarchical] Output file exists, will overwrite');
    }
    
    // Create .tnset archive with user-selected compression level
    const compressionLevel = settingsWithMeta?.compressionLevel !== undefined ? settingsWithMeta.compressionLevel : 6;
    console.log('[bundler] Using compression level:', compressionLevel);
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: compressionLevel } });
    
    // Track archive progress for UI feedback
    let lastProgressPercent = 0;
    archive.on('progress', (progress) => {
      const percent = Math.round((progress.fs.processedBytes / progress.fs.totalBytes) * 100);
      // Only send updates when percentage changes to avoid flooding
      if (percent !== lastProgressPercent && percent >= 0 && percent <= 100) {
        lastProgressPercent = percent;
        mainWindow?.webContents?.send('archive-progress', {
          type: 'progress',
          percent: percent,
          processedBytes: progress.fs.processedBytes,
          totalBytes: progress.fs.totalBytes
        });
      }
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    output.on('error', (err) => {
      throw err;
    });
    
    archive.pipe(output);
    
    // Add original_data.xml to xml/ folder (preserve exact format and encoding)
    archive.file(xmlPath, { name: 'xml/original_data.xml' });
    
    // Create working_data.xml (copy of original for now - will be updated by desktop app later)
    archive.file(xmlPath, { name: 'xml/working_data.xml' });
    
    console.log('[hierarchical] Added XML files to xml/ folder');
    
    // Add all audio files to audio/ folder (flat structure)
    // IMPORTANT: Only add audio for records that are actually in sub-bundles (after hierarchy filtering)
    
    for (const soundFile of soundFiles) {
      let srcPath;
      let actualFileName = soundFile;
      
      if (processedDir && processedNameMap.has(soundFile)) {
        const processedName = processedNameMap.get(soundFile);
        srcPath = path.join(processedDir, processedName);
        actualFileName = processedName;
      } else {
        srcPath = path.join(audioFolder, soundFile);
      }
      
      if (fs.existsSync(srcPath)) {
        archive.file(srcPath, { name: `audio/${actualFileName}` });
      } else {
        console.warn('[hierarchical] Audio file not found:', srcPath);
      }
    }
    
    console.log('[hierarchical] Added', soundFiles.size, 'audio files to audio/ folder');
    
    // Build hierarchy.json with complete structure
    const buildHierarchyFromTree = (node, records) => {
      if (!node || !node.field) return null;
      
      // Handle organizational nodes
      if (node.isOrganizational && node.organizationalGroups) {
        const field = node.organizationalBaseField || '';
        
        // Build organizational group structure - groups become parent nodes
        const organizationalValues = [];
        
        // Process each organizational group
        for (const group of node.organizationalGroups) {
          // Skip excluded groups
          if (group.included === false) continue;
          
          if (group.children && group.children.values) {
            const includedGroupValues = group.children.values.filter(v => v.included !== false);
            
            // Build children for this organizational group
            const groupChildren = [];
            
            for (const valueConfig of includedGroupValues) {
              // Filter records for this specific value
              const valueRecords = records.filter(r => r[field] === valueConfig.value);
              
              if (valueRecords.length > 0) {
                const childNode = {
                  value: valueConfig.value,
                  label: valueConfig.value,
                  recordCount: valueRecords.length,
                  audioVariants: valueConfig.audioVariants || [],
                  references: valueRecords.map(r => normalizeRefString(r.Reference)).filter(ref => ref)
                };
                
                // Recursively build children if they exist
                if (valueConfig.children && valueConfig.children.field) {
                  const childTree = buildHierarchyFromTree(valueConfig.children, valueRecords);
                  if (childTree && childTree.values && childTree.values.length > 0) {
                    childNode.children = childTree.values;
                    // For non-leaf nodes, don't include references at this level
                    delete childNode.references;
                  }
                }
                
                groupChildren.push(childNode);
              }
            }
            
            // Create organizational group as parent node
            if (groupChildren.length > 0) {
              organizationalValues.push({
                value: group.name,
                label: group.name,
                recordCount: groupChildren.reduce((sum, child) => sum + child.recordCount, 0),
                children: groupChildren
              });
            }
          }
        }
        
        // Process unassigned values as direct children (not under a group)
        if (node.unassignedValues) {
          const includedUnassigned = node.unassignedValues.filter(v => v.included !== false);
          
          for (const valueConfig of includedUnassigned) {
            const valueRecords = records.filter(r => r[field] === valueConfig.value);
            
            if (valueRecords.length > 0) {
              const valueNode = {
                value: valueConfig.value,
                label: valueConfig.value,
                recordCount: valueRecords.length,
                audioVariants: valueConfig.audioVariants || [],
                references: valueRecords.map(r => normalizeRefString(r.Reference)).filter(ref => ref)
              };
              
              // Recursively build children if they exist
              if (valueConfig.children && valueConfig.children.field) {
                const childTree = buildHierarchyFromTree(valueConfig.children, valueRecords);
                if (childTree && childTree.values && childTree.values.length > 0) {
                  valueNode.children = childTree.values;
                  // For non-leaf nodes, don't include references at this level
                  delete valueNode.references;
                }
              }
              
              organizationalValues.push(valueNode);
            }
          }
        }
        
        return {
          field: field,
          isOrganizational: true,
          values: organizationalValues
        };
      }
      
      // Regular (non-organizational) node handling
      const field = node.field;
      const includedValues = (node.values || []).filter(v => v.included);
      
      // Group records by value
      const valueGroups = new Map();
      for (const record of records) {
        const value = record[field];
        const valueConfig = includedValues.find(v => v.value === value);
        if (value && valueConfig) {
          if (!valueGroups.has(value)) {
            valueGroups.set(value, { records: [], valueConfig });
          }
          valueGroups.get(value).records.push(record);
        }
      }
      
      // Build values array with children and Reference lists
      const values = [];
      for (const [value, groupData] of valueGroups.entries()) {
        const { records: valueRecords, valueConfig } = groupData;
        const valueNode = {
          value: value,
          label: valueConfig.label || value,
          recordCount: valueRecords.length,
          audioVariants: valueConfig.audioVariants || [],
          // Add Reference list (preserving leading zeros)
          references: valueRecords.map(r => normalizeRefString(r.Reference)).filter(ref => ref)
        };
        
        // Recursively build children if they exist
        if (valueConfig.children && valueConfig.children.field) {
          const childTree = buildHierarchyFromTree(valueConfig.children, valueRecords);
          if (childTree && childTree.values && childTree.values.length > 0) {
            valueNode.children = childTree.values;
            // For non-leaf nodes, don't include references at this level
            delete valueNode.references;
          }
        }
        
        values.push(valueNode);
      }
      
      return {
        field: field,
        values: values
      };
    };
    
    const hierarchyJsonTree = settingsTree 
      ? buildHierarchyFromTree(settingsTree, filteredRecords)
      : null;
    
    if (!hierarchyJsonTree) {
      throw new Error('Failed to build hierarchy tree. Please ensure hierarchy is configured in the UI.');
    }
    
    const hierarchy = {
      tree: hierarchyJsonTree,
      audioVariants: settingsWithMeta.audioFileVariants || []
    };
    archive.append(JSON.stringify(hierarchy, null, 2), { name: 'hierarchy.json' });
    
    console.log('[hierarchical] Generated hierarchy.json with Reference lists');
    
    // Add settings.json
    archive.append(JSON.stringify(settingsWithMeta, null, 2), { name: 'settings.json' });
    
    // Add processing report if available
    if (typeof processingReport !== 'undefined') {
      archive.append(JSON.stringify(processingReport, null, 2), { name: 'processing_report.json' });
      console.log('[hierarchical] Added processing report');
    }
    
    // Send progress event and ensure UI has time to update before starting finalization
    mainWindow?.webContents?.send('archive-progress', { type: 'start' });
    await new Promise(resolve => setTimeout(resolve, 100)); // Give UI time to show progress
    console.log('[bundler] Finalizing archive...');
    
    // Monitor finalization progress with polling since archiver doesn't emit progress during finalize
    let finalizeDone = false;
    const progressInterval = setInterval(() => {
      if (!finalizeDone) {
        const currentBytes = archive.pointer();
        mainWindow?.webContents?.send('archive-progress', {
          type: 'finalizing',
          bytesWritten: currentBytes
        });
      }
    }, 500); // Update every 500ms
    
    try {
      await archive.finalize();
      finalizeDone = true;
      clearInterval(progressInterval);
      console.log('[bundler] Archive finalized');
      
      // Wait for output stream to finish
      await new Promise((resolve, reject) => {
        output.on('close', () => {
          console.log('[bundler] Archive written successfully. Total bytes:', archive.pointer());
          mainWindow?.webContents?.send('archive-progress', { 
            type: 'done',
            totalBytes: archive.pointer() 
          });
          resolve();
        });
        output.on('error', reject);
      });
    } catch (error) {
      finalizeDone = true;
      clearInterval(progressInterval);
      throw error;
    }
    
    console.log('[bundler] Hierarchical bundle creation complete');
    
    // Clean up processed audio cache after bundle creation
    if (typeof processedDir !== 'undefined' && processedDir && fs.existsSync(processedDir)) {
      try {
        fs.rmSync(processedDir, { recursive: true, force: true });
        console.log('[hierarchical] Cleaned up processed audio cache:', processedDir);
      } catch (cleanupErr) {
        console.warn('[hierarchical] Failed to clean up processed audio cache:', cleanupErr.message);
      }
    }
    
    return {
      success: true,
      recordCount: filteredRecords.length, // Total records in XML
      recordsIncluded: recordsIncluded, // Records actually included in hierarchy
      recordsExcluded: recordsExcluded, // Records excluded by hierarchy configuration
      audioFileCount: soundFiles.size,
      missingSoundFiles: missingSoundFiles.length > 0 ? missingSoundFiles : null,
      subBundleCount: subBundles.length,
      hierarchicalBundle: true,
    };
  } catch (error) {
    // Clean up on error too
    if (typeof processedDir !== 'undefined' && processedDir && fs.existsSync(processedDir)) {
      try {
        fs.rmSync(processedDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors on error path
      }
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

function generateSubBundlesFromTree(records, node, pathPrefix, parentAudioVariants) {
  const subBundles = [];
  
  if (!node || !node.field) {
    return subBundles;
  }
  
  // Handle organizational nodes
  if (node.isOrganizational && node.organizationalGroups) {
    const field = node.organizationalBaseField || '';
    const allValues = [];
    
    // Collect values from included organizational groups
    for (const group of node.organizationalGroups) {
      // Skip excluded groups
      if (group.included === false) continue;
      
      if (group.children && group.children.values) {
        const includedGroupValues = group.children.values.filter(v => v.included !== false);
        allValues.push(...includedGroupValues);
      }
    }
    
    // Add included unassigned values
    if (node.unassignedValues) {
      const includedUnassigned = node.unassignedValues.filter(v => v.included !== false);
      allValues.push(...includedUnassigned);
    }
    
    // Group records by field value
    const groups = new Map();
    for (const record of records) {
      const value = record[field];
      const valueConfig = allValues.find(v => v.value === value);
      if (value && valueConfig) {
        if (!groups.has(value)) {
          groups.set(value, { records: [], valueConfig });
        }
        groups.get(value).records.push(record);
      }
    }
    
    // Generate sub-bundles for each included value
    for (const [value, groupData] of groups.entries()) {
      const { records: groupRecords, valueConfig } = groupData;
      const safeName = value.replace(/[^a-zA-Z0-9_-]/g, '_');
      const newPath = pathPrefix ? `${pathPrefix}/${safeName}` : safeName;
      
      const audioVariants = Array.isArray(valueConfig.audioVariants) && valueConfig.audioVariants.length > 0
        ? valueConfig.audioVariants
        : (parentAudioVariants || []);
      
      // Check if organizational value has children
      if (valueConfig.children && valueConfig.children.field) {
        // Recurse into children (can be more organizational nodes or regular nodes)
        const childBundles = generateSubBundlesFromTree(
          groupRecords,
          valueConfig.children,
          newPath,
          audioVariants
        );
        subBundles.push(...childBundles);
      } else {
        // Leaf node - create sub-bundle
        subBundles.push({
          path: newPath,
          categoryPath: newPath,
          records: groupRecords,
          audioVariants: audioVariants,
          label: value
        });
      }
    }
    
    return subBundles;
  }
  
  // Regular (non-organizational) node handling
  const field = node.field;
  const includedValues = (node.values || []).filter(v => v.included);
  
  // Group records by field value
  const groups = new Map();
  for (const record of records) {
    const value = record[field];
    const valueConfig = includedValues.find(v => v.value === value);
    if (value && valueConfig) {
      if (!groups.has(value)) {
        groups.set(value, { records: [], valueConfig });
      }
      groups.get(value).records.push(record);
    }
  }
  
  // Generate sub-bundles for each value
  for (const [value, groupData] of groups.entries()) {
    const { records: groupRecords, valueConfig } = groupData;
    const safeName = value.replace(/[^a-zA-Z0-9_-]/g, '_');
    const newPath = pathPrefix ? `${pathPrefix}/${safeName}` : safeName;
    
    // Use value's audioVariants (already inherits from parent during UI config)
    const audioVariants = Array.isArray(valueConfig.audioVariants) && valueConfig.audioVariants.length > 0
      ? valueConfig.audioVariants
      : (parentAudioVariants || []);
    
    // Check if this value has children
    if (valueConfig.children && valueConfig.children.field) {
      // Recurse into children
      const childBundles = generateSubBundlesFromTree(
        groupRecords, 
        valueConfig.children, 
        newPath, 
        audioVariants
      );
      subBundles.push(...childBundles);
    } else {
      // Leaf node - create sub-bundle
      subBundles.push({
        path: newPath,
        categoryPath: newPath,
        records: groupRecords,
        audioVariants: audioVariants,
        label: valueConfig.label || value
      });
    }
  }
  
  return subBundles;
}

function generateSubBundles(records, hierarchyLevels, levelIndex, pathPrefix, settings, parentAudioVariants = null) {
  const subBundles = [];
  
  if (levelIndex >= hierarchyLevels.length) {
    // Leaf node - create a sub-bundle
    return [{
      path: pathPrefix || 'root',
      categoryPath: pathPrefix || 'root',
      records: records,
      audioVariants: parentAudioVariants || []
    }];
  }
  
  const level = hierarchyLevels[levelIndex];
  const field = level.field;
  const includedValues = level.values.filter(v => v.included);
  
  // Group records by field value
  const groups = new Map();
  for (const record of records) {
    const value = record[field];
    const valueConfig = includedValues.find(v => v.value === value);
    if (value && valueConfig) {
      if (!groups.has(value)) {
        groups.set(value, { records: [], valueConfig });
      }
      groups.get(value).records.push(record);
    }
  }
  
  // Generate sub-bundles for each group
  for (const [value, groupData] of groups.entries()) {
    const { records: groupRecords, valueConfig } = groupData;
    const safeName = value.replace(/[^a-zA-Z0-9_-]/g, '_');
    const newPath = pathPrefix ? `${pathPrefix}/${safeName}` : safeName;
    
    // Determine which audio variants to use for this value
    const audioVariants = Array.isArray(valueConfig.audioVariants) && valueConfig.audioVariants.length > 0
      ? valueConfig.audioVariants
      : (parentAudioVariants || []);
    
    if (levelIndex === hierarchyLevels.length - 1) {
      // This is the last level - create leaf sub-bundle
      subBundles.push({
        path: newPath,
        categoryPath: newPath,
        records: groupRecords,
        audioVariants: audioVariants,
        label: valueConfig.label || value
      });
    } else {
      // Recurse to next level
      const childBundles = generateSubBundles(groupRecords, hierarchyLevels, levelIndex + 1, newPath, settings, audioVariants);
      subBundles.push(...childBundles);
    }
  }
  
  return subBundles;
}

function createSubBundleXml(records, tgKey, tgIdKey) {
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

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<phon_data>',
    ...records.map((r) => buildDataForm(r)),
    '</phon_data>',
    '',
  ].join('\n');
}

ipcMain.handle('select-output-file', async (event, bundleType = 'legacy') => {
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
