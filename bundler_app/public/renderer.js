const { ipcRenderer } = require('electron');

let availableFields = [];
let xmlFilePath = null;
let audioFolderPath = null;
let outputFilePath = null;

async function selectXmlFile() {
  const path = await ipcRenderer.invoke('select-xml-file');
  if (path) {
    xmlFilePath = path;
    document.getElementById('xmlPath').value = path;
    
    // Parse XML to get available fields
    const result = await ipcRenderer.invoke('parse-xml', path);
    
    if (result.success) {
      availableFields = result.fields;
      updateWrittenFormElements();
      updateGlossOptions();
      document.getElementById('xmlInfo').textContent = 
        `✓ Loaded ${result.recordCount} records`;
      document.getElementById('xmlInfo').style.color = 'green';
      checkFormValid();
    } else {
      document.getElementById('xmlInfo').textContent = 
        `✗ Error: ${result.error}`;
      document.getElementById('xmlInfo').style.color = 'red';
    }
  }
}

function updateWrittenFormElements() {
  const container = document.getElementById('writtenFormElements');
  container.innerHTML = '';
  
  availableFields.forEach(field => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = field;
    checkbox.name = 'writtenForm';
    
    // Check 'Phonetic' by default
    if (field === 'Phonetic') {
      checkbox.checked = true;
    }
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(field));
    container.appendChild(label);
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

async function selectAudioFolder() {
  const path = await ipcRenderer.invoke('select-audio-folder');
  if (path) {
    audioFolderPath = path;
    document.getElementById('audioFolder').value = path;
    checkFormValid();
  }
}

async function selectOutputFile() {
  const path = await ipcRenderer.invoke('select-output-file');
  if (path) {
    outputFilePath = path;
    document.getElementById('outputPath').value = path;
    checkFormValid();
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
  
  // Collect settings
  const writtenFormElements = getSelectedWrittenFormElements();
  
  if (writtenFormElements.length === 0) {
    showStatus('error', 'Please select at least one written form element');
    return;
  }
  
  const settings = {
    writtenFormElements,
    showWrittenForm: document.getElementById('showWrittenForm').checked,
    audioFileSuffix: document.getElementById('audioSuffix').value.trim() || null,
    referenceNumbers: parseReferenceNumbers(document.getElementById('referenceNumbers').value),
    requireUserSpelling: document.getElementById('requireUserSpelling').checked,
    userSpellingElement: document.getElementById('userSpellingElement').value.trim(),
    toneGroupElement: document.getElementById('toneGroupElement').value.trim(),
    showGloss: document.getElementById('showGloss').checked,
    glossElement: (document.getElementById('showGloss').checked
      ? (document.getElementById('glossElement').value || null)
      : null),
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

function showStatus(type, message) {
  const statusEl = document.getElementById('status');
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.style.display = 'block';
}
