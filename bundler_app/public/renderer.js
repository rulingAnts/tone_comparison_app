const { ipcRenderer } = require('electron');

let availableFields = [];
let xmlFilePath = null;
let audioFolderPath = null;
let outputFilePath = null;
let persisted = null; // settings loaded from main
let audioVariants = [];
let bundleType = 'legacy'; // 'legacy' or 'hierarchical'
let hierarchyLevels = []; // Array of {field, values: {value, included, count}}
let parsedXmlData = null; // Store full parsed XML data for hierarchy analysis

window.addEventListener('DOMContentLoaded', async () => {
  await loadPersistedSettings();
  setupToneFieldToggles();
  attachChangePersistence();
});

function handleBundleTypeChange() {
  const selected = document.querySelector('input[name="bundleType"]:checked');
  if (!selected) return;
  
  bundleType = selected.value;
  
  // Update info text
  const infoDiv = document.getElementById('bundleTypeInfo');
  if (bundleType === 'legacy') {
    infoDiv.innerHTML = '<strong>Legacy mode:</strong> Creates a single bundle file with all words. Compatible with all app versions.';
  } else {
    infoDiv.innerHTML = '<strong>Hierarchical mode:</strong> Organize words into sub-bundles using XML field categories (e.g., by word class, syllable pattern). Advanced workflow for complex tone analysis.';
  }
  
  // Show/hide hierarchical-specific sections
  const hierarchicalSections = document.querySelectorAll('.hierarchical-only');
  hierarchicalSections.forEach(section => {
    if (bundleType === 'hierarchical') {
      section.classList.add('visible');
    } else {
      section.classList.remove('visible');
    }
  });
  
  // Update output file extension in the button text
  updateCreateButtonText();
  
  // Persist bundle type choice
  persistSettings();
}

async function loadPersistedSettings() {
  try {
    persisted = await ipcRenderer.invoke('get-settings');
  } catch {
    persisted = null;
  }
  if (!persisted) return;

  if (persisted.xmlPath) {
    xmlFilePath = persisted.xmlPath;
    document.getElementById('xmlPath').value = persisted.xmlPath;
    const result = await ipcRenderer.invoke('parse-xml', persisted.xmlPath);
    if (result && result.success) {
      availableFields = result.fields;
      parsedXmlData = result; // Store for hierarchy analysis
      updateWrittenFormElements(persisted.settings?.writtenFormElements || []);
      updateGlossOptions();
      updateToneFieldOptions();
      updateUserSpellingOptions();
      document.getElementById('xmlInfo').textContent = `✓ Loaded ${result.recordCount} records`;
      document.getElementById('xmlInfo').style.color = 'green';
    } else {
      document.getElementById('xmlInfo').textContent = result && result.error ? `✗ Error: ${result.error}` : '✗ Failed to parse XML';
      document.getElementById('xmlInfo').style.color = 'red';
    }
  }

  if (persisted.audioFolder) {
    audioFolderPath = persisted.audioFolder;
    document.getElementById('audioFolder').value = persisted.audioFolder;
  }
  if (persisted.outputPath) {
    outputFilePath = persisted.outputPath;
    document.getElementById('outputPath').value = persisted.outputPath;
  }

  const s = persisted.settings || {};
  
  // Restore bundle type
  if (s.bundleType) {
    bundleType = s.bundleType;
    const radioToCheck = document.querySelector(`input[name="bundleType"][value="${bundleType}"]`);
    if (radioToCheck) {
      radioToCheck.checked = true;
      handleBundleTypeChange();
    }
  }
  
  document.getElementById('showWrittenForm').checked = !!s.showWrittenForm;
  document.getElementById('showGloss').checked = !!s.showGloss;
  document.getElementById('requireUserSpelling').checked = !!s.requireUserSpelling;
  document.getElementById('showReferenceNumbers').checked = !!s.showReferenceNumbers;
  
  // Restore user spelling element
  const userSpellingSelect = document.getElementById('userSpellingElement');
  if (userSpellingSelect && s.userSpellingElement) {
    userSpellingSelect.value = s.userSpellingElement;
  }
  validateUserSpellingField();
  
  // Restore tone group element
  const toneGroupSelect = document.getElementById('toneGroupElement');
  if (toneGroupSelect && s.toneGroupElement) {
    toneGroupSelect.value = s.toneGroupElement;
  }
  
  // Restore optional tone fields
  if (s.toneGroupIdField) {
    const cb = document.getElementById('enableToneGroupId');
    const sel = document.getElementById('toneGroupIdField');
    if (cb) cb.checked = true;
    if (sel) {
      sel.disabled = false;
      sel.value = s.toneGroupIdField;
    }
  }
  if (s.pitchField) {
    const cb = document.getElementById('enablePitchField');
    const sel = document.getElementById('pitchField');
    if (cb) cb.checked = true;
    if (sel) {
      sel.disabled = false;
      sel.value = s.pitchField;
    }
  }
  if (s.abbreviationField) {
    const cb = document.getElementById('enableAbbreviationField');
    const sel = document.getElementById('abbreviationField');
    if (cb) cb.checked = true;
    if (sel) {
      sel.disabled = false;
      sel.value = s.abbreviationField;
    }
  }
  if (s.exemplarField) {
    const cb = document.getElementById('enableExemplarField');
    const sel = document.getElementById('exemplarField');
    if (cb) cb.checked = true;
    if (sel) {
      sel.disabled = false;
      sel.value = s.exemplarField;
    }
  }
  
  document.getElementById('bundleDescription').value = s.bundleDescription || '';
  // Audio processing defaults
  const ap = s.audioProcessing || {};
  const apAutoTrim = !!ap.autoTrim;
  const apAutoNorm = !!ap.autoNormalize;
  const apFlac = !!ap.convertToFlac;
  const autoTrimEl = document.getElementById('autoTrim');
  const autoNormEl = document.getElementById('autoNormalize');
  const flacEl = document.getElementById('convertToFlac');
  if (autoTrimEl) autoTrimEl.checked = apAutoTrim;
  if (autoNormEl) autoNormEl.checked = apAutoNorm;
  if (flacEl) flacEl.checked = apFlac;
  const refs = Array.isArray(s.referenceNumbers) ? s.referenceNumbers : [];
  document.getElementById('referenceNumbers').value = refs.join('\n');
  if (s.glossElement) {
    const glossSel = document.getElementById('glossElement');
    if (glossSel) glossSel.value = s.glossElement;
  }

  // Initialize audio variants UI
  audioVariants = Array.isArray(s.audioFileVariants) && s.audioFileVariants.length > 0
    ? s.audioFileVariants.map((v) => ({
        description: String(v.description || ''),
        suffix: (v.suffix == null || v.suffix === '') ? '' : String(v.suffix),
      }))
    : [{ description: 'Default', suffix: (s.audioFileSuffix || '') }];
  renderAudioVariants();
  
  // Restore hierarchy levels
  if (Array.isArray(s.hierarchyLevels) && s.hierarchyLevels.length > 0) {
    hierarchyLevels = s.hierarchyLevels.map(level => ({
      ...level,
      audioConfig: level.audioConfig || {
        includeAudio: true,
        suffix: '',
        applyTo: 'this'
      }
    }));
    renderHierarchyTree();
  }

  checkFormValid();
}

function attachChangePersistence() {
  const persist = () => persistSettings();
  const byId = (id) => document.getElementById(id);
  [
    'showWrittenForm', 'showGloss', 'requireUserSpelling', 'showReferenceNumbers',
    'userSpellingElement', 'toneGroupElement', 'referenceNumbers', 'glossElement', 'bundleDescription',
    'autoTrim', 'autoNormalize', 'convertToFlac',
    'toneGroupIdField', 'pitchField', 'abbreviationField', 'exemplarField',
  ].forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener('change', persist);
  });
  
  // Add validation listener to user spelling field
  const userSpellingEl = byId('userSpellingElement');
  if (userSpellingEl) {
    userSpellingEl.addEventListener('change', validateUserSpellingField);
  }

  const addBtn = document.getElementById('addAudioVariantBtn');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      audioVariants.push({ description: '', suffix: '' });
      renderAudioVariants();
      persistSettings();
    });
  }
}

function collectCurrentSettings() {
  const writtenFormElements = getSelectedWrittenFormElements();
  const showWrittenForm = document.getElementById('showWrittenForm').checked;
  const variants = getAudioVariantsFromDOM();
  const firstSuffix = (variants.length > 0 ? (variants[0].suffix || '') : '');
  
  // Collect optional tone fields
  const toneGroupIdField = document.getElementById('enableToneGroupId')?.checked 
    ? document.getElementById('toneGroupIdField')?.value?.trim() 
    : null;
  const pitchField = document.getElementById('enablePitchField')?.checked
    ? document.getElementById('pitchField')?.value?.trim()
    : null;
  const abbreviationField = document.getElementById('enableAbbreviationField')?.checked
    ? document.getElementById('abbreviationField')?.value?.trim()
    : null;
  const exemplarField = document.getElementById('enableExemplarField')?.checked
    ? document.getElementById('exemplarField')?.value?.trim()
    : null;
  
  return {
    xmlPath: xmlFilePath,
    audioFolder: audioFolderPath,
    outputPath: outputFilePath,
    settings: {
      bundleType: bundleType,
      writtenFormElements,
      showWrittenForm,
      audioFileSuffix: firstSuffix === '' ? null : firstSuffix,
      audioFileVariants: variants,
      referenceNumbers: parseReferenceNumbers(document.getElementById('referenceNumbers').value),
      requireUserSpelling: document.getElementById('requireUserSpelling').checked,
      showReferenceNumbers: document.getElementById('showReferenceNumbers').checked,
      userSpellingElement: document.getElementById('userSpellingElement').value.trim(),
      toneGroupElement: document.getElementById('toneGroupElement').value.trim(),
      toneGroupIdField: toneGroupIdField || undefined,
      pitchField: pitchField || undefined,
      abbreviationField: abbreviationField || undefined,
      exemplarField: exemplarField || undefined,
      showGloss: document.getElementById('showGloss').checked,
      glossElement: (document.getElementById('showGloss').checked
        ? (document.getElementById('glossElement').value || null)
        : null),
      bundleDescription: document.getElementById('bundleDescription').value.trim(),
      hierarchyLevels: hierarchyLevels, // Save hierarchy configuration
      audioProcessing: {
        autoTrim: !!document.getElementById('autoTrim')?.checked,
        autoNormalize: !!document.getElementById('autoNormalize')?.checked,
        convertToFlac: !!document.getElementById('convertToFlac')?.checked,
      },
    },
  };
}

async function persistSettings() {
  const patch = collectCurrentSettings();
  try { await ipcRenderer.invoke('set-settings', patch); } catch {}
}

async function selectXmlFile() {
  const path = await ipcRenderer.invoke('select-xml-file');
  if (path) {
    xmlFilePath = path;
    document.getElementById('xmlPath').value = path;
    
    // Parse XML to get available fields
    const result = await ipcRenderer.invoke('parse-xml', path);
    
    if (result.success) {
      availableFields = result.fields;
      parsedXmlData = result; // Store for hierarchy analysis
      const pre = persisted?.settings?.writtenFormElements || [];
      updateWrittenFormElements(pre);
      updateGlossOptions();
      updateToneFieldOptions();
      updateUserSpellingOptions();
      renderHierarchyTree();
      document.getElementById('xmlInfo').textContent = 
        `✓ Loaded ${result.recordCount} records`;
      document.getElementById('xmlInfo').style.color = 'green';
      checkFormValid();
      await persistSettings();
    } else {
      document.getElementById('xmlInfo').textContent = 
        `✗ Error: ${result.error}`;
      document.getElementById('xmlInfo').style.color = 'red';
    }
  }
}

function updateWrittenFormElements(preselected = []) {
  const container = document.getElementById('writtenFormElements');
  container.innerHTML = '';
  
  availableFields.forEach(field => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = field;
    checkbox.name = 'writtenForm';
    
    // Preselect if persisted, else default to 'Phonetic'
    if (Array.isArray(preselected) && preselected.length > 0) {
      checkbox.checked = preselected.includes(field);
    } else if (field === 'Phonetic') {
      checkbox.checked = true;
    }
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(field));
    container.appendChild(label);

    checkbox.addEventListener('change', () => {
      persistSettings();
      validateUserSpellingField();
    });
  });
}

function updateGlossOptions() {
  const select = document.getElementById('glossElement');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Select element —';
  select.appendChild(placeholder);

  availableFields.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });

  // Prefer "Gloss" if present
  if (availableFields.includes('Gloss')) {
    select.value = 'Gloss';
  } else if (availableFields.includes(current)) {
    select.value = current;
  } else {
    select.value = '';
  }
}

function updateToneFieldOptions() {
  const toneGroupSelect = document.getElementById('toneGroupElement');
  const toneGroupIdSelect = document.getElementById('toneGroupIdField');
  const pitchSelect = document.getElementById('pitchField');
  const abbreviationSelect = document.getElementById('abbreviationField');
  const exemplarSelect = document.getElementById('exemplarField');
  
  const selects = [toneGroupSelect, toneGroupIdSelect, pitchSelect, abbreviationSelect, exemplarSelect];
  const currentValues = selects.map(s => s ? s.value : '');
  
  selects.forEach((select, index) => {
    if (!select) return;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Select element —';
    select.appendChild(placeholder);
    
    availableFields.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      select.appendChild(opt);
    });
    
    // Restore previous value if still valid
    if (availableFields.includes(currentValues[index])) {
      select.value = currentValues[index];
    } else if (index === 0 && availableFields.includes('SurfaceMelodyGroup')) {
      // Default tone group to SurfaceMelodyGroup if available
      select.value = 'SurfaceMelodyGroup';
    }
  });
}

function updateUserSpellingOptions() {
  const select = document.getElementById('userSpellingElement');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Select element —';
  select.appendChild(placeholder);

  availableFields.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });

  // Prefer "Orthographic" if present
  if (availableFields.includes('Orthographic')) {
    select.value = 'Orthographic';
  } else if (availableFields.includes(current)) {
    select.value = current;
  } else {
    select.value = '';
  }
  
  validateUserSpellingField();
}

function validateUserSpellingField() {
  const userSpellingSelect = document.getElementById('userSpellingElement');
  const warningDiv = document.getElementById('userSpellingWarning');
  if (!userSpellingSelect || !warningDiv) return;
  
  const selectedSpelling = userSpellingSelect.value;
  if (!selectedSpelling) {
    warningDiv.style.display = 'none';
    return;
  }
  
  // Check if selected spelling field conflicts with written form elements
  const writtenFormElements = getSelectedWrittenFormElements();
  if (writtenFormElements.includes(selectedSpelling)) {
    warningDiv.textContent = `⚠️ Warning: "${selectedSpelling}" is also used for written form display. This field will be overwritten by user input.`;
    warningDiv.style.display = 'block';
  } else {
    warningDiv.style.display = 'none';
  }
}

function setupToneFieldToggles() {
  const toggles = [
    { checkbox: 'enableToneGroupId', select: 'toneGroupIdField' },
    { checkbox: 'enablePitchField', select: 'pitchField' },
    { checkbox: 'enableAbbreviationField', select: 'abbreviationField' },
    { checkbox: 'enableExemplarField', select: 'exemplarField' }
  ];
  
  toggles.forEach(({ checkbox, select }) => {
    const checkboxEl = document.getElementById(checkbox);
    const selectEl = document.getElementById(select);
    if (checkboxEl && selectEl) {
      checkboxEl.addEventListener('change', () => {
        selectEl.disabled = !checkboxEl.checked;
        persistSettings();
      });
    }
  });
}

// Hierarchy Tree Builder Functions
function addHierarchyLevel() {
  hierarchyLevels.push({
    field: '',
    values: [],
    audioConfig: {
      includeAudio: true, // Whether to include audio at all
      suffix: '', // Audio suffix for this level (empty = use parent/default)
      applyTo: 'this' // 'this', 'children', or 'selected'
    }
  });
  renderHierarchyTree();
  persistSettings();
}

function removeHierarchyLevel(index) {
  hierarchyLevels.splice(index, 1);
  renderHierarchyTree();
  persistSettings();
}

function updateHierarchyField(index, field) {
  hierarchyLevels[index].field = field;
  hierarchyLevels[index].values = [];
  
  // Auto-detect values and counts from XML data
  if (parsedXmlData && field) {
    const valueCounts = new Map();
    
    // Apply filters from previous levels
    const filteredRecords = getFilteredRecords(index);
    
    filteredRecords.forEach(record => {
      const value = record[field];
      if (value) {
        valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
      }
    });
    
    // Convert to array and sort by value
    hierarchyLevels[index].values = Array.from(valueCounts.entries())
      .map(([value, count]) => ({
        value,
        included: true, // Include by default
        count
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }
  
  renderHierarchyTree();
  persistSettings();
}

function getFilteredRecords(upToLevel) {
  if (!parsedXmlData || !parsedXmlData.records) return [];
  
  let filtered = parsedXmlData.records;
  
  // Apply filters from levels 0 to upToLevel-1
  for (let i = 0; i < upToLevel && i < hierarchyLevels.length; i++) {
    const level = hierarchyLevels[i];
    if (!level.field) continue;
    
    const includedValues = new Set(
      level.values.filter(v => v.included).map(v => v.value)
    );
    
    if (includedValues.size > 0) {
      filtered = filtered.filter(record => 
        includedValues.has(record[level.field])
      );
    }
  }
  
  return filtered;
}

function toggleHierarchyValue(levelIndex, valueIndex) {
  hierarchyLevels[levelIndex].values[valueIndex].included = 
    !hierarchyLevels[levelIndex].values[valueIndex].included;
  
  // Recalculate counts for subsequent levels
  for (let i = levelIndex + 1; i < hierarchyLevels.length; i++) {
    if (hierarchyLevels[i].field) {
      updateHierarchyField(i, hierarchyLevels[i].field);
    }
  }
  
  renderHierarchyTree();
  persistSettings();
}

function updateAudioConfig(levelIndex, field, value) {
  if (!hierarchyLevels[levelIndex].audioConfig) {
    hierarchyLevels[levelIndex].audioConfig = {
      includeAudio: true,
      suffix: '',
      applyTo: 'this'
    };
  }
  hierarchyLevels[levelIndex].audioConfig[field] = value;
  persistSettings();
}

function renderHierarchyTree() {
  const container = document.getElementById('hierarchyTree');
  if (!container) return;
  
  if (hierarchyLevels.length === 0) {
    container.innerHTML = '<div style="color: #999; font-style: italic; padding: 10px;">No category levels defined. Click "Add Category Level" to start.</div>';
    return;
  }
  
  container.innerHTML = '';
  
  hierarchyLevels.forEach((level, index) => {
    const levelDiv = document.createElement('div');
    levelDiv.className = 'tree-level';
    
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'tree-node';
    
    // Header with field selector and remove button
    const headerDiv = document.createElement('div');
    headerDiv.className = 'tree-node-header';
    
    const fieldLabel = document.createElement('strong');
    fieldLabel.textContent = `Level ${index + 1}:`;
    fieldLabel.style.flex = '0 0 70px';
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'tree-node-field';
    
    const fieldSelect = document.createElement('select');
    fieldSelect.innerHTML = '<option value="">— Select field —</option>';
    availableFields.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      if (f === level.field) opt.selected = true;
      fieldSelect.appendChild(opt);
    });
    fieldSelect.addEventListener('change', () => updateHierarchyField(index, fieldSelect.value));
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-tree remove';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => removeHierarchyLevel(index);
    
    fieldDiv.appendChild(fieldSelect);
    headerDiv.appendChild(fieldLabel);
    headerDiv.appendChild(fieldDiv);
    headerDiv.appendChild(removeBtn);
    
    nodeDiv.appendChild(headerDiv);
    
    // Values with checkboxes and counts
    if (level.field && level.values.length > 0) {
      const valuesDiv = document.createElement('div');
      valuesDiv.className = 'tree-node-values';
      
      level.values.forEach((valueItem, valueIndex) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'tree-value-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = valueItem.included;
        checkbox.addEventListener('change', () => toggleHierarchyValue(index, valueIndex));
        
        const label = document.createElement('span');
        label.textContent = valueItem.value;
        
        const count = document.createElement('span');
        count.className = 'tree-value-count';
        count.textContent = `(${valueItem.count})`;
        
        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(label);
        itemDiv.appendChild(count);
        valuesDiv.appendChild(itemDiv);
      });
      
      nodeDiv.appendChild(valuesDiv);
    } else if (level.field) {
      const noValues = document.createElement('div');
      noValues.style.color = '#999';
      noValues.style.fontStyle = 'italic';
      noValues.style.padding = '8px';
      noValues.textContent = 'No values found for this field';
      nodeDiv.appendChild(noValues);
    }
    
    // Audio configuration section
    if (level.field) {
      const audioConfigDiv = document.createElement('div');
      audioConfigDiv.style.marginTop = '12px';
      audioConfigDiv.style.padding = '10px';
      audioConfigDiv.style.background = '#f9f9f9';
      audioConfigDiv.style.borderRadius = '4px';
      audioConfigDiv.style.border = '1px solid #e0e0e0';
      
      const audioTitle = document.createElement('div');
      audioTitle.style.fontWeight = 'bold';
      audioTitle.style.marginBottom = '8px';
      audioTitle.style.fontSize = '13px';
      audioTitle.textContent = 'Audio Configuration';
      audioConfigDiv.appendChild(audioTitle);
      
      // Include audio checkbox
      const includeAudioDiv = document.createElement('div');
      includeAudioDiv.style.marginBottom = '8px';
      
      const includeAudioCb = document.createElement('input');
      includeAudioCb.type = 'checkbox';
      includeAudioCb.checked = level.audioConfig?.includeAudio !== false;
      includeAudioCb.style.width = 'auto';
      includeAudioCb.style.marginRight = '6px';
      includeAudioCb.addEventListener('change', () => {
        updateAudioConfig(index, 'includeAudio', includeAudioCb.checked);
        renderHierarchyTree(); // Re-render to show/hide suffix options
      });
      
      const includeAudioLabel = document.createElement('label');
      includeAudioLabel.textContent = 'Include audio in sub-bundles';
      includeAudioLabel.style.cursor = 'pointer';
      includeAudioLabel.onclick = () => includeAudioCb.click();
      
      includeAudioDiv.appendChild(includeAudioCb);
      includeAudioDiv.appendChild(includeAudioLabel);
      audioConfigDiv.appendChild(includeAudioDiv);
      
      // Audio suffix configuration (only if audio is included)
      if (level.audioConfig?.includeAudio !== false) {
        const suffixDiv = document.createElement('div');
        suffixDiv.style.display = 'flex';
        suffixDiv.style.alignItems = 'center';
        suffixDiv.style.gap = '8px';
        suffixDiv.style.marginTop = '8px';
        
        const suffixLabel = document.createElement('span');
        suffixLabel.textContent = 'Audio suffix:';
        suffixLabel.style.fontSize = '13px';
        suffixLabel.style.flex = '0 0 90px';
        
        const suffixInput = document.createElement('input');
        suffixInput.type = 'text';
        suffixInput.value = level.audioConfig?.suffix || '';
        suffixInput.placeholder = 'e.g., -slow';
        suffixInput.style.flex = '1';
        suffixInput.style.padding = '4px 8px';
        suffixInput.style.fontSize = '13px';
        suffixInput.addEventListener('change', () => {
          updateAudioConfig(index, 'suffix', suffixInput.value.trim());
        });
        
        suffixDiv.appendChild(suffixLabel);
        suffixDiv.appendChild(suffixInput);
        audioConfigDiv.appendChild(suffixDiv);
        
        const suffixInfo = document.createElement('div');
        suffixInfo.style.fontSize = '11px';
        suffixInfo.style.color = '#666';
        suffixInfo.style.marginTop = '4px';
        suffixInfo.textContent = 'Leave empty to use default audio files. Add suffix to use variant (e.g., file-slow.wav)';
        audioConfigDiv.appendChild(suffixInfo);
      } else {
        const noAudioInfo = document.createElement('div');
        noAudioInfo.style.fontSize = '12px';
        noAudioInfo.style.color = '#666';
        noAudioInfo.style.fontStyle = 'italic';
        noAudioInfo.style.marginTop = '8px';
        noAudioInfo.textContent = 'Sub-bundles will be created without audio files (text-only mode)';
        audioConfigDiv.appendChild(noAudioInfo);
      }
      
      nodeDiv.appendChild(audioConfigDiv);
    }
    
    levelDiv.appendChild(nodeDiv);
    container.appendChild(levelDiv);
  });
}

async function selectAudioFolder() {
  const path = await ipcRenderer.invoke('select-audio-folder');
  if (path) {
    audioFolderPath = path;
    document.getElementById('audioFolder').value = path;
    checkFormValid();
    await persistSettings();
  }
}

async function selectOutputFile() {
  const path = await ipcRenderer.invoke('select-output-file', bundleType);
  if (path) {
    outputFilePath = path;
    document.getElementById('outputPath').value = path;
    checkFormValid();
    await persistSettings();
  }
}

function checkFormValid() {
  const isValid = xmlFilePath && audioFolderPath && outputFilePath;
  document.getElementById('createBtn').disabled = !isValid;
}

function parseReferenceNumbers(text) {
  if (!text.trim()) return [];
  
  // Split by newlines, commas, and spaces
  return text
    .split(/[\n,\s]+/)
    .map(ref => ref.trim())
    .filter(ref => ref.length > 0);
}

function getSelectedWrittenFormElements() {
  const checkboxes = document.querySelectorAll('input[name="writtenForm"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

async function createBundle() {
  const statusEl = document.getElementById('status');
  statusEl.style.display = 'none';
  const procContainer = document.getElementById('procProgress');
  const procBar = document.getElementById('procBar');
  const procMeta = document.getElementById('procMeta');
  
  // Collect settings
  const showWrittenForm = document.getElementById('showWrittenForm').checked;
  const writtenFormElements = getSelectedWrittenFormElements();
  
  if (showWrittenForm && writtenFormElements.length === 0) {
    showStatus('error', 'Please select at least one written form element or uncheck "Show written forms"');
    return;
  }
  // Persist current state before bundling
  await persistSettings();
  
  const settings = {
    writtenFormElements,
    showWrittenForm,
    audioFileSuffix: (getAudioVariantsFromDOM()[0]?.suffix || '').trim() || null,
    audioFileVariants: getAudioVariantsFromDOM(),
    referenceNumbers: parseReferenceNumbers(document.getElementById('referenceNumbers').value),
    requireUserSpelling: document.getElementById('requireUserSpelling').checked,
    userSpellingElement: document.getElementById('userSpellingElement').value.trim(),
    toneGroupElement: document.getElementById('toneGroupElement').value.trim(),
    showGloss: document.getElementById('showGloss').checked,
    glossElement: (document.getElementById('showGloss').checked
      ? (document.getElementById('glossElement').value || null)
      : null),
    bundleDescription: document.getElementById('bundleDescription').value.trim(),
    audioProcessing: {
      autoTrim: !!document.getElementById('autoTrim')?.checked,
      autoNormalize: !!document.getElementById('autoNormalize')?.checked,
      convertToFlac: !!document.getElementById('convertToFlac')?.checked,
    },
  };

  if (settings.showGloss && !settings.glossElement) {
    showStatus('error', 'Please select a gloss element, or uncheck "Include gloss".');
    return;
  }
  
  const config = {
    xmlPath: xmlFilePath,
    audioFolder: audioFolderPath,
    outputPath: outputFilePath,
    settings,
  };
  
  // Disable button during creation
  document.getElementById('createBtn').disabled = true;
  document.getElementById('createBtn').textContent = 'Creating Bundle...';

  // Listen for progress events
  ipcRenderer.removeAllListeners('audio-processing-progress');
  ipcRenderer.on('audio-processing-progress', (event, info) => {
    if (!procContainer) return;
    if (info.type === 'start') {
      procContainer.style.display = 'block';
      procBar.style.width = '0%';
      procMeta.textContent = 'Starting…';
    } else if (info.type === 'file-done' || info.type === 'file-error') {
      const pct = Math.round((info.completed / info.total) * 100);
      procBar.style.width = pct + '%';
      const elapsedMs = Date.now() - info.startTime;
      const perFile = elapsedMs / Math.max(1, info.completed);
      const remainingMs = (info.total - info.completed) * perFile;
      procMeta.textContent = `${pct}% — ${info.completed}/${info.total} — elapsed ${formatDuration(elapsedMs)} — remaining ${formatDuration(remainingMs)}`;
    } else if (info.type === 'done') {
      const pct = 100;
      procBar.style.width = '100%';
      const elapsedMs = info.elapsedMs;
      procMeta.textContent = `100% — ${info.completed}/${info.total} — elapsed ${formatDuration(elapsedMs)} — remaining 0:00`;
      setTimeout(() => { procContainer.style.display = 'none'; }, 1500);
    } else if (info.type === 'skipped') {
      procContainer.style.display = 'none';
    }
  });
  
  const result = await ipcRenderer.invoke('create-bundle', config);
  
  document.getElementById('createBtn').disabled = false;
  document.getElementById('createBtn').textContent = 'Create Bundle';
  
  if (result.success) {
    let message = `Bundle created successfully!\n\n` +
                  `Records: ${result.recordCount}\n` +
                  `Audio files: ${result.audioFileCount}`;
    
    if (result.missingSoundFiles) {
      showStatus('warning', 
        message + `\n\nWarning: ${result.missingSoundFiles.length} audio files not found:\n` +
        result.missingSoundFiles.slice(0, 10).join('\n') +
        (result.missingSoundFiles.length > 10 ? `\n...and ${result.missingSoundFiles.length - 10} more` : '')
      );
    } else {
      showStatus('success', message);
    }
  } else {
    showStatus('error', `Failed to create bundle: ${result.error}`);
  }
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderAudioVariants() {
  const container = document.getElementById('audioVariants');
  if (!container) return;
  container.innerHTML = '';

  const table = document.createElement('div');
  table.style.display = 'grid';
  table.style.gridTemplateColumns = '1fr 220px 40px';
  table.style.gap = '8px';

  // Header
  const hDesc = document.createElement('div'); hDesc.textContent = 'Description'; hDesc.style.color = '#666'; hDesc.style.fontWeight = '600';
  const hSuf = document.createElement('div'); hSuf.textContent = 'Suffix'; hSuf.style.color = '#666'; hSuf.style.fontWeight = '600';
  const hAct = document.createElement('div'); hAct.textContent = '';
  table.appendChild(hDesc); table.appendChild(hSuf); table.appendChild(hAct);

  if (audioVariants.length === 0) {
    audioVariants = [{ description: 'Default', suffix: '' }];
  }

  audioVariants.forEach((v, idx) => {
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.placeholder = 'e.g., Yohanis';
    descInput.value = v.description || '';
    descInput.addEventListener('change', () => {
      audioVariants[idx].description = descInput.value.trim();
      persistSettings();
    });

    const sufInput = document.createElement('input');
    sufInput.type = 'text';
    sufInput.placeholder = 'e.g., -phon';
    sufInput.value = v.suffix || '';
    sufInput.addEventListener('change', () => {
      audioVariants[idx].suffix = sufInput.value.trim();
      persistSettings();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-secondary';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove';
    delBtn.disabled = (idx === 0 && audioVariants.length === 1); // keep at least one
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (audioVariants.length <= 1) return;
      audioVariants.splice(idx, 1);
      renderAudioVariants();
      persistSettings();
    });

    table.appendChild(descInput);
    table.appendChild(sufInput);
    table.appendChild(delBtn);
  });

  container.appendChild(table);
}

function getAudioVariantsFromDOM() {
  // Use current audioVariants array (kept in sync on change)
  // Normalize: ensure strings and strip empties to ''
  return audioVariants.map((v) => ({
    description: String(v.description || ''),
    suffix: (v.suffix == null ? '' : String(v.suffix)),
  }));
}

function showStatus(type, message) {
  const statusEl = document.getElementById('status');
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.style.display = 'block';
}

// Save Profile flow using an in-app modal instead of prompt
let lastFocusedBeforeModal = null;

function saveProfile() {
  // Open modal
  lastFocusedBeforeModal = document.activeElement;
  const overlay = document.getElementById('saveProfileOverlay');
  const input = document.getElementById('profileNameInput');
  if (!overlay || !input) return;
  overlay.style.display = 'flex';
  // Pre-fill with a lightweight suggestion based on description or date
  const desc = (document.getElementById('bundleDescription')?.value || '').trim();
  if (desc) {
    input.value = desc.replace(/[^a-z0-9-_\. ]/gi, '_');
  } else {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    input.value = `profile_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  setTimeout(() => input.focus(), 0);
}

function closeSaveProfileModal() {
  const overlay = document.getElementById('saveProfileOverlay');
  if (overlay) overlay.style.display = 'none';
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
    lastFocusedBeforeModal.focus();
  }
}

async function confirmSaveProfile(name) {
  const clean = String(name || '').trim();
  if (!clean) return;
  const data = collectCurrentSettings();
  const result = await ipcRenderer.invoke('save-profile', { name: clean, data });
  if (result && result.success) {
    showStatus('success', `Saved profile: ${result.filePath}`);
  } else {
    showStatus('error', `Failed to save profile: ${result?.error || 'Unknown error'}`);
  }
  closeSaveProfileModal();
}

// Modal wiring
window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('saveProfileForm');
  const cancelBtn = document.getElementById('cancelSaveProfileBtn');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('profileNameInput');
      confirmSaveProfile(input ? input.value : '');
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeSaveProfileModal());
  }
  const overlay = document.getElementById('saveProfileOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSaveProfileModal();
    });
  }
});

async function loadProfile() {
  const result = await ipcRenderer.invoke('open-profile');
  if (!result || !result.success) {
    if (result && result.error) showStatus('error', `Failed to load profile: ${result.error}`);
    return;
  }
  const profile = result.data;
  if (profile.xmlPath) {
    xmlFilePath = profile.xmlPath;
    document.getElementById('xmlPath').value = profile.xmlPath;
    const parsed = await ipcRenderer.invoke('parse-xml', profile.xmlPath);
    if (parsed && parsed.success) {
      availableFields = parsed.fields;
      parsedXmlData = parsed; // Store for hierarchy analysis
      updateWrittenFormElements(profile.settings?.writtenFormElements || []);
      updateGlossOptions();
      updateToneFieldOptions();
      updateUserSpellingOptions();
      document.getElementById('xmlInfo').textContent = `✓ Loaded ${parsed.recordCount} records`;
      document.getElementById('xmlInfo').style.color = 'green';
    } else {
      document.getElementById('xmlInfo').textContent = parsed && parsed.error ? `✗ Error: ${parsed.error}` : '✗ Failed to parse XML';
      document.getElementById('xmlInfo').style.color = 'red';
    }
  }
  audioFolderPath = profile.audioFolder || null;
  document.getElementById('audioFolder').value = profile.audioFolder || '';
  outputFilePath = profile.outputPath || null;
  document.getElementById('outputPath').value = profile.outputPath || '';

  const s = profile.settings || {};
  document.getElementById('showWrittenForm').checked = !!s.showWrittenForm;
  document.getElementById('showGloss').checked = !!s.showGloss;
  document.getElementById('audioSuffix').value = s.audioFileSuffix || '';
  document.getElementById('requireUserSpelling').checked = !!s.requireUserSpelling;
  document.getElementById('userSpellingElement').value = s.userSpellingElement || 'Orthographic';
  document.getElementById('toneGroupElement').value = s.toneGroupElement || 'SurfaceMelodyGroup';
  document.getElementById('bundleDescription').value = s.bundleDescription || '';
  const refs = Array.isArray(s.referenceNumbers) ? s.referenceNumbers : [];
  document.getElementById('referenceNumbers').value = refs.join('\n');
  if (s.glossElement) {
    const glossSel = document.getElementById('glossElement');
    if (glossSel) glossSel.value = s.glossElement;
  }

  await persistSettings();
  checkFormValid();
}

function updateCreateButtonText() {
  const btn = document.getElementById('createBtn');
  if (!btn) return;
  
  if (bundleType === 'hierarchical') {
    btn.textContent = 'Create Macro-Bundle (.tnset)';
  } else {
    btn.textContent = 'Create Bundle (.tncmp)';
  }
}
