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
      // Restore hierarchical bundle
      const manifestPath = path.join(extractedPath, 'manifest.json');
      const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
      const settingsPath = path.join(extractedPath, 'settings.json');
      
      if (!fs.existsSync(manifestPath) || !fs.existsSync(hierarchyPath) || !fs.existsSync(settingsPath)) {
        console.log('[desktop_matching] Missing bundle files, cannot restore');
        return;
      }
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      hierarchyConfig = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      
      // Verify bundle ID matches
      if (manifest.bundleId !== sessionData.bundleId && settings.bundleId !== sessionData.bundleId) {
        console.log('[desktop_matching] Bundle ID mismatch, cannot restore');
        return;
      }
      
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
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                subBundles.push({
                  path: subPath,
                  categoryPath: metadata.categoryPath || subPath,
                  recordCount: metadata.recordCount || 0,
                  audioConfig: metadata.audioConfig || { includeAudio: true, suffix: '' },
                  fullPath: subDir,
                });
              } else {
                scanSubBundles(subDir, subPath);
              }
            }
          }
        };
        
        scanSubBundles(subBundlesDir);
      }
      
      bundleData = {
        settings,
        manifest,
        hierarchy: hierarchyConfig,
        subBundles,
        extractedPath,
        bundleId: settings.bundleId || manifest.bundleId || null,
        bundleType: 'hierarchical',
      };
      
      // Load existing change history
      const existingHistory = ChangeTracker.loadChangeHistory(extractedPath);
      changeTracker.initialize(extractedPath, existingHistory);
      
      // If currently in a sub-bundle, restore its records
      if (sessionData.currentSubBundle) {
        const subBundle = bundleData.subBundles.find(sb => sb.path === sessionData.currentSubBundle);
        if (subBundle) {
          let xmlPath = path.join(subBundle.fullPath, 'data_updated.xml');
          if (!fs.existsSync(xmlPath)) {
            xmlPath = path.join(subBundle.fullPath, 'data.xml');
          }
          if (fs.existsSync(xmlPath)) {
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
            
            bundleData.records = dataForms;
            bundleData.currentSubBundlePath = sessionData.currentSubBundle;
            currentSubBundlePath = sessionData.currentSubBundle;
          }
        }
      }
      
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
      // OLD STRUCTURE: Fall back to sub_bundles/ directory loading
      console.log('[desktop_matching] Loading hierarchical bundle with old structure (sub_bundles/)');
      
      // Load manifest.json (may not exist in very old bundles)
      const manifestPath = path.join(extractedPath, 'manifest.json');
      const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        : { bundleType: 'hierarchical', version: '1.0' };
      
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
      
      // Build sub-bundle list from sub_bundles/ directory
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
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                subBundles.push({
                  path: subPath,
                  categoryPath: metadata.categoryPath || subPath,
                  recordCount: metadata.recordCount || 0,
                  audioConfig: metadata.audioConfig || { includeAudio: true, suffix: '' },
                  fullPath: subDir,
                  usesNewStructure: false, // Flag for old structure
                });
              } else {
                scanSubBundles(subDir, subPath);
              }
            }
          }
        };
        
        scanSubBundles(subBundlesDir);
      }
      
      console.log(`[desktop_matching] Found ${subBundles.length} sub-bundles (old structure)`);
      
      const existingHistory = ChangeTracker.loadChangeHistory(extractedPath);
      
      bundleData = {
        settings,
        manifest,
        hierarchy: hierarchyConfig,
        subBundles,
        extractedPath,
        bundleId: settings.bundleId || manifest.bundleId || null,
        bundleType: 'hierarchical',
        usesNewStructure: false,
      };
      
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
            recordCount: sb.recordCount,
            assignedCount: 0,
            reviewed: false,
            queue: [],
            groups: [],
          })),
          currentSubBundle: null,
          selectedAudioVariantIndex: 0,
          records: {},
          locale: sessionData?.locale || 'en',
        };
        
        saveSession();
      }
      
      changeTracker.initialize(extractedPath, existingHistory);
      
      return {
        success: true,
        bundleType: 'hierarchical',
        settings: bundleData.settings,
        manifest: manifest,
        hierarchy: hierarchyConfig,
        subBundleCount: subBundles.length,
        session: sessionData,
        requiresNavigation: true,
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
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
    // Check for new structure (audio/ folder at root)
    const newAudioDir = path.join(extractedPath, 'audio');
    if (fs.existsSync(newAudioDir)) {
      // New structure: all audio in root audio/ folder
      audioDir = newAudioDir;
    } else if (currentSubBundlePath) {
      // Old structure: audio in sub_bundles/{path}/audio/
      audioDir = path.join(extractedPath, 'sub_bundles', currentSubBundlePath, 'audio');
    }
  } else {
    // For legacy bundles, audio is in audio/
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
    
    let dataForms = [];
    
    // Check if using new structure (with references list) or old structure (with fullPath)
    if (subBundle.usesNewStructure && subBundle.references && bundleData.allDataForms) {
      // NEW STRUCTURE: Filter allDataForms by references list
      console.log('[load-sub-bundle] Using new structure with centralized XML');
      const refSet = new Set(subBundle.references.map(r => normalizeRefString(r)));
      dataForms = bundleData.allDataForms.filter(df => {
        const ref = normalizeRefString(df.Reference);
        return refSet.has(ref);
      });
    } else if (subBundle.fullPath) {
      // OLD STRUCTURE: Load from sub_bundles/{path}/data.xml
      console.log('[load-sub-bundle] Using old structure with sub_bundles/ folder');
      
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
      
      // Handle data_form which can be undefined, empty array, single object, or array of objects
      if (!phonData.data_form || (Array.isArray(phonData.data_form) && phonData.data_form.length === 0)) {
        dataForms = [];
      } else if (Array.isArray(phonData.data_form)) {
        dataForms = phonData.data_form;
      } else {
        dataForms = [phonData.data_form];
      }
    } else {
      throw new Error('Sub-bundle has neither references list nor fullPath');
    }
    
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
    
    // Create archive
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    
    // Add manifest.json (from original bundle)
    const manifestPath = path.join(extractedPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      // Update export timestamp
      manifest.exportedAt = new Date().toISOString();
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    }
    
    // Add hierarchy.json (from original bundle)
    const hierarchyPath = path.join(extractedPath, 'hierarchy.json');
    if (fs.existsSync(hierarchyPath)) {
      archive.file(hierarchyPath, { name: 'hierarchy.json' });
    }
    
    // Add data_original.xml (unchanged) - try both filenames for compatibility
    let originalXmlPath = path.join(extractedPath, 'original_data.xml');
    if (!fs.existsSync(originalXmlPath)) {
      originalXmlPath = path.join(extractedPath, 'data_original.xml');
    }
    if (fs.existsSync(originalXmlPath)) {
      const xmlName = path.basename(originalXmlPath);
      archive.file(originalXmlPath, { name: xmlName });
    }
    
    // Add settings.json (bundle-level settings)
    const settingsPath = path.join(extractedPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      archive.file(settingsPath, { name: 'settings.json' });
    }
    
    // Add fonts folder
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
        console.log('[desktop_matching] Added change_history.json to export');
      }
    } catch (error) {
      console.warn('[desktop_matching] Failed to save change history:', error.message);
    }
    
    // Process each sub-bundle
    for (const subBundle of sessionData.subBundles) {
      const subBundlePath = subBundle.path;
      const subBundleDir = `sub_bundles/${subBundlePath}`;
      
      // Create data_updated.xml for this sub-bundle with tone group assignments
      const updatedXml = buildSubBundleDataXml(subBundle);
      archive.append(updatedXml, { name: `${subBundleDir}/data_updated.xml` });
      
      // Copy original data.xml
      const originalDataPath = path.join(extractedPath, 'sub_bundles', subBundlePath, 'data.xml');
      if (fs.existsSync(originalDataPath)) {
        archive.file(originalDataPath, { name: `${subBundleDir}/data.xml` });
      }
      
      // Copy audio folder
      const audioDir = path.join(extractedPath, 'sub_bundles', subBundlePath, 'audio');
      if (fs.existsSync(audioDir)) {
        archive.directory(audioDir, `${subBundleDir}/audio`);
      }
      
      // Create metadata.json with progress and review status
      const metadata = {
        path: subBundlePath,
        recordCount: subBundle.recordCount || 0,
        assignedCount: subBundle.assignedCount || 0,
        reviewed: subBundle.reviewed || false,
        groupCount: subBundle.groups.length,
        exportedAt: new Date().toISOString(),
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: `${subBundleDir}/metadata.json` });
      
      // Add group images to sub-bundle images folder
      const imagesAdded = new Set();
      for (const group of subBundle.groups) {
        if (group.image && fs.existsSync(group.image) && !imagesAdded.has(group.image)) {
          const imageName = `group_${group.groupNumber}${path.extname(group.image)}`;
          archive.file(group.image, { name: `${subBundleDir}/images/${imageName}` });
          imagesAdded.add(group.image);
        }
      }
    }
    
    // Add export_meta.json with overall statistics
    const exportMeta = {
      bundleId: bundleData.bundleId,
      exportedAt: new Date().toISOString(),
      platform: 'desktop',
      subBundleCount: sessionData.subBundles.length,
      totalGroups: sessionData.subBundles.reduce((sum, sb) => sum + sb.groups.length, 0),
      reviewedSubBundles: sessionData.subBundles.filter(sb => sb.reviewed).length,
    };
    archive.append(JSON.stringify(exportMeta, null, 2), { name: 'export_meta.json' });
    
    await archive.finalize();
    
    return { success: true, outputPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Build data_updated.xml for a sub-bundle with tone group assignments
function buildSubBundleDataXml(subBundle) {
  const tgKey = bundleData.settings.toneGroupElement || 'SurfaceMelodyGroup';
  const tgIdKey = bundleData.settings.toneGroupIdElement || 'SurfaceMelodyGroupId';
  const userSpellingKey = bundleData.settings.userSpellingElement || 'Orthographic';
  
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
      
      // Add enhanced fields if present
      if (groupData.pitchTranscription) {
        updated['SurfaceMelodyPitch'] = groupData.pitchTranscription;
      }
      if (groupData.toneAbbreviation) {
        updated['SurfaceMelody'] = groupData.toneAbbreviation;
      }
      if (groupData.exemplarWord) {
        updated['SurfaceMelodyEx'] = groupData.exemplarWord;
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
}

// Export single sub-bundle as legacy format (.zip)
ipcMain.handle('export-sub-bundle', async (event, { subBundlePath }) => {
  if (!bundleData || !sessionData || bundleType !== 'hierarchical') {
    return { success: false, error: 'No hierarchical bundle loaded' };
  }
  
  const subBundleSession = sessionData.subBundles.find(sb => sb.path === subBundlePath);
  if (!subBundleSession) {
    return { success: false, error: 'Sub-bundle not found' };
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
    
    // Build updated XML for this sub-bundle only
    const updatedXml = buildSubBundleDataXml(subBundleSession);
    
    // Get original data.xml for this sub-bundle
    const originalDataPath = path.join(extractedPath, 'sub_bundles', subBundlePath, 'data.xml');
    const originalXml = fs.readFileSync(originalDataPath, 'utf8');
    
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
    
    // Add audio files for this sub-bundle
    const audioDir = path.join(extractedPath, 'sub_bundles', subBundlePath, 'audio');
    if (fs.existsSync(audioDir)) {
      archive.directory(audioDir, 'audio');
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
    // Get current sub-bundle
    const currentSubBundle = sessionData.currentSubBundle;
    if (!currentSubBundle) {
      return { success: false, error: 'No current sub-bundle' };
    }
    
    if (currentSubBundle === targetSubBundle) {
      return { success: false, error: 'Cannot move to same sub-bundle' };
    }
    
    // Find current and target sub-bundle data
    const currentSubBundleData = bundleData.subBundles.find(sb => sb.path === currentSubBundle);
    const targetSubBundleData = bundleData.subBundles.find(sb => sb.path === targetSubBundle);
    
    if (!currentSubBundleData || !targetSubBundleData) {
      return { success: false, error: 'Sub-bundle data not found' };
    }
    
    // Find current and target sub-bundle sessions
    const currentSession = sessionData.subBundles.find(sb => sb.path === currentSubBundle);
    const targetSession = sessionData.subBundles.find(sb => sb.path === targetSubBundle);
    
    if (!currentSession || !targetSession) {
      return { success: false, error: 'Sub-bundle session not found' };
    }
    
    // Read current sub-bundle XML
    const currentXmlPath = path.join(currentSubBundleData.fullPath, 'data.xml');
    if (!fs.existsSync(currentXmlPath)) {
      return { success: false, error: 'Current sub-bundle data.xml not found' };
    }
    
    const currentXmlBuffer = fs.readFileSync(currentXmlPath);
    const currentXmlData = currentXmlBuffer.toString('utf8');
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    
    const currentXmlResult = parser.parse(currentXmlData);
    const currentPhonData = currentXmlResult.phon_data;
    let currentDataForms = Array.isArray(currentPhonData.data_form) 
      ? currentPhonData.data_form 
      : [currentPhonData.data_form];
    
    // Find the record to move
    const recordIndex = currentDataForms.findIndex(df => normalizeRefString(df.Reference) === ref);
    if (recordIndex === -1) {
      return { success: false, error: 'Record not found in current sub-bundle' };
    }
    
    const record = currentDataForms[recordIndex];
    
    // Update category fields to match target sub-bundle
    const categoryUpdates = getCategoryUpdatesForPath(targetSubBundle, bundleData.hierarchy);
    Object.entries(categoryUpdates).forEach(([field, value]) => {
      record[field] = value;
    });
    
    // Copy audio files to target sub-bundle
    if (record.SoundFile) {
      const currentAudioDir = path.join(currentSubBundleData.fullPath, 'audio');
      const targetAudioDir = path.join(targetSubBundleData.fullPath, 'audio');
      
      // Ensure target audio directory exists
      if (!fs.existsSync(targetAudioDir)) {
        fs.mkdirSync(targetAudioDir, { recursive: true });
      }
      
      // Move all audio variants
      const baseFilename = path.parse(record.SoundFile).name;
      const audioVariants = bundleData.settings.audioFileVariants || [{ suffix: '' }];
      
      for (const variant of audioVariants) {
        const suffix = variant.suffix || '';
        const sourceFile = path.join(currentAudioDir, `${baseFilename}${suffix}.flac`);
        const targetFile = path.join(targetAudioDir, `${baseFilename}${suffix}.flac`);
        
        if (fs.existsSync(sourceFile)) {
          fs.copyFileSync(sourceFile, targetFile);
          fs.unlinkSync(sourceFile); // Delete source file after copying
        } else {
          // Try with .wav extension
          const sourceWav = path.join(currentAudioDir, `${baseFilename}${suffix}.wav`);
          if (fs.existsSync(sourceWav)) {
            const targetWav = path.join(targetAudioDir, `${baseFilename}${suffix}.wav`);
            fs.copyFileSync(sourceWav, targetWav);
            fs.unlinkSync(sourceWav); // Delete source file after copying
          }
        }
      }
    }
    
    // Remove record from current sub-bundle XML
    currentDataForms.splice(recordIndex, 1);
    
    // Update current sub-bundle XML
    if (currentDataForms.length === 0) {
      // Don't leave empty data.xml, keep at least an empty structure
      currentPhonData.data_form = [];
    } else if (currentDataForms.length === 1) {
      currentPhonData.data_form = currentDataForms[0];
    } else {
      currentPhonData.data_form = currentDataForms;
    }
    
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      indentBy: '  ',
    });
    
    const updatedCurrentXml = builder.build(currentXmlResult);
    fs.writeFileSync(currentXmlPath, updatedCurrentXml, 'utf8');
    
    // Read or create target sub-bundle XML
    const targetXmlPath = path.join(targetSubBundleData.fullPath, 'data.xml');
    let targetXmlResult;
    
    if (fs.existsSync(targetXmlPath)) {
      const targetXmlBuffer = fs.readFileSync(targetXmlPath);
      const targetXmlData = targetXmlBuffer.toString('utf8');
      targetXmlResult = parser.parse(targetXmlData);
    } else {
      // Create new structure
      targetXmlResult = {
        phon_data: {
          data_form: []
        }
      };
    }
    
    const targetPhonData = targetXmlResult.phon_data;
    let targetDataForms = Array.isArray(targetPhonData.data_form) 
      ? targetPhonData.data_form 
      : (targetPhonData.data_form ? [targetPhonData.data_form] : []);
    
    // Add record to target sub-bundle
    targetDataForms.push(record);
    
    if (targetDataForms.length === 1) {
      targetPhonData.data_form = targetDataForms[0];
    } else {
      targetPhonData.data_form = targetDataForms;
    }
    
    const updatedTargetXml = builder.build(targetXmlResult);
    fs.writeFileSync(targetXmlPath, updatedTargetXml, 'utf8');
    
    // Update session data
    // Remove from current sub-bundle
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
    currentSession.recordCount = currentDataForms.length;
    
    // Add to target sub-bundle
    if (!targetSession.queue.includes(ref)) {
      targetSession.queue.push(ref);
    }
    targetSession.recordCount = targetDataForms.length;
    
    console.log(`[move-word-to-sub-bundle] Moved ${ref} from ${currentSubBundle} to ${targetSubBundle}`);
    console.log(`[move-word-to-sub-bundle] Updated category fields:`, categoryUpdates);
    
    // Track the sub-bundle move
    changeTracker.logSubBundleMove(
      ref,
      currentSubBundle,
      targetSubBundle,
      Object.keys(categoryUpdates).join(', '),
      currentSubBundle,
      targetSubBundle
    );
    
    // Save session
    saveSession();
    
    // Return updated session
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

// Helper to get category field updates based on target path
function getCategoryUpdatesForPath(targetPath, hierarchy) {
  const updates = {};
  
  // Parse the hierarchy tree to determine which fields to update
  const pathParts = targetPath.split('/');
  
  if (!hierarchy || !hierarchy.tree) {
    return updates;
  }
  
  // Navigate through the tree to find field assignments
  let currentLevel = hierarchy.tree.values || [];
  let currentField = hierarchy.tree.field || 'Category';
  
  pathParts.forEach((part, index) => {
    // Set the field for this level
    updates[currentField] = part;
    
    // Find the node for this part
    const node = currentLevel.find(n => n.value === part);
    if (node && node.children && node.children.length > 0) {
      // If there are children, get the field name for the next level
      // This should be stored in the hierarchy structure
      currentLevel = node.children;
      // For now, assume standard field progression
      if (index === 0 && part === 'Noun') {
        currentField = 'SyllableProfile'; // Or whatever the second-level field is
      }
    }
  });
  
  return updates;
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
