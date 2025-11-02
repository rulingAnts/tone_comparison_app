const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const csv = require('fast-csv');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

ipcMain.handle('select-result-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Zip Files', extensions: ['zip'] }],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

ipcMain.handle('load-results', async (event, filePaths) => {
  try {
    const results = [];
    
    for (const filePath of filePaths) {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      
      // Extract speaker name from file path
      const speakerName = path.basename(filePath, '.zip');
      
      // Find and parse CSV
      const csvEntry = zipEntries.find(e => e.entryName.endsWith('.csv'));
      if (!csvEntry) {
        throw new Error(`No CSV file found in ${speakerName}`);
      }
      
      const csvData = csvEntry.getData().toString('utf8');
      const toneGroups = await parseCsv(csvData);
      
      // Find and parse XML
      const xmlEntry = zipEntries.find(e => e.entryName.endsWith('.xml'));
      if (!xmlEntry) {
        throw new Error(`No XML file found in ${speakerName}`);
      }
      
      const xmlData = xmlEntry.getData().toString('utf16le');
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const xmlResult = parser.parse(xmlData);
      
      const phonData = xmlResult.phon_data;
      const dataForms = Array.isArray(phonData.data_form) 
        ? phonData.data_form 
        : [phonData.data_form];
      
      results.push({
        speaker: speakerName,
        toneGroups,
        records: dataForms,
        filePath,
      });
    }
    
    return {
      success: true,
      results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('analyze-results', async (event, results) => {
  try {
    const analysis = analyzeResults(results);
    return {
      success: true,
      analysis,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

function parseCsv(csvData) {
  return new Promise((resolve, reject) => {
    const rows = [];
    csv.parseString(csvData, { headers: true })
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function analyzeResults(results) {
  // Build word-to-groups map for each speaker
  const speakerAssignments = results.map(result => {
    const assignments = new Map();
    
    result.records.forEach(record => {
      const reference = record.Reference;
      const toneGroup = record.SurfaceMelodyGroup;
      
      if (toneGroup) {
        assignments.set(reference, parseInt(toneGroup));
      }
    });
    
    return {
      speaker: result.speaker,
      assignments,
      toneGroups: result.toneGroups,
    };
  });
  
  // Find all unique words across speakers
  const allWords = new Set();
  speakerAssignments.forEach(sa => {
    sa.assignments.forEach((_, ref) => allWords.add(ref));
  });
  
  // Analyze agreement for each word
  const wordAnalysis = [];
  
  for (const word of allWords) {
    const speakerGroups = speakerAssignments.map(sa => ({
      speaker: sa.speaker,
      group: sa.assignments.get(word),
    })).filter(sg => sg.group !== undefined);
    
    // Check if all speakers agree
    const groups = speakerGroups.map(sg => sg.group);
    const allAgree = groups.length > 1 && groups.every(g => g === groups[0]);
    
    wordAnalysis.push({
      word,
      speakerGroups,
      agreement: allAgree ? 'full' : 'partial',
      disagreement: !allAgree && speakerGroups.length > 1,
    });
  }
  
  // Find potential merged groups (groups with substantial overlap)
  const mergedGroups = findMergedGroups(speakerAssignments);
  
  // Calculate statistics
  const totalWords = wordAnalysis.length;
  const agreedWords = wordAnalysis.filter(w => w.agreement === 'full').length;
  const disagreedWords = wordAnalysis.filter(w => w.disagreement).length;
  
  return {
    totalWords,
    agreedWords,
    disagreedWords,
    agreementPercentage: totalWords > 0 ? (agreedWords / totalWords * 100).toFixed(1) : 0,
    wordAnalysis: wordAnalysis.filter(w => w.disagreement), // Only return disagreements
    mergedGroups,
    speakers: speakerAssignments.map(sa => ({
      speaker: sa.speaker,
      groupCount: sa.toneGroups.length,
      wordCount: sa.assignments.size,
    })),
  };
}

function findMergedGroups(speakerAssignments) {
  const merged = [];
  
  // For each pair of speakers
  for (let i = 0; i < speakerAssignments.length; i++) {
    for (let j = i + 1; j < speakerAssignments.length; j++) {
      const speaker1 = speakerAssignments[i];
      const speaker2 = speakerAssignments[j];
      
      // Group words by speaker1's assignments
      const s1Groups = new Map();
      speaker1.assignments.forEach((group, word) => {
        if (!s1Groups.has(group)) {
          s1Groups.set(group, []);
        }
        s1Groups.get(group).push(word);
      });
      
      // For each group in speaker1, find overlapping groups in speaker2
      s1Groups.forEach((words, s1Group) => {
        const s2GroupCounts = new Map();
        
        words.forEach(word => {
          const s2Group = speaker2.assignments.get(word);
          if (s2Group !== undefined) {
            s2GroupCounts.set(s2Group, (s2GroupCounts.get(s2Group) || 0) + 1);
          }
        });
        
        // Find groups with >80% overlap
        s2GroupCounts.forEach((count, s2Group) => {
          const overlapPercent = (count / words.length) * 100;
          if (overlapPercent > 80) {
            merged.push({
              speaker1: speaker1.speaker,
              group1: s1Group,
              exemplar1: speaker1.toneGroups.find(g => parseInt(g['Tone Group']) === s1Group),
              speaker2: speaker2.speaker,
              group2: s2Group,
              exemplar2: speaker2.toneGroups.find(g => parseInt(g['Tone Group']) === s2Group),
              overlapPercent: overlapPercent.toFixed(1),
              sharedWords: count,
            });
          }
        });
      });
    }
  }
  
  return merged;
}
