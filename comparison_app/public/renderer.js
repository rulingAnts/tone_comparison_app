const { ipcRenderer } = require('electron');
const path = require('path');

let currentResults = null;
let currentAnalysis = null;
let appSettings = { audioFolder: null, audioSuffix: '' };
let consensusAssignments = {}; // { [wordRef]: groupNumber }
let selectedWord = null;

async function loadResults() {
  const filePaths = await ipcRenderer.invoke('select-result-files');
  
  if (filePaths.length === 0) {
    return;
  }

  // Show file list
  const fileListEl = document.getElementById('fileList');
  fileListEl.innerHTML = `
    <h2>Loading ${filePaths.length} result file(s)...</h2>
    <ul class="file-list">
      ${filePaths.map(p => `<li>${p}</li>`).join('')}
    </ul>
  `;

  // Load and parse results
  const result = await ipcRenderer.invoke('load-results', filePaths);

  if (!result.success) {
    alert(`Error loading results: ${result.error}`);
    return;
  }

  currentResults = result.results;

  // Analyze results
  const analysisResult = await ipcRenderer.invoke('analyze-results', currentResults);

  if (!analysisResult.success) {
    alert(`Error analyzing results: ${analysisResult.error}`);
    return;
  }

  currentAnalysis = analysisResult.analysis;

  // Display results
  displayResults();
}

async function initSettings() {
  try {
    const s = await ipcRenderer.invoke('get-settings');
    if (s) appSettings = s;
  } catch {}
  refreshSettingsSummary();
}

function refreshSettingsSummary() {
  const el = document.getElementById('audioSettingsSummary');
  if (!el) return;
  const folder = appSettings.audioFolder ? appSettings.audioFolder : 'not set';
  const suffix = appSettings.audioSuffix ? `, suffix: "${appSettings.audioSuffix}"` : '';
  el.textContent = `Audio folder: ${folder}${suffix}`;
}

async function openAudioSettings() {
  const folder = await ipcRenderer.invoke('select-audio-folder');
  if (!folder) return;
  const suffix = window.prompt('Optional audio filename suffix to insert before extension (e.g., -d):', appSettings.audioSuffix || '');
  const patch = { audioFolder: folder, audioSuffix: suffix || '' };
  const saved = await ipcRenderer.invoke('set-settings', patch);
  appSettings = saved;
  refreshSettingsSummary();
}

function buildAudioPathForSoundFile(soundFileName) {
  if (!appSettings.audioFolder || !soundFileName) return null;
  const ext = path.extname(soundFileName);
  const base = soundFileName.slice(0, soundFileName.length - ext.length);
  const withSuffix = appSettings.audioSuffix ? `${base}${appSettings.audioSuffix}${ext}` : soundFileName;
  return path.join(appSettings.audioFolder, withSuffix);
}

function findRecordForWord(wordRef) {
  if (!currentResults) return null;
  for (const r of currentResults) {
    const rec = (r.records || []).find(df => (df && (df.Reference || df['Reference Number'])) && String(df.Reference || df['Reference Number']).trim() === String(wordRef).trim());
    if (rec) return rec;
  }
  return null;
}

function openReview(wordRef) {
  selectedWord = wordRef;
  const panel = document.getElementById('reviewPanel');
  const header = document.getElementById('reviewHeader');
  const audioEl = document.getElementById('audioPlayer');
  const audioNote = document.getElementById('audioNote');
  const picker = document.getElementById('groupPicker');
  if (!panel) return;

  // Header: show per-speaker assignments
  const sg = (currentAnalysis.wordAnalysis || []).find(w => w.word === wordRef)?.speakerGroups || [];
  header.innerHTML = `Word <strong>${wordRef}</strong> — ` + sg.map(x => `${x.speaker}: Group ${x.group ?? '-'}`).join(' | ');

  // Audio
  const rec = findRecordForWord(wordRef);
  if (rec && rec.SoundFile) {
    const filePath = buildAudioPathForSoundFile(rec.SoundFile);
    if (filePath) {
      audioEl.src = encodeURI(`file://${filePath}`);
      audioNote.textContent = rec.SoundFile !== path.basename(filePath) ? `Using suffix; looking for ${path.basename(filePath)}` : `Using ${rec.SoundFile}`;
    } else {
      audioEl.removeAttribute('src');
      audioNote.textContent = 'Set Audio Settings to enable playback.';
    }
  } else {
    audioEl.removeAttribute('src');
    audioNote.textContent = 'No SoundFile found in XML for this word.';
  }

  // Group picker: aggregate unique groups across speakers with exemplar images
  const groupMap = new Map(); // key: groupNumber -> { group: num, imageData, label }
  (currentResults || []).forEach(r => {
    (r.toneGroups || []).forEach(row => {
      const gnum = parseInt(row['Tone Group (Num)'] || row['Tone Group'] || row['Group'] || row['group']);
      if (!Number.isFinite(gnum)) return;
      if (!groupMap.has(gnum)) {
        groupMap.set(gnum, {
          group: gnum,
          imageData: row.imageData || null,
          label: row['Written Form'] || row['Reference Number'] || `Group ${gnum}`,
        });
      } else {
        const cur = groupMap.get(gnum);
        if (!cur.imageData && row.imageData) cur.imageData = row.imageData;
      }
    });
  });

  const entries = Array.from(groupMap.values()).sort((a,b) => a.group - b.group);
  picker.innerHTML = entries.map(e => `
    <div class="group-card" data-group="${e.group}" style="border:1px solid #ddd; border-radius:6px; overflow:hidden; cursor:pointer; background:#fff;">
      <div style="height:120px; background:#f2f2f2; display:flex; align-items:center; justify-content:center;">
        ${e.imageData ? `<img src="${e.imageData}" alt="Group ${e.group}" style="max-height:120px; max-width:100%;">` : `<span style='color:#aaa;'>No Image</span>`}
      </div>
      <div style="padding:8px 10px;">
        <div style="font-weight:600;">Group ${e.group}</div>
        <div style="color:#666; font-size:12px;">${e.label || ''}</div>
      </div>
    </div>
  `).join('');

  // Highlight current consensus
  const chosen = consensusAssignments[wordRef];
  Array.from(picker.querySelectorAll('.group-card')).forEach(card => {
    const g = parseInt(card.getAttribute('data-group'));
    if (chosen === g) {
      card.style.borderColor = '#007bff';
      card.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.2)';
    }
    card.addEventListener('click', () => {
      consensusAssignments[wordRef] = g;
      openReview(wordRef); // re-render highlight
      // Re-render disagreements to show consensus column
      displayResults();
    });
  });

  panel.style.display = 'block';
}
function displayResults() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  const { 
    totalWords, 
    agreedWords, 
    disagreedWords, 
    agreementPercentage, 
    wordAnalysis, 
    mergedGroups, 
    speakers 
  } = currentAnalysis;

  // Update file list
  const fileListEl = document.getElementById('fileList');
  fileListEl.innerHTML = `
    <h2>Loaded ${currentResults.length} Speaker Result(s)</h2>
    <ul class="file-list">
      ${currentResults.map(r => `<li><strong>${r.speaker}</strong>: ${r.toneGroups.length} tone groups, ${r.records.length} words</li>`).join('')}
    </ul>
  `;

  // Display statistics
  const statsEl = document.getElementById('stats');
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totalWords}</div>
      <div class="stat-label">Total Words</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${agreedWords}</div>
      <div class="stat-label">Full Agreement</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${disagreedWords}</div>
      <div class="stat-label">Disagreements</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${agreementPercentage}%</div>
      <div class="stat-label">Agreement Rate</div>
    </div>
  `;

  // Display speaker summaries
  const speakersEl = document.getElementById('speakersSection');
  speakersEl.innerHTML = `
    <h2>Speaker Summaries</h2>
    <table>
      <thead>
        <tr>
          <th>Speaker</th>
          <th>Tone Groups</th>
          <th>Words Grouped</th>
        </tr>
      </thead>
      <tbody>
        ${speakers.map(s => `
          <tr>
            <td><strong>${s.speaker}</strong></td>
            <td>${s.groupCount}</td>
            <td>${s.wordCount}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Display disagreements
  if (disagreedWords > 0) {
    const disagreementsEl = document.getElementById('disagreementsSection');
    disagreementsEl.innerHTML = `
      <h2>Words with Disagreements (${disagreedWords})</h2>
      <table>
        <thead>
          <tr>
            <th>Word Reference</th>
            ${speakers.map(s => `<th>${s.speaker}</th>`).join('')}
            <th>Consensus</th>
          </tr>
        </thead>
        <tbody>
          ${wordAnalysis.map(w => `
            <tr class="disagreement" style="cursor:pointer;" onclick="openReview('${w.word}')">
              <td><strong>${w.word}</strong></td>
              ${speakers.map(s => {
                const sg = w.speakerGroups.find(sg => sg.speaker === s.speaker);
                return `<td>${sg ? `Group ${sg.group}` : '-'}</td>`;
              }).join('')}
              <td>${consensusAssignments[w.word] != null ? `Group ${consensusAssignments[w.word]}` : '<span style="color:#999">(set in review)</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="margin-top: 10px; color: #666; font-style: italic;">
        Click a row to review, play audio, and set a consensus group.
      </p>
    `;
  } else {
    document.getElementById('disagreementsSection').innerHTML = `
      <h2>Words with Disagreements</h2>
      <p style="color: #28a745; font-weight: bold;">✓ All words have full agreement!</p>
    `;
  }

  // Display merged groups
  if (mergedGroups.length > 0) {
    const mergedEl = document.getElementById('mergedGroupsSection');
    mergedEl.innerHTML = `
      <h2>Potential Merged Groups (${mergedGroups.length})</h2>
      <p style="margin-bottom: 15px; color: #666;">
        These groups have >80% overlap and may represent the same tone melody with different exemplars.
      </p>
      ${mergedGroups.map(mg => `
        <div class="merged-group">
          <h3>
            <span class="overlap-badge">${mg.overlapPercent}% overlap (${mg.sharedWords} words)</span>
          </h3>
          <div class="speaker-info">
            <strong>${mg.speaker1}</strong> - Group ${mg.group1}<br>
            Exemplar: ${mg.exemplar1 ? mg.exemplar1['Written Form'] || mg.exemplar1['Reference Number'] : 'Unknown'}
          </div>
          <div class="speaker-info">
            <strong>${mg.speaker2}</strong> - Group ${mg.group2}<br>
            Exemplar: ${mg.exemplar2 ? mg.exemplar2['Written Form'] || mg.exemplar2['Reference Number'] : 'Unknown'}
          </div>
        </div>
      `).join('')}
      <p style="margin-top: 10px; color: #666; font-style: italic;">
        Consider using one exemplar for each merged group moving forward.
      </p>
    `;
  } else {
    document.getElementById('mergedGroupsSection').innerHTML = '';
  }
}

// Initialize settings on load
initSettings();
