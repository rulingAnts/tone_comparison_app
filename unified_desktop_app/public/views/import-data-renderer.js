// Use the exposed electronAPI from preload
if (!window.electronAPI) {
  console.error('[import-data] window.electronAPI is not defined! Preload script may not have loaded correctly.');
  console.error('[import-data] window object keys:', Object.keys(window));
}
const ipcRenderer = window.electronAPI;

// Constant for representing blank/empty/null values
const BLANK_VALUE = '(blank)';

// Normalize blank values: null, undefined, empty string, whitespace-only -> BLANK_VALUE
function normalizeBlankValue(value) {
  if (value === null || value === undefined || value === '') {
    return BLANK_VALUE;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return BLANK_VALUE;
  }
  return value;
}

// Check if a value is blank (for comparison)
function isBlankValue(value) {
  return value === null || value === undefined || value === '' || 
         (typeof value === 'string' && value.trim() === '') ||
         value === BLANK_VALUE;
}

let availableFields = [];
let xmlFilePath = null;
let audioFolderPath = null;
let outputFilePath = null;
let persisted = null; // settings loaded from main
let audioVariants = [];
let bundleType = 'hierarchical'; // Always hierarchical for new workflow
let hierarchyTree = null; // Root node: {field, values: [{value, label, count, included, audioVariants, children: [nodes], isOrganizational: bool}]}
// isOrganizational: true means this is a virtual grouping node (not tied to XML field)
let parsedXmlData = null; // Store full parsed XML data for hierarchy analysis
let filterGroups = []; // Array of filter groups: [{logic: 'AND'|'OR', conditions: [{field, operator, value, not, valueType}]}]
let nextFilterGroupId = 1;
let nextFilterConditionId = 1;
let isLinkedBundle = true; // Always create linked bundles in new workflow

// Drag and drop state for reordering values
let draggedValueContainer = null;
let draggedValuePath = null;

// Initialize after a short delay to ensure DOM and electronAPI are ready
console.log('[import-data] Scheduling initialization...');
setTimeout(async () => {
  console.log('[import-data] Initializing import-data-renderer...');
  try {
    await loadPersistedSettings();
    setupToneFieldToggles();
    attachChangePersistence();
    setupModalHandlers();
    console.log('[import-data] Initialization complete');
  } catch (error) {
    console.error('[import-data] Initialization error:', error);
  }
}, 100);

function setupModalHandlers() {
  console.log('[import-data] Setting up modal handlers...');
  
  // Add grouping value modal
  const addGroupingForm = document.getElementById('addGroupingValueForm');
  const cancelAddGroupingBtn = document.getElementById('cancelAddGroupingValueBtn');
  
  if (addGroupingForm) {
    console.log('[import-data] Attaching submit handler to addGroupingValueForm');
    addGroupingForm.addEventListener('submit', handleAddGroupingValueSubmit);
  } else {
    console.warn('[import-data] addGroupingValueForm not found!');
  }
  
  if (cancelAddGroupingBtn) {
    cancelAddGroupingBtn.addEventListener('click', closeAddGroupingValueModal);
  }
  
  // Close on overlay click
  const addGroupingOverlay = document.getElementById('addGroupingValueOverlay');
  if (addGroupingOverlay) {
    addGroupingOverlay.addEventListener('click', (e) => {
      if (e.target === addGroupingOverlay) {
        closeAddGroupingValueModal();
      }
    });
  }
  
  // Add child level modal
  const confirmAddChildLevelBtn = document.getElementById('confirmAddChildLevelBtn');
  const cancelAddChildLevelBtn = document.getElementById('cancelAddChildLevelBtn');
  
  if (confirmAddChildLevelBtn) {
    confirmAddChildLevelBtn.addEventListener('click', handleAddChildLevelSubmit);
  }
  
  if (cancelAddChildLevelBtn) {
    cancelAddChildLevelBtn.addEventListener('click', closeAddChildLevelModal);
  }
  
  // Close child level modal on overlay click
  const addChildLevelOverlay = document.getElementById('addChildLevelOverlay');
  if (addChildLevelOverlay) {
    addChildLevelOverlay.addEventListener('click', (e) => {
      if (e.target === addChildLevelOverlay) {
        closeAddChildLevelModal();
      }
    });
  }
  
  // Save profile modal
  const saveProfileForm = document.getElementById('saveProfileForm');
  const cancelSaveProfileBtn = document.getElementById('cancelSaveProfileBtn');
  
  if (saveProfileForm) {
    console.log('[import-data] Attaching submit handler to saveProfileForm');
    saveProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('profileNameInput');
      confirmSaveProfile(input ? input.value : '');
    });
  } else {
    console.warn('[import-data] saveProfileForm not found!');
  }
  
  if (cancelSaveProfileBtn) {
    cancelSaveProfileBtn.addEventListener('click', () => closeSaveProfileModal());
  }
  
  const saveProfileOverlay = document.getElementById('saveProfileOverlay');
  if (saveProfileOverlay) {
    saveProfileOverlay.addEventListener('click', (e) => {
      if (e.target === saveProfileOverlay) closeSaveProfileModal();
    });
  }
  
  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (addGroupingOverlay && addGroupingOverlay.style.display === 'flex') {
        closeAddGroupingValueModal();
      }
      if (addChildLevelOverlay && addChildLevelOverlay.style.display === 'flex') {
        closeAddChildLevelModal();
      }
      if (saveProfileOverlay && saveProfileOverlay.style.display !== 'none') {
        closeSaveProfileModal();
      }
    }
  });
  
  console.log('[import-data] Modal handlers setup complete');
}


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
  
  // Show/hide reference numbers section (only for legacy bundles)
  const refNumbersSection = document.getElementById('referenceNumbersSection');
  if (refNumbersSection) {
    refNumbersSection.style.display = (bundleType === 'legacy') ? 'block' : 'none';
  }
  
  // Reset linked bundle checkbox when switching to legacy
  if (bundleType === 'legacy') {
    const linkedCheckbox = document.getElementById('createLinkedBundle');
    if (linkedCheckbox) {
      linkedCheckbox.checked = false;
    }
  }
  
  // Update output file extension in the button text
  updateCreateButtonText();
  
  // Persist bundle type choice
  persistSettings();
}

function handleLinkedBundleChange() {
  const linkedCheckbox = document.getElementById('createLinkedBundle');
  const linkedInfo = document.getElementById('linkedBundleInfo');
  
  if (linkedCheckbox && linkedCheckbox.checked) {
    if (linkedInfo) linkedInfo.style.display = 'block';
  } else {
    if (linkedInfo) linkedInfo.style.display = 'none';
  }
  
  persistSettings();
}

async function loadPersistedSettings() {
  try {
    console.log('[import-data] Loading persisted settings...');
    persisted = await ipcRenderer.invoke('bundler:get-settings');
    console.log('[import-data] Got persisted settings:', persisted);
  } catch (error) {
    console.error('[import-data] Error loading settings:', error);
    persisted = null;
  }
  if (!persisted) {
    console.log('[import-data] No persisted settings found');
    return;
  }

  if (persisted.xmlPath) {
    console.log('[import-data] Restoring XML path:', persisted.xmlPath);
    xmlFilePath = persisted.xmlPath;
    document.getElementById('xmlPath').value = persisted.xmlPath;
    const result = await ipcRenderer.invoke('bundler:parse-xml', persisted.xmlPath);
    if (result && result.success) {
      console.log('[import-data] XML parsed successfully, records:', result.recordCount);
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
    const audioFolderEl = document.getElementById('audioFolder');
    if (audioFolderEl) audioFolderEl.value = persisted.audioFolder;
  }
  // outputPath element removed from UI - not needed for linked bundles
  if (persisted.outputPath) {
    outputFilePath = persisted.outputPath;
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
  
  // Restore linked bundle option
  if (s.createLinkedBundle) {
    const linkedCheckbox = document.getElementById('createLinkedBundle');
    if (linkedCheckbox) {
      linkedCheckbox.checked = true;
      handleLinkedBundleChange();
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
  
  // Restore group pre-population setting
  if (s.groupingField) {
    const radio = document.querySelector(`input[name="groupingField"][value="${s.groupingField}"]`);
    if (radio) radio.checked = true;
  }
  
  // Update group loading radio button states based on field availability
  updateGroupLoadingRadioButtons();
  
  document.getElementById('bundleDescription').value = s.bundleDescription || '';
  
  // compressionLevel element removed from UI - value stored but not displayed
  const compressionLevel = s.compressionLevel !== undefined ? s.compressionLevel : 6;
  
  // Audio processing elements removed from UI
  // referenceNumbers element removed from UI
  
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
  // Restore hierarchy tree (supports both old hierarchyLevels format and new hierarchyTree format)
  if (s.hierarchyTree) {
    console.log('[import-data] Restoring hierarchy tree:', s.hierarchyTree);
    hierarchyTree = restoreTreeNode(s.hierarchyTree);
    renderHierarchyTree();
    console.log('[import-data] Hierarchy tree rendered');
  } else if (Array.isArray(s.hierarchyLevels) && s.hierarchyLevels.length > 0) {
    // Migrate old format to new tree format (best effort - first level only)
    const firstLevel = s.hierarchyLevels[0];
    hierarchyTree = {
      field: firstLevel.field,
      values: (firstLevel.values || []).map(value => ({
        value: value.value,
        count: value.count || 0,
        included: value.included !== false,
        label: value.label || value.value,
        audioVariants: Array.isArray(value.audioVariants) ? value.audioVariants : audioVariants.map((_, i) => i),
        parentAudioVariants: null,
        children: null // Can't migrate complex hierarchies automatically
      }))
    };
    renderHierarchyTree();
  }
  
  // Restore filter groups
  if (Array.isArray(s.filterGroups) && s.filterGroups.length > 0) {
    console.log('[import-data] Restoring filter groups:', s.filterGroups.length, 'groups');
    filterGroups = s.filterGroups;
    
    // Migrate old format to new format if needed (conditions -> items)
    filterGroups = filterGroups.map(group => migrateFilterGroup(group));
    
    // Ensure IDs are sequential
    const allIds = collectAllFilterIds(filterGroups);
    const maxGroupId = Math.max(...allIds.groupIds, 0);
    const maxConditionId = Math.max(...allIds.conditionIds, 0);
    nextFilterGroupId = maxGroupId + 1;
    nextFilterConditionId = maxConditionId + 1;
    renderFilterGroups();
    console.log('[import-data] Filter groups rendered');
  } else {
    console.log('[import-data] No filter groups to restore');
  }

  console.log('[import-data] Settings restoration complete');
  checkFormValid();
}

// Helper to migrate old filter group format to new nested format
function migrateFilterGroup(group) {
  if (group.items) {
    // Already new format - recursively migrate nested groups
    return {
      ...group,
      items: group.items.map(item => {
        if (item.type === 'group') {
          return migrateFilterGroup(item);
        }
        return item;
      })
    };
  }
  
  // Old format with conditions array - convert to items
  return {
    id: group.id,
    type: 'group',
    logic: group.logic || 'AND',
    items: (group.conditions || []).map(cond => ({
      ...cond,
      type: 'condition'
    }))
  };
}

// Helper to collect all IDs recursively
function collectAllFilterIds(groups) {
  const groupIds = [];
  const conditionIds = [];
  
  function collectFromItems(items) {
    for (const item of items) {
      if (item.type === 'group') {
        groupIds.push(item.id);
        collectFromItems(item.items || []);
      } else if (item.type === 'condition') {
        conditionIds.push(item.id);
      }
    }
  }
  
  for (const group of groups) {
    groupIds.push(group.id);
    collectFromItems(group.items || []);
  }
  
  return { groupIds, conditionIds };
}

// Recursively restore tree node structure
function restoreTreeNode(node) {
  if (!node) return null;
  
  const restored = {
    field: node.field || '',
    isOrganizational: node.isOrganizational || false, // Preserve organizational flag
    values: (node.values || []).map(value => ({
      value: value.value,
      count: value.count || 0,
      included: value.included !== false,
      label: value.label || value.value,
      audioVariants: Array.isArray(value.audioVariants) ? value.audioVariants : audioVariants.map((_, i) => i),
      parentAudioVariants: Array.isArray(value.parentAudioVariants) ? value.parentAudioVariants : null,
      children: value.children ? restoreTreeNode(value.children) : null
    }))
  };
  
  // Preserve organizational group data
  if (node.organizationalBaseField) {
    restored.organizationalBaseField = node.organizationalBaseField;
  }
  
  if (node.organizationalGroups && Array.isArray(node.organizationalGroups)) {
    restored.organizationalGroups = node.organizationalGroups.map(group => ({
      name: group.name,
      included: group.included !== false,
      children: group.children ? {
        field: group.children.field || '',
        values: (group.children.values || []).map(value => ({
          value: value.value,
          count: value.count || 0,
          included: value.included !== false,
          label: value.label || value.value,
          audioVariants: Array.isArray(value.audioVariants) ? value.audioVariants : audioVariants.map((_, i) => i),
          parentAudioVariants: Array.isArray(value.parentAudioVariants) ? value.parentAudioVariants : null,
          children: value.children ? restoreTreeNode(value.children) : null
        }))
      } : null
    }));
  }
  
  if (node.unassignedValues && Array.isArray(node.unassignedValues)) {
    restored.unassignedValues = node.unassignedValues.map(value => ({
      value: value.value,
      count: value.count || 0,
      included: value.included !== false,
      label: value.label || value.value,
      audioVariants: Array.isArray(value.audioVariants) ? value.audioVariants : audioVariants.map((_, i) => i),
      parentAudioVariants: Array.isArray(value.parentAudioVariants) ? value.parentAudioVariants : null,
      children: value.children ? restoreTreeNode(value.children) : null
    }));
  }
  
  return restored;
}

function attachChangePersistence() {
  const persist = () => persistSettings();
  const byId = (id) => document.getElementById(id);
  [
    'showWrittenForm', 'showGloss', 'requireUserSpelling', 'showReferenceNumbers',
    'userSpellingElement', 'toneGroupElement', 'referenceNumbers', 'glossElement', 'bundleDescription',
    'convertToFlac', 'compressionLevel',
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
    userSpellingEl.addEventListener('change', handleCustomFieldSelection);
  }
  
  // Add custom field listeners to tone field selects
  ['toneGroupElement', 'toneGroupIdField', 'pitchField', 'abbreviationField', 'exemplarField'].forEach(id => {
    const select = byId(id);
    if (select) {
      select.addEventListener('change', handleCustomFieldSelection);
    }
  });

  const addBtn = document.getElementById('addAudioVariantBtn');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      audioVariants.push({ description: '', suffix: '' });
      renderAudioVariants();
      persistSettings();
    });
  }
  
  const importBtn = document.getElementById('importAudioVariantsBtn');
  if (importBtn) {
    importBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleImportAudioVariantsMenu();
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
  
  // Collect group pre-population setting (single field selection)
  const groupingFieldRadio = document.querySelector('input[name="groupingField"]:checked');
  const groupingField = groupingFieldRadio ? groupingFieldRadio.value : 'none';
  
  return {
    xmlPath: xmlFilePath,
    audioFolder: audioFolderPath,
    outputPath: outputFilePath,
    settings: {
      bundleType: bundleType,
      createLinkedBundle: document.getElementById('createLinkedBundle')?.checked || false,
      writtenFormElements,
      showWrittenForm,
      audioFileSuffix: firstSuffix === '' ? null : firstSuffix,
      audioFileVariants: variants,
      referenceNumbers: [], // Removed from UI - always empty
      requireUserSpelling: document.getElementById('requireUserSpelling').checked,
      showReferenceNumbers: document.getElementById('showReferenceNumbers').checked,
      userSpellingElement: document.getElementById('userSpellingElement').value.trim(),
      toneGroupElement: document.getElementById('toneGroupElement').value.trim(),
      toneGroupIdField: toneGroupIdField || undefined,
      pitchField: pitchField || undefined,
      abbreviationField: abbreviationField || undefined,
      exemplarField: exemplarField || undefined,
      groupingField: groupingField,
      showGloss: document.getElementById('showGloss').checked,
      glossElement: (document.getElementById('showGloss').checked
        ? (document.getElementById('glossElement').value || null)
        : null),
      bundleDescription: document.getElementById('bundleDescription').value.trim(),
      hierarchyTree: hierarchyTree, // Save hierarchy tree configuration
      filterGroups: filterGroups, // Save filter configuration
      audioProcessing: {
        autoTrim: false, // Always disabled
        autoNormalize: false, // Always disabled
        convertToFlac: false, // Removed from UI - always false
      },
      compressionLevel: 6, // Removed from UI - use default value
    },
  };
}

async function persistSettings() {
  const patch = collectCurrentSettings();
  try { await ipcRenderer.invoke('bundler:set-settings', patch); } catch {}
}

async function selectXmlFile() {
  try {
    console.log('[import-data] Calling bundler:select-xml-file');
    const path = await ipcRenderer.invoke('bundler:select-xml-file');
    console.log('[import-data] Got path:', path);
    if (path) {
      xmlFilePath = path;
      document.getElementById('xmlPath').value = path;
      
      // Parse XML to get available fields
      const result = await ipcRenderer.invoke('bundler:parse-xml', path);
      
      if (result.success) {
        availableFields = result.fields;
        parsedXmlData = result; // Store for hierarchy analysis
        const pre = persisted?.settings?.writtenFormElements || [];
        updateWrittenFormElements(pre);
        updateGlossOptions();
        updateToneFieldOptions();
        updateUserSpellingOptions();
        renderFilterGroups(); // Initialize filter UI with available fields
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
  } catch (error) {
    console.error('[import-data] Error in selectXmlFile:', error);
    document.getElementById('xmlInfo').textContent = `✗ Error: ${error.message}`;
    document.getElementById('xmlInfo').style.color = 'red';
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
    
    // Add custom option
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '+ Add custom field name...';
    customOpt.style.fontWeight = 'bold';
    customOpt.style.color = '#007bff';
    select.appendChild(customOpt);
    
    // Restore previous value if still valid
    if (availableFields.includes(currentValues[index])) {
      select.value = currentValues[index];
    } else if (currentValues[index] && currentValues[index] !== '__custom__') {
      // Custom field name entered previously - add it to the list
      const customOpt = document.createElement('option');
      customOpt.value = currentValues[index];
      customOpt.textContent = currentValues[index] + ' (custom)';
      select.insertBefore(customOpt, select.lastChild);
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
  
  // Add custom option
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '+ Add custom field name...';
  customOpt.style.fontWeight = 'bold';
  customOpt.style.color = '#007bff';
  select.appendChild(customOpt);

  // Prefer "Orthographic" if present
  if (availableFields.includes('Orthographic')) {
    select.value = 'Orthographic';
  } else if (availableFields.includes(current)) {
    select.value = current;
  } else if (current && current !== '__custom__') {
    // Custom field name entered previously - add it to the list
    const customOpt = document.createElement('option');
    customOpt.value = current;
    customOpt.textContent = current + ' (custom)';
    select.insertBefore(customOpt, select.lastChild);
    select.value = current;
  } else {
    select.value = '';
  }
  
  validateUserSpellingField();
}

function handleCustomFieldSelection(event) {
  const select = event.target;
  if (select.value === '__custom__') {
    // Store which select triggered this
    const selectId = select.id;
    
    // Show modal
    const overlay = document.getElementById('addCustomFieldOverlay');
    const input = document.getElementById('customFieldInput');
    const form = document.getElementById('addCustomFieldForm');
    
    if (!overlay || !input || !form) {
      console.error('Custom field modal elements not found');
      select.value = '';
      return;
    }
    
    // Clear previous input
    input.value = '';
    
    // Show modal
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
    
    // Handle form submission
    const handleSubmit = (e) => {
      e.preventDefault();
      const fieldName = input.value.trim();
      
      if (fieldName) {
        // Validation happens via HTML5 pattern attribute
        // Add the custom field to the dropdown
        const customOpt = document.createElement('option');
        customOpt.value = fieldName;
        customOpt.textContent = fieldName + ' (custom)';
        select.insertBefore(customOpt, select.lastChild);
        select.value = fieldName;
        
        // Close modal
        overlay.style.display = 'none';
        
        // Persist the change
        persistSettings();
      }
      
      // Clean up listeners
      form.removeEventListener('submit', handleSubmit);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    // Handle cancel
    const cancelBtn = document.getElementById('cancelAddCustomFieldBtn');
    const handleCancel = () => {
      overlay.style.display = 'none';
      select.value = '';
      form.removeEventListener('submit', handleSubmit);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    form.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Handle ESC key
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
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
        updateGroupLoadingRadioButtons();
        persistSettings();
      });
    }
  });
  
  // Add listeners to group loading radio buttons for persistence
  document.querySelectorAll('input[name="groupingField"]').forEach(radio => {
    radio.addEventListener('change', () => persistSettings());
  });
}

// Update enabled/disabled state of group loading radio buttons based on field configuration
function updateGroupLoadingRadioButtons() {
  const idEnabled = document.getElementById('enableToneGroupId')?.checked && 
                     document.getElementById('toneGroupIdField')?.value;
  const pitchEnabled = document.getElementById('enablePitchField')?.checked && 
                        document.getElementById('pitchField')?.value;
  const abbrevEnabled = document.getElementById('enableAbbreviationField')?.checked && 
                         document.getElementById('abbreviationField')?.value;
  const exemplarEnabled = document.getElementById('enableExemplarField')?.checked && 
                           document.getElementById('exemplarField')?.value;
  
  const loadIdRadio = document.getElementById('loadGroupsFromId');
  const loadPitchRadio = document.getElementById('loadGroupsFromPitch');
  const loadAbbrevRadio = document.getElementById('loadGroupsFromAbbreviation');
  const loadExemplarRadio = document.getElementById('loadGroupsFromExemplar');
  const loadNoneRadio = document.getElementById('loadGroupsFromNone');
  
  if (loadIdRadio) {
    loadIdRadio.disabled = !idEnabled;
    if (!idEnabled && loadIdRadio.checked) {
      if (loadNoneRadio) loadNoneRadio.checked = true;
    }
  }
  if (loadPitchRadio) {
    loadPitchRadio.disabled = !pitchEnabled;
    if (!pitchEnabled && loadPitchRadio.checked) {
      if (loadNoneRadio) loadNoneRadio.checked = true;
    }
  }
  if (loadAbbrevRadio) {
    loadAbbrevRadio.disabled = !abbrevEnabled;
    if (!abbrevEnabled && loadAbbrevRadio.checked) {
      if (loadNoneRadio) loadNoneRadio.checked = true;
    }
  }
  if (loadExemplarRadio) {
    loadExemplarRadio.disabled = !exemplarEnabled;
    if (!exemplarEnabled && loadExemplarRadio.checked) {
      if (loadNoneRadio) loadNoneRadio.checked = true;
    }
  }
}

// Hierarchy Tree Builder Functions
// ============================================================================
// TREE-BASED HIERARCHY FUNCTIONS
// ============================================================================

// Get node at path (array of indices or objects for organizational groups)
function getNodeAtPath(path) {
  if (!hierarchyTree || path.length === 0) return hierarchyTree;
  
  let node = hierarchyTree;
  for (let i = 0; i < path.length; i++) {
    const pathSegment = path[i];
    
    // Handle organizational group paths (objects with type: 'orgGroup')
    if (typeof pathSegment === 'object' && pathSegment.type === 'orgGroup') {
      // Navigate into organizational group's value
      if (!node.children || !node.children.isOrganizational) return null;
      const group = node.children.organizationalGroups[pathSegment.groupIndex];
      if (!group || !group.children || !group.children.values) return null;
      
      const value = group.children.values[pathSegment.valueIndex];
      if (i === path.length - 1) return value;
      node = value.children;
    } else {
      // Handle regular numeric index paths
      if (!node || !node.values || pathSegment >= node.values.length) return null;
      const value = node.values[pathSegment];
      if (i === path.length - 1) return value; // Return the value node itself
      node = value.children; // Move to next level
    }
  }
  return node;
}

// Set node at path
function setNodeAtPath(path, newNode) {
  if (path.length === 0) {
    hierarchyTree = newNode;
    return;
  }
  
  let node = hierarchyTree;
  for (let i = 0; i < path.length - 1; i++) {
    if (!node.values[path[i]].children) {
      node.values[path[i]].children = null;
    }
    node = node.values[path[i]].children;
  }
  node.values[path[path.length - 1]] = newNode;
}

// Initialize root level
// Get records with filters applied
function getFilteredRecords() {
  if (!parsedXmlData || !parsedXmlData.records) return [];
  
  // Apply filters if any exist
  if (typeof applyFilters === 'function' && filterGroups && filterGroups.length > 0) {
    return applyFilters(parsedXmlData.records);
  }
  
  // No filters - return all records
  return parsedXmlData.records;
}

function initializeRootLevel() {
  if (!hierarchyTree) {
    hierarchyTree = {
      field: '',
      values: []
    };
  }
  renderHierarchyTree();
  persistSettings();
}

// Add child level to a specific value node
function addChildLevel(path) {
  const parentValue = getNodeAtPath(path);
  if (!parentValue) return;
  
  parentValue.children = {
    field: '',
    values: []
  };
  
  renderHierarchyTree();
  persistSettings();
}

// Remove child level from a value node
function removeChildLevel(path) {
  const parentValue = getNodeAtPath(path);
  if (!parentValue) return;
  
  parentValue.children = null;
  renderHierarchyTree();
  persistSettings();
}

// Update field at a specific node
function updateNodeField(path, field) {
  const node = path.length === 0 ? hierarchyTree : getNodeAtPath(path);
  if (!node) return;
  
  // If this is a value node with children, update the children's field
  if (path.length > 0 && node.children) {
    node.children.field = field;
    node.children.values = [];
    
    // Auto-detect values from filtered records
    if (parsedXmlData && field) {
      const filteredRecords = getRecordsForPath(path);
      const valueCounts = new Map();
      
      filteredRecords.forEach(record => {
        const rawValue = record[field];
        const value = normalizeBlankValue(rawValue);
        valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
      });
      
      // Get parent's audioVariants for inheritance
      const parentAudioVariants = node.audioVariants || audioVariants.map((_, i) => i);
      
      node.children.values = Array.from(valueCounts.entries())
        .map(([value, count]) => ({
          value,
          label: value,
          included: true,
          count,
          audioVariants: [...parentAudioVariants], // Inherit from parent
          parentAudioVariants: [...parentAudioVariants],
          children: null
        }))
        .sort((a, b) => a.value.localeCompare(b.value));
    }
  } else if (path.length === 0) {
    // Updating root field
    node.field = field;
    node.values = [];
    
    if (parsedXmlData && field) {
      const valueCounts = new Map();
      const filteredRecords = getFilteredRecords();
      filteredRecords.forEach(record => {
        const rawValue = record[field];
        const value = normalizeBlankValue(rawValue);
        valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
      });
      
      node.values = Array.from(valueCounts.entries())
        .map(([value, count]) => ({
          value,
          label: value,
          included: true,
          count,
          audioVariants: audioVariants.map((_, i) => i),
          parentAudioVariants: null,
          children: null
        }))
        .sort((a, b) => a.value.localeCompare(b.value));
    }
  }
  
  renderHierarchyTree();
  persistSettings();
}

// Toggle organizational node mode
function toggleOrganizationalNode(path, isOrganizational) {
  const node = path.length === 0 ? hierarchyTree : getNodeAtPath(path);
  if (!node || !node.children) return;
  
  const childNode = node.children;
  childNode.isOrganizational = isOrganizational;
  
  if (isOrganizational) {
    // Store the original XML field for later use
    childNode.organizationalBaseField = childNode.field || '';
    childNode.field = 'Virtual Grouping';
    
    // Collect all existing values from the non-organizational version
    const existingValues = childNode.values || [];
    
    // Initialize organizational structure
    childNode.organizationalGroups = [];
    childNode.unassignedValues = existingValues.map(v => ({
      value: v.value,
      count: v.count || 0,
      included: v.included !== false
    }));
    
    // Clear the regular values array (we'll rebuild it for rendering)
    childNode.values = [];
  } else {
    // Switching back to regular XML-backed mode
    // Restore original field
    if (childNode.organizationalBaseField) {
      childNode.field = childNode.organizationalBaseField;
      delete childNode.organizationalBaseField;
    } else {
      childNode.field = '';
    }
    
    // Rebuild values from organizational groups and unassigned
    const allValues = new Set();
    if (childNode.organizationalGroups) {
      childNode.organizationalGroups.forEach(group => {
        if (group.children && group.children.values) {
          group.children.values.forEach(v => allValues.add(v.value));
        }
      });
    }
    if (childNode.unassignedValues) {
      childNode.unassignedValues.forEach(v => allValues.add(v.value));
    }
    
    // Re-detect values from XML if we have the field
    if (childNode.field && parsedXmlData) {
      const filteredRecords = getRecordsForPath(path);
      const valueCounts = new Map();
      
      filteredRecords.forEach(record => {
        const rawVal = record[childNode.field];
        const val = normalizeBlankValue(rawVal);
        valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
      });
      
      const parentValue = path.length > 0 ? getNodeAtPath(path) : null;
      const parentAudioVariants = parentValue?.audioVariants || audioVariants.map((_, i) => i);
      
      childNode.values = Array.from(valueCounts.entries())
        .map(([value, count]) => ({
          value,
          label: value,
          included: allValues.has(value), // Preserve included state
          count,
          audioVariants: [...parentAudioVariants],
          parentAudioVariants: [...parentAudioVariants],
          children: null
        }))
        .sort((a, b) => a.value.localeCompare(b.value));
    }
    
    // Clean up organizational data
    delete childNode.organizationalGroups;
    delete childNode.unassignedValues;
  }
  
  renderHierarchyTree();
  persistSettings();
}

// Add a manual value to an organizational node
function addOrganizationalValue(path) {
  const node = path.length === 0 ? hierarchyTree : getNodeAtPath(path);
  if (!node || !node.children || !node.children.isOrganizational) return;
  
  // Store path for use in the modal handler
  window.pendingOrganizationalValuePath = path;
  
  // Show modal
  const overlay = document.getElementById('addGroupingValueOverlay');
  const input = document.getElementById('groupingValueInput');
  overlay.style.display = 'flex';
  input.value = '';
  input.focus();
}

// Handle the add grouping value form submission
function handleAddGroupingValueSubmit(e) {
  console.log('[import-data] handleAddGroupingValueSubmit called');
  e.preventDefault();
  
  try {
    const path = window.pendingOrganizationalValuePath;
    if (!path) {
      console.error('[import-data] No pending path!');
      return;
    }
    
    const node = path.length === 0 ? hierarchyTree : getNodeAtPath(path);
    if (!node || !node.children || !node.children.isOrganizational) {
      console.error('[import-data] Invalid node or not organizational');
      return;
    }
    
    const groupName = document.getElementById('groupingValueInput').value.trim();
    if (!groupName) {
      console.warn('[import-data] Empty group name');
      return;
    }
    
    console.log('[import-data] Adding organizational group:', groupName);
    
    const childNode = node.children;
  
  // Initialize organizational groups array if needed
  if (!childNode.organizationalGroups) {
    childNode.organizationalGroups = [];
  }
  
  // Get parent's audio variants for inheritance
  const parentValue = path.length > 0 ? getNodeAtPath(path) : null;
  const parentAudioVariants = parentValue?.audioVariants || audioVariants.map((_, i) => i);
  
  // Create new organizational group
  const newGroup = {
    name: groupName,
    label: groupName,
    included: true,
    audioVariants: [...parentAudioVariants],
    parentAudioVariants: [...parentAudioVariants],
    // This group will contain a child node with the base field
    children: {
      field: childNode.organizationalBaseField || '',
      values: [], // Values will be moved here from unassigned
      isOrganizational: false // The children are XML-backed
    }
  };
  
  childNode.organizationalGroups.push(newGroup);
  
  console.log('[import-data] Organizational group added, rendering tree...');
  renderHierarchyTree();
  
  console.log('[import-data] Persisting settings...');
  persistSettings();
  
  // Close modal
  console.log('[import-data] Closing modal...');
  closeAddGroupingValueModal();
  console.log('[import-data] Done!');
  } catch (error) {
    console.error('[import-data] Error in handleAddGroupingValueSubmit:', error);
    alert(`Error adding organizational group: ${error.message}`);
  }
}

function closeAddGroupingValueModal() {
  const overlay = document.getElementById('addGroupingValueOverlay');
  overlay.style.display = 'none';
  window.pendingOrganizationalValuePath = null;
}

// Add a child level to an organizational group
function addChildLevelToOrgGroup(nodePath, groupIndex) {
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return;
  
  const orgNode = node.children;
  const group = orgNode.organizationalGroups[groupIndex];
  if (!group || !group.children) return;
  
  // Get available XML fields for child level
  const fields = availableFields || [];
  if (fields.length === 0) {
    alert('No XML fields available. Please load an XML file first.');
    return;
  }
  
  // Store the path and group index for the modal handler
  window.pendingChildLevelPath = nodePath;
  window.pendingChildLevelGroupIndex = groupIndex;
  
  // Populate field dropdowns
  const childFieldSelect = document.getElementById('childFieldSelect');
  const orgBaseFieldSelect = document.getElementById('orgBaseFieldSelect');
  
  if (childFieldSelect && orgBaseFieldSelect) {
    // Clear existing options
    childFieldSelect.innerHTML = '<option value="">-- Select XML field --</option>';
    orgBaseFieldSelect.innerHTML = '<option value="">-- Select XML field --</option>';
    
    // Add field options
    fields.forEach(field => {
      const option1 = document.createElement('option');
      option1.value = field;
      option1.textContent = field;
      childFieldSelect.appendChild(option1);
      
      const option2 = document.createElement('option');
      option2.value = field;
      option2.textContent = field;
      orgBaseFieldSelect.appendChild(option2);
    });
  }
  
  // Update modal title with group name
  const groupNameDiv = document.getElementById('addChildLevelGroupName');
  if (groupNameDiv) {
    groupNameDiv.textContent = `Group: "${group.name}"`;
  }
  
  // Show modal
  const overlay = document.getElementById('addChildLevelOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

function handleAddChildLevelSubmit() {
  const childLevelType = document.querySelector('input[name="childLevelType"]:checked')?.value;
  
  if (!childLevelType) return;
  
  const nodePath = window.pendingChildLevelPath;
  const groupIndex = window.pendingChildLevelGroupIndex;
  
  if (nodePath === undefined || groupIndex === undefined) return;
  
  if (childLevelType === 'xmlField') {
    const fieldName = document.getElementById('childFieldSelect')?.value;
    if (!fieldName) {
      alert('Please select an XML field.');
      return;
    }
    addXMLFieldToGroup(nodePath, groupIndex, fieldName);
  } else if (childLevelType === 'organizational') {
    const baseField = document.getElementById('orgBaseFieldSelect')?.value;
    if (!baseField) {
      alert('Please select an XML field to organize.');
      return;
    }
    addOrganizationalLevelToGroup(nodePath, groupIndex, baseField);
  }
  
  closeAddChildLevelModal();
}

function closeAddChildLevelModal() {
  const overlay = document.getElementById('addChildLevelOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  window.pendingChildLevelPath = null;
  window.pendingChildLevelGroupIndex = null;
}

// Add an organizational level as child to a group
function addOrganizationalLevelToGroup(nodePath, groupIndex, baseField) {
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return;
  
  const orgNode = node.children;
  const group = orgNode.organizationalGroups[groupIndex];
  if (!group || !group.children) return;
  
  if (!baseField) return;
  
  const fields = availableFields || [];
  if (!fields.includes(baseField.trim())) {
    alert(`Field "${baseField}" not found in XML. Available fields: ${fields.join(', ')}`);
    return;
  }
  
  // For each value in the group, add a child organizational node
  if (!group.children.values) group.children.values = [];
  
  group.children.values.forEach(value => {
    // Get records for this value to populate the organizational node
    const valuePath = [...nodePath, { type: 'orgGroup', groupIndex, valueIndex: group.children.values.indexOf(value) }];
    const filteredRecords = getRecordsForPathExtended(valuePath, group.children.field, value.value);
    
    // Get unique values from the base field
    const valueCounts = new Map();
    filteredRecords.forEach(record => {
      const rawVal = record[baseField.trim()];
      const val = normalizeBlankValue(rawVal);
      valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
    });
    
    // Create organizational child node
    value.children = {
      field: 'Virtual Grouping',
      isOrganizational: true,
      organizationalBaseField: baseField.trim(),
      organizationalGroups: [],
      unassignedValues: Array.from(valueCounts.entries()).map(([val, count]) => ({
        value: val,
        count: count,
        included: true
      })),
      values: []
    };
  });
  
  renderHierarchyTree();
  persistSettings();
}

// Add an XML field as child to a group
function addXMLFieldToGroup(nodePath, groupIndex, fieldName) {
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return;
  
  const orgNode = node.children;
  const group = orgNode.organizationalGroups[groupIndex];
  if (!group || !group.children) return;
  
  // For each value in the group, add a child XML field node
  if (!group.children.values) group.children.values = [];
  
  group.children.values.forEach(value => {
    // Get records for this value
    const valuePath = [...nodePath, { type: 'orgGroup', groupIndex, valueIndex: group.children.values.indexOf(value) }];
    const filteredRecords = getRecordsForPathExtended(valuePath, group.children.field, value.value);
    
    // Get unique values from the field
    const valueCounts = new Map();
    filteredRecords.forEach(record => {
      const rawVal = record[fieldName];
      const val = normalizeBlankValue(rawVal);
      valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
    });
    
    const parentAudioVariants = value.audioVariants || [];
    
    // Create child node with XML field
    value.children = {
      field: fieldName,
      isOrganizational: false,
      values: Array.from(valueCounts.entries()).map(([val, count]) => ({
        value: val,
        label: val,
        count: count,
        included: true,
        audioVariants: [...parentAudioVariants],
        parentAudioVariants: [...parentAudioVariants],
        children: null
      })).sort((a, b) => a.value.localeCompare(b.value))
    };
  });
  
  renderHierarchyTree();
  persistSettings();
}

// Helper function to get records filtered by path including organizational groups
function getRecordsForPathExtended(path, currentField, currentValue) {
  if (!parsedXmlData || !parsedXmlData.records) return [];
  
  let filtered = parsedXmlData.records;
  let currentNode = hierarchyTree;
  
  for (let i = 0; i < path.length; i++) {
    const pathSegment = path[i];
    
    if (typeof pathSegment === 'object' && pathSegment.type === 'orgGroup') {
      // Skip organizational group navigation for filtering
      // Just move to the organizational node
      if (currentNode.children && currentNode.children.isOrganizational) {
        const group = currentNode.children.organizationalGroups[pathSegment.groupIndex];
        if (group && group.children && group.children.values) {
          const value = group.children.values[pathSegment.valueIndex];
          // Filter by the actual XML field value
          if (value && group.children.field) {
            filtered = filtered.filter(record => record[group.children.field] === value.value);
          }
          currentNode = value;
        }
      }
    } else {
      // Regular numeric index
      if (!currentNode || !currentNode.values) break;
      const value = currentNode.values[pathSegment];
      
      if (value && value.included && currentNode.field) {
        // Only filter by XML fields
        if (!currentNode.isOrganizational) {
          filtered = filtered.filter(record => record[currentNode.field] === value.value);
        }
      }
      
      currentNode = value ? value.children : null;
    }
  }
  
  // Apply final filter for current field/value
  if (currentField && currentValue) {
    filtered = filtered.filter(record => record[currentField] === currentValue);
  }
  
  return filtered;
}

// Get records filtered by path down the tree
function getRecordsForPath(path) {
  if (!parsedXmlData || !parsedXmlData.records) return [];
  
  // Start with filtered records
  let filtered = getFilteredRecords();
  let currentNode = hierarchyTree;
  
  for (let i = 0; i < path.length; i++) {
    if (!currentNode || !currentNode.field) break;
    
    const valueIndex = path[i];
    const value = currentNode.values[valueIndex];
    
    if (value && value.included) {
      // Only filter by XML fields (skip organizational nodes)
      if (!currentNode.isOrganizational) {
        filtered = filtered.filter(record => record[currentNode.field] === value.value);
      }
      // Organizational nodes don't filter - they just group existing records
    }
    
    // Move to next level
    currentNode = value ? value.children : null;
  }
  
  return filtered;
}

// Toggle value inclusion
function toggleNodeValue(path) {
  const value = getNodeAtPath(path);
  if (!value) return;
  
  value.included = !value.included;
  
  // Recalculate counts for child levels
  recalculateChildCounts(path);
  
  renderHierarchyTree();
  persistSettings();
}

// Recalculate counts for all children of a node
function recalculateChildCounts(path) {
  const value = getNodeAtPath(path);
  if (!value || !value.children || !value.children.field) return;
  
  const filteredRecords = getRecordsForPath(path);
  
  if (value.children.isOrganizational) {
    // For organizational nodes, sum up counts from their children
    value.children.values.forEach(childValue => {
      if (childValue.children) {
        // Sum up the counts of this organizational value's children
        const totalCount = childValue.children.values?.reduce((sum, v) => sum + (v.count || 0), 0) || 0;
        childValue.count = totalCount;
      } else {
        // Leaf organizational node - count needs to be set manually or from assignment
        childValue.count = childValue.count || 0;
      }
    });
  } else {
    // XML-backed node - count from records
    const field = value.children.field;
    const valueCounts = new Map();
    
    filteredRecords.forEach(record => {
      const rawVal = record[field];
      const val = normalizeBlankValue(rawVal);
      valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
    });
    
    // Update counts
    value.children.values.forEach(childValue => {
      childValue.count = valueCounts.get(childValue.value) || 0;
    });
  }
  
  // Recursively update children's children
  value.children.values.forEach((childValue, index) => {

/**
 * Refresh hierarchy counts when filters change
 * This recalculates counts for all values in the hierarchy tree
 */
function refreshHierarchyCounts() {
  if (!hierarchyTree || !hierarchyTree.field) return;
  
  // Recalculate root level counts
  const filteredRecords = getFilteredRecords();
  const valueCounts = new Map();
  
  filteredRecords.forEach(record => {
    const rawValue = record[hierarchyTree.field];
    const value = normalizeBlankValue(rawValue);
    valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
  });
  
  // Update root counts
  hierarchyTree.values.forEach(value => {
    value.count = valueCounts.get(value.value) || 0;
  });
  
  // Recursively update all child levels
  function refreshNodeCounts(node, path) {
    if (!node.values) return;
    
    node.values.forEach((value, index) => {
      const valuePath = [...path, index];
      
      // Recalculate children if they exist
      if (value.children && value.children.field) {
        const pathRecords = getRecordsForPath(valuePath);
        const childValueCounts = new Map();
        
        if (!value.children.isOrganizational) {
          pathRecords.forEach(record => {
            const rawVal = record[value.children.field];
            const val = normalizeBlankValue(rawVal);
            childValueCounts.set(val, (childValueCounts.get(val) || 0) + 1);
          });
          
          value.children.values.forEach(childValue => {
            childValue.count = childValueCounts.get(childValue.value) || 0;
          });
        }
        
        // Recurse into deeper levels
        refreshNodeCounts(value.children, valuePath);
      }
    });
  }
  
  refreshNodeCounts(hierarchyTree, []);
  
  // Re-render to show updated counts
  renderHierarchyTree();
}
    if (childValue.children) {
      recalculateChildCounts([...path, index]);
    }
  });
}

// Toggle audio variant for a specific value
function toggleAudioVariant(path, variantIndex, enabled) {
  const value = getNodeAtPath(path);
  if (!value) return;
  
  if (!value.audioVariants) {
    value.audioVariants = [];
  }
  
  if (enabled && !value.audioVariants.includes(variantIndex)) {
    value.audioVariants.push(variantIndex);
    value.audioVariants.sort((a, b) => a - b);
  } else if (!enabled) {
    value.audioVariants = value.audioVariants.filter(v => v !== variantIndex);
  }
  
  // Propagate to children of this value only
  propagateAudioVariantsToChildren(path);
  
  persistSettings();
  renderHierarchyTree();
}

// Propagate audio variants to all children of a value
function propagateAudioVariantsToChildren(path) {
  const value = getNodeAtPath(path);
  if (!value || !value.children || !value.children.values) return;
  
  const parentVariants = value.audioVariants || [];
  
  value.children.values.forEach((childValue, index) => {
    childValue.parentAudioVariants = [...parentVariants];
    
    // Remove any variants from child that parent doesn't have
    if (childValue.audioVariants) {
      childValue.audioVariants = childValue.audioVariants.filter(v => 
        parentVariants.includes(v)
      );
    }
    
    // Recursively propagate to grandchildren
    if (childValue.children) {
      propagateAudioVariantsToChildren([...path, index]);
    }
  });
}

// Toggle audio configuration panel visibility
function toggleAudioConfigPanel(pathStr) {
  const panel = document.getElementById(`audio-panel-${pathStr}`);
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

// Toggle collapse/expand for value children
function toggleCollapseExpand(pathStr) {
  const childrenContainer = document.getElementById(`children-${pathStr}`);
  const toggle = document.querySelector(`.collapse-toggle[data-path-str="${pathStr}"]`);
  
  if (childrenContainer) {
    childrenContainer.classList.toggle('collapsed');
    
    // Update toggle icon
    if (toggle) {
      toggle.classList.toggle('collapsed');
    }
  }
}

// ============================================================================
// DRAG AND DROP HANDLERS FOR REORDERING VALUES
// ============================================================================

function handleValueDragStart(e) {
  draggedValueContainer = e.currentTarget;
  draggedValuePath = JSON.parse(e.currentTarget.dataset.valuePath);
  
  e.currentTarget.classList.add('value-item-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleValueDragEnd(e) {
  e.currentTarget.classList.remove('value-item-dragging');
  
  // Remove all drag-over classes
  document.querySelectorAll('.value-item-drag-over').forEach(el => {
    el.classList.remove('value-item-drag-over');
  });
  
  draggedValueContainer = null;
  draggedValuePath = null;
}

function handleValueDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  e.dataTransfer.dropEffect = 'move';
  
  const target = e.currentTarget;
  if (target !== draggedValueContainer) {
    target.classList.add('value-item-drag-over');
  }
  
  return false;
}

function handleValueDragLeave(e) {
  e.currentTarget.classList.remove('value-item-drag-over');
}

function handleValueDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  e.currentTarget.classList.remove('value-item-drag-over');
  
  if (draggedValueContainer === e.currentTarget) {
    return false;
  }
  
  const targetPath = JSON.parse(e.currentTarget.dataset.valuePath);
  
  // Only allow reordering within the same parent level
  const draggedParentPath = draggedValuePath.slice(0, -1);
  const targetParentPath = targetPath.slice(0, -1);
  
  if (JSON.stringify(draggedParentPath) !== JSON.stringify(targetParentPath)) {
    console.log('Cannot reorder items from different levels');
    return false;
  }
  
  // Get the parent node that contains the values array we need to reorder
  let parentNode;
  if (draggedParentPath.length === 0) {
    // Top level - parent is the root hierarchyTree
    parentNode = hierarchyTree;
  } else {
    // Child level - need to get the parent value's children node
    const parentValuePath = draggedParentPath.slice(0, -1);
    const parentValueIndex = draggedParentPath[draggedParentPath.length - 1];
    
    if (parentValuePath.length === 0) {
      // Parent is a top-level value
      parentNode = hierarchyTree.values[parentValueIndex].children;
    } else {
      // Parent is a nested value - navigate to it
      const parentValue = getNodeAtPath(draggedParentPath);
      parentNode = parentValue ? parentValue.children : null;
    }
  }
  
  if (!parentNode || !parentNode.values) {
    console.log('Could not find parent node with values array');
    return false;
  }
  
  const draggedIndex = draggedValuePath[draggedValuePath.length - 1];
  const targetIndex = targetPath[targetPath.length - 1];
  
  // Reorder the values array
  const values = parentNode.values;
  const [removed] = values.splice(draggedIndex, 1);
  values.splice(targetIndex, 0, removed);
  
  // Re-render and persist
  renderHierarchyTree();
  persistSettings();
  
  return false;
}

// ============================================================================

function renderHierarchyTree() {
  const container = document.getElementById('hierarchyTree');
  if (!container) return;
  
  if (!hierarchyTree) {
    container.innerHTML = `
      <div style="color: #999; font-style: italic; padding: 10px;">
        No hierarchy defined. Click "Add Root Level" to start.
      </div>
      <div class="tree-actions" style="margin-top: 10px;">
        <button class="btn-tree add" onclick="initializeRootLevel()">Add Root Level</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  // Render root level
  const rootDiv = renderNode(hierarchyTree, [], 0);
  container.appendChild(rootDiv);
}

// Render organizational node with groups and unassigned values
function renderOrganizationalNode(node, path, depth, nodeDiv) {
  const pathStr = path.join('-');
  
  // Show info about the base field being organized
  if (node.organizationalBaseField) {
    const infoDiv = document.createElement('div');
    infoDiv.style.padding = '10px';
    infoDiv.style.background = '#fff3cd';
    infoDiv.style.border = '1px solid #ffa726';
    infoDiv.style.borderRadius = '4px';
    infoDiv.style.marginBottom = '15px';
    infoDiv.style.fontSize = '13px';
    infoDiv.innerHTML = `<strong>Organizing field:</strong> ${node.organizationalBaseField}<br>` +
      `<em>Drag values between groups to organize them. Each value can only be in one group.</em>`;
    nodeDiv.appendChild(infoDiv);
  }
  
  // Render organizational groups
  if (node.organizationalGroups && node.organizationalGroups.length > 0) {
    const groupsContainer = document.createElement('div');
    groupsContainer.style.marginBottom = '15px';
    groupsContainer.className = 'org-groups-container';
    
    node.organizationalGroups.forEach((group, groupIndex) => {
      const groupDiv = document.createElement('div');
      groupDiv.style.background = '#f0f8ff';
      groupDiv.style.border = '2px solid #2196f3';
      groupDiv.style.borderRadius = '6px';
      groupDiv.style.padding = '12px';
      groupDiv.style.marginBottom = '10px';
      groupDiv.style.cursor = 'grab';
      groupDiv.draggable = true;
      groupDiv.dataset.groupIndex = groupIndex;
      groupDiv.dataset.nodePath = JSON.stringify(path);
      groupDiv.className = 'org-group-container';
      
      // If group is excluded, gray it out
      if (group.included === false) {
        groupDiv.style.opacity = '0.5';
        groupDiv.style.background = '#f9f9f9';
      }
      
      // Add group drag event listeners
      groupDiv.addEventListener('dragstart', handleGroupDragStart);
      groupDiv.addEventListener('dragend', handleGroupDragEnd);
      groupDiv.addEventListener('dragover', handleGroupDragOver);
      groupDiv.addEventListener('drop', (e) => handleGroupDrop(e, path, groupIndex));
      
      // Group header
      const groupHeader = document.createElement('div');
      groupHeader.style.fontWeight = 'bold';
      groupHeader.style.marginBottom = '8px';
      groupHeader.style.fontSize = '14px';
      groupHeader.style.color = '#1976d2';
      groupHeader.style.display = 'flex';
      groupHeader.style.alignItems = 'center';
      groupHeader.style.gap = '8px';
      
      // Checkbox for group inclusion
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupCheckbox.checked = group.included !== false;
      groupCheckbox.style.cursor = 'pointer';
      groupCheckbox.style.margin = '0';
      groupCheckbox.onclick = (e) => {
        e.stopPropagation();
        toggleOrgGroupInclusion(path, groupIndex);
      };
      // Prevent dragging when clicking checkbox
      groupCheckbox.ondragstart = (e) => e.preventDefault();
      groupHeader.appendChild(groupCheckbox);
      
      // Drag handle
      const dragHandle = document.createElement('span');
      dragHandle.textContent = '⋮⋮';
      dragHandle.style.color = '#999';
      dragHandle.style.fontSize = '12px';
      dragHandle.style.cursor = 'grab';
      groupHeader.appendChild(dragHandle);
      
      const groupLabel = document.createElement('span');
      groupLabel.textContent = `📁 ${group.name}`;
      groupHeader.appendChild(groupLabel);
      
      const groupCount = group.children?.values?.length || 0;
      const countSpan = document.createElement('span');
      countSpan.style.marginLeft = 'auto';
      countSpan.style.fontWeight = 'normal';
      countSpan.style.color = '#666';
      countSpan.style.fontSize = '12px';
      countSpan.textContent = `(${groupCount} values)`;
      groupHeader.appendChild(countSpan);
      
      groupDiv.appendChild(groupHeader);
      
      // Values in this group
      if (group.children && group.children.values && group.children.values.length > 0) {
        const valuesContainer = document.createElement('div');
        valuesContainer.style.display = 'flex';
        valuesContainer.style.flexWrap = 'wrap';
        valuesContainer.style.gap = '6px';
        valuesContainer.style.marginTop = '8px';
        valuesContainer.dataset.groupIndex = groupIndex;
        valuesContainer.dataset.targetType = 'group';
        valuesContainer.className = 'org-drop-zone';
        
        // Add drop zone listeners
        valuesContainer.addEventListener('dragover', handleOrgValueDragOver);
        valuesContainer.addEventListener('drop', (e) => handleOrgValueDrop(e, path, groupIndex));
        valuesContainer.addEventListener('dragleave', handleOrgValueDragLeave);
        
        group.children.values.forEach((value, valueIndex) => {
          const valueChip = createOrgValueChip(value, path, groupIndex, valueIndex);
          valuesContainer.appendChild(valueChip);
        });
        
        groupDiv.appendChild(valuesContainer);
        
        // Render child hierarchy levels for each value in this group
        if (group.children.values.length > 0) {
          group.children.values.forEach((value, valueIndex) => {
            if (value.children) {
              // Build path to this value: current path + group marker + value index
              const valuePath = [...path, { type: 'orgGroup', groupIndex, valueIndex }];
              
              // Render the child node
              const childNodeDiv = renderNode(value.children, valuePath, (path.length + 1) * 2);
              if (childNodeDiv) {
                childNodeDiv.style.marginLeft = '20px';
                childNodeDiv.style.paddingLeft = '10px';
                childNodeDiv.style.borderLeft = '2px solid #ccc';
                groupDiv.appendChild(childNodeDiv);
              }
            }
          });
        }
      } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.color = '#999';
        emptyMsg.style.fontStyle = 'italic';
        emptyMsg.style.fontSize = '12px';
        emptyMsg.style.padding = '8px';
        emptyMsg.textContent = 'No values assigned yet. Drag from Unassigned below.';
        emptyMsg.dataset.groupIndex = groupIndex;
        emptyMsg.dataset.targetType = 'group';
        emptyMsg.className = 'org-drop-zone';
        
        // Add drop zone listeners
        emptyMsg.addEventListener('dragover', handleOrgValueDragOver);
        emptyMsg.addEventListener('drop', (e) => handleOrgValueDrop(e, path, groupIndex));
        emptyMsg.addEventListener('dragleave', handleOrgValueDragLeave);
        
        groupDiv.appendChild(emptyMsg);
      }
      
      // TODO: Add "Add Child Level" button for nested organizational nodes (feature disabled for now)
      // const addChildBtn = document.createElement('button');
      // addChildBtn.textContent = '+ Add Child Level to Group';
      // addChildBtn.style.marginTop = '8px';
      // addChildBtn.style.fontSize = '11px';
      // addChildBtn.style.padding = '4px 8px';
      // addChildBtn.style.background = '#e3f2fd';
      // addChildBtn.style.border = '1px solid #2196f3';
      // addChildBtn.style.borderRadius = '4px';
      // addChildBtn.style.cursor = 'pointer';
      // addChildBtn.onclick = () => addChildLevelToOrgGroup(path, groupIndex);
      // groupDiv.appendChild(addChildBtn);
      
      groupsContainer.appendChild(groupDiv);
    });
    
    nodeDiv.appendChild(groupsContainer);
  }
  
  // Render unassigned values section
  const unassignedDiv = document.createElement('div');
  unassignedDiv.style.background = '#f5f5f5';
  unassignedDiv.style.border = '1px dashed #999';
  unassignedDiv.style.borderRadius = '6px';
  unassignedDiv.style.padding = '12px';
  unassignedDiv.style.marginBottom = '15px';
  
  const unassignedHeader = document.createElement('div');
  unassignedHeader.style.fontWeight = 'bold';
  unassignedHeader.style.marginBottom = '8px';
  unassignedHeader.style.fontSize = '14px';
  unassignedHeader.style.color = '#666';
  unassignedHeader.textContent = '📋 Unassigned Values';
  
  const unassignedCount = node.unassignedValues?.length || 0;
  const countSpan = document.createElement('span');
  countSpan.style.marginLeft = '8px';
  countSpan.style.fontWeight = 'normal';
  countSpan.style.fontSize = '12px';
  countSpan.textContent = `(${unassignedCount})`;
  unassignedHeader.appendChild(countSpan);
  
  unassignedDiv.appendChild(unassignedHeader);
  
  if (node.unassignedValues && node.unassignedValues.length > 0) {
    const unassignedContainer = document.createElement('div');
    unassignedContainer.style.display = 'flex';
    unassignedContainer.style.flexWrap = 'wrap';
    unassignedContainer.style.gap = '6px';
    unassignedContainer.style.marginTop = '8px';
    unassignedContainer.dataset.targetType = 'unassigned';
    unassignedContainer.className = 'org-drop-zone';
    
    // Add drop zone listeners
    unassignedContainer.addEventListener('dragover', handleOrgValueDragOver);
    unassignedContainer.addEventListener('drop', (e) => handleOrgValueDrop(e, path, -1));
    unassignedContainer.addEventListener('dragleave', handleOrgValueDragLeave);
    
    node.unassignedValues.forEach((value, valueIndex) => {
      const valueChip = createOrgValueChip(value, path, -1, valueIndex);
      unassignedContainer.appendChild(valueChip);
    });
    
    unassignedDiv.appendChild(unassignedContainer);
  } else {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.color = '#999';
    emptyMsg.style.fontStyle = 'italic';
    emptyMsg.style.fontSize = '12px';
    emptyMsg.style.padding = '8px';
    emptyMsg.textContent = 'All values have been assigned to groups.';
    emptyMsg.dataset.targetType = 'unassigned';
    emptyMsg.className = 'org-drop-zone';
    
    // Add drop zone listeners
    emptyMsg.addEventListener('dragover', handleOrgValueDragOver);
    emptyMsg.addEventListener('drop', (e) => handleOrgValueDrop(e, path, -1));
    emptyMsg.addEventListener('dragleave', handleOrgValueDragLeave);
    
    unassignedDiv.appendChild(emptyMsg);
  }
  
  nodeDiv.appendChild(unassignedDiv);
  
  // Add button to create new group
  const addGroupBtn = document.createElement('button');
  addGroupBtn.className = 'btn-tree add';
  addGroupBtn.textContent = '+ Add Organizational Group';
  addGroupBtn.style.fontSize = '12px';
  addGroupBtn.style.padding = '6px 12px';
  addGroupBtn.style.marginTop = '10px';
  addGroupBtn.onclick = () => addOrganizationalValue(path);
  nodeDiv.appendChild(addGroupBtn);
  
  return nodeDiv;
}

// Create a draggable chip for an organizational value
function createOrgValueChip(value, nodePath, groupIndex, valueIndex) {
  const chip = document.createElement('div');
  chip.style.display = 'inline-flex';
  chip.style.alignItems = 'center';
  chip.style.gap = '6px';
  chip.style.padding = '6px 10px';
  chip.style.background = 'white';
  chip.style.border = '1px solid #ccc';
  chip.style.borderRadius = '16px';
  chip.style.fontSize = '12px';
  chip.style.cursor = 'grab';
  chip.draggable = true;
  chip.dataset.orgValue = JSON.stringify({ value: value.value, nodePath, groupIndex, valueIndex });
  
  // If value is excluded, gray it out
  if (value.included === false) {
    chip.style.opacity = '0.5';
    chip.style.background = '#f5f5f5';
  }
  
  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = value.included !== false;
  checkbox.style.cursor = 'pointer';
  checkbox.style.margin = '0';
  checkbox.onclick = (e) => {
    e.stopPropagation();
    toggleOrgValueInclusion(nodePath, groupIndex, valueIndex);
  };
  // Prevent dragging when clicking checkbox
  checkbox.ondragstart = (e) => e.preventDefault();
  chip.appendChild(checkbox);
  
  // Drag icon
  const dragIcon = document.createElement('span');
  dragIcon.textContent = '⋮⋮';
  dragIcon.style.color = '#999';
  dragIcon.style.fontSize = '10px';
  chip.appendChild(dragIcon);
  
  // Value label
  const label = document.createElement('span');
  label.textContent = value.value;
  label.style.fontWeight = '500';
  chip.appendChild(label);
  
  // Count
  if (value.count > 0) {
    const count = document.createElement('span');
    count.textContent = `(${value.count})`;
    count.style.color = '#666';
    count.style.fontSize = '11px';
    chip.appendChild(count);
  }
  
  // Drag event listeners
  chip.addEventListener('dragstart', handleOrgValueDragStart);
  chip.addEventListener('dragend', handleOrgValueDragEnd);
  
  return chip;
}

// Organizational value drag handlers
let draggedOrgValue = null;

function handleOrgValueDragStart(e) {
  draggedOrgValue = JSON.parse(e.currentTarget.dataset.orgValue);
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify(draggedOrgValue));
}

function handleOrgValueDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  draggedOrgValue = null;
  
  // Remove all drag-over classes
  document.querySelectorAll('.org-drop-zone-over').forEach(el => {
    el.classList.remove('org-drop-zone-over');
  });
}

function handleOrgValueDragOver(e) {
  if (!draggedOrgValue) return;
  
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  e.dataTransfer.dropEffect = 'move';
  
  // Check if we're hovering over another value chip (for reordering)
  const chipElement = e.target.closest('[data-org-value]');
  if (chipElement && chipElement !== e.currentTarget) {
    // Hovering over a specific chip - show insertion indicator
    const rect = chipElement.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    
    // Remove previous indicators
    document.querySelectorAll('.org-insert-before, .org-insert-after').forEach(el => {
      el.classList.remove('org-insert-before', 'org-insert-after');
    });
    
    if (e.clientX < midpoint) {
      chipElement.classList.add('org-insert-before');
    } else {
      chipElement.classList.add('org-insert-after');
    }
  } else {
    // Hovering over the container - highlight it
    e.currentTarget.classList.add('org-drop-zone-over');
  }
  
  return false;
}

function handleOrgValueDragLeave(e) {
  // Only remove classes if we're actually leaving the drop zone, not just moving to a child
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('org-drop-zone-over');
  }
  
  // Remove insertion indicators
  document.querySelectorAll('.org-insert-before, .org-insert-after').forEach(el => {
    el.classList.remove('org-insert-before', 'org-insert-after');
  });
}

function handleOrgValueDrop(e, nodePath, targetGroupIndex) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  e.currentTarget.classList.remove('org-drop-zone-over');
  
  // Remove insertion indicators
  document.querySelectorAll('.org-insert-before, .org-insert-after').forEach(el => {
    el.classList.remove('org-insert-before', 'org-insert-after');
  });
  
  if (!draggedOrgValue) return false;
  
  const sourceGroupIndex = draggedOrgValue.groupIndex;
  const sourceValueIndex = draggedOrgValue.valueIndex;
  const valueData = draggedOrgValue.value;
  
  // Get the organizational node
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return false;
  
  const orgNode = node.children;
  
  // Check if we're dropping on a specific chip (for reordering within same group)
  const targetChipElement = e.target.closest('[data-org-value]');
  let targetValueIndex = null;
  let insertBefore = true;
  
  if (targetChipElement && sourceGroupIndex === targetGroupIndex) {
    // We're reordering within the same group
    const targetChipData = JSON.parse(targetChipElement.dataset.orgValue);
    targetValueIndex = targetChipData.valueIndex;
    
    // Determine if we should insert before or after
    const rect = targetChipElement.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    insertBefore = e.clientX < midpoint;
    
    // Don't do anything if dropping in the exact same spot
    if (sourceValueIndex === targetValueIndex || 
        (insertBefore && sourceValueIndex === targetValueIndex - 1) ||
        (!insertBefore && sourceValueIndex === targetValueIndex + 1)) {
      return false;
    }
  } else if (sourceGroupIndex === targetGroupIndex && !targetChipElement) {
    // Dropping in same group but not on a specific chip - treat as append
    // This is effectively no-op for reordering
    return false;
  }
  
  // Remove from source
  let removedValue;
  if (sourceGroupIndex === -1) {
    // Remove from unassigned
    removedValue = orgNode.unassignedValues.splice(sourceValueIndex, 1)[0];
  } else {
    // Remove from source group
    removedValue = orgNode.organizationalGroups[sourceGroupIndex].children.values.splice(sourceValueIndex, 1)[0];
  }
  
  // Add to target
  if (targetGroupIndex === -1) {
    // Add to unassigned
    if (!orgNode.unassignedValues) {
      orgNode.unassignedValues = [];
    }
    
    if (targetValueIndex !== null && sourceGroupIndex === -1) {
      // Reordering within unassigned
      let adjustedIndex = targetValueIndex;
      if (sourceValueIndex < targetValueIndex) {
        adjustedIndex--; // Adjust for the removal
      }
      if (!insertBefore) {
        adjustedIndex++;
      }
      orgNode.unassignedValues.splice(adjustedIndex, 0, removedValue);
    } else {
      // Moving from a group to unassigned - append
      orgNode.unassignedValues.push(removedValue);
    }
  } else {
    // Add to target group
    const targetGroup = orgNode.organizationalGroups[targetGroupIndex];
    if (!targetGroup.children) {
      targetGroup.children = {
        field: orgNode.organizationalBaseField || '',
        values: []
      };
    }
    if (!targetGroup.children.values) {
      targetGroup.children.values = [];
    }
    
    if (targetValueIndex !== null && sourceGroupIndex === targetGroupIndex) {
      // Reordering within the same group
      let adjustedIndex = targetValueIndex;
      if (sourceValueIndex < targetValueIndex) {
        adjustedIndex--; // Adjust for the removal
      }
      if (!insertBefore) {
        adjustedIndex++;
      }
      targetGroup.children.values.splice(adjustedIndex, 0, removedValue);
    } else {
      // Moving from another group/unassigned - append
      targetGroup.children.values.push(removedValue);
    }
  }
  
  renderHierarchyTree();
  persistSettings();
  
  return false;
}

// Organizational group drag handlers
let draggedGroup = null;

function handleGroupDragStart(e) {
  const groupDiv = e.currentTarget;
  draggedGroup = {
    groupIndex: parseInt(groupDiv.dataset.groupIndex),
    nodePath: JSON.parse(groupDiv.dataset.nodePath)
  };
  
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify(draggedGroup));
  
  // Prevent dragging values while dragging the group
  e.stopPropagation();
}

function handleGroupDragEnd(e) {
  e.currentTarget.style.opacity = '1';
  draggedGroup = null;
  
  // Remove all drag-over classes
  document.querySelectorAll('.org-group-drag-over-before, .org-group-drag-over-after').forEach(el => {
    el.classList.remove('org-group-drag-over-before', 'org-group-drag-over-after');
  });
}

function handleGroupDragOver(e) {
  if (!draggedGroup) return;
  
  // Only handle group dragging, not value dragging
  if (draggedOrgValue) return;
  
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  e.dataTransfer.dropEffect = 'move';
  e.stopPropagation();
  
  const targetGroupDiv = e.currentTarget;
  const rect = targetGroupDiv.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  
  // Remove previous indicators
  document.querySelectorAll('.org-group-drag-over-before, .org-group-drag-over-after').forEach(el => {
    el.classList.remove('org-group-drag-over-before', 'org-group-drag-over-after');
  });
  
  if (e.clientY < midpoint) {
    targetGroupDiv.classList.add('org-group-drag-over-before');
  } else {
    targetGroupDiv.classList.add('org-group-drag-over-after');
  }
  
  return false;
}

function handleGroupDrop(e, nodePath, targetGroupIndex) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  // Remove indicators
  document.querySelectorAll('.org-group-drag-over-before, .org-group-drag-over-after').forEach(el => {
    el.classList.remove('org-group-drag-over-before', 'org-group-drag-over-after');
  });
  
  if (!draggedGroup) return false;
  
  const sourceGroupIndex = draggedGroup.groupIndex;
  
  // Don't do anything if dropping in same location
  if (sourceGroupIndex === targetGroupIndex) {
    return false;
  }
  
  // Get the organizational node
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return false;
  
  const orgNode = node.children;
  
  // Determine insertion position
  const targetGroupDiv = e.currentTarget;
  const rect = targetGroupDiv.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const insertBefore = e.clientY < midpoint;
  
  // Calculate final position
  let finalIndex = targetGroupIndex;
  if (!insertBefore) {
    finalIndex++;
  }
  
  // Adjust if dragging from earlier position
  if (sourceGroupIndex < finalIndex) {
    finalIndex--;
  }
  
  // Don't do anything if dropping in same location
  if (sourceGroupIndex === finalIndex) {
    return false;
  }
  
  // Remove from source position
  const [movedGroup] = orgNode.organizationalGroups.splice(sourceGroupIndex, 1);
  
  // Insert at target position
  orgNode.organizationalGroups.splice(finalIndex, 0, movedGroup);
  
  renderHierarchyTree();
  persistSettings();
  
  return false;
}

// Toggle inclusion of an organizational group (and all its values)
function toggleOrgGroupInclusion(nodePath, groupIndex) {
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return;
  
  const orgNode = node.children;
  const group = orgNode.organizationalGroups[groupIndex];
  
  // Toggle the group's inclusion state
  const newState = group.included === false ? true : false;
  group.included = newState;
  
  // Also toggle all values in the group
  if (group.children && group.children.values) {
    group.children.values.forEach(value => {
      value.included = newState;
    });
  }
  
  renderHierarchyTree();
  persistSettings();
}

// Toggle inclusion of a single organizational value
function toggleOrgValueInclusion(nodePath, groupIndex, valueIndex) {
  const node = nodePath.length === 0 ? hierarchyTree : getNodeAtPath(nodePath);
  if (!node || !node.children || !node.children.isOrganizational) return;
  
  const orgNode = node.children;
  
  let value;
  if (groupIndex === -1) {
    // Value in unassigned
    value = orgNode.unassignedValues[valueIndex];
  } else {
    // Value in a group
    const group = orgNode.organizationalGroups[groupIndex];
    if (!group.children || !group.children.values) return;
    value = group.children.values[valueIndex];
  }
  
  // Toggle the value's inclusion state
  value.included = value.included === false ? true : false;
  
  renderHierarchyTree();
  persistSettings();
}

// Recursively render a node and its children
function renderNode(node, path, depth) {
  const nodeDiv = document.createElement('div');
  nodeDiv.className = 'tree-node';
  if (node.isOrganizational) {
    nodeDiv.classList.add('organizational');
  }
  nodeDiv.style.marginLeft = `${depth * 20}px`;
  nodeDiv.style.borderLeft = depth > 0 ? '2px solid #ccc' : 'none';
  nodeDiv.style.paddingLeft = depth > 0 ? '15px' : '0';
  nodeDiv.style.marginTop = depth > 0 ? '10px' : '0';
  
  // Node header with field selector
  const headerDiv = document.createElement('div');
  headerDiv.className = 'tree-node-header';
  headerDiv.style.display = 'flex';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.gap = '10px';
  headerDiv.style.marginBottom = '10px';
  
  const fieldLabel = document.createElement('strong');
  fieldLabel.textContent = path.length === 0 ? 'Root Level:' : `Field:`;
  fieldLabel.style.flex = '0 0 80px';
  
  // Organizational node checkbox (only for child nodes)
  if (path.length > 0) {
    const orgCheckbox = document.createElement('input');
    orgCheckbox.type = 'checkbox';
    orgCheckbox.id = `org-${path.join('-')}`;
    orgCheckbox.checked = node.isOrganizational || false;
    orgCheckbox.style.width = 'auto';
    orgCheckbox.style.marginRight = '5px';
    
    const orgLabel = document.createElement('label');
    orgLabel.htmlFor = `org-${path.join('-')}`;
    orgLabel.textContent = 'Organizational (virtual grouping)';
    orgLabel.style.fontSize = '12px';
    orgLabel.style.color = '#666';
    orgLabel.style.cursor = 'pointer';
    orgLabel.style.display = 'flex';
    orgLabel.style.alignItems = 'center';
    orgLabel.style.gap = '5px';
    orgLabel.style.marginBottom = '8px';
    orgLabel.insertBefore(orgCheckbox, orgLabel.firstChild);
    
    orgCheckbox.addEventListener('change', () => {
      toggleOrganizationalNode(path, orgCheckbox.checked);
    });
    
    nodeDiv.appendChild(orgLabel);
  }
  
  const fieldSelect = document.createElement('select');
  fieldSelect.style.flex = '1';
  fieldSelect.disabled = node.isOrganizational || false;
  
  if (node.isOrganizational) {
    fieldSelect.innerHTML = '<option value="">— Organizational Node (no XML field) —</option>';
  } else {
    fieldSelect.innerHTML = '<option value="">— Select field —</option>';
    availableFields.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      if (f === node.field) opt.selected = true;
      fieldSelect.appendChild(opt);
    });
  }
  
  fieldSelect.addEventListener('change', () => {
    updateNodeField(path, fieldSelect.value);
  });
  
  headerDiv.appendChild(fieldLabel);
  headerDiv.appendChild(fieldSelect);
  
  // Remove button (only for non-root)
  if (path.length > 0) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-tree remove';
    removeBtn.textContent = 'Remove Level';
    removeBtn.style.fontSize = '12px';
    removeBtn.style.padding = '4px 8px';
    removeBtn.onclick = () => {
      // The path represents the value that owns this node as its child
      // So we need to get that value and set its children to null
      const ownerValue = getNodeAtPath(path);
      if (ownerValue) {
        ownerValue.children = null;
        renderHierarchyTree();
        persistSettings();
      }
    };
    headerDiv.appendChild(removeBtn);
  }
  
  nodeDiv.appendChild(headerDiv);
  
  // Special rendering for organizational nodes
  if (node.isOrganizational && node.organizationalGroups !== undefined) {
    return renderOrganizationalNode(node, path, depth, nodeDiv);
  }
  
  // Render values
  if (node.field && node.values && node.values.length > 0) {
    const valuesDiv = document.createElement('div');
    valuesDiv.style.display = 'flex';
    valuesDiv.style.flexDirection = 'column';
    valuesDiv.style.gap = '10px';
    valuesDiv.style.marginBottom = '15px';
    
    node.values.forEach((valueItem, valueIndex) => {
      const valuePath = [...path, valueIndex];
      const pathStr = valuePath.join('-');
      
      const valueContainer = document.createElement('div');
      valueContainer.style.background = valueItem.included ? '#f9f9f9' : '#fafafa';
      valueContainer.style.border = '1px solid #ddd';
      valueContainer.style.borderRadius = '6px';
      valueContainer.style.padding = '10px';
      valueContainer.draggable = true;
      valueContainer.dataset.valuePath = JSON.stringify(valuePath);
      valueContainer.dataset.valueIndex = valueIndex;
      
      // Add drag event listeners
      valueContainer.addEventListener('dragstart', handleValueDragStart);
      valueContainer.addEventListener('dragend', handleValueDragEnd);
      valueContainer.addEventListener('dragover', handleValueDragOver);
      valueContainer.addEventListener('drop', handleValueDrop);
      valueContainer.addEventListener('dragleave', handleValueDragLeave);
      
      // Value header
      const valueHeader = document.createElement('div');
      valueHeader.style.display = 'flex';
      valueHeader.style.alignItems = 'center';
      valueHeader.style.gap = '10px';
      valueHeader.style.marginBottom = '8px';
      
      // Collapse/expand toggle (only if has children)
      if (valueItem.children && valueItem.included) {
        const collapseToggle = document.createElement('span');
        collapseToggle.className = 'collapse-toggle';
        collapseToggle.textContent = '▼';
        collapseToggle.title = 'Collapse/expand children';
        collapseToggle.dataset.pathStr = pathStr;
        collapseToggle.addEventListener('click', () => toggleCollapseExpand(pathStr));
        valueHeader.appendChild(collapseToggle);
      } else {
        // Spacer to maintain alignment
        const spacer = document.createElement('span');
        spacer.style.width = '20px';
        spacer.style.display = 'inline-block';
        valueHeader.appendChild(spacer);
      }
      
      // Drag handle
      const dragHandle = document.createElement('span');
      dragHandle.className = 'value-drag-handle';
      dragHandle.textContent = '⋮⋮';
      dragHandle.title = 'Drag to reorder';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = valueItem.included;
      checkbox.style.width = 'auto';
      checkbox.addEventListener('change', () => toggleNodeValue(valuePath));
      
      const label = document.createElement('span');
      label.style.flex = '1';
      label.style.fontWeight = '600';
      label.style.fontSize = '14px';
      label.textContent = valueItem.value;
      
      // Add organizational badge if this is a virtual grouping
      if (valueItem.isOrganizational) {
        const badge = document.createElement('span');
        badge.style.marginLeft = '8px';
        badge.style.padding = '2px 6px';
        badge.style.background = '#ffa726';
        badge.style.color = 'white';
        badge.style.fontSize = '10px';
        badge.style.borderRadius = '3px';
        badge.style.fontWeight = 'bold';
        badge.textContent = 'VIRTUAL';
        badge.title = 'This is an organizational grouping (not tied to XML field)';
        label.appendChild(badge);
      }
      
      const count = document.createElement('span');
      count.style.color = '#666';
      count.style.fontSize = '13px';
      count.textContent = `(${valueItem.count} words)`;
      
      valueHeader.appendChild(dragHandle);
      valueHeader.appendChild(checkbox);
      valueHeader.appendChild(label);
      valueHeader.appendChild(count);
      
      // Buttons row
      const buttonsDiv = document.createElement('div');
      buttonsDiv.style.display = 'flex';
      buttonsDiv.style.gap = '8px';
      buttonsDiv.style.marginTop = '8px';
      
      if (valueItem.included) {
        // Audio config button
        const audioBtn = document.createElement('button');
        audioBtn.className = 'btn-tree';
        audioBtn.textContent = 'Audio ▼';
        audioBtn.style.fontSize = '12px';
        audioBtn.style.padding = '4px 10px';
        audioBtn.style.background = '#6c757d';
        audioBtn.style.color = 'white';
        audioBtn.onclick = () => toggleAudioConfigPanel(pathStr);
        buttonsDiv.appendChild(audioBtn);
        
        // Add child level button
        if (!valueItem.children) {
          const addChildBtn = document.createElement('button');
          addChildBtn.className = 'btn-tree add';
          addChildBtn.textContent = '+ Add Child Level';
          addChildBtn.style.fontSize = '12px';
          addChildBtn.style.padding = '4px 10px';
          addChildBtn.onclick = () => addChildLevel(valuePath);
          buttonsDiv.appendChild(addChildBtn);
        } else {
          const removeChildBtn = document.createElement('button');
          removeChildBtn.className = 'btn-tree remove';
          removeChildBtn.textContent = '− Remove Children';
          removeChildBtn.style.fontSize = '12px';
          removeChildBtn.style.padding = '4px 10px';
          removeChildBtn.onclick = () => removeChildLevel(valuePath);
          buttonsDiv.appendChild(removeChildBtn);
        }
      }
      
      valueHeader.appendChild(buttonsDiv);
      valueContainer.appendChild(valueHeader);
      
      // Audio configuration panel
      if (valueItem.included) {
        const audioPanel = document.createElement('div');
        audioPanel.id = `audio-panel-${pathStr}`;
        audioPanel.style.display = 'none';
        audioPanel.style.marginTop = '10px';
        audioPanel.style.padding = '12px';
        audioPanel.style.background = '#fff';
        audioPanel.style.border = '1px solid #ddd';
        audioPanel.style.borderRadius = '4px';
        
        const audioTitle = document.createElement('div');
        audioTitle.style.fontWeight = 'bold';
        audioTitle.style.marginBottom = '10px';
        audioTitle.style.fontSize = '13px';
        audioTitle.textContent = `Audio variants for "${valueItem.value}":`;
        audioPanel.appendChild(audioTitle);
        
        if (audioVariants.length > 0) {
          const variantsDiv = document.createElement('div');
          variantsDiv.style.display = 'flex';
          variantsDiv.style.flexDirection = 'column';
          variantsDiv.style.gap = '8px';
          
          audioVariants.forEach((variant, variantIndex) => {
            const variantLabel = document.createElement('label');
            variantLabel.style.display = 'flex';
            variantLabel.style.alignItems = 'center';
            variantLabel.style.gap = '8px';
            variantLabel.style.cursor = 'pointer';
            
            const variantCb = document.createElement('input');
            variantCb.type = 'checkbox';
            variantCb.checked = valueItem.audioVariants && valueItem.audioVariants.includes(variantIndex);
            variantCb.style.width = 'auto';
            
            // Disable if parent has disabled this variant
            const isInherited = valueItem.parentAudioVariants && !valueItem.parentAudioVariants.includes(variantIndex);
            if (isInherited) {
              variantCb.disabled = true;
              variantCb.checked = false;
              variantLabel.style.opacity = '0.5';
              variantLabel.style.cursor = 'not-allowed';
            }
            
            variantCb.addEventListener('change', () => {
              toggleAudioVariant(valuePath, variantIndex, variantCb.checked);
            });
            
            const variantText = document.createElement('span');
            variantText.style.fontSize = '13px';
            variantText.textContent = `[${variantIndex}] ${variant.description}`;
            if (variant.suffix) {
              variantText.textContent += ` (${variant.suffix})`;
            }
            if (isInherited) {
              variantText.textContent += ' (disabled by parent)';
            }
            
            variantLabel.appendChild(variantCb);
            variantLabel.appendChild(variantText);
            variantsDiv.appendChild(variantLabel);
          });
          
          audioPanel.appendChild(variantsDiv);
          
          const inheritInfo = document.createElement('div');
          inheritInfo.style.fontSize = '11px';
          inheritInfo.style.color = '#666';
          inheritInfo.style.marginTop = '10px';
          inheritInfo.style.fontStyle = 'italic';
          if (valueItem.children) {
            inheritInfo.textContent = 'ℹ️ Child values will inherit these selections';
          } else {
            inheritInfo.textContent = 'ℹ️ Only selected audio variants will be included in this sub-bundle';
          }
          audioPanel.appendChild(inheritInfo);
        } else {
          const noVariants = document.createElement('div');
          noVariants.style.fontSize = '12px';
          noVariants.style.color = '#999';
          noVariants.style.fontStyle = 'italic';
          noVariants.textContent = 'No audio variants configured. Add variants in Audio Settings section.';
          audioPanel.appendChild(noVariants);
        }
        
        valueContainer.appendChild(audioPanel);
      }
      
      valuesDiv.appendChild(valueContainer);
      
      // Recursively render children (wrapped in collapsible container)
      if (valueItem.children && valueItem.included) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'value-children-container';
        childrenContainer.id = `children-${pathStr}`;
        
        const childDiv = renderNode(valueItem.children, valuePath, depth + 1);
        childrenContainer.appendChild(childDiv);
        valuesDiv.appendChild(childrenContainer);
      }
    });
    
    nodeDiv.appendChild(valuesDiv);
    
    // Add button for organizational nodes to manually add values
    if (node.isOrganizational) {
      const addValueBtn = document.createElement('button');
      addValueBtn.className = 'btn-tree add';
      addValueBtn.textContent = '+ Add Grouping Value';
      addValueBtn.style.fontSize = '12px';
      addValueBtn.style.padding = '6px 12px';
      addValueBtn.style.marginTop = '10px';
      addValueBtn.onclick = () => addOrganizationalValue(path);
      nodeDiv.appendChild(addValueBtn);
    }
  } else if (node.field) {
    const noValues = document.createElement('div');
    noValues.style.color = '#999';
    noValues.style.fontStyle = 'italic';
    noValues.style.padding = '10px';
    noValues.textContent = node.isOrganizational 
      ? 'No grouping values defined. Click "+ Add Grouping Value" to create one.'
      : 'No values found for this field';
    nodeDiv.appendChild(noValues);
    
    // Add button for empty organizational nodes
    if (node.isOrganizational) {
      const addValueBtn = document.createElement('button');
      addValueBtn.className = 'btn-tree add';
      addValueBtn.textContent = '+ Add Grouping Value';
      addValueBtn.style.fontSize = '12px';
      addValueBtn.style.padding = '6px 12px';
      addValueBtn.style.marginTop = '10px';
      addValueBtn.onclick = () => addOrganizationalValue(path);
      nodeDiv.appendChild(addValueBtn);
    }
  }
  
  return nodeDiv;
}

async function selectAudioFolder() {
  try {
    console.log('[import-data] Calling bundler:select-audio-folder');
    const path = await ipcRenderer.invoke('bundler:select-audio-folder');
    console.log('[import-data] Got path:', path);
    if (path) {
      audioFolderPath = path;
      document.getElementById('audioFolder').value = path;
      checkFormValid();
      await persistSettings();
    }
  } catch (error) {
    console.error('[import-data] Error in selectAudioFolder:', error);
    alert(`Error selecting audio folder: ${error.message}`);
  }
}

async function selectOutputFile() {
  const path = await ipcRenderer.invoke('bundler:select-output-file', bundleType);
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

// ========== Compression level estimates ==========

function updateCompressionEstimate() {
  const level = parseInt(document.getElementById('compressionLevel').value);
  document.getElementById('compressionLevelValue').textContent = level;
  
  // Compression ratios and speed multipliers based on empirical data
  const estimates = {
    0: { size: 100, speed: 0.1, desc: 'No compression (fastest)' },
    1: { size: 85, speed: 0.2, desc: 'Minimal compression' },
    2: { size: 75, speed: 0.3, desc: 'Low compression' },
    3: { size: 68, speed: 0.5, desc: 'Below default' },
    4: { size: 62, speed: 0.7, desc: 'Moderate compression' },
    5: { size: 58, speed: 0.9, desc: 'Default compression' },
    6: { size: 55, speed: 1.0, desc: 'Good compression (recommended)' },
    7: { size: 53, speed: 1.5, desc: 'Better compression' },
    8: { size: 51, speed: 2.2, desc: 'High compression' },
    9: { size: 50, speed: 3.0, desc: 'Maximum compression (slowest)' }
  };
  
  const estimate = estimates[level];
  const estimateDiv = document.getElementById('compressionEstimate');
  
  estimateDiv.innerHTML = `
    <strong>${estimate.desc}</strong><br>
    File size: ~${estimate.size}% of uncompressed | Processing time: ~${estimate.speed.toFixed(1)}x baseline
  `;
  
  // Visual feedback for extreme settings
  if (level === 0) {
    estimateDiv.style.background = '#fff3cd';
    estimateDiv.style.borderLeft = '3px solid #ffc107';
  } else if (level >= 8) {
    estimateDiv.style.background = '#fff3cd';
    estimateDiv.style.borderLeft = '3px solid #ff9800';
  } else {
    estimateDiv.style.background = '#f8f9fa';
    estimateDiv.style.borderLeft = 'none';
  }
}

// Import existing .tnset bundle
async function importExistingBundle() {
  // TODO: Implement bundle import logic
  // - Open file dialog for .tnset files
  // - Check if linked or embedded bundle
  // - If linked: populate UI with settings
  // - If embedded/legacy: immediately pass to Tone Analysis tab
  alert('Import .tnset Bundle feature coming soon!\n\nThis will allow you to:\n- Import existing bundles\n- Edit hierarchy and filters\n- Continue sorting where you left off');
}

// Start Sorting - creates linked bundle and passes to Tone Analysis
async function startSorting() {
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
  
  // Use collectCurrentSettings to get all settings including bundleType and hierarchyTree
  const fullConfig = collectCurrentSettings();
  const settings = fullConfig.settings;

  if (settings.showGloss && !settings.glossElement) {
    showStatus('error', 'Please select a gloss element, or uncheck "Include gloss".');
    return;
  }
  
  // Validate tone fields - if checkbox is enabled, must have a field selected
  if (document.getElementById('enableToneGroupId')?.checked && !settings.toneGroupIdField) {
    showStatus('error', 'Please select a field for Tone Group ID, or uncheck the option.');
    return;
  }
  if (document.getElementById('enablePitchField')?.checked && !settings.pitchField) {
    showStatus('error', 'Please select a field for Pitch, or uncheck the option.');
    return;
  }
  if (document.getElementById('enableAbbreviationField')?.checked && !settings.abbreviationField) {
    showStatus('error', 'Please select a field for Abbreviation, or uncheck the option.');
    return;
  }
  if (document.getElementById('enableExemplarField')?.checked && !settings.exemplarField) {
    showStatus('error', 'Please select a field for Exemplar, or uncheck the option.');
    return;
  }
  
  console.log('[createBundle] bundleType:', settings.bundleType);
  console.log('[createBundle] hierarchyTree exists:', !!settings.hierarchyTree);
  
  const config = {
    xmlPath: xmlFilePath,
    audioFolder: audioFolderPath,
    outputPath: outputFilePath,
    settings,
  };
  
  // Disable button during creation
  document.getElementById('createBtn').disabled = true;
  document.getElementById('createBtn').textContent = 'Creating Bundle...';

  // Listen for audio processing progress events
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
  
  // Listen for archive finalization progress events
  ipcRenderer.removeAllListeners('archive-progress');
  ipcRenderer.on('archive-progress', (event, info) => {
    console.log('[renderer] Archive progress:', info.type, info);
    if (!procContainer) return;
    if (info.type === 'start') {
      procContainer.style.display = 'block';
      procBar.style.width = '0%';
      procBar.style.background = '#007bff';
      procBar.style.animation = 'none';
      procMeta.textContent = 'Preparing to finalize archive…';
    } else if (info.type === 'progress') {
      const pct = info.percent || 0;
      procBar.style.width = pct + '%';
      procBar.style.background = '#007bff';
      procBar.style.animation = 'none';
      const mb = (info.processedBytes / 1024 / 1024).toFixed(2);
      const totalMb = (info.totalBytes / 1024 / 1024).toFixed(2);
      procMeta.textContent = `Compressing… ${pct}% — ${mb} MB / ${totalMb} MB`;
    } else if (info.type === 'finalizing') {
      // Indeterminate progress during finalization
      const mb = (info.bytesWritten / 1024 / 1024).toFixed(2);
      procContainer.style.display = 'block'; // Ensure visible
      procBar.style.width = '100%';
      procBar.style.background = 'linear-gradient(90deg, #4CAF50 25%, #81C784 50%, #4CAF50 75%)';
      procBar.style.backgroundSize = '200% 100%';
      procBar.style.animation = 'progress-animation 2s linear infinite';
      procMeta.textContent = `Finalizing… ${mb} MB written`;
    } else if (info.type === 'done') {
      const mb = info.totalBytes ? (info.totalBytes / 1024 / 1024).toFixed(2) : '?';
      procBar.style.width = '100%';
      procBar.style.background = '#4CAF50';
      procBar.style.animation = 'none';
      procMeta.textContent = `Archive complete! ${mb} MB`;
      setTimeout(() => { procContainer.style.display = 'none'; }, 1500);
    }
  });
  
  const result = await ipcRenderer.invoke('bundler:create-bundle', config);
  
  document.getElementById('createBtn').disabled = false;
  document.getElementById('createBtn').textContent = 'Create Bundle';
  
  if (result.success) {
    let message = `Bundle created successfully!\n\n`;
    
    // Show hierarchical or legacy record counts
    if (result.hierarchicalBundle && result.recordsIncluded !== undefined) {
      message += `Records included: ${result.recordsIncluded}\n`;
      message += `Records excluded: ${result.recordsExcluded}\n`;
      message += `Total records: ${result.recordCount}\n`;
    } else {
      message += `Records: ${result.recordCount}\n`;
    }
    
    message += `Audio files: ${result.audioFileCount}`;
    
    if (result.missingSoundFiles && Array.isArray(result.missingSoundFiles)) {
      // Show detailed missing files list with scrolling
      const statusEl = document.getElementById('status');
      statusEl.className = 'status warning';
      statusEl.style.display = 'block';
      statusEl.style.maxHeight = '500px';
      statusEl.style.overflowY = 'auto';
      
      // Build HTML content with proper formatting
      let html = `<div style="font-weight: bold; margin-bottom: 10px;">${message}</div>`;
      html += `<div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #856404;">`;
      html += `<strong>⚠ Warning: ${result.missingSoundFiles.length} audio files not found</strong>`;
      html += `</div>`;
      
      // Group by reference for better organization
      const missingByRef = {};
      result.missingSoundFiles.forEach(item => {
        const ref = typeof item === 'string' ? 'unknown' : (item.ref || 'unknown');
        if (!missingByRef[ref]) missingByRef[ref] = [];
        missingByRef[ref].push(item);
      });
      
      const uniqueRefs = Object.keys(missingByRef).sort();
      html += `<div style="margin-top: 10px; margin-bottom: 5px;">Unique references affected: ${uniqueRefs.length}</div>`;
      html += `<div style="margin-top: 10px; font-family: monospace; font-size: 12px; line-height: 1.6;">`;
      
      uniqueRefs.forEach(ref => {
        const items = missingByRef[ref];
        html += `<div style="margin-top: 8px; margin-bottom: 4px;"><strong>Ref ${ref}:</strong></div>`;
        items.forEach(item => {
          const fileName = typeof item === 'string' ? item : item.file;
          const suffix = typeof item === 'string' ? '' : item.suffix;
          html += `<div style="margin-left: 20px; color: #721c24;">  suffix '${suffix}': ${fileName}</div>`;
        });
      });
      
      html += `</div>`;
      statusEl.innerHTML = html;
    } else {
      showStatus('success', message);
    }
    
    // NEW WORKFLOW: Switch to Tone Analysis tab after successful bundle creation
    setTimeout(async () => {
      try {
        // Notify Tone Analysis to load the linked bundle
        await window.electronAPI.invoke('switch-view', 'analysis');
        // TODO: Pass bundle configuration to Tone Analysis tab
      } catch (error) {
        console.error('Failed to switch to Tone Analysis:', error);
      }
    }, 1000);
  } else {
    showStatus('error', `Failed to create bundle: ${result.error}`);
  }
  
  // Re-enable button
  document.getElementById('createBtn').disabled = false;
  document.getElementById('createBtn').textContent = '🚀 Start Sorting!';
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
  table.style.gridTemplateColumns = '70px 1fr 220px 40px';
  table.style.gap = '8px';
  table.style.alignItems = 'center';

  // Header
  const hOrder = document.createElement('div'); hOrder.textContent = 'Order'; hOrder.style.color = '#666'; hOrder.style.fontWeight = '600';
  const hDesc = document.createElement('div'); hDesc.textContent = 'Description'; hDesc.style.color = '#666'; hDesc.style.fontWeight = '600';
  const hSuf = document.createElement('div'); hSuf.textContent = 'Suffix'; hSuf.style.color = '#666'; hSuf.style.fontWeight = '600';
  const hAct = document.createElement('div'); hAct.textContent = '';
  table.appendChild(hOrder); table.appendChild(hDesc); table.appendChild(hSuf); table.appendChild(hAct);

  if (audioVariants.length === 0) {
    audioVariants = [{ description: 'Default', suffix: '' }];
  }

  audioVariants.forEach((v, idx) => {
    // Order buttons container
    const orderBtns = document.createElement('div');
    orderBtns.style.display = 'flex';
    orderBtns.style.gap = '4px';
    
    const upBtn = document.createElement('button');
    upBtn.className = 'btn-secondary';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.style.padding = '2px 8px';
    upBtn.style.fontSize = '16px';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (idx > 0) {
        // Swap with previous item
        [audioVariants[idx - 1], audioVariants[idx]] = [audioVariants[idx], audioVariants[idx - 1]];
        renderAudioVariants();
        persistSettings();
      }
    });
    
    const downBtn = document.createElement('button');
    downBtn.className = 'btn-secondary';
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.style.padding = '2px 8px';
    downBtn.style.fontSize = '16px';
    downBtn.disabled = idx === audioVariants.length - 1;
    downBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (idx < audioVariants.length - 1) {
        // Swap with next item
        [audioVariants[idx], audioVariants[idx + 1]] = [audioVariants[idx + 1], audioVariants[idx]];
        renderAudioVariants();
        persistSettings();
      }
    });
    
    orderBtns.appendChild(upBtn);
    orderBtns.appendChild(downBtn);
    
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

    table.appendChild(orderBtns);
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

// Import audio variants from clipboard
async function importAudioVariantsFromClipboard() {
  try {
    // Close the dropdown menu
    const menu = document.getElementById('importAudioVariantsMenu');
    if (menu) menu.style.display = 'none';
    
    // Check if clipboard API is available
    if (!window.electronAPI || !window.electronAPI.clipboard) {
      alert('Clipboard API not available. Please ensure the app has proper permissions.');
      console.error('[import-data] window.electronAPI.clipboard not available');
      return;
    }
    
    // Read clipboard text
    const clipboardText = window.electronAPI.clipboard.readText();
    console.log('[import-data] Clipboard text:', clipboardText);
    
    if (!clipboardText || !clipboardText.trim()) {
      alert('Clipboard is empty. Please copy tab-separated values (Description\\tSuffix) and try again.');
      return;
    }
    
    // Parse tab-separated values
    const lines = clipboardText.trim().split('\n');
    const variants = [];
    const errors = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      const parts = line.split('\t');
      
      if (parts.length !== 2) {
        errors.push(`Line ${i + 1}: Expected 2 columns (Description\\tSuffix), found ${parts.length}`);
        continue;
      }
      
      const description = parts[0].trim();
      const suffix = parts[1].trim();
      
      if (!description) {
        errors.push(`Line ${i + 1}: Description cannot be empty`);
        continue;
      }
      
      variants.push({
        description: description,
        suffix: suffix
      });
    }
    
    // Show validation errors if any
    if (errors.length > 0) {
      alert(`Found ${errors.length} error(s):\\n\\n${errors.join('\\n')}\\n\\nNo variants were imported.`);
      return;
    }
    
    if (variants.length === 0) {
      alert('No valid audio variants found in clipboard. Please ensure your data is tab-separated with 2 columns:\\nDescription\\tSuffix');
      return;
    }
    
    // Confirm overwrite
    const currentCount = audioVariants.length;
    const message = `This will replace your current ${currentCount} audio variant(s) with ${variants.length} new variant(s).\\n\\nContinue?`;
    
    if (!confirm(message)) {
      return;
    }
    
    // Import the variants
    audioVariants = variants;
    renderAudioVariants();
    await persistSettings();
    
    showStatus('success', `Imported ${variants.length} audio variant(s) from clipboard`);
  } catch (error) {
    console.error('[import-data] Error importing audio variants:', error);
    alert(`Error importing audio variants: ${error.message}`);
  }
}

// Toggle import dropdown menu
function toggleImportAudioVariantsMenu() {
  const menu = document.getElementById('importAudioVariantsMenu');
  if (!menu) return;
  
  if (menu.style.display === 'none') {
    menu.style.display = 'block';
  } else {
    menu.style.display = 'none';
  }
}

// Close import menu when clicking outside
document.addEventListener('click', (e) => {
  const btn = document.getElementById('importAudioVariantsBtn');
  const menu = document.getElementById('importAudioVariantsMenu');
  
  if (!btn || !menu) return;
  
  // If clicking outside both button and menu, close the menu
  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function showStatus(type, message) {
  const statusEl = document.getElementById('status');
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.innerHTML = ''; // Clear any HTML
  statusEl.textContent = message; // Set as plain text
  statusEl.style.display = 'block';
  statusEl.style.maxHeight = ''; // Reset max height
  statusEl.style.overflowY = ''; // Reset overflow
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
  const result = await ipcRenderer.invoke('bundler:save-profile', { name: clean, data });
  if (result && result.success) {
    showStatus('success', `Saved profile: ${result.filePath}`);
  } else {
    showStatus('error', `Failed to save profile: ${result?.error || 'Unknown error'}`);
  }
  closeSaveProfileModal();
}

async function loadProfile() {
  const result = await ipcRenderer.invoke('bundler:open-profile');
  if (!result || !result.success) {
    if (result && result.error) showStatus('error', `Failed to load profile: ${result.error}`);
    return;
  }
  const profile = result.data;
  if (profile.xmlPath) {
    xmlFilePath = profile.xmlPath;
    document.getElementById('xmlPath').value = profile.xmlPath;
    const parsed = await ipcRenderer.invoke('bundler:parse-xml', profile.xmlPath);
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
  const audioFolderEl = document.getElementById('audioFolder');
  if (audioFolderEl) audioFolderEl.value = profile.audioFolder || '';
  
  // outputPath element removed from UI - not needed for linked bundles
  outputFilePath = profile.outputPath || null;

  const s = profile.settings || {};
  document.getElementById('showWrittenForm').checked = !!s.showWrittenForm;
  document.getElementById('showGloss').checked = !!s.showGloss;
  document.getElementById('requireUserSpelling').checked = !!s.requireUserSpelling;
  document.getElementById('showReferenceNumbers').checked = !!s.showReferenceNumbers;
  document.getElementById('userSpellingElement').value = s.userSpellingElement || 'Orthographic';
  document.getElementById('toneGroupElement').value = s.toneGroupElement || 'SurfaceMelodyGroup';
  document.getElementById('bundleDescription').value = s.bundleDescription || '';
  
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
  
  // Restore group pre-population setting
  if (s.groupingField) {
    const radio = document.querySelector(`input[name="groupingField"][value="${s.groupingField}"]`);
    if (radio) radio.checked = true;
  }
  
  // referenceNumbers element removed from UI
  if (s.glossElement) {
    const glossSel = document.getElementById('glossElement');
    if (glossSel) glossSel.value = s.glossElement;
  }

  // Restore audio variants
  audioVariants = Array.isArray(s.audioFileVariants) && s.audioFileVariants.length > 0
    ? s.audioFileVariants.map((v) => ({
        description: String(v.description || ''),
        suffix: (v.suffix == null || v.suffix === '') ? '' : String(v.suffix),
      }))
    : [{ description: 'Default', suffix: (s.audioFileSuffix || '') }];
  renderAudioVariants();

  // Audio processing and compression elements removed from UI
  
  // Restore bundle type
  if (s.bundleType) {
    bundleType = s.bundleType;
    const radioToCheck = document.querySelector(`input[name="bundleType"][value="${bundleType}"]`);
    if (radioToCheck) {
      radioToCheck.checked = true;
      handleBundleTypeChange();
    }
  }

  // Restore hierarchy tree from profile (supports both new hierarchyTree and legacy hierarchyLevels)
  if (s.hierarchyTree) {
    hierarchyTree = restoreTreeNode(s.hierarchyTree);
    renderHierarchyTree();
  } else if (Array.isArray(s.hierarchyLevels) && s.hierarchyLevels.length > 0) {
    // Migrate old format to new tree format (best effort - first level only)
    const firstLevel = s.hierarchyLevels[0];
    hierarchyTree = {
      field: firstLevel.field,
      values: (firstLevel.values || []).map(value => ({
        value: value.value,
        count: value.count || 0,
        included: value.included !== false,
        label: value.label || value.value,
        audioVariants: Array.isArray(value.audioVariants) ? value.audioVariants : audioVariants.map((_, i) => i),
        parentAudioVariants: null,
        children: null
      }))
    };
    renderHierarchyTree();
  }

  // Restore filter groups
  if (Array.isArray(s.filterGroups) && s.filterGroups.length > 0) {
    console.log('[import-data] Restoring filter groups from profile:', s.filterGroups.length, 'groups');
    filterGroups = s.filterGroups;
    
    // Migrate old format to new format if needed (conditions -> items)
    filterGroups = filterGroups.map(group => migrateFilterGroup(group));
    
    // Ensure IDs are sequential
    const allIds = collectAllFilterIds(filterGroups);
    const maxGroupId = Math.max(...allIds.groupIds, 0);
    const maxConditionId = Math.max(...allIds.conditionIds, 0);
    nextFilterGroupId = maxGroupId + 1;
    nextFilterConditionId = maxConditionId + 1;
    renderFilterGroups();
    console.log('[import-data] Filter groups rendered from profile');
  } else {
    console.log('[import-data] No filter groups in profile');
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

// Check for conflicts in source data
async function checkConflicts() {
  const resultDiv = document.getElementById('conflictCheckResult');
  const btn = document.getElementById('checkConflictsBtn');
  
  // Clear previous results
  resultDiv.style.display = 'none';
  resultDiv.innerHTML = '';
  
  // Disable button during check
  btn.disabled = true;
  btn.textContent = '🔍 Checking...';
  
  try {
    // Get current settings
    const config = collectCurrentSettings();
    const xmlPath = config.xmlPath || document.getElementById('xmlPath').value;
    const settings = config.settings;
    
    if (!xmlPath) {
      resultDiv.style.display = 'block';
      resultDiv.style.background = '#fff3cd';
      resultDiv.style.border = '1px solid #ffc107';
      resultDiv.style.padding = '12px';
      resultDiv.style.borderRadius = '4px';
      resultDiv.innerHTML = '<strong>⚠️ No XML file selected.</strong> Please select a Dekereke XML file first.';
      return;
    }
    
    const result = await ipcRenderer.invoke('bundler:check-conflicts', { xmlPath, settings });
    
    if (!result.success) {
      resultDiv.style.display = 'block';
      resultDiv.style.background = '#f8d7da';
      resultDiv.style.border = '1px solid #f5c6cb';
      resultDiv.style.padding = '12px';
      resultDiv.style.borderRadius = '4px';
      resultDiv.innerHTML = `<strong>❌ Error:</strong> ${result.error}`;
      return;
    }
    
    if (result.message) {
      // Info message (no grouping field configured, etc.)
      resultDiv.style.display = 'block';
      resultDiv.style.background = '#d1ecf1';
      resultDiv.style.border = '1px solid #bee5eb';
      resultDiv.style.padding = '12px';
      resultDiv.style.borderRadius = '4px';
      resultDiv.innerHTML = `<strong>ℹ️ Info:</strong> ${result.message}`;
      return;
    }
    
    if (!result.hasConflicts) {
      // No conflicts found
      resultDiv.style.display = 'block';
      resultDiv.style.background = '#d4edda';
      resultDiv.style.border = '1px solid #c3e6cb';
      resultDiv.style.padding = '12px';
      resultDiv.style.borderRadius = '4px';
      resultDiv.innerHTML = `
        <strong>✅ No conflicts detected!</strong><br>
        <div style="margin-top: 8px; font-size: 13px;">
          All words grouped by <strong>${result.groupingField}</strong> have consistent values 
          across all configured fields. Your data is ready to export without any overwrites.
        </div>
      `;
      return;
    }
    
    // Conflicts found - show detailed report
    let html = `
      <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px;">
        <strong>⚠️ ${result.conflicts.length} group(s) with conflicts detected!</strong>
        <div style="margin-top: 8px; font-size: 13px;">
          These words will be <strong>overwritten</strong> during export to match their group's majority values:
        </div>
      </div>
    `;
    
    result.conflicts.forEach(conflict => {
      html += `
        <div style="border: 1px solid #ddd; padding: 10px; margin-top: 10px; border-radius: 4px; background: #f9f9f9;">
          <h4 style="margin: 0 0 8px 0; font-size: 14px;">Group ${conflict.groupNumber}${conflict.groupId ? ` (${conflict.groupId})` : ''}</h4>
      `;
      
      if (conflict.pitchConflicts && conflict.pitchConflicts.length > 0) {
        html += `<div style="margin-bottom: 6px;"><strong>Pitch (${result.fieldNames.pitch}):</strong><ul style="margin: 2px 0 0 20px; font-size: 12px;">`;
        conflict.pitchConflicts.forEach(c => {
          html += `<li>Ref ${c.reference}: "${c.currentValue}" → "${c.willBecome}"</li>`;
        });
        html += `</ul></div>`;
      }
      
      if (conflict.abbreviationConflicts && conflict.abbreviationConflicts.length > 0) {
        html += `<div style="margin-bottom: 6px;"><strong>Abbreviation (${result.fieldNames.abbreviation}):</strong><ul style="margin: 2px 0 0 20px; font-size: 12px;">`;
        conflict.abbreviationConflicts.forEach(c => {
          html += `<li>Ref ${c.reference}: "${c.currentValue}" → "${c.willBecome}"</li>`;
        });
        html += `</ul></div>`;
      }
      
      if (conflict.exemplarConflicts && conflict.exemplarConflicts.length > 0) {
        html += `<div style="margin-bottom: 6px;"><strong>Exemplar (${result.fieldNames.exemplar}):</strong><ul style="margin: 2px 0 0 20px; font-size: 12px;">`;
        conflict.exemplarConflicts.forEach(c => {
          html += `<li>Ref ${c.reference}: "${c.currentValue}" → "${c.willBecome}"</li>`;
        });
        html += `</ul></div>`;
      }
      
      html += `</div>`;
    });
    
    html += `
      <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 10px; margin-top: 10px; border-radius: 4px; font-size: 12px;">
        <strong>What this means:</strong>
        <ul style="margin: 6px 0 0 20px;">
          <li>You can still create this bundle and use it normally</li>
          <li>When exporting from the matching app, you'll see this same report</li>
          <li>You can choose to approve the overwrites or cancel to fix your source data first</li>
          <li>To avoid conflicts: ensure all words in each group have matching values, or configure different output field names</li>
        </ul>
      </div>
    `;
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = html;
    
  } catch (error) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#f8d7da';
    resultDiv.style.border = '1px solid #f5c6cb';
    resultDiv.style.padding = '12px';
    resultDiv.style.borderRadius = '4px';
    resultDiv.innerHTML = `<strong>❌ Error:</strong> ${error.message}`;
  } finally {
    // Re-enable button
    btn.disabled = false;
    btn.textContent = '🔍 Check for Conflicts Now';
  }
}

