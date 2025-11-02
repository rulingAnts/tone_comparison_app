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
    const referenceNumbers = (settings.referenceNumbers || []).map((r) => normalizeRefString(r));
    const refSet = new Set(referenceNumbers);
    let filteredRecords = referenceNumbers.length > 0
      ? dataForms.filter(df => {
          const ref = df && df.Reference != null ? normalizeRefString(df.Reference) : '';
          return refSet.has(ref);
        })
      : dataForms;

    // Optional: keep a stable numeric order without changing stored strings
    filteredRecords = sortByNumericRef(filteredRecords);
    
    // Collect sound files
    const soundFiles = new Set();
    const missingSoundFiles = [];
    
    for (const record of filteredRecords) {
      if (record.SoundFile) {
        let soundFile = record.SoundFile;
        
        // Add suffix if specified
        if (settings.audioFileSuffix) {
          const lastDot = soundFile.lastIndexOf('.');
          if (lastDot !== -1) {
            soundFile = soundFile.substring(0, lastDot) + 
                       settings.audioFileSuffix + 
                       soundFile.substring(lastDot);
          } else {
            soundFile += settings.audioFileSuffix;
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
    
    // Create minimized XML with only filtered records and no prior tone grouping
    const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
    const tgIdKey = settings.toneGroupIdElement || 'SurfaceMelodyGroupId';
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
    
    // Add settings file
    archive.append(JSON.stringify(settings, null, 2), { name: 'settings.json' });
    
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
      { name: 'Zip Files', extensions: ['zip'] },
    ],
    defaultPath: 'tone_matching_bundle.tncmp',
  });
  
  if (!result.canceled && result.filePath) {
    return result.filePath;
  }
  return null;
});
