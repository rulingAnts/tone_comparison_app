const { ipcRenderer } = require('electron');
const path = require('path');

let currentResults = null;
let currentAnalysis = null;
let appSettings = { audioFolder: null, audioSuffix: '' };
let consensusAssignments = {}; // { [wordRef]: groupNumber }
let selectedWord = null;
let currentReviewView = 'disagreements'; // 'disagreements' | 'all' | 'groups'

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
  console.log('[comparison] Loaded settings:', appSettings);
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
  const nextSuffix = await showSuffixModal(appSettings.audioSuffix || '');
  if (nextSuffix === null) {
    // User canceled suffix input; keep previous suffix but still save folder
  }
  const patch = { audioFolder: folder, audioSuffix: nextSuffix };
  await ipcRenderer.invoke('set-settings', patch);
  const saved = await ipcRenderer.invoke('get-settings');
  appSettings = saved || patch;
  console.log('[comparison] Saved settings:', appSettings);
  refreshSettingsSummary();
}

function showSuffixModal(defaultValue = '') {
  return new Promise(resolve => {
    const modal = document.getElementById('suffixModal');
    const input = document.getElementById('suffixInput');
    const btnSave = document.getElementById('suffixSaveBtn');
    const btnCancel = document.getElementById('suffixCancelBtn');
    if (!modal || !input || !btnSave || !btnCancel) {
      // Fallback: if modal not present, resolve with default
      return resolve(defaultValue || '');
    }
    input.value = defaultValue || '';
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      btnSave.removeEventListener('click', onSave);
      btnCancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      modal.removeEventListener('click', onBackdrop);
    };
    const onSave = () => { const v = input.value || ''; cleanup(); resolve(v); };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => {
      if (e.key === 'Enter') onSave();
      if (e.key === 'Escape') onCancel();
    };
    const onBackdrop = (e) => {
      if (e.target === modal) onCancel();
    };

    btnSave.addEventListener('click', onSave);
    btnCancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    modal.addEventListener('click', onBackdrop);
    setTimeout(() => input.focus(), 0);
  });
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
  const sg = (currentAnalysis.wordAnalysisAll || currentAnalysis.wordAnalysis || []).find(w => w.word === wordRef)?.speakerGroups || [];
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
    wordAnalysisAll,
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

  // Render Group Review
  renderGroupReview();

  // Display All words table
  const allWordsEl = document.getElementById('allWordsSection');
  if (Array.isArray(wordAnalysisAll) && wordAnalysisAll.length > 0) {
    allWordsEl.innerHTML = `
      <h2>All Words (${wordAnalysisAll.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Word Reference</th>
            ${speakers.map(s => `<th>${s.speaker}</th>`).join('')}
            <th>Consensus</th>
          </tr>
        </thead>
        <tbody>
          ${wordAnalysisAll.map(w => `
            <tr class="${w.disagreement ? 'disagreement' : ''}" style="cursor:pointer;" onclick="openReview('${w.word}')">
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
    allWordsEl.innerHTML = '';
  }

  // Apply view toggle visibility
  setViewVisibility();
}

function setViewVisibility() {
  const allEl = document.getElementById('allWordsSection');
  const disEl = document.getElementById('disagreementsSection');
  const grpEl = document.getElementById('groupReviewSection');
  const btnAll = document.getElementById('btnShowAll');
  const btnDis = document.getElementById('btnShowDisagreements');
  const btnGrp = document.getElementById('btnShowGroups');
  if (!allEl || !disEl) return;
  // Reset displays
  allEl.style.display = 'none';
  disEl.style.display = 'none';
  if (grpEl) grpEl.style.display = 'none';
  if (btnAll) btnAll.style.background = '#17a2b8';
  if (btnDis) btnDis.style.background = '#007bff';
  if (btnGrp) btnGrp.style.background = '#20c997';

  if (currentReviewView === 'all') {
    allEl.style.display = 'block';
    if (btnAll) btnAll.style.background = '#138496';
  } else if (currentReviewView === 'groups') {
    if (grpEl) grpEl.style.display = 'block';
    if (btnGrp) btnGrp.style.background = '#199a79';
  } else {
    disEl.style.display = 'block';
    if (btnDis) btnDis.style.background = '#0056b3';
  }
}

function setReviewView(view) {
  currentReviewView = view;
  setViewVisibility();
}

function toNumericRef(ref) {
  const m = String(ref || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.NaN;
}

function getAllGroupNumbers() {
  const set = new Set();
  (currentResults || []).forEach(r => {
    (r.toneGroups || []).forEach(row => {
      const gnum = parseInt(row['Tone Group (Num)'] || row['Tone Group'] || row['Group'] || row['group']);
      if (Number.isFinite(gnum)) set.add(gnum);
    });
  });
  return Array.from(set).sort((a,b) => a - b);
}

function getGroupImageDataMap() {
  const map = new Map(); // group -> imageData
  (currentResults || []).forEach(r => {
    (r.toneGroups || []).forEach(row => {
      const gnum = parseInt(row['Tone Group (Num)'] || row['Tone Group'] || row['Group'] || row['group']);
      if (!Number.isFinite(gnum)) return;
      if (!map.has(gnum) && row.imageData) {
        map.set(gnum, row.imageData);
      }
    });
  });
  return map;
}

function getSpeakerAssignmentsByWord() {
  const byWord = new Map(); // ref -> [{speaker, group}]
  (currentResults || []).forEach(r => {
    const sp = r.speaker;
    (r.records || []).forEach(df => {
      const ref = String(df?.Reference || df?.['Reference Number'] || '').trim();
      const group = df?.SurfaceMelodyGroup != null ? parseInt(df.SurfaceMelodyGroup) : undefined;
      if (!ref) return;
      if (!byWord.has(ref)) byWord.set(ref, []);
      if (group != null && !Number.isNaN(group)) byWord.get(ref).push({ speaker: sp, group });
    });
  });
  return byWord;
}

function getConsensusOrMajorityGroup(ref, speakerGroups) {
  if (consensusAssignments[ref] != null) return consensusAssignments[ref];
  const counts = new Map();
  for (const sg of speakerGroups) {
    counts.set(sg.group, (counts.get(sg.group) || 0) + 1);
  }
  let best = null; let bestCount = -1;
  counts.forEach((cnt, g) => {
    if (cnt > bestCount || (cnt === bestCount && g < best)) { best = g; bestCount = cnt; }
  });
  return best;
}

function renderGroupReview() {
  const container = document.getElementById('groupReviewSection');
  if (!container) return;
  const groupNumbers = getAllGroupNumbers();
  const imageMap = getGroupImageDataMap();
  const byWord = getSpeakerAssignmentsByWord();
  const words = Array.from(byWord.keys()).sort((a,b) => toNumericRef(a) - toNumericRef(b));

  // Build mapping: group -> words
  const groups = new Map(groupNumbers.map(g => [g, []]));
  words.forEach(ref => {
    const sgs = byWord.get(ref);
    if (!sgs || sgs.length === 0) return;
    const targetGroup = getConsensusOrMajorityGroup(ref, sgs);
    if (targetGroup == null || Number.isNaN(targetGroup)) return;
    if (!groups.has(targetGroup)) groups.set(targetGroup, []);
    const disagree = sgs.some(x => x.group !== sgs[0].group);
    groups.get(targetGroup).push({ ref, speakerGroups: sgs, disagree });
  });

  // Render
  container.innerHTML = groupNumbers.map(g => {
    const img = imageMap.get(g);
    const list = groups.get(g) || [];
    const itemsHtml = list.map(item => {
      const sgText = item.speakerGroups.map(x => `${x.speaker}:${x.group}`).join(' ');
      const rowCls = item.disagree ? 'disagreement' : '';
      // Build target options
      const opts = groupNumbers.map(n => `<option value="${n}" ${n===g ? 'selected' : ''}>Group ${n}</option>`).join('');
      return `
        <div class="${rowCls}" style="display:flex; align-items:center; gap:10px; padding:6px 4px; border-bottom:1px solid #eee;">
          <button onclick="playWord('${item.ref}')" title="Play" style="padding:4px 8px; background:#6c757d;">▶</button>
          <button onclick="openReview('${item.ref}')" title="Open review" style="padding:4px 8px; background:#007bff;">Review</button>
          <div style="flex:1;">
            <strong>${item.ref}</strong>
            <span style="color:#777; font-size:12px; margin-left:8px;">${sgText}</span>
          </div>
          <label style="font-size:12px; color:#555; margin-right:4px;">Move to:</label>
          <select onchange="moveWordToGroup('${item.ref}', this.value)">${opts}</select>
        </div>`;
    }).join('');

    return `
      <div class="group-card" style="margin-bottom:20px; border:1px solid #ddd; border-radius:8px; overflow:hidden; background:#fff;">
        <div style="display:flex; gap:16px; padding:12px; align-items:center; background:#f8f9fa;">
          <div style="width:140px; height:100px; background:#f2f2f2; display:flex; align-items:center; justify-content:center;">
            ${img ? `<img src="${img}" alt="Group ${g}" style="max-height:100%; max-width:100%;">` : `<span style='color:#aaa;'>No Image</span>`}
          </div>
          <div>
            <div style="font-weight:700; font-size:18px;">Group ${g}</div>
            <div style="color:#666;">${list.length} word(s)</div>
          </div>
        </div>
        <div style="padding: 0 12px 8px;">
          ${itemsHtml || `<div style='color:#999; padding:8px 0;'>No words assigned.</div>`}
        </div>
      </div>`;
  }).join('');
}

function playWord(wordRef) {
  try {
    const rec = findRecordForWord(wordRef);
    const labelEl = document.getElementById('globalAudioLabel');
    const audioEl = document.getElementById('globalAudioPlayer');
    if (!labelEl || !audioEl) return;
    if (rec && rec.SoundFile) {
      const filePath = buildAudioPathForSoundFile(rec.SoundFile);
      if (filePath) {
        audioEl.src = encodeURI(`file://${filePath}`);
        labelEl.textContent = `Now Playing: ${wordRef} (${path.basename(filePath)})`;
        audioEl.play().catch(() => {});
      } else {
        labelEl.textContent = 'Set Audio Settings to enable playback.';
        audioEl.removeAttribute('src');
      }
    } else {
      labelEl.textContent = 'No SoundFile found for this word.';
      audioEl.removeAttribute('src');
    }
  } catch (e) {
    console.warn('Failed to play word', wordRef, e);
  }
}

function moveWordToGroup(ref, groupValue) {
  const g = parseInt(groupValue);
  if (!Number.isFinite(g)) return;
  consensusAssignments[ref] = g;
  // Rerender group review and tables
  renderGroupReview();
  displayResults();
}

// Initialize settings on load
initSettings();

// Expose functions to window for inline onclick handlers
window.loadResults = loadResults;
window.openAudioSettings = openAudioSettings;
window.openReview = openReview;
window.setReviewView = setReviewView;
window.moveWordToGroup = moveWordToGroup;
window.playWord = playWord;
