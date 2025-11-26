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
const { changeTracker, ChangeTracker } = require('./utils/changeTracker');

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
  
  // Auto-restore bundle if session exists
  if (sessionData && sessionData.bundleId) {
    restoreBundleFromSession();
  }
});

async function restoreBundleFromSession() {
  try {
    // Check if extracted bundle still exists
    extractedPath = getExtractedBundlePath();
    if (!fs.existsSync(extractedPath)) {
      console.log('[desktop_matching] No extracted bundle found, cannot restore');
      return;
    }
    
    // Determine bundle type from session
    bundleType = sessionData.bundleType || 'legacy';
    
    if (bundleType === 'hierarchical') {
      // Restore hierarchical bundle - check for new structure first
      const xmlFolder = path.join(extractedPath, 'xml');
      const audioFolder = path.join(extractedPath, 'audio');
      const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
      const settingsPath = path.join(extractedPath, 'settings.json');
      
      const hasNewStructure = fs.existsSync(xmlFolder) && fs.existsSync(audioFolder);
      
      if (!fs.existsSync(hierarchyPath) || !fs.existsSync(settingsPath)) {
        console.log('[desktop_matching] Missing bundle files, cannot restore');
        return;
      }
      
      hierarchyConfig = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      
      // Verify bundle ID matches
      if (settings.bundleId !== sessionData.bundleId) {
        console.log('[desktop_matching] Bundle ID mismatch, cannot restore');
        return;
      }
      
      if (!hasNewStructure) {
        console.log('[desktop_matching] Old hierarchical structure not supported, cannot restore');
        return;
      }
      
      console.log('[desktop_matching] Restoring new hierarchical structure bundle');
      
      // Load XML data
      const workingXmlPath = path.join(xmlFolder, 'working_data.xml');
      const originalXmlPath = path.join(xmlFolder, 'original_data.xml');
      const xmlPath = fs.existsSync(workingXmlPath) ? workingXmlPath : originalXmlPath;
      
      if (!fs.existsSync(xmlPath)) {
        console.log('[desktop_matching] No XML data found, cannot restore');
        return;
      }
      
      // Parse XML
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
      
      // Build sub-bundle list from hierarchy
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
      
      if (hierarchyConfig.tree) {
        extractSubBundlesFromTree(hierarchyConfig.tree);
      }
      
      bundleData = {
        settings,
        hierarchy: hierarchyConfig,
        subBundles,
        extractedPath,
        bundleId: settings.bundleId,
        bundleType: 'hierarchical',
        xmlPath: xmlPath,
        allDataForms: allDataForms,
        usesNewStructure: true,
      };
      
      // If currently in a sub-bundle, restore its records
      if (sessionData.currentSubBundle) {
        const subBundle = bundleData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
        if (subBundle && subBundle.references) {
          const refSet = new Set(subBundle.references.map(r => normalizeRefString(r)));
          bundleData.records = allDataForms.filter(df => {
            const ref = normalizeRefString(df.Reference);
            return refSet.has(ref);
          });
          currentSubBundlePath = sessionData.currentSubBundle;
        }
      }
      
      // Load existing change history
      const existingHistory = ChangeTracker.loadChangeHistory(extractedPath);
      changeTracker.initialize(extractedPath, existingHistory);
      
      console.log('[desktop_matching] Restored hierarchical bundle:', bundleData.bundleId);
      
    } else {
      // Restore legacy bundle
      const settingsPath = path.join(extractedPath, 'settings.json');
      if (!fs.existsSync(settingsPath)) {
        console.log('[desktop_matching] Missing settings.json, cannot restore');
        return;
      }
      
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      
      // Verify bundle ID matches
      if (settings.bundleId !== sessionData.bundleId) {
        console.log('[desktop_matching] Bundle ID mismatch, cannot restore');
        return;
      }
      
      // Find XML file
      let xmlPath = path.join(extractedPath, 'data_updated.xml');
      if (!fs.existsSync(xmlPath)) {
        xmlPath = path.join(extractedPath, 'data.xml');
      }
      if (!fs.existsSync(xmlPath)) {
        console.log('[desktop_matching] Missing XML file, cannot restore');
        return;
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
      
      bundleData = {
        settings,
        records: dataForms,
        extractedPath,
        bundleId: settings.bundleId || null,
        isReimport: fs.existsSync(path.join(extractedPath, 'data_updated.xml')),
      };
      
      console.log('[desktop_matching] Restored legacy bundle:', bundleData.bundleId);
    }
    
  } catch (error) {
    console.warn('[desktop_matching] Failed to restore bundle:', error.message);
    // Clear session if restoration failed
    sessionData = null;
    bundleData = null;
    extractedPath = null;
  }
}

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

// Find most common metadata values in a group
function findMostCommonGroupMetadata(members, dataForms, pitchKey, abbreviationKey, exemplarKey) {
  // Count occurrences of each value for each field
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
  
  // Find most common value for each field
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

// Detect conflicts in group metadata
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
      
      // Check pitch conflicts
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
      
      // Check abbreviation conflicts
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
      
      // Check exemplar conflicts
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
    
    // Only include groups that have conflicts
    if (groupConflicts.pitchConflicts.length > 0 ||
        groupConflicts.abbreviationConflicts.length > 0 ||
        groupConflicts.exemplarConflicts.length > 0) {
      conflicts.push(groupConflicts);
    }
  });
  
  return conflicts;
}

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
      
      // Pre-populate groups from XML if grouping field is configured
      // This works for both fresh bundles (data.xml) and re-imports (data_updated.xml)
      const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
      const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
      const userSpellingKey = settings.userSpellingElement || 'Orthographic';
      const pitchKey = settings.pitchField;
      const abbreviationKey = settings.abbreviationField;
      const exemplarKey = settings.exemplarField;
      
      // Backward compatibility: migrate old multi-field settings to new single-field
      if (settings.groupingField === undefined) {
        if (settings.loadGroupsFromId) {
          settings.groupingField = 'id';
        } else if (settings.loadGroupsFromPitch) {
          settings.groupingField = 'pitch';
        } else if (settings.loadGroupsFromAbbreviation) {
          settings.groupingField = 'abbreviation';
        } else if (settings.loadGroupsFromExemplar) {
          settings.groupingField = 'exemplar';
        } else {
          settings.groupingField = 'none';
        }
      }
      
      // Determine which single field to use for grouping
      const groupingField = settings.groupingField || 'none';
      console.log('[desktop_matching] Legacy bundle grouping config:', {
        groupingField,
        tgIdKey,
        pitchKey,
        abbreviationKey,
        exemplarKey
      });
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
      
      console.log('[desktop_matching] Selected grouping key:', groupingKey);
      
      // Build group map from records using single field (if configured)
      const groupMap = new Map(); // field value -> { id, members[], groupingValue }
      
      if (groupingKey) {
        console.log('[desktop_matching] Starting group building from', dataForms.length, 'records');
          dataForms.forEach(record => {
            const ref = normalizeRefString(record.Reference);
            const groupValue = record[groupingKey];
            
            if (groupValue) {
              if (!groupMap.has(groupValue)) {
                // Determine group ID: use value if it's the ID field, otherwise generate
                const groupId = (groupingField === 'id') 
                  ? groupValue 
                  : `group_${groupValue.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                groupMap.set(groupValue, {
                  id: groupId,
                  groupNumber: groupMap.size + 1,
                  members: [],
                  image: null,
                  additionsSinceReview: 0,
                  requiresReview: false,
                  groupingValue: groupValue, // Store the value used for grouping
                });
              }
              
              groupMap.get(groupValue).members.push(ref);
              
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
        
        console.log('[desktop_matching] Built', groupMap.size, 'groups from grouping key:', groupingKey);
        
        // Convert to array and sort by group number
        sessionData.groups = Array.from(groupMap.values()).sort((a, b) => a.groupNumber - b.groupNumber);
        console.log('[desktop_matching] Converted to array:', sessionData.groups.length, 'groups');
        
        // Determine most common metadata values for ALL fields (not just grouping field)
        // This ensures group has representative values even if grouped by ID only
        sessionData.groups.forEach(group => {
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
      } else {
        // No grouping field selected, just import user spelling
        dataForms.forEach(record => {
          const ref = normalizeRefString(record.Reference);
          if (record[userSpellingKey]) {
            sessionData.records[ref] = {
              userSpelling: record[userSpellingKey],
            };
          }
        });
      }
      
      // Try to load images from images/ folder if present (regardless of grouping)
      const imagesPath = path.join(extractedPath, 'images');
      if (fs.existsSync(imagesPath) && sessionData.groups.length > 0) {
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
      
      if (sessionData.groups.length > 0) {
        console.log(`[desktop_matching] Loaded ${sessionData.groups.length} pre-populated tone groups from ${groupingField} field`);
      }
      
      saveSession();
    }
    
    console.log('[desktop_matching] Legacy bundle returning:', {
      recordCount: dataForms.length,
      groupsCount: sessionData.groups.length,
      isReimport,
      importedGroups: sessionData.groups.length
    });
    
    return {
      success: true,
      settings: bundleData.settings,
      recordCount: dataForms.length,
      session: sessionData,
      isReimport,
      importedGroups: sessionData.groups.length,
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
    
    // Check for new structure (xml/ and audio/ folders at root)
    const xmlFolder = path.join(extractedPath, 'xml');
    const audioFolder = path.join(extractedPath, 'audio');
    const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
    
    const hasNewStructure = fs.existsSync(xmlFolder) && fs.existsSync(audioFolder);
    
    if (hasNewStructure) {
      // NEW STRUCTURE: Load from centralized XML and audio
      console.log('[desktop_matching] Loading hierarchical bundle with new structure (xml/, audio/)');
      
      // Load hierarchy.json
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
      
      // Load XML data (prefer working_data.xml, fallback to original_data.xml)
      const workingXmlPath = path.join(xmlFolder, 'working_data.xml');
      const originalXmlPath = path.join(xmlFolder, 'original_data.xml');
      const xmlPath = fs.existsSync(workingXmlPath) ? workingXmlPath : originalXmlPath;
      
      if (!fs.existsSync(xmlPath)) {
        throw new Error('Hierarchical bundle missing XML data');
      }
      
      // Parse XML with UTF-16 support
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
      
      // Build sub-bundle list from hierarchy.json tree
      const subBundles = [];
      
      function extractSubBundlesFromTree(node, pathPrefix = '', parentAudioVariants = []) {
        if (!node) return;
        
        const values = node.values || [];
        
        for (const valueNode of values) {
          const subPath = pathPrefix ? `${pathPrefix}/${valueNode.value}` : valueNode.value;
          
          // Check if this is a leaf node (has references) or parent node (has children)
          if (valueNode.children && valueNode.children.length > 0) {
            // Parent node - recurse into children
            const audioVariants = valueNode.audioVariants || parentAudioVariants;
            for (const child of valueNode.children) {
              extractSubBundlesFromTree(
                { field: child.field || node.field, values: [child] },
                subPath,
                audioVariants
              );
            }
          } else if (valueNode.references && valueNode.references.length > 0) {
            // Leaf node - create sub-bundle entry
            subBundles.push({
              path: subPath,
              categoryPath: subPath,
              label: valueNode.label || valueNode.value,
              references: valueNode.references,
              recordCount: valueNode.recordCount || valueNode.references.length,
              audioVariants: valueNode.audioVariants || parentAudioVariants,
              organizationalGroup: valueNode.organizationalGroup || null,
              // NEW STRUCTURE FLAG: indicates we have centralized data
              usesNewStructure: true,
            });
          }
        }
      }
      
      if (hierarchyConfig.tree) {
        extractSubBundlesFromTree(hierarchyConfig.tree);
      }
      
      console.log(`[desktop_matching] Found ${subBundles.length} sub-bundles (new structure)`);
      
      // Load existing change history if present
      const existingHistory = ChangeTracker.loadChangeHistory(extractedPath);
      
      // Build bundle data structure
      bundleData = {
        settings,
        hierarchy: hierarchyConfig,
        subBundles,
        extractedPath,
        bundleId: settings.bundleId || null,
        bundleType: 'hierarchical',
        xmlPath: xmlPath, // Store which XML file we're using
        allDataForms: allDataForms, // Store all records for quick lookup
        usesNewStructure: true, // Flag for new centralized structure
      };
      
      // Create or restore session
      let needNewSession = true;
      if (sessionData && sessionData.bundleId === bundleData.bundleId && sessionData.bundleType === 'hierarchical') {
        needNewSession = false;
      }
      
      if (needNewSession) {
        sessionData = {
          bundleId: bundleData.bundleId,
          bundleType: 'hierarchical',
          hierarchyConfig: hierarchyConfig,
          subBundles: subBundles.map(sb => ({
            path: sb.path,
            categoryPath: sb.categoryPath,
            label: sb.label,
            recordCount: sb.recordCount,
            assignedCount: 0,
            reviewed: false,
            queue: [...(sb.references || [])], // Initialize with all references
            groups: [],
            organizationalGroup: sb.organizationalGroup || null,
          })),
          currentSubBundle: null,
          selectedAudioVariantIndex: 0,
          records: {},
          locale: sessionData?.locale || 'en',
        };
        
        saveSession();
      }
      
      // Initialize change tracker
      changeTracker.initialize(extractedPath, existingHistory);
      console.log('[desktop_matching] Change tracker initialized');
      
      return {
        success: true,
        bundleType: 'hierarchical',
        settings: bundleData.settings,
        hierarchy: hierarchyConfig,
        subBundleCount: subBundles.length,
        session: sessionData,
        requiresNavigation: true,
      };
      
    } else {
      // No new structure detected - hierarchical bundles must have xml/ and audio/ folders
      throw new Error('Invalid hierarchical bundle structure. Expected xml/ and audio/ folders at root.');
    }
    
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

ipcMain.handle('check-restored-bundle', async () => {
  // Check if bundle was restored on startup
  if (!bundleData || !sessionData) {
    return { restored: false };
  }
  
  const result = {
    restored: true,
    bundleType: bundleType,
    settings: bundleData.settings,
    session: sessionData,
  };
  
  if (bundleType === 'hierarchical') {
    result.hierarchy = bundleData.hierarchy;
    result.manifest = bundleData.manifest;
    result.subBundleCount = bundleData.subBundles?.length || 0;
    result.requiresNavigation = !sessionData.currentSubBundle; // Show navigation if not in a sub-bundle
  } else {
    result.recordCount = bundleData.records?.length || 0;
  }
  
  return result;
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
  
  // Get old value for tracking
  const oldSpelling = sessionData.records[ref]?.userSpelling || '';
  
  if (!sessionData.records[ref]) {
    sessionData.records[ref] = {};
  }
  sessionData.records[ref].userSpelling = userSpelling;
  
  // Track spelling change for hierarchical bundles
  if (bundleType === 'hierarchical' && sessionData.currentSubBundle && oldSpelling !== userSpelling) {
    const settings = bundleData?.settings || {};
    const fieldName = settings.userSpellingElement || 'Orthographic';
    changeTracker.logSpellingChange(
      sessionData.currentSubBundle,
      ref,
      fieldName,
      oldSpelling,
      userSpelling
    );
  }
  
  saveSession();
  return sessionData;
});

ipcMain.handle('toggle-word-flag', async (event, ref, flagged) => {
  if (!sessionData) return null;
  
  if (!sessionData.records[ref]) {
    sessionData.records[ref] = {};
  }
  sessionData.records[ref].flagged = flagged;
  
  saveSession();
  return sessionData;
});

ipcMain.handle('add-word-to-group', async (event, ref, groupId) => {
  if (!sessionData) return null;
  
  // Get old group info for change tracking
  const oldGroup = sessionData.groups.find(g => g.members?.includes(ref));
  const oldGroupId = oldGroup?.id || '';
  
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
  
  // Track the assignment (for hierarchical bundles)
  if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
    const subBundleId = sessionData.currentSubBundle;
    const record = bundleData.records?.find(r => normalizeRefString(r.Reference) === ref);
    changeTracker.logToneGroupAssignment(subBundleId, ref, groupId, {
      oldGroupId,
      groupSize: group?.members?.length || 1
    });
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
    
    // Delete group if it's now empty
    if (group.members.length === 0) {
      sessionData.groups = sessionData.groups.filter(g => g.id !== groupId);
      console.log(`[remove-word-from-group] Deleted empty group ${groupId}`);
      
      // Also remove from sub-bundle session if hierarchical
      if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
        const subBundleSession = sessionData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
        if (subBundleSession) {
          subBundleSession.groups = subBundleSession.groups.filter(g => g.id !== groupId);
        }
      }
    }
  }
  
  // Track the removal (for hierarchical bundles)
  if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
    const subBundleId = sessionData.currentSubBundle;
    changeTracker.logToneGroupRemoval(subBundleId, ref, groupId);
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
    // Track field changes for hierarchical bundles
    const trackFieldChange = (field, newValue, action) => {
      if (bundleType === 'hierarchical' && sessionData.currentSubBundle && newValue !== undefined) {
        const oldValue = group[field];
        if (oldValue !== newValue) {
          // Log change for the exemplar word if it exists, otherwise log for the group
          const ref = group.exemplarWordRef || (group.members?.[0] || 'group');
          changeTracker.logFieldChange(
            sessionData.currentSubBundle,
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
    
    // Enhanced group fields with tracking
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
    
    // For hierarchical bundles, also update the sub-bundle session
    if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
      const subBundleSession = sessionData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
      if (subBundleSession && subBundleSession.groups) {
        const subGroup = subBundleSession.groups.find(g => g.id === groupId);
        if (subGroup) {
          // Update the sub-bundle's copy of this group
          Object.assign(subGroup, updates);
        }
      }
    }
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
  
  // Determine audio directory based on bundle type and structure
  let audioDir;
  if (bundleType === 'hierarchical') {
    // New structure: all audio in root audio/ folder
    audioDir = path.join(extractedPath, 'audio');
  } else {
    // For legacy single bundles, audio is in audio/
    audioDir = path.join(extractedPath, 'audio');
  }
  
  if (!audioDir || !fs.existsSync(audioDir)) {
    console.log('[get-audio-path] Audio directory not found:', audioDir);
    return null;
  }
  
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
  if (bundleType === 'hierarchical') {
    // For hierarchical bundles, reset all sub-bundles
    sessionData.subBundles = bundleData.subBundles.map(sb => {
      const subBundleRecords = bundleData.allDataForms.filter(df => 
        sb.references && sb.references.some(r => normalizeRefString(r) === normalizeRefString(df.Reference))
      );
      const queue = subBundleRecords.map(df => normalizeRefString(df.Reference));
      
      return {
        path: sb.path,
        queue,
        groups: [],
        recordCount: subBundleRecords.length,
        assignedCount: 0,
      };
    });
    sessionData.currentSubBundle = null;
    sessionData.queue = [];
    sessionData.groups = [];
    sessionData.records = {};
  } else {
    // For legacy bundles
    const queue = bundleData.records.map(df => normalizeRefString(df.Reference));
    sessionData = {
      bundleId: bundleData.bundleId,
      queue,
      selectedAudioVariantIndex: sessionData.selectedAudioVariantIndex || 0,
      groups: [],
      records: {},
      locale: sessionData.locale || 'en',
    };
  }
  
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
    
    let dataForms = [];
    
    // Check if this is a re-import (data_updated.xml exists in xml/ folder)
    const xmlDir = path.join(bundleData.extractedPath, 'xml');
    const isReimport = fs.existsSync(path.join(xmlDir, 'data_updated.xml'));
    
    // Filter allDataForms by references list
    if (subBundle.references && bundleData.allDataForms) {
      console.log('[load-sub-bundle] Filtering records by Reference list');
      const refSet = new Set(subBundle.references.map(r => normalizeRefString(r)));
      dataForms = bundleData.allDataForms.filter(df => {
        const ref = normalizeRefString(df.Reference);
        return refSet.has(ref);
      });
    } else {
      throw new Error('Sub-bundle missing references list or bundle missing allDataForms');
    }
    
    // Update bundleData with current sub-bundle records
    bundleData.records = dataForms;
    bundleData.currentSubBundlePath = subBundlePath;
    currentSubBundlePath = subBundlePath;
    
    // Update or create session data for this sub-bundle
    let subBundleSession = sessionData.subBundles.find(sb => sb.path === subBundlePath);
    if (!subBundleSession) {
      // Create session for this sub-bundle if it doesn't exist
      console.log('[load-sub-bundle] Creating new session for sub-bundle:', subBundlePath);
      subBundleSession = {
        path: subBundlePath,
        queue: dataForms.map(df => normalizeRefString(df.Reference)),
        groups: [],
        recordCount: dataForms.length,
        assignedCount: 0,
      };
      sessionData.subBundles.push(subBundleSession);
    }
    
    // Check if this sub-bundle has been loaded before
    if (!subBundleSession.queue || subBundleSession.queue.length === 0) {
      // First time loading - initialize queue
      const queue = dataForms.map(df => normalizeRefString(df.Reference));
      subBundleSession.queue = queue;
    }
    
    // Pre-populate groups from XML if grouping field is configured AND no groups exist yet
    // This works for both fresh bundles and re-imports, and handles session restoration
    if (!subBundleSession.groups || subBundleSession.groups.length === 0) {
      subBundleSession.groups = [];
      
      {
        const settings = bundleData.settings;
        const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
        const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
        const userSpellingKey = settings.userSpellingElement || 'Orthographic';
        const pitchKey = settings.pitchField;
        const abbreviationKey = settings.abbreviationField;
        const exemplarKey = settings.exemplarField;
        
        // Backward compatibility: migrate old multi-field settings to new single-field
        if (settings.groupingField === undefined) {
          if (settings.loadGroupsFromId) {
            settings.groupingField = 'id';
          } else if (settings.loadGroupsFromPitch) {
            settings.groupingField = 'pitch';
          } else if (settings.loadGroupsFromAbbreviation) {
            settings.groupingField = 'abbreviation';
          } else if (settings.loadGroupsFromExemplar) {
            settings.groupingField = 'exemplar';
          } else {
            settings.groupingField = 'none';
          }
        }
        
        // Determine which single field to use for grouping
        const groupingField = settings.groupingField || 'none';
        console.log('[desktop_matching] Hierarchical sub-bundle grouping config:', {
          groupingField,
          tgIdKey,
          pitchKey,
          abbreviationKey,
          exemplarKey
        });
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
        
        console.log('[desktop_matching] Selected grouping key for sub-bundle:', groupingKey);
        
        // Build group map from records using single field
        const groupMap = new Map(); // field value -> { id, members[], groupingValue }
        
        if (groupingKey) {
          console.log('[desktop_matching] Starting sub-bundle group building from', dataForms.length, 'records');
          dataForms.forEach(record => {
            const ref = normalizeRefString(record.Reference);
            const groupValue = record[groupingKey];
            
            if (groupValue) {
              if (!groupMap.has(groupValue)) {
                // Determine group ID: use value if it's the ID field, otherwise generate
                const groupId = (groupingField === 'id') 
                  ? groupValue 
                  : `group_${groupValue.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                groupMap.set(groupValue, {
                  id: groupId,
                  groupNumber: groupMap.size + 1,
                  members: [],
                  image: null,
                  additionsSinceReview: 0,
                  requiresReview: false,
                  groupingValue: groupValue, // Store the value used for grouping
                });
              }
              
              groupMap.get(groupValue).members.push(ref);
              
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
        
        console.log('[desktop_matching] Built', groupMap.size, 'groups in sub-bundle from grouping key:', groupingKey);
        
        // Convert to array and sort by group number
        subBundleSession.groups = Array.from(groupMap.values()).sort((a, b) => a.groupNumber - b.groupNumber);
        console.log('[desktop_matching] Converted to sub-bundle array:', subBundleSession.groups.length, 'groups');
        
        // Determine most common metadata values for ALL fields (not just grouping field)
        // This ensures group has representative values even if grouped by ID only
        subBundleSession.groups.forEach(group => {
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
      } else {
        // No grouping field selected, just import user spelling
        dataForms.forEach(record => {
          const ref = normalizeRefString(record.Reference);
          if (record[userSpellingKey]) {
            if (!sessionData.records[ref]) {
              sessionData.records[ref] = {};
            }
            sessionData.records[ref].userSpelling = record[userSpellingKey];
          }
        });
      }
      
      // Try to load images from images/ folder if present (regardless of grouping)
      // Images are stored at bundle root level, not per sub-bundle
      const imagesPath = path.join(bundleData.extractedPath, 'images');
      if (fs.existsSync(imagesPath) && subBundleSession.groups.length > 0) {
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
      
      if (subBundleSession.groups.length > 0) {
        console.log(`[desktop_matching] Loaded ${subBundleSession.groups.length} existing tone groups for sub-bundle`);
      }
      }
    }
    
    // Update assigned count
    const assignedCount = dataForms.length - subBundleSession.queue.length;
    subBundleSession.assignedCount = assignedCount;
    
    // Set current sub-bundle in session
    sessionData.currentSubBundle = subBundlePath;
    
    // Create compatibility layer - populate session.queue and session.groups from current sub-bundle
    sessionData.queue = [...subBundleSession.queue];
    sessionData.groups = subBundleSession.groups.map(g => ({ ...g }));
    
    saveSession();
    
    console.log('[desktop_matching] Hierarchical sub-bundle returning:', {
      path: subBundlePath,
      recordCount: dataForms.length,
      groupsCount: subBundleSession.groups.length,
      isReimport,
      importedGroups: subBundleSession.groups.length
    });
    
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
      importedGroups: subBundleSession.groups.length,
    };
  } catch (error) {
    console.error('[load-sub-bundle] Error loading sub-bundle:', subBundlePath, error);
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

ipcMain.handle('clear-bundle', async () => {
  try {
    // Clear in-memory data
    bundleData = null;
    sessionData = null;
    bundleType = 'legacy';
    hierarchyConfig = null;
    currentSubBundlePath = null;
    
    // Delete session file
    const sessionPath = getSessionPath();
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    
    // Delete extracted bundle
    const extractedBundlePath = getExtractedBundlePath();
    if (fs.existsSync(extractedBundlePath)) {
      fs.rmSync(extractedBundlePath, { recursive: true, force: true });
    }
    
    console.log('[desktop_matching] Bundle and session cleared');
    return { success: true };
  } catch (error) {
    console.error('[desktop_matching] Failed to clear bundle:', error);
    return { success: false, error: error.message };
  }
});

// Check for conflicts before export
ipcMain.handle('check-export-conflicts', async () => {
  if (!bundleData || !sessionData) {
    return { hasConflicts: false, error: 'No bundle loaded' };
  }
  
  const settings = bundleData.settings;
  const pitchKey = settings.pitchField;
  const abbreviationKey = settings.abbreviationField;
  const exemplarKey = settings.exemplarField;
  
  let conflicts = [];
  
  if (bundleType === 'hierarchical') {
    // Check all sub-bundles for conflicts
    if (sessionData.subBundles && Array.isArray(sessionData.subBundles)) {
      sessionData.subBundles.forEach(subBundleSession => {
        if (subBundleSession.groups && subBundleSession.groups.length > 0) {
          // Find the dataForms for this sub-bundle
          const subBundle = bundleData.subBundles.find(sb => sb.path === subBundleSession.path);
          if (subBundle && subBundle.references && bundleData.allDataForms) {
            const refSet = new Set(subBundle.references.map(r => normalizeRefString(r)));
            const dataForms = bundleData.allDataForms.filter(df => {
              const ref = normalizeRefString(df.Reference);
              return refSet.has(ref);
            });
            
            const subBundleConflicts = detectGroupConflicts(
              subBundleSession.groups,
              dataForms,
              pitchKey,
              abbreviationKey,
              exemplarKey
            );
            
            // Add sub-bundle path to each conflict for context
            subBundleConflicts.forEach(conflict => {
              conflict.subBundlePath = subBundleSession.path;
            });
            
            conflicts = conflicts.concat(subBundleConflicts);
          }
        }
      });
    }
  } else {
    // Legacy bundle - check session groups
    if (sessionData.groups && sessionData.groups.length > 0) {
      conflicts = detectGroupConflicts(
        sessionData.groups,
        bundleData.records,
        pitchKey,
        abbreviationKey,
        exemplarKey
      );
    }
  }
  
  return {
    hasConflicts: conflicts.length > 0,
    conflicts: conflicts,
    fieldNames: {
      pitch: pitchKey,
      abbreviation: abbreviationKey,
      exemplar: exemplarKey,
    },
  };
});

ipcMain.handle('export-bundle', async () => {
  if (!bundleData || !sessionData) {
    return { success: false, error: 'No bundle loaded' };
  }
  
  // Determine export type based on bundle type
  if (bundleType === 'hierarchical') {
    return await exportHierarchicalBundle();
  } else {
    return await exportLegacyBundle();
  }
});

// Update working_data.xml with all changes from sessionData (hierarchical bundles)
async function updateWorkingXmlWithSessionData() {
  if (!bundleData || !sessionData || bundleType !== 'hierarchical') {
    return;
  }

  const xmlFolder = path.join(extractedPath, 'xml');
  const workingXmlPath = path.join(xmlFolder, 'working_data.xml');

  if (!fs.existsSync(workingXmlPath)) {
    console.warn('[updateWorkingXmlWithSessionData] working_data.xml not found');
    return;
  }

  console.log('[updateWorkingXmlWithSessionData] Updating working_data.xml with session changes');

  // Read and parse XML with UTF-16 encoding
  const xmlBuffer = fs.readFileSync(workingXmlPath);
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
  let dataForms = Array.isArray(phonData.data_form)
    ? phonData.data_form
    : [phonData.data_form];

  // Get field names from settings
  const settings = bundleData.settings;
  const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
  const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
  const userSpellingKey = settings.userSpellingElement || 'Orthographic';
  const pitchKey = settings.pitchField;
  const abbreviationKey = settings.abbreviationField;
  const exemplarKey = settings.exemplarField;

  // Build a map of all group assignments from all sub-bundles
  const refToGroup = new Map();
  
  if (sessionData.subBundles && Array.isArray(sessionData.subBundles)) {
    sessionData.subBundles.forEach(subBundleSession => {
      if (subBundleSession.groups && subBundleSession.groups.length > 0) {
        subBundleSession.groups.forEach(group => {
          (group.members || []).forEach(ref => {
            refToGroup.set(normalizeRefString(ref), {
              groupNumber: group.groupNumber,
              groupId: group.id,
              pitchTranscription: group.pitchTranscription,
              toneAbbreviation: group.toneAbbreviation,
              exemplarWord: group.exemplarWord,
            });
          });
        });
      }
    });
  }

  console.log(`[updateWorkingXmlWithSessionData] Found ${refToGroup.size} group assignments to apply`);

  // Update each data form
  let updatedCount = 0;
  dataForms.forEach(record => {
    const ref = normalizeRefString(record.Reference);
    let wasUpdated = false;

    // Apply user spelling if present
    const edits = sessionData.records[ref];
    if (edits && edits.userSpelling && userSpellingKey) {
      record[userSpellingKey] = edits.userSpelling;
      wasUpdated = true;
    }

    // Apply tone group assignment if present
    const groupData = refToGroup.get(ref);
    if (groupData) {
      record[tgKey] = String(groupData.groupNumber);
      record[tgIdKey] = groupData.groupId;

      // Add metadata fields using configured field names
      if (groupData.pitchTranscription && pitchKey) {
        record[pitchKey] = groupData.pitchTranscription;
      }
      if (groupData.toneAbbreviation && abbreviationKey) {
        record[abbreviationKey] = groupData.toneAbbreviation;
      }
      if (groupData.exemplarWord && exemplarKey) {
        record[exemplarKey] = groupData.exemplarWord;
      }
      wasUpdated = true;
    }

    if (wasUpdated) {
      updatedCount++;
    }
  });

  console.log(`[updateWorkingXmlWithSessionData] Updated ${updatedCount} records in working_data.xml`);

  // Build XML
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
  });

  let updatedXml = builder.build(xmlResult);

  // Ensure XML declaration with UTF-16
  if (!updatedXml.startsWith('<?xml')) {
    updatedXml = '<?xml version="1.0" encoding="utf-16"?>\n' + updatedXml;
  } else {
    // Replace existing declaration to ensure UTF-16
    updatedXml = updatedXml.replace(
      /<\?xml[^?]*\?>/,
      '<?xml version="1.0" encoding="utf-16"?>'
    );
  }

  // Write with UTF-16 encoding
  fs.writeFileSync(workingXmlPath, updatedXml, 'utf16le');
  console.log('[updateWorkingXmlWithSessionData] Successfully wrote updated working_data.xml');
}

// Export hierarchical bundle (.tnset)
async function exportHierarchicalBundle() {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog({
    title: 'Export Hierarchical Bundle',
    defaultPath: `${bundleData.bundleId}_export.tnset`,
    filters: [{ name: 'Hierarchical Tone Bundle', extensions: ['tnset'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Export cancelled' };
  }

  try {
    const outputPath = result.filePath;
    
    // FIRST: Update working_data.xml with all changes from sessionData
    if (bundleData.usesNewStructure) {
      console.log('[export-bundle] Updating working_data.xml with session changes');
      await updateWorkingXmlWithSessionData();
    }
    
    // Create archive
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    
    // For new structure bundles, export updated xml/ and audio/ folders
    if (bundleData.usesNewStructure) {
      console.log('[export-bundle] Exporting new structure bundle');
      
      // Add xml/ folder with working_data.xml (now updated)
      const xmlFolder = path.join(extractedPath, 'xml');
      if (fs.existsSync(xmlFolder)) {
        archive.directory(xmlFolder, 'xml');
      }
      
      // Add audio/ folder
      const audioFolder = path.join(extractedPath, 'audio');
      if (fs.existsSync(audioFolder)) {
        archive.directory(audioFolder, 'audio');
      }
      
      // Add hierarchy.json (updated with current state)
      const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
      if (fs.existsSync(hierarchyPath)) {
        archive.file(hierarchyPath, { name: 'hierarchy.json' });
      }
      
      // Add settings.json
      const settingsPath = path.join(extractedPath, 'settings.json');
      if (fs.existsSync(settingsPath)) {
        archive.file(settingsPath, { name: 'settings.json' });
      }
      
      // Add fonts folder if exists
      const fontsPath = path.join(extractedPath, 'fonts');
      if (fs.existsSync(fontsPath)) {
        archive.directory(fontsPath, 'fonts');
      }
      
      // Save and add change_history.json
      try {
        const changeHistory = await changeTracker.saveChangeHistory();
        if (changeHistory) {
          const changeHistoryPath = path.join(extractedPath, 'change_history.json');
          archive.file(changeHistoryPath, { name: 'change_history.json' });
          console.log('[export-bundle] Added change_history.json to export');
        }
      } catch (error) {
        console.warn('[export-bundle] Failed to save change history:', error.message);
      }
      
    } else {
      // Old structure export (should not be reached since we removed old structure support)
      throw new Error('Old hierarchical structure export not supported. Please use new structure bundles.');
    }
    
    await archive.finalize();
    
    return { success: true, outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Build data_updated.xml for a sub-bundle with tone group assignments
function buildSubBundleDataXml(subBundle) {
  const settings = bundleData.settings;
  const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
  const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
  const userSpellingKey = settings.userSpellingElement || 'Orthographic';
  const pitchKey = settings.pitchField;
  const abbreviationKey = settings.abbreviationField;
  const exemplarKey = settings.exemplarField;
  
  // Create map of ref -> tone group data
  const refToGroup = new Map();
  subBundle.groups.forEach(group => {
    (group.members || []).forEach(ref => {
      refToGroup.set(ref, {
        groupNumber: group.groupNumber,
        groupId: group.id,
        pitchTranscription: group.pitchTranscription,
        toneAbbreviation: group.toneAbbreviation,
        exemplarWord: group.exemplarWord,
        exemplarWordRef: group.exemplarWordRef,
      });
    });
  });
  
  // Get records for this sub-bundle (from queue + assigned)
  const subBundleRefs = new Set([...subBundle.queue, ...refToGroup.keys()]);
  const subBundleRecords = bundleData.records.filter(record => {
    const ref = normalizeRefString(record.Reference);
    return subBundleRefs.has(ref);
  });
  
  // Update records with assignments
  const updatedRecords = subBundleRecords.map(record => {
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
      
      // Add metadata fields using configured field names
      if (groupData.pitchTranscription && pitchKey) {
        updated[pitchKey] = groupData.pitchTranscription;
      }
      if (groupData.toneAbbreviation && abbreviationKey) {
        updated[abbreviationKey] = groupData.toneAbbreviation;
      }
      if (groupData.exemplarWord && exemplarKey) {
        updated[exemplarKey] = groupData.exemplarWord;
      }
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

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<phon_data>',
    ...updatedRecords.map((r) => buildDataForm(r)),
    '</phon_data>',
    '',
  ].join('\n');
}

// Export legacy bundle (.tncmp / .zip)
async function exportLegacyBundle() {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog({
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
    const settings = bundleData.settings;
    const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
    const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
    const userSpellingKey = settings.userSpellingElement || 'Orthographic';
    const pitchKey = settings.pitchField;
    const abbreviationKey = settings.abbreviationField;
    const exemplarKey = settings.exemplarField;
    
    // Create a map of ref -> tone group data
    const refToGroup = new Map();
    sessionData.groups.forEach(group => {
      (group.members || []).forEach(ref => {
        refToGroup.set(ref, {
          groupNumber: group.groupNumber,
          groupId: group.id,
          pitchTranscription: group.pitchTranscription,
          toneAbbreviation: group.toneAbbreviation,
          exemplarWord: group.exemplarWord,
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
        
        // Add metadata fields using configured field names
        if (groupData.pitchTranscription && pitchKey) {
          updated[pitchKey] = groupData.pitchTranscription;
        }
        if (groupData.toneAbbreviation && abbreviationKey) {
          updated[abbreviationKey] = groupData.toneAbbreviation;
        }
        if (groupData.exemplarWord && exemplarKey) {
          updated[exemplarKey] = groupData.exemplarWord;
        }
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
}

// Export just the working_data.xml file
ipcMain.handle('export-working-xml-only', async () => {
  if (!bundleData || !sessionData || bundleType !== 'hierarchical') {
    return { success: false, error: 'No hierarchical bundle loaded' };
  }

  if (!bundleData.usesNewStructure) {
    return { success: false, error: 'Export requires new hierarchical bundle structure' };
  }

  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog({
    title: 'Export Working XML',
    defaultPath: 'working_data.xml',
    filters: [{ name: 'XML Files', extensions: ['xml'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Export cancelled' };
  }

  try {
    // Update working_data.xml with all changes from sessionData
    await updateWorkingXmlWithSessionData();

    // Copy the updated working_data.xml to the selected location
    const workingXmlPath = path.join(extractedPath, 'xml', 'working_data.xml');
    
    if (!fs.existsSync(workingXmlPath)) {
      return { success: false, error: 'working_data.xml not found' };
    }

    fs.copyFileSync(workingXmlPath, result.filePath);

    return {
      success: true,
      path: result.filePath,
    };
  } catch (error) {
    console.error('[export-working-xml-only] Error:', error);
    return { success: false, error: error.message };
  }
});

// Export single sub-bundle as legacy format (.zip)
ipcMain.handle('export-sub-bundle', async (event, { subBundlePath }) => {
  if (!bundleData || !sessionData || bundleType !== 'hierarchical') {
    return { success: false, error: 'No hierarchical bundle loaded' };
  }
  
  if (!bundleData.usesNewStructure) {
    return { success: false, error: 'Export sub-bundle requires new hierarchical bundle structure' };
  }
  
  const subBundleSession = sessionData.subBundles.find(sb => sb.path === subBundlePath);
  if (!subBundleSession) {
    return { success: false, error: 'Sub-bundle not found' };
  }
  
  const subBundle = bundleData.subBundles.find(sb => sb.path === subBundlePath);
  if (!subBundle || !subBundle.references) {
    return { success: false, error: 'Sub-bundle data not found' };
  }
  
  const { dialog } = require('electron');
  const subBundleName = path.basename(subBundlePath);
  const result = await dialog.showSaveDialog({
    title: `Export Sub-Bundle: ${subBundleName}`,
    defaultPath: `${bundleData.bundleId}_${subBundleName}.zip`,
    filters: [{ name: 'Tone Bundle', extensions: ['zip'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: 'Export cancelled' };
  }

  try {
    const outputPath = result.filePath;
    
    // Build updated XML for this sub-bundle from allDataForms
    const updatedXml = buildSubBundleDataXml(subBundleSession);
    
    // Build original XML for this sub-bundle from original_data.xml
    const originalXmlPath = path.join(extractedPath, 'xml', 'original_data.xml');
    const xmlBuffer = fs.readFileSync(originalXmlPath);
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
    const allOriginalDataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    // Filter to this sub-bundle only
    const refSet = new Set(subBundle.references.map(r => normalizeRefString(r)));
    const subBundleOriginalDataForms = allOriginalDataForms.filter(df => {
      const ref = normalizeRefString(df.Reference);
      return refSet.has(ref);
    });
    
    // Build XML for original data
    phonData.data_form = subBundleOriginalDataForms.length === 1 
      ? subBundleOriginalDataForms[0] 
      : subBundleOriginalDataForms;
    
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      indentBy: '  ',
    });
    
    const originalXml = '<?xml version="1.0" encoding="utf-16"?>\n' + builder.build(xmlResult);
    
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
      subBundle: subBundlePath,
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
    
    // Add settings (with legacy audioFileSuffix)
    const exportSettings = { ...bundleData.settings };
    if (Array.isArray(exportSettings.audioFileVariants) && exportSettings.audioFileVariants.length > 0) {
      const firstSuf = exportSettings.audioFileVariants[0]?.suffix || '';
      exportSettings.audioFileSuffix = firstSuf === '' ? null : firstSuf;
    }
    archive.append(JSON.stringify(exportSettings, null, 2), { name: 'settings.json' });
    
    // Add audio files for this sub-bundle from centralized audio/ folder
    const audioDir = path.join(extractedPath, 'audio');
    if (fs.existsSync(audioDir)) {
      // Filter audio files to only include those for this sub-bundle
      const audioFiles = fs.readdirSync(audioDir);
      for (const audioFile of audioFiles) {
        // Check if this audio file belongs to any of the references in this sub-bundle
        const baseName = path.parse(audioFile).name;
        // Remove any suffix to get the base reference
        const refMatch = baseName.match(/^(\d+)/);
        if (refMatch) {
          const ref = normalizeRefString(refMatch[1]);
          if (refSet.has(ref)) {
            const audioFilePath = path.join(audioDir, audioFile);
            archive.file(audioFilePath, { name: `audio/${audioFile}` });
          }
        }
      }
    }
    
    // Create images folder and add group images
    const tempImagesDir = path.join(extractedPath, 'temp_images_export');
    if (!fs.existsSync(tempImagesDir)) {
      fs.mkdirSync(tempImagesDir, { recursive: true });
    }
    
    // Copy group images
    for (const group of subBundleSession.groups) {
      if (group.image && fs.existsSync(group.image)) {
        const imageName = `group_${group.groupNumber}${path.extname(group.image)}`;
        const destPath = path.join(tempImagesDir, imageName);
        fs.copyFileSync(group.image, destPath);
        archive.file(destPath, { name: `images/${imageName}` });
      }
    }
    
    await archive.finalize();
    
    // Clean up temp images folder
    if (fs.existsSync(tempImagesDir)) {
      fs.rmSync(tempImagesDir, { recursive: true, force: true });
    }
    
    return { success: true, outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get hierarchy data for move word modal
ipcMain.handle('get-hierarchy-data', async () => {
  if (bundleType !== 'hierarchical' || !bundleData || !sessionData) {
    return { success: false, error: 'Not a hierarchical bundle' };
  }
  
  return {
    success: true,
    hierarchy: bundleData.hierarchy,
    subBundles: sessionData.subBundles,
  };
});

// Move word to different sub-bundle
ipcMain.handle('move-word-to-sub-bundle', async (event, { ref, targetSubBundle, returnToOriginal }) => {
  if (bundleType !== 'hierarchical' || !sessionData) {
    return { success: false, error: 'Not a hierarchical bundle' };
  }
  
  try {
    const currentSubBundle = sessionData.currentSubBundle;
    if (!currentSubBundle) {
      return { success: false, error: 'No current sub-bundle' };
    }
    
    if (currentSubBundle === targetSubBundle) {
      return { success: false, error: 'Cannot move to same sub-bundle' };
    }
    
    // Find sub-bundle data and sessions
    const currentSubBundleData = bundleData.subBundles.find(sb => sb.path === currentSubBundle);
    const targetSubBundleData = bundleData.subBundles.find(sb => sb.path === targetSubBundle);
    const currentSession = sessionData.subBundles.find(sb => sb.path === currentSubBundle);
    const targetSession = sessionData.subBundles.find(sb => sb.path === targetSubBundle);
    
    if (!currentSubBundleData || !targetSubBundleData || !currentSession || !targetSession) {
      return { success: false, error: 'Sub-bundle not found' };
    }
    
    // Ensure we have the new structure
    if (!bundleData.usesNewStructure) {
      return { success: false, error: 'Move word operation requires new hierarchical bundle structure' };
    }
    
    console.log('[move-word] Updating hierarchy.json and working_data.xml');
    
    // 1. Update hierarchy.json
    const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
    updateHierarchyJsonReferences(hierarchyPath, currentSubBundle, targetSubBundle, ref);
      
      // Also update in-memory references
      if (currentSubBundleData.references) {
        const idx = currentSubBundleData.references.findIndex(r => normalizeRefString(r) === ref);
        if (idx !== -1) {
          currentSubBundleData.references.splice(idx, 1);
        }
      }
      if (!targetSubBundleData.references) {
        targetSubBundleData.references = [];
      }
      if (!targetSubBundleData.references.some(r => normalizeRefString(r) === ref)) {
        targetSubBundleData.references.push(ref);
      }
      
      // 2. Update working_data.xml with category field changes
      const workingXmlPath = path.join(extractedPath, 'xml', 'working_data.xml');
      const categoryUpdates = getCategoryUpdatesForPath(targetSubBundle, bundleData.hierarchy);
      updateWorkingDataXmlFields(workingXmlPath, ref, categoryUpdates);
      
      console.log(`[move-word] Updated ${ref}: ${Object.entries(categoryUpdates).map(([k,v]) => `${k}=${v}`).join(', ')}`);
      
      // 3. Update session data (NO audio file copying!)
      currentSession.queue = currentSession.queue.filter(r => r !== ref);
      sessionData.queue = sessionData.queue.filter(r => r !== ref);
      
      // Remove from groups if present
      for (const group of currentSession.groups) {
        if (group.members && group.members.includes(ref)) {
          group.members = group.members.filter(m => m !== ref);
          if (group.additionsSinceReview !== undefined) {
            group.additionsSinceReview++;
          }
          break;
        }
      }
      
      for (const group of sessionData.groups) {
        if (group.members && group.members.includes(ref)) {
          group.members = group.members.filter(m => m !== ref);
          if (group.additionsSinceReview !== undefined) {
            group.additionsSinceReview++;
          }
          break;
        }
      }
      
      currentSession.assignedCount = Math.max(0, (currentSession.assignedCount || 0) - 1);
      currentSession.recordCount = (currentSession.recordCount || 0) - 1;
      
      // Add to target sub-bundle
      if (!targetSession.queue.includes(ref)) {
        targetSession.queue.push(ref);
      }
      targetSession.recordCount = (targetSession.recordCount || 0) + 1;
      
      // Track the move
      changeTracker.logSubBundleMove(
        ref,
        currentSubBundle,
        targetSubBundle,
        Object.keys(categoryUpdates).join(', '),
        currentSubBundle,
        targetSubBundle
      );
      
      saveSession();
      
      return {
        success: true,
        session: {
          ...sessionData,
          queue: [...sessionData.queue],
          groups: sessionData.groups.map(g => ({ ...g })),
        },
      };
    
  } catch (error) {
    console.error('[move-word-to-sub-bundle] Error:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// XML Export handler
// ============================================================================
ipcMain.handle('export-bundle-xml', async (event, options) => {
  try {
    if (!bundleData || bundleType !== 'hierarchical') {
      return { success: false, error: 'No hierarchical bundle loaded' };
    }
    
    if (!bundleData.usesNewStructure) {
      return { success: false, error: 'Export requires new hierarchical bundle structure' };
    }
    
    // Export working_data.xml
    const workingXmlPath = path.join(extractedPath, 'xml', 'working_data.xml');
    
    if (!fs.existsSync(workingXmlPath)) {
      return { success: false, error: 'working_data.xml not found' };
    }
    
    // Choose output path
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Updated XML',
      defaultPath: 'updated_data.xml',
      filters: [
        { name: 'XML Files', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, error: 'Export canceled' };
    }
    
    // Copy working_data.xml to export location
    fs.copyFileSync(workingXmlPath, result.filePath);
    
    // Generate change report
    const changes = changeTracker.generateReport();
    const reportPath = result.filePath.replace('.xml', '_changes.json');
    fs.writeFileSync(reportPath, JSON.stringify(changes, null, 2), 'utf8');
    
    console.log('[export-bundle-xml] Exported to:', result.filePath);
    
    return {
      success: true,
      xmlPath: result.filePath,
      reportPath: reportPath,
      recordCount: bundleData.allDataForms ? bundleData.allDataForms.length : 0,
    };
    
  } catch (error) {
    console.error('[export-bundle-xml] Error:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// Helper function: Get category field updates from hierarchy path
// ============================================================================
function getCategoryUpdatesForPath(targetPath, hierarchy) {
  const updates = {};
  
  if (!hierarchy || !hierarchy.tree) {
    return updates;
  }
  
  // Split path like "Noun/CVCV" into parts
  const pathParts = targetPath.split('/');
  
  // Walk the tree to find field assignments at each level
  let currentLevel = hierarchy.tree;
  
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    const field = currentLevel.field;
    
    // Assign the field value for this level
    if (field) {
      updates[field] = part;
    }
    
    // Find the matching value node
    const values = currentLevel.values || [];
    const matchingValue = values.find(v => v.value === part);
    
    if (matchingValue && matchingValue.children && matchingValue.children.length > 0) {
      // Get the field name from first child (they all share same field)
      const firstChild = matchingValue.children[0];
      if (typeof firstChild.field === 'string') {
        currentLevel = { field: firstChild.field, values: matchingValue.children };
      } else {
        // Children array contains values, not a new level object
        break;
      }
    } else {
      break;
    }
  }
  
  return updates;
}

// ============================================================================
// Helper function: Update hierarchy.json with Reference movement
// ============================================================================
function updateHierarchyJsonReferences(hierarchyPath, currentPath, targetPath, ref) {
  // Read hierarchy.json
  const hierarchy = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
  const normalizedRef = normalizeRefString(ref);
  
  // Recursive function to find and update nodes
  function updateNode(node, pathToFind, isRemove) {
    if (!node || !node.values) return false;
    
    for (const valueNode of node.values) {
      // Build full path for this node
      let nodePath = valueNode.value;
      
      // Check if we found the target path
      if (pathToFind === nodePath) {
        if (valueNode.references) {
          if (isRemove) {
            // Remove reference
            const idx = valueNode.references.findIndex(r => normalizeRefString(r) === normalizedRef);
            if (idx !== -1) {
              valueNode.references.splice(idx, 1);
              valueNode.recordCount = valueNode.references.length;
              return true;
            }
          } else {
            // Add reference
            if (!valueNode.references.some(r => normalizeRefString(r) === normalizedRef)) {
              valueNode.references.push(ref);
              valueNode.recordCount = valueNode.references.length;
              return true;
            }
          }
        }
      } else if (pathToFind.startsWith(nodePath + '/') && valueNode.children) {
        // Recurse into children
        const childField = valueNode.children[0]?.field;
        if (updateNode({ field: childField, values: valueNode.children }, pathToFind, isRemove)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Remove from current path
  updateNode(hierarchy.tree, currentPath, true);
  
  // Add to target path
  updateNode(hierarchy.tree, targetPath, false);
  
  // Write back to disk
  fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchy, null, 2), 'utf8');
}

// ============================================================================
// Helper function: Update working_data.xml with field changes
// ============================================================================
function updateWorkingDataXmlFields(xmlPath, ref, fieldUpdates) {
  // Read XML with UTF-16 encoding
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
  
  const xmlResult = parser.parse(xmlData);
  const phonData = xmlResult.phon_data;
  let dataForms = Array.isArray(phonData.data_form) 
    ? phonData.data_form 
    : [phonData.data_form];
  
  // Find the record to update
  const normalizedRef = normalizeRefString(ref);
  const record = dataForms.find(df => normalizeRefString(df.Reference) === normalizedRef);
  
  if (!record) {
    throw new Error(`Record ${ref} not found in working_data.xml`);
  }
  
  // Update fields
  Object.entries(fieldUpdates).forEach(([field, value]) => {
    record[field] = value;
  });
  
  // Build XML
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
  });
  
  let updatedXml = builder.build(xmlResult);
  
  // Ensure XML declaration with UTF-16
  if (!updatedXml.startsWith('<?xml')) {
    updatedXml = '<?xml version="1.0" encoding="utf-16"?>\n' + updatedXml;
  } else {
    // Replace existing declaration to ensure UTF-16
    updatedXml = updatedXml.replace(
      /<\?xml[^?]*\?>/,
      '<?xml version="1.0" encoding="utf-16"?>'
    );
  }
  
  // Write with UTF-16 encoding
  fs.writeFileSync(xmlPath, updatedXml, 'utf16le');
}

// Helper to extract category field information from hierarchy paths
function extractCategoryFieldsFromPath(oldPath, newPath) {
  try {
    // Paths are like "Noun/CVCV" or "Verb/VCV/transitive"
    // Parse the hierarchy to determine which field changed
    const oldParts = oldPath.split('/');
    const newParts = newPath.split('/');
    
    // Find the first differing part
    let field = 'Category';
    let oldValue = oldPath;
    let newValue = newPath;
    
    // If we have hierarchy config with tree structure, use it to determine the field
    if (hierarchyConfig && hierarchyConfig.tree) {
      // Tree structure: walk tree to find field at depth
      let currentNode = hierarchyConfig.tree;
      for (let i = 0; i < Math.max(oldParts.length, newParts.length); i++) {
        if (oldParts[i] !== newParts[i]) {
          field = currentNode.field || 'Category';
          oldValue = oldParts[i] || '';
          newValue = newParts[i] || '';
          break;
        }
        // Navigate to children if available
        if (currentNode.values) {
          const matchingValue = currentNode.values.find(v => v.value === oldParts[i]);
          if (matchingValue && matchingValue.children && matchingValue.children.length > 0) {
            currentNode = matchingValue.children[0]; // Assume first child for structure
          } else {
            break;
          }
        }
      }
    }
    
    return { field, oldValue, newValue };
  } catch (error) {
    console.warn('[extractCategoryFieldsFromPath] Error:', error.message);
    return { field: 'Category', oldValue: oldPath, newValue: newPath };
  }
}

// Mark all groups in current session as reviewed
ipcMain.handle('mark-all-groups-reviewed', async () => {
  if (!sessionData || !sessionData.groups) {
    return { success: false, error: 'No session data' };
  }
  
  try {
    // Mark all groups as reviewed
    for (const group of sessionData.groups) {
      group.additionsSinceReview = 0;
      group.requiresReview = false;
      
      // Track review action for hierarchical bundles
      if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
        changeTracker.logGroupReviewed(sessionData.currentSubBundle, group.id);
      }
    }
    
    // If hierarchical, also update sub-bundle session
    if (bundleType === 'hierarchical' && sessionData.currentSubBundle) {
      const subBundleSession = sessionData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
      if (subBundleSession) {
        for (const group of subBundleSession.groups) {
          group.additionsSinceReview = 0;
          group.requiresReview = false;
        }
      }
    }
    
    saveSession();
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Mark sub-bundle as reviewed (hierarchical bundles only)
ipcMain.handle('mark-sub-bundle-reviewed', async (event, { reviewed }) => {
  if (bundleType !== 'hierarchical' || !sessionData || !sessionData.currentSubBundle) {
    return { success: false, error: 'Not in a hierarchical sub-bundle' };
  }
  
  try {
    const subBundleSession = sessionData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
    if (!subBundleSession) {
      return { success: false, error: 'Sub-bundle not found' };
    }
    
    subBundleSession.reviewed = reviewed;
    
    saveSession();
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Undo last change
ipcMain.handle('undo', async () => {
  try {
    // TODO: Implement actual undo functionality
    // This would require storing state snapshots before each change
    return { 
      success: false, 
      error: 'Undo functionality not yet implemented',
      canUndo: false,
      canRedo: false
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Redo last undone change
ipcMain.handle('redo', async () => {
  try {
    // TODO: Implement actual redo functionality  
    return { 
      success: false, 
      error: 'Redo functionality not yet implemented',
      canUndo: false,
      canRedo: false
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get undo/redo state
ipcMain.handle('get-undo-redo-state', async () => {
  return {
    canUndo: false,
    canRedo: false
  };
});
