const { ipcRenderer } = require('electron');

let currentResults = null;
let currentAnalysis = null;

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
          </tr>
        </thead>
        <tbody>
          ${wordAnalysis.map(w => `
            <tr class="disagreement">
              <td><strong>${w.word}</strong></td>
              ${speakers.map(s => {
                const sg = w.speakerGroups.find(sg => sg.speaker === s.speaker);
                return `<td>${sg ? `Group ${sg.group}` : '-'}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="margin-top: 10px; color: #666; font-style: italic;">
        These words were grouped differently by the speakers and may need further review.
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
