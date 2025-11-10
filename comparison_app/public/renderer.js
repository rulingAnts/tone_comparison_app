const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

let currentResults = null;
let currentAnalysis = null;
let appSettings = { audioFolder: null, audioSuffix: '' };
let consensusAssignments = {}; // { [wordRef]: number | 'custom:<id>' }
let selectedWord = null;
let currentReviewView = 'disagreements'; // 'disagreements' | 'all' | 'groups'
const expandedWords = new Set();
let customGroups = []; // [{ id, label, imagePath?, imageData? }]

// --- Session persistence (custom groups + consensus) ---
async function loadSession() {
  try {
    const session = await ipcRenderer.invoke('get-session');
    if (session && typeof session === 'object') {
      if (Array.isArray(session.customGroups)) customGroups = session.customGroups;
      if (session.consensusAssignments && typeof session.consensusAssignments === 'object') {
        consensusAssignments = { ...consensusAssignments, ...session.consensusAssignments };
      }
      // Re-render if we already have results
      if (currentResults && currentAnalysis) {
        displayResults();
      }
    }
  } catch (e) {
    console.warn('[comparison] Failed to load session:', e);
  }
}

async function saveSession() {
  try {
    await ipcRenderer.invoke('set-session', { customGroups, consensusAssignments });
  } catch (e) {
    console.warn('[comparison] Failed to save session:', e);
  }
}

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
  // Load session (custom groups + consensus)
  await loadSession();
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
  // Switch to Group Review and expand this word's chooser inline
  selectedWord = wordRef;
  currentReviewView = 'groups';
  setViewVisibility();
  expandWord(wordRef, { scroll: true });
}

function toggleExpand(wordRef) {
  if (expandedWords.has(wordRef)) {
    expandedWords.delete(wordRef);
  } else {
    expandedWords.add(wordRef);
  }
  renderGroupReview();
}

function expandWord(wordRef, { scroll } = { scroll: false }) {
  expandedWords.add(wordRef);
  renderGroupReview();
  if (scroll) {
    const rowEl = document.getElementById(`word-row-${CSS.escape(wordRef)}`);
    if (rowEl && rowEl.scrollIntoView) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
function displayResults() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('results').style.display = 'block';

  const { 
    totalWords, 
    agreedWords, 
    disagreedWords, 
    agreementPercentage,
    unassignedBySpeaker,
    totalUnassigned,
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
          <th>Unassigned</th>
        </tr>
      </thead>
      <tbody>
        ${speakers.map(s => `
          <tr>
            <td><strong>${s.speaker}</strong></td>
            <td>${s.groupCount}</td>
            <td>${s.wordCount}</td>
            <td>${s.unassignedCount > 0 ? `<span style="color:#dc3545;font-weight:bold;">${s.unassignedCount}</span>` : '0'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  // Display unassigned words
  if (totalUnassigned > 0) {
    const unassignedEl = document.getElementById('unassignedSection');
    unassignedEl.innerHTML = `
      <h2 style="color:#dc3545;">Unassigned Words</h2>
      <p style="color:#666; margin-bottom:15px;">
        The following words were not assigned to any tone group by at least one speaker.
      </p>
      ${unassignedBySpeaker.map(u => u.count > 0 ? `
        <div style="background:#fff3cd; padding:15px; margin-bottom:15px; border-radius:6px; border-left:4px solid #ffc107;">
          <h3 style="margin:0 0 10px 0; font-size:16px;"><strong>${u.speaker}</strong>: ${u.count} unassigned word(s)</h3>
          <div style="max-height:200px; overflow-y:auto; background:white; padding:10px; border-radius:4px;">
            ${u.unassigned.map(ref => `<div style="padding:4px 0;">${ref}</div>`).join('')}
          </div>
        </div>
      ` : '').join('')}
    `;
  } else {
    document.getElementById('unassignedSection').innerHTML = '';
  }

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
              <td>${formatConsensusDisplay(consensusAssignments[w.word])}</td>
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
              <td>${formatConsensusDisplay(consensusAssignments[w.word])}</td>
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

function formatConsensusDisplay(val) {
  if (val == null) return '<span style="color:#999">(set in review)</span>';
  if (typeof val === 'string' && val.startsWith('custom:')) {
    const id = val.slice('custom:'.length);
    const cg = (customGroups || []).find(x => x.id === id);
    if (cg) return `Custom: ${cg.label || id}`;
    return 'Custom';
  }
  return `Group ${val}`;
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
  const groupDetails = getGroupDetailsMap();
  const byWord = getSpeakerAssignmentsByWord();
  const words = Array.from(byWord.keys()).sort((a,b) => toNumericRef(a) - toNumericRef(b));

  // Build mapping: group -> words
  const groups = new Map(groupNumbers.map(g => [g, []]));
  const customGroupBuckets = new Map(); // id -> words
  words.forEach(ref => {
    const sgs = byWord.get(ref);
    if (!sgs || sgs.length === 0) return;
    const targetGroup = getConsensusOrMajorityGroup(ref, sgs);
    if (targetGroup == null) return;
    const disagree = sgs.some(x => x.group !== sgs[0].group);
    // Custom group assignment string: 'custom:<id>'
    if (typeof targetGroup === 'string' && targetGroup.startsWith('custom:')) {
      const id = targetGroup.slice('custom:'.length);
      if (!customGroupBuckets.has(id)) customGroupBuckets.set(id, []);
      customGroupBuckets.get(id).push({ ref, speakerGroups: sgs, disagree });
      return;
    }
    const gnum = parseInt(targetGroup);
    if (!Number.isFinite(gnum)) return;
    if (!groups.has(gnum)) groups.set(gnum, []);
    groups.get(gnum).push({ ref, speakerGroups: sgs, disagree });
  });

  // Render
  const numericGroupsHtml = groupNumbers.map(g => {
    const img = imageMap.get(g);
    const list = groups.get(g) || [];
    const itemsHtml = list.map(item => {
      const sgText = item.speakerGroups.map(x => `${x.speaker}:${x.group}`).join(' ');
      const rowCls = item.disagree ? 'disagreement' : '';
      const isExpanded = expandedWords.has(item.ref);
      const chooser = buildInlineGroupChooser(item.ref, groupNumbers, groupDetails);
      return `
        <div id="word-row-${item.ref}" class="${rowCls}" style="padding:6px 4px; border-bottom:1px solid #eee;">
          <div style="display:flex; align-items:center; gap:10px;">
            <button onclick="playWord('${item.ref}')" title="Play" style="padding:4px 8px; background:#6c757d;">▶</button>
            <div style="flex:1;">
              <strong>${item.ref}</strong>
              <span style="color:#777; font-size:12px; margin-left:8px;">${sgText}</span>
            </div>
            <button onclick="toggleExpand('${item.ref}')" style="padding:4px 8px;">${isExpanded ? 'Hide' : 'Change group'}</button>
          </div>
          <div style="margin-top:8px; display:${isExpanded ? 'block' : 'none'};">
            ${chooser}
          </div>
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

  // Render custom groups (if any)
  const customGroupsHtml = (customGroups || []).map(cg => {
    const list = customGroupBuckets.get(cg.id) || [];
    const itemsHtml = list.map(item => {
      const sgText = item.speakerGroups.map(x => `${x.speaker}:${x.group}`).join(' ');
      const rowCls = item.disagree ? 'disagreement' : '';
      const isExpanded = expandedWords.has(item.ref);
      const chooser = buildInlineGroupChooser(item.ref, groupNumbers, groupDetails);
      return `
        <div id="word-row-${item.ref}" class="${rowCls}" style="padding:6px 4px; border-bottom:1px solid #eee;">
          <div style="display:flex; align-items:center; gap:10px;">
            <button onclick="playWord('${item.ref}')" title="Play" style="padding:4px 8px; background:#6c757d;">▶</button>
            <div style="flex:1;">
              <strong>${item.ref}</strong>
              <span style="color:#777; font-size:12px; margin-left:8px;">${sgText}</span>
            </div>
            <button onclick="toggleExpand('${item.ref}')" style="padding:4px 8px;">${isExpanded ? 'Hide' : 'Change group'}</button>
          </div>
          <div style="margin-top:8px; display:${isExpanded ? 'block' : 'none'};">
            ${chooser}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="group-card" style="margin-bottom:20px; border:1px solid #ddd; border-radius:8px; overflow:hidden; background:#fff;">
        <div style="display:flex; gap:16px; padding:12px; align-items:center; background:#f8f9fa;">
          <div style="width:140px; height:100px; background:#f2f2f2; display:flex; align-items:center; justify-content:center;">
            ${cg.imageData ? `<img src="${cg.imageData}" alt="${cg.label || 'Custom Group'}" style="max-height:100%; max-width:100%;">` : `<span style='color:#aaa;'>No Image</span>`}
          </div>
          <div>
            <div style="font-weight:700; font-size:18px;">Custom: ${cg.label || cg.id}</div>
            <div style="color:#666;">${list.length} word(s)</div>
          </div>
        </div>
        <div style="padding: 0 12px 8px;">
          ${itemsHtml || `<div style='color:#999; padding:8px 0;'>No words assigned.</div>`}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = numericGroupsHtml + (customGroupsHtml ? `<h2 style="margin:10px 0 6px;">Custom Groups</h2>` + customGroupsHtml : '');
}

function buildInlineGroupChooser(wordRef, groupNumbers, groupDetails) {
  const chosen = consensusAssignments[wordRef];
  // Build combined list: numeric groups + custom groups (as 'custom:<id>')
  const numericCards = groupNumbers.map(g => {
    const d = groupDetails.get(g) || {};
    const isSelected = chosen === g;
    const selectedStyle = isSelected ? 'border-color:#007bff; box-shadow:0 0 0 2px rgba(0,123,255,0.2);' : '';
    const img = d.imageData ? `<img src=\"${d.imageData}\" alt=\"Group ${g}\" style=\"max-height:100%; max-width:100%;\">` : `<span style='color:#aaa;'>No Image</span>`;
    const label = d.label ? `<div style=\"color:#666; font-size:12px;\">${d.label}</div>` : '';
    return `
      <div onclick=\"moveWordToGroup('${wordRef}', ${g})\" class=\"group-card\" style=\"border:1px solid #ddd; border-radius:6px; overflow:hidden; cursor:pointer; background:#fff; ${selectedStyle}\">
        <div style=\"height:100px; background:#f2f2f2; display:flex; align-items:center; justify-content:center;\">${img}</div>
        <div style=\"padding:6px 8px;\">
          <div style=\"font-weight:600;\">Group ${g}</div>
          ${label}
        </div>
      </div>`;
  }).join('');

  const customCards = (customGroups || []).map(cg => {
    const key = `custom:${cg.id}`;
    const d = groupDetails.get(key) || { imageData: cg.imageData, label: cg.label };
    const isSelected = chosen === key;
    const selectedStyle = isSelected ? 'border-color:#28a745; box-shadow:0 0 0 2px rgba(40,167,69,0.2);' : '';
    const img = d.imageData ? `<img src=\"${d.imageData}\" alt=\"${cg.label || 'Custom'}\" style=\"max-height:100%; max-width:100%;\">` : `<span style='color:#aaa;'>No Image</span>`;
    const label = d.label ? `<div style=\"color:#666; font-size:12px;\">${d.label}</div>` : '';
    return `
      <div onclick=\"moveWordToGroup('${wordRef}', 'custom:${cg.id}')\" class=\"group-card\" style=\"border:1px solid #ddd; border-radius:6px; overflow:hidden; cursor:pointer; background:#fff; ${selectedStyle}\">
        <div style=\"height:100px; background:#f2f2f2; display:flex; align-items:center; justify-content:center;\">${img}</div>
        <div style=\"padding:6px 8px;\">
          <div style=\"font-weight:600;\">Custom</div>
          ${label}
        </div>
      </div>`;
  }).join('');

  return `<div style=\"display:grid; grid-template-columns:repeat(auto-fill, minmax(140px,1fr)); gap:10px;\">${numericCards}${customCards}</div>`;
}

function getGroupDetailsMap() {
  const map = new Map(); // key (number or 'custom:<id>') -> { imageData, label }
  (currentResults || []).forEach(r => {
    (r.toneGroups || []).forEach(row => {
      const gnum = parseInt(row['Tone Group (Num)'] || row['Tone Group'] || row['Group'] || row['group']);
      if (!Number.isFinite(gnum)) return;
      const label = row['Written Form'] || row['Reference Number'] || '';
      if (!map.has(gnum)) {
        map.set(gnum, { imageData: row.imageData || null, label });
      } else {
        const cur = map.get(gnum);
        if (!cur.imageData && row.imageData) cur.imageData = row.imageData;
        if (!cur.label && label) cur.label = label;
      }
    });
  });
  // Add custom group details
  (customGroups || []).forEach(cg => {
    const key = `custom:${cg.id}`;
    if (!map.has(key)) map.set(key, { imageData: cg.imageData || null, label: cg.label || '' });
  });
  return map;
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
  // Accept numeric or custom group key ('custom:<id>')
  if (typeof groupValue === 'string' && groupValue.startsWith('custom:')) {
    consensusAssignments[ref] = groupValue;
  } else {
    const g = parseInt(groupValue);
    if (!Number.isFinite(g)) return;
    consensusAssignments[ref] = g;
  }
  // Persist + rerender
  saveSession();
  renderGroupReview();
  displayResults();
}

// --- Add Custom Group flow ---
function showLabelModal(defaultValue = '') {
  return new Promise(resolve => {
    const modal = document.getElementById('labelModal');
    const input = document.getElementById('labelInput');
    const btnSave = document.getElementById('labelSaveBtn');
    const btnCancel = document.getElementById('labelCancelBtn');
    if (!modal || !input || !btnSave || !btnCancel) {
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

function fileToDataURL(absPath) {
  try {
    const ext = (path.extname(absPath) || '').toLowerCase().replace('.', '');
    const data = fs.readFileSync(absPath);
    const base64 = data.toString('base64');
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'png' ? 'image/png' : 'application/octet-stream');
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.warn('Failed to read image file:', absPath, e);
    return null;
  }
}

async function startAddGroup() {
  // 1) Ask for label
  const label = await showLabelModal('');
  if (label === null) return; // canceled
  // 2) Ask for image (optional)
  let imagePath = null;
  try {
    imagePath = await ipcRenderer.invoke('select-image-file');
  } catch {}
  let imageData = null;
  if (imagePath) imageData = fileToDataURL(imagePath);

  // 3) Create and persist
  const id = `cg_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
  const newGroup = { id, label: String(label || '').trim(), imagePath: imagePath || null, imageData };
  customGroups.push(newGroup);
  await saveSession();

  // 4) Rerender chooser and group review
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
window.toggleExpand = toggleExpand;
window.startAddGroup = startAddGroup;
