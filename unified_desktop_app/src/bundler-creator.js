/**
 * Bundle Creation Logic
 * 
 * This module contains the complex bundle creation functions for both
 * legacy and hierarchical bundle types.
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { XMLParser } = require('fast-xml-parser');
const { normalizeRefString, toNumericRef, sortByNumericRef } = require('./utils/refUtils');
const { validateBundleAudio, checkDuplicateReferences } = require('./validator');
const { applyFilters } = require('./filter-engine');

const BLANK_VALUE = '(blank)';

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

async function createLegacyBundle(config, mainWindow, liteNormalizer, app) {
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
    
    // Ensure audio variants exist
    if (!Array.isArray(settingsWithMeta.audioFileVariants) || settingsWithMeta.audioFileVariants.length === 0) {
      const suf = (settingsWithMeta.audioFileSuffix || '');
      settingsWithMeta.audioFileVariants = [
        { description: 'Default', suffix: suf },
      ];
    }
    
    // Keep legacy audioFileSuffix equal to first variant
    const firstSuf = (settingsWithMeta.audioFileVariants[0]?.suffix || '');
    settingsWithMeta.audioFileSuffix = firstSuf === '' ? null : firstSuf;
    
    // Parse XML
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
    
    // Apply filter configuration
    let filteredByFilters = dataForms;
    if (settingsWithMeta.filterGroups && settingsWithMeta.filterGroups.length > 0) {
      filteredByFilters = applyFilters(dataForms, settingsWithMeta.filterGroups);
      console.log(`[createLegacyBundle] Filters applied: ${dataForms.length} -> ${filteredByFilters.length} records`);
    }
    
    // Filter records by reference numbers
    const referenceNumbers = (settingsWithMeta.referenceNumbers || []).map((r) => normalizeRefString(r));
    const refSet = new Set(referenceNumbers);
    let filteredRecords = referenceNumbers.length > 0
      ? filteredByFilters.filter(df => {
          const ref = df && df.Reference != null ? normalizeRefString(df.Reference) : '';
          return refSet.has(ref);
        })
      : filteredByFilters;

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
    console.log('[bundler] Audio files:', soundFiles.size, 'Missing:', missingSoundFiles.length);

    // Audio processing
    const ap = settingsWithMeta.audioProcessing || {};
    const wantsProcessing = !!ap.autoTrim || !!ap.autoNormalize || !!ap.convertToFlac;
    const outputFormat = ap.convertToFlac ? 'flac' : 'wav16';
    let processedDir = null;
    const processedNameMap = new Map();
    let processingReport;

    if (wantsProcessing && liteNormalizer) {
      try {
        const inputAbsList = Array.from(soundFiles)
          .map((name) => path.join(audioFolder, name))
          .filter((abs) => fs.existsSync(abs));

        console.log('[bundler] Processing enabled. Files:', inputAbsList.length);

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
          
          processingReport = {
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
        console.warn('[bundler] Audio processing failed:', procErr.message);
        mainWindow?.webContents?.send('audio-processing-progress', { type: 'skipped' });
        processedDir = null;
      }
    }

    // Create minimized XML
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
        if (k === tgKey || k === tgIdKey) continue;
        const v = rec[k];
        if (isBlankValue(v)) {
          parts.push(`  <${k}/>`);
        } else {
          parts.push(`  <${k}>${escapeXml(v)}</${k}>`);
        }
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

    // Check output path
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.isDirectory()) {
        throw new Error(`Output path "${outputPath}" is a directory. Choose a different filename.`);
      }
    }

    // Create zip bundle
    const compressionLevel = settingsWithMeta?.compressionLevel !== undefined ? settingsWithMeta.compressionLevel : 6;
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: compressionLevel } });
    
    let lastProgressPercent = 0;
    archive.on('progress', (progress) => {
      const percent = Math.round((progress.fs.processedBytes / progress.fs.totalBytes) * 100);
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
    
    archive.on('error', (err) => { throw err; });
    output.on('error', (err) => { throw err; });
    archive.pipe(output);
    
    // Add files
    archive.append(subsetXml, { name: 'data.xml' });
    archive.append(JSON.stringify(settingsWithMeta, null, 2), { name: 'settings.json' });
    
    if (processingReport) {
      archive.append(JSON.stringify(processingReport, null, 2), { name: 'processing_report.json' });
    }
    
    // Add audio files
    for (const soundFile of soundFiles) {
      const srcPath = path.join(audioFolder, soundFile);
      let addPath = srcPath;
      let addName = `audio/${soundFile}`;

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
    
    mainWindow?.webContents?.send('archive-progress', { type: 'start' });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let finalizeDone = false;
    const progressInterval = setInterval(() => {
      if (!finalizeDone) {
        mainWindow?.webContents?.send('archive-progress', {
          type: 'finalizing',
          bytesWritten: archive.pointer()
        });
      }
    }, 500);
    
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
    
    // Validation
    let finalMissing = missingSoundFiles;
    try {
      const validation = await validateBundleAudio({
        records: filteredRecords,
        audioFolder,
        processedDir,
        processedNameMap,
        variants: settingsWithMeta.audioFileVariants || [{ suffix: '' }],
      });
      finalMissing = validation.missing || [];
    } catch (vErr) {
      console.warn('[bundler] validation failed:', vErr.message);
    }
    
    // Cleanup
    if (processedDir && fs.existsSync(processedDir)) {
      try {
        fs.rmSync(processedDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('[bundler] Cleanup failed:', cleanupErr.message);
      }
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
}

async function createHierarchicalBundle(config, mainWindow, liteNormalizer, app) {
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
    
    const isLinkedBundle = settingsWithMeta.createLinkedBundle === true;
    
    if (isLinkedBundle) {
      console.log('[hierarchical] Creating LINKED bundle');
      settingsWithMeta.linkedBundle = true;
      settingsWithMeta.linkedXmlPath = xmlPath;
      settingsWithMeta.linkedAudioFolder = audioFolder;
    }
    
    // Read XML
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
    
    // Check duplicates
    const duplicates = checkDuplicateReferences(dataForms);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate Reference values: ${duplicates.join(', ')}`);
    }
    
    // Apply filters
    let filteredByFilters = dataForms;
    if (settingsWithMeta.filterGroups && settingsWithMeta.filterGroups.length > 0) {
      filteredByFilters = applyFilters(dataForms, settingsWithMeta.filterGroups);
    }
    
    let filteredRecords = sortByNumericRef(filteredByFilters);
    
    // Get hierarchy tree
    const settingsTree = settingsWithMeta.hierarchyTree;
    const hierarchyLevels = settingsWithMeta.hierarchyLevels;
    
    if (!settingsTree && (!hierarchyLevels || hierarchyLevels.length === 0)) {
      throw new Error('Hierarchical bundle requires hierarchy configuration');
    }
    
    // Generate sub-bundles (simplified for now)
    const subBundles = settingsTree 
      ? generateSubBundlesFromTree(filteredRecords, settingsTree, '', [])
      : [];
    
    if (subBundles.length === 0) {
      throw new Error('No sub-bundles were generated');
    }
    
    // Collect sound files
    const soundFiles = new Set();
    const missingSoundFiles = [];
    const audioVariantConfigs = settingsWithMeta.audioFileVariants || [];
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
          
          const baseFilePath = path.join(audioFolder, baseSoundFile);
          if (fs.existsSync(baseFilePath)) {
            soundFiles.add(baseSoundFile);
          } else {
            missingSoundFiles.push({ file: baseSoundFile, ref, suffix: '(no suffix)' });
          }
          
          for (const variant of audioVariantConfigs) {
            if (variant.suffix) {
              const variantFile = `${basename}${variant.suffix}${ext}`;
              const variantPath = path.join(audioFolder, variantFile);
              if (fs.existsSync(variantPath)) {
                soundFiles.add(variantFile);
              } else {
                missingSoundFiles.push({ file: variantFile, ref, suffix: variant.suffix });
              }
            }
          }
        }
      }
    }
    
    const recordsIncluded = includedRecords.size;
    const recordsExcluded = filteredRecords.length - recordsIncluded;
    
    console.log('[hierarchical] Records:', recordsIncluded, 'included,', recordsExcluded, 'excluded');
    
    // Audio processing (same as legacy)
    const ap = settingsWithMeta.audioProcessing || {};
    const wantsProcessing = !!ap.autoTrim || !!ap.autoNormalize || !!ap.convertToFlac;
    const outputFormat = ap.convertToFlac ? 'flac' : 'wav16';
    let processedDir = null;
    const processedNameMap = new Map();
    let processingReport;

    if (wantsProcessing && liteNormalizer) {
      try {
        const inputAbsList = Array.from(soundFiles)
          .map((name) => path.join(audioFolder, name))
          .filter((abs) => fs.existsSync(abs));

        if (inputAbsList.length > 0) {
          processedDir = path.join(app.getPath('userData'), 'bundler-processed-audio', String(Date.now()));
          fs.mkdirSync(processedDir, { recursive: true });

          const tStart = Date.now();
          mainWindow?.webContents?.send('audio-processing-progress', { type: 'start', total: inputAbsList.length, startTime: tStart });

          const procResult = await liteNormalizer.normalizeBatch({
            input: audioFolder,
            output: processedDir,
            files: inputAbsList,
            autoNormalize: !!ap.autoNormalize,
            autoTrim: !!ap.autoTrim,
            outputFormat,
            onProgress: (info) => {
              if (info.type === 'file-done' || info.type === 'file-error') {
                mainWindow?.webContents?.send('audio-processing-progress', {
                  type: info.type,
                  completed: info.completed,
                  total: info.total,
                  index: info.index,
                  inFile: info.inFile,
                  outFile: info.outFile,
                  error: info.error,
                  startTime: tStart,
                });
              }
            }
          });

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
          
          processingReport = {
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
        console.warn('[hierarchical] Audio processing failed:', procErr.message);
        processedDir = null;
      }
    }
    
    // Check output path
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.isDirectory()) {
        throw new Error(`Output path "${outputPath}" is a directory`);
      }
    }
    
    // Create archive
    const compressionLevel = settingsWithMeta?.compressionLevel !== undefined ? settingsWithMeta.compressionLevel : 6;
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: compressionLevel } });
    
    let lastProgressPercent = 0;
    archive.on('progress', (progress) => {
      const percent = Math.round((progress.fs.processedBytes / progress.fs.totalBytes) * 100);
      if (percent !== lastProgressPercent && percent >= 0 && percent <= 100) {
        lastProgressPercent = percent;
        mainWindow?.webContents?.send('archive-progress', {
          type: 'progress',
          percent,
          processedBytes: progress.fs.processedBytes,
          totalBytes: progress.fs.totalBytes
        });
      }
    });
    
    archive.on('error', (err) => { throw err; });
    output.on('error', (err) => { throw err; });
    archive.pipe(output);
    
    // Add content
    if (isLinkedBundle) {
      const linkMetadata = {
        linkedBundle: true,
        linkedXmlPath: xmlPath,
        linkedAudioFolder: audioFolder,
        bundleCreatedAt: new Date().toISOString(),
      };
      archive.append(JSON.stringify(linkMetadata, null, 2), { name: 'link_metadata.json' });
    } else {
      archive.file(xmlPath, { name: 'xml/original_data.xml' });
      archive.file(xmlPath, { name: 'xml/working_data.xml' });
      
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
        }
      }
    }
    
    // Build hierarchy.json
    const hierarchyJsonTree = settingsTree 
      ? buildHierarchyFromTree(settingsTree, filteredRecords)
      : null;
    
    if (!hierarchyJsonTree) {
      throw new Error('Failed to build hierarchy tree');
    }
    
    const hierarchy = {
      tree: hierarchyJsonTree,
      audioVariants: settingsWithMeta.audioFileVariants || []
    };
    archive.append(JSON.stringify(hierarchy, null, 2), { name: 'hierarchy.json' });
    archive.append(JSON.stringify(settingsWithMeta, null, 2), { name: 'settings.json' });
    
    if (processingReport) {
      archive.append(JSON.stringify(processingReport, null, 2), { name: 'processing_report.json' });
    }
    
    mainWindow?.webContents?.send('archive-progress', { type: 'start' });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let finalizeDone = false;
    const progressInterval = setInterval(() => {
      if (!finalizeDone) {
        mainWindow?.webContents?.send('archive-progress', {
          type: 'finalizing',
          bytesWritten: archive.pointer()
        });
      }
    }, 500);
    
    try {
      await archive.finalize();
      finalizeDone = true;
      clearInterval(progressInterval);
      
      await new Promise((resolve, reject) => {
        output.on('close', () => {
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
    
    // Cleanup
    if (processedDir && fs.existsSync(processedDir)) {
      try {
        fs.rmSync(processedDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('[hierarchical] Cleanup failed:', cleanupErr.message);
      }
    }
    
    return {
      success: true,
      recordCount: filteredRecords.length,
      recordsIncluded,
      recordsExcluded,
      audioFileCount: soundFiles.size,
      missingSoundFiles: missingSoundFiles.length > 0 ? missingSoundFiles : null,
      subBundleCount: subBundles.length,
      hierarchicalBundle: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Helper functions for hierarchical bundles
function generateSubBundlesFromTree(records, node, pathPrefix, parentAudioVariants) {
  const subBundles = [];
  
  if (!node || !node.field) {
    return subBundles;
  }
  
  // Handle organizational nodes
  if (node.isOrganizational && node.organizationalGroups) {
    const field = node.organizationalBaseField || '';
    const allValues = [];
    
    for (const group of node.organizationalGroups) {
      if (group.included === false) continue;
      if (group.children && group.children.values) {
        const includedGroupValues = group.children.values.filter(v => v.included !== false);
        allValues.push(...includedGroupValues);
      }
    }
    
    if (node.unassignedValues) {
      const includedUnassigned = node.unassignedValues.filter(v => v.included !== false);
      allValues.push(...includedUnassigned);
    }
    
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
    
    for (const [value, groupData] of groups.entries()) {
      const { records: groupRecords, valueConfig } = groupData;
      const safeName = value.replace(/[^a-zA-Z0-9_-]/g, '_');
      const newPath = pathPrefix ? `${pathPrefix}/${safeName}` : safeName;
      
      const audioVariants = Array.isArray(valueConfig.audioVariants) && valueConfig.audioVariants.length > 0
        ? valueConfig.audioVariants
        : (parentAudioVariants || []);
      
      if (valueConfig.children && valueConfig.children.field) {
        const childBundles = generateSubBundlesFromTree(groupRecords, valueConfig.children, newPath, audioVariants);
        subBundles.push(...childBundles);
      } else {
        subBundles.push({
          path: newPath,
          categoryPath: newPath,
          records: groupRecords,
          audioVariants,
          label: value
        });
      }
    }
    
    return subBundles;
  }
  
  // Regular node handling
  const field = node.field;
  const includedValues = (node.values || []).filter(v => v.included);
  
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
  
  for (const [value, groupData] of groups.entries()) {
    const { records: groupRecords, valueConfig } = groupData;
    const safeName = value.replace(/[^a-zA-Z0-9_-]/g, '_');
    const newPath = pathPrefix ? `${pathPrefix}/${safeName}` : safeName;
    
    const audioVariants = Array.isArray(valueConfig.audioVariants) && valueConfig.audioVariants.length > 0
      ? valueConfig.audioVariants
      : (parentAudioVariants || []);
    
    if (valueConfig.children && valueConfig.children.field) {
      const childBundles = generateSubBundlesFromTree(groupRecords, valueConfig.children, newPath, audioVariants);
      subBundles.push(...childBundles);
    } else {
      subBundles.push({
        path: newPath,
        categoryPath: newPath,
        records: groupRecords,
        audioVariants,
        label: valueConfig.label || value
      });
    }
  }
  
  return subBundles;
}

function buildHierarchyFromTree(node, records) {
  if (!node || !node.field) return null;
  
  // Handle organizational nodes
  if (node.isOrganizational && node.organizationalGroups) {
    const field = node.organizationalBaseField || '';
    const organizationalValues = [];
    
    for (const group of node.organizationalGroups) {
      if (group.included === false) continue;
      
      if (group.children && group.children.values) {
        const includedGroupValues = group.children.values.filter(v => v.included !== false);
        const groupChildren = [];
        
        for (const valueConfig of includedGroupValues) {
          const normalizedValueConfig = normalizeBlankValue(valueConfig.value);
          const valueRecords = records.filter(r => normalizeBlankValue(r[field]) === normalizedValueConfig);
          
          if (valueRecords.length > 0) {
            const childNode = {
              value: valueConfig.value,
              label: valueConfig.value,
              recordCount: valueRecords.length,
              audioVariants: valueConfig.audioVariants || [],
              references: valueRecords.map(r => normalizeRefString(r.Reference)).filter(ref => ref)
            };
            
            if (valueConfig.children && valueConfig.children.field) {
              const childTree = buildHierarchyFromTree(valueConfig.children, valueRecords);
              if (childTree && childTree.values && childTree.values.length > 0) {
                childNode.children = childTree.values;
                delete childNode.references;
              }
            }
            
            groupChildren.push(childNode);
          }
        }
        
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
    
    if (node.unassignedValues) {
      const includedUnassigned = node.unassignedValues.filter(v => v.included !== false);
      
      for (const valueConfig of includedUnassigned) {
        const normalizedValueConfig = normalizeBlankValue(valueConfig.value);
        const valueRecords = records.filter(r => normalizeBlankValue(r[field]) === normalizedValueConfig);
        
        if (valueRecords.length > 0) {
          const valueNode = {
            value: valueConfig.value,
            label: valueConfig.value,
            recordCount: valueRecords.length,
            audioVariants: valueConfig.audioVariants || [],
            references: valueRecords.map(r => normalizeRefString(r.Reference)).filter(ref => ref)
          };
          
          if (valueConfig.children && valueConfig.children.field) {
            const childTree = buildHierarchyFromTree(valueConfig.children, valueRecords);
            if (childTree && childTree.values && childTree.values.length > 0) {
              valueNode.children = childTree.values;
              delete valueNode.references;
            }
          }
          
          organizationalValues.push(valueNode);
        }
      }
    }
    
    return {
      field,
      isOrganizational: true,
      values: organizationalValues
    };
  }
  
  // Regular node handling
  const field = node.field;
  const includedValues = (node.values || []).filter(v => v.included);
  
  const valueGroups = new Map();
  for (const record of records) {
    const rawValue = record[field];
    const value = normalizeBlankValue(rawValue);
    const valueConfig = includedValues.find(v => v.value === value);
    if (valueConfig) {
      if (!valueGroups.has(value)) {
        valueGroups.set(value, { records: [], valueConfig });
      }
      valueGroups.get(value).records.push(record);
    }
  }
  
  const values = [];
  for (const [value, groupData] of valueGroups.entries()) {
    const { records: valueRecords, valueConfig } = groupData;
    const valueNode = {
      value,
      label: valueConfig.label || value,
      recordCount: valueRecords.length,
      audioVariants: valueConfig.audioVariants || [],
      references: valueRecords.map(r => normalizeRefString(r.Reference)).filter(ref => ref)
    };
    
    if (valueConfig.children && valueConfig.children.field) {
      const childTree = buildHierarchyFromTree(valueConfig.children, valueRecords);
      if (childTree && childTree.values && childTree.values.length > 0) {
        valueNode.children = childTree.values;
        delete valueNode.references;
      }
    }
    
    values.push(valueNode);
  }
  
  return {
    field,
    values
  };
}

module.exports = {
  createLegacyBundle,
  createHierarchicalBundle,
};
