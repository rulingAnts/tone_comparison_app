const { ipcRenderer } = require('electron');

// State
let bundleSettings = null;
let session = null;
let currentWord = null;
let currentGroupId = null;

const REVIEW_THRESHOLD = 5;

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
  // Set up keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);
});

function handleKeyDown(e) {
  // Space or Enter to play audio (when not typing in input)
  if ((e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    playAudio();
  }
  
  // Enter to confirm spelling when in input
  if (e.key === 'Enter' && e.target.id === 'spellingTextInput') {
    e.preventDefault();
    confirmSpelling();
  }
  
  // Escape to cancel spelling edit
  if (e.key === 'Escape' && e.target.id === 'spellingTextInput') {
    e.preventDefault();
    cancelSpellingEdit();
  }
}

async function loadBundle() {
  try {
    const filePath = await ipcRenderer.invoke('select-bundle-file');
    if (!filePath) return;
    
    const result = await ipcRenderer.invoke('load-bundle', filePath);
    if (!result.success) {
      alert(`Failed to load bundle: ${result.error}`);
      return;
    }
    
    bundleSettings = result.settings;
    session = result.session;
    
    // Initialize UI
    initializeAudioVariants();
    updateProgressIndicator();
    
    // Show work area
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('workArea').classList.remove('hidden');
    
    // Load current word and groups
    await loadCurrentWord();
    renderGroups();
    
  } catch (error) {
    alert(`Error loading bundle: ${error.message}`);
  }
}

function initializeAudioVariants() {
  const select = document.getElementById('audioVariantSelect');
  select.innerHTML = '';
  
  const variants = bundleSettings.audioFileVariants || [{ description: 'Default', suffix: '' }];
  variants.forEach((variant, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = variant.description || `Variant ${index + 1}`;
    select.appendChild(option);
  });
  
  select.value = session.selectedAudioVariantIndex || 0;
  select.addEventListener('change', async () => {
    session.selectedAudioVariantIndex = parseInt(select.value);
    await ipcRenderer.invoke('update-session', { selectedAudioVariantIndex: session.selectedAudioVariantIndex });
  });
}

function updateProgressIndicator() {
  const total = session.queue.length + getTotalAssignedWords();
  const completed = getTotalAssignedWords();
  document.getElementById('progressIndicator').textContent = `Progress: ${completed} / ${total} words assigned`;
}

function getTotalAssignedWords() {
  return session.groups.reduce((sum, g) => sum + (g.members || []).length, 0);
}

async function loadCurrentWord() {
  currentWord = await ipcRenderer.invoke('get-current-word');
  
  if (!currentWord) {
    // No more words
    document.querySelector('.word-panel').innerHTML = '<h2>All words assigned!</h2><p>You can export your results or review your groups.</p>';
    return;
  }
  
  // Update written form
  const writtenFormLine = document.getElementById('writtenFormLine');
  if (bundleSettings.showWrittenForm && bundleSettings.writtenFormElements) {
    const writtenParts = bundleSettings.writtenFormElements
      .map(elem => currentWord[elem])
      .filter(val => val != null && val !== '');
    writtenFormLine.textContent = writtenParts.join(' ') || '(no written form)';
    writtenFormLine.style.display = 'block';
  } else {
    writtenFormLine.style.display = 'none';
  }
  
  // Update gloss
  const glossLine = document.getElementById('glossLine');
  if (bundleSettings.glossElement && currentWord[bundleSettings.glossElement]) {
    glossLine.textContent = currentWord[bundleSettings.glossElement];
    glossLine.style.display = 'block';
  } else {
    glossLine.style.display = 'none';
  }
  
  // Update spelling section
  const spellingSection = document.getElementById('spellingSection');
  if (bundleSettings.requireUserSpelling) {
    spellingSection.classList.remove('hidden');
    
    const ref = currentWord.Reference;
    const edits = session.records[ref] || {};
    
    if (edits.userSpelling) {
      // Show spelling display
      showSpellingDisplay(edits.userSpelling);
    } else {
      // Show spelling input
      showSpellingInput();
    }
  } else {
    spellingSection.classList.add('hidden');
  }
  
  // Update Add Word button state
  updateAddWordButton();
}

function showSpellingInput() {
  document.getElementById('spellingInput').classList.remove('hidden');
  document.getElementById('spellingDisplay').classList.add('hidden');
  document.getElementById('spellingTextInput').value = '';
}

function showSpellingDisplay(spelling) {
  document.getElementById('spellingInput').classList.add('hidden');
  document.getElementById('spellingDisplay').classList.remove('hidden');
  document.getElementById('spellingText').textContent = spelling;
}

function editSpelling() {
  const currentSpelling = document.getElementById('spellingText').textContent;
  document.getElementById('spellingTextInput').value = currentSpelling;
  showSpellingInput();
  document.getElementById('spellingTextInput').focus();
}

function cancelSpellingEdit() {
  const ref = currentWord.Reference;
  const edits = session.records[ref] || {};
  
  if (edits.userSpelling) {
    showSpellingDisplay(edits.userSpelling);
  } else {
    document.getElementById('spellingTextInput').value = '';
  }
}

async function confirmSpelling() {
  const input = document.getElementById('spellingTextInput');
  const userSpelling = input.value.trim();
  
  if (!userSpelling) {
    alert('Please enter a spelling');
    return;
  }
  
  const ref = currentWord.Reference;
  await ipcRenderer.invoke('confirm-spelling', ref, userSpelling);
  
  // Update session
  if (!session.records[ref]) session.records[ref] = {};
  session.records[ref].userSpelling = userSpelling;
  
  // Update display
  showSpellingDisplay(userSpelling);
  input.blur();
  
  // Update Add Word button
  updateAddWordButton();
}

function updateAddWordButton() {
  const addWordBtn = document.getElementById('addWordBtn');
  const addWordHint = document.getElementById('addWordHint');
  
  const needsSpelling = bundleSettings.requireUserSpelling;
  const ref = currentWord?.Reference;
  const hasSpelling = ref && session.records[ref]?.userSpelling;
  const hasCurrentGroup = currentGroupId != null;
  
  const canAdd = (!needsSpelling || hasSpelling) && hasCurrentGroup;
  
  addWordBtn.disabled = !canAdd;
  
  if (!hasCurrentGroup) {
    addWordHint.textContent = 'Please select or create a tone group first';
    addWordHint.classList.remove('hidden');
  } else if (needsSpelling && !hasSpelling) {
    addWordHint.textContent = 'Please confirm spelling before adding word to group';
    addWordHint.classList.remove('hidden');
  } else {
    addWordHint.classList.add('hidden');
  }
}

async function playAudio() {
  if (!currentWord || !currentWord.SoundFile) {
    console.log('No audio file for current word');
    return;
  }
  
  const variantIndex = session.selectedAudioVariantIndex || 0;
  const variants = bundleSettings.audioFileVariants || [{ description: 'Default', suffix: '' }];
  const suffix = variants[variantIndex]?.suffix || '';
  
  const audioPath = await ipcRenderer.invoke('get-audio-path', currentWord.SoundFile, suffix);
  if (!audioPath) {
    console.log('Audio file not found:', currentWord.SoundFile);
    return;
  }
  
  const audioPlayer = document.getElementById('audioPlayer');
  audioPlayer.src = `file://${audioPath}`;
  audioPlayer.play().catch(err => console.error('Audio playback error:', err));
}

async function createNewGroup() {
  const imagePath = await ipcRenderer.invoke('select-image-file');
  
  const newGroup = await ipcRenderer.invoke('create-group', { image: imagePath });
  session.groups.push(newGroup);
  
  // Set as current group
  currentGroupId = newGroup.id;
  
  renderGroups();
  updateAddWordButton();
}

async function addWordToCurrentGroup() {
  if (!currentGroupId || !currentWord) return;
  
  const ref = currentWord.Reference;
  
  // Add word to group
  await ipcRenderer.invoke('add-word-to-group', ref, currentGroupId);
  
  // Update session locally
  const group = session.groups.find(g => g.id === currentGroupId);
  if (group) {
    if (!group.members) group.members = [];
    if (!group.members.includes(ref)) {
      group.members.push(ref);
      group.additionsSinceReview = (group.additionsSinceReview || 0) + 1;
    }
  }
  
  // Remove from queue
  session.queue = session.queue.filter(r => r !== ref);
  
  // Check if review is needed
  if (group && group.additionsSinceReview >= REVIEW_THRESHOLD && !group.requiresReview) {
    group.requiresReview = true;
    alert(`Group ${group.groupNumber} has ${group.additionsSinceReview} new additions. Consider reviewing this group.`);
    await ipcRenderer.invoke('update-group', currentGroupId, { requiresReview: true });
  }
  
  // Update UI
  updateProgressIndicator();
  renderGroups();
  await loadCurrentWord();
}

async function removeWordFromGroup(ref, groupId) {
  await ipcRenderer.invoke('remove-word-from-group', ref, groupId);
  
  // Update session locally
  const group = session.groups.find(g => g.id === groupId);
  if (group) {
    group.members = (group.members || []).filter(m => m !== ref);
  }
  
  // Add to front of queue
  if (!session.queue.includes(ref)) {
    session.queue.unshift(ref);
  }
  
  // Update UI
  updateProgressIndicator();
  renderGroups();
  await loadCurrentWord();
}

async function playMemberAudio(ref) {
  const record = await ipcRenderer.invoke('get-record-by-ref', ref);
  if (!record || !record.SoundFile) return;
  
  const variantIndex = session.selectedAudioVariantIndex || 0;
  const variants = bundleSettings.audioFileVariants || [{ description: 'Default', suffix: '' }];
  const suffix = variants[variantIndex]?.suffix || '';
  
  const audioPath = await ipcRenderer.invoke('get-audio-path', record.SoundFile, suffix);
  if (!audioPath) return;
  
  const audioPlayer = document.getElementById('audioPlayer');
  audioPlayer.src = `file://${audioPath}`;
  audioPlayer.play().catch(err => console.error('Audio playback error:', err));
}

async function changeGroupImage(groupId) {
  const imagePath = await ipcRenderer.invoke('select-image-file');
  if (!imagePath) return;
  
  await ipcRenderer.invoke('update-group', groupId, { image: imagePath });
  
  const group = session.groups.find(g => g.id === groupId);
  if (group) {
    group.image = imagePath;
  }
  
  renderGroups();
}

async function removeGroupImage(groupId) {
  await ipcRenderer.invoke('update-group', groupId, { image: null });
  
  const group = session.groups.find(g => g.id === groupId);
  if (group) {
    group.image = null;
  }
  
  renderGroups();
}

async function markGroupReviewed(groupId) {
  await ipcRenderer.invoke('update-group', groupId, { 
    additionsSinceReview: 0, 
    requiresReview: false 
  });
  
  const group = session.groups.find(g => g.id === groupId);
  if (group) {
    group.additionsSinceReview = 0;
    group.requiresReview = false;
  }
  
  renderGroups();
}

function getMemberDisplayLines(ref) {
  // Priority: gloss > user spelling > written form
  const record = session.records[ref] || {};
  
  const lines = [];
  
  // Try gloss first
  if (bundleSettings.glossElement) {
    // We need to fetch the record to get gloss - simplified for now
    // In a real implementation, we'd cache records or fetch async
    lines.push({ text: ref, isRef: true }); // Placeholder - would need async fetch
  }
  
  // Try user spelling
  if (record.userSpelling) {
    if (lines.length === 0) {
      lines.push({ text: record.userSpelling, isTitle: true });
    } else if (lines.length === 1) {
      lines.push({ text: record.userSpelling, isSubtitle: true });
    }
  }
  
  // Try written form - would need async fetch of full record
  // For MVP, we'll just show ref and user spelling if available
  
  if (lines.length === 0) {
    lines.push({ text: ref, isRef: true });
  }
  
  return lines.slice(0, 2); // Max 2 lines
}

async function renderGroups() {
  const groupsList = document.getElementById('groupsList');
  
  if (session.groups.length === 0) {
    groupsList.innerHTML = '<div class="no-bundle">No groups yet. Create a group to begin.</div>';
    return;
  }
  
  groupsList.innerHTML = '';
  
  for (const group of session.groups) {
    const card = document.createElement('div');
    card.className = 'group-card';
    if (group.id === currentGroupId) {
      card.className += ' active';
    }
    
    card.addEventListener('click', () => {
      currentGroupId = group.id;
      renderGroups();
      updateAddWordButton();
    });
    
    // Header
    const header = document.createElement('div');
    header.className = 'group-header';
    
    const groupNumber = document.createElement('div');
    groupNumber.className = 'group-number';
    groupNumber.textContent = `Group ${group.groupNumber}`;
    header.appendChild(groupNumber);
    
    if (group.requiresReview) {
      const reviewBadge = document.createElement('button');
      reviewBadge.textContent = '✓ Mark Reviewed';
      reviewBadge.className = 'secondary';
      reviewBadge.style.fontSize = '12px';
      reviewBadge.style.padding = '4px 8px';
      reviewBadge.onclick = (e) => {
        e.stopPropagation();
        markGroupReviewed(group.id);
      };
      header.appendChild(reviewBadge);
    }
    
    card.appendChild(header);
    
    // Image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'group-image-container';
    
    if (group.image) {
      const img = document.createElement('img');
      img.className = 'group-image';
      img.src = `file://${group.image}`;
      img.onclick = (e) => {
        e.stopPropagation();
        changeGroupImage(group.id);
      };
      imageContainer.appendChild(img);
      
      const removeImgBtn = document.createElement('button');
      removeImgBtn.textContent = 'Remove Image';
      removeImgBtn.className = 'danger';
      removeImgBtn.style.fontSize = '12px';
      removeImgBtn.style.padding = '4px 8px';
      removeImgBtn.style.marginTop = '5px';
      removeImgBtn.onclick = (e) => {
        e.stopPropagation();
        removeGroupImage(group.id);
      };
      imageContainer.appendChild(removeImgBtn);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'image-placeholder';
      placeholder.textContent = 'Click to add image';
      placeholder.onclick = (e) => {
        e.stopPropagation();
        changeGroupImage(group.id);
      };
      imageContainer.appendChild(placeholder);
    }
    
    card.appendChild(imageContainer);
    
    // Members
    if (group.members && group.members.length > 0) {
      const membersList = document.createElement('div');
      membersList.className = 'members-list';
      
      for (const ref of group.members) {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        
        const memberText = document.createElement('div');
        memberText.className = 'member-text';
        
        // Get display lines
        const record = await ipcRenderer.invoke('get-record-by-ref', ref);
        const lines = [];
        
        // Priority: gloss > user spelling > written form
        const glossText = bundleSettings.glossElement && record ? record[bundleSettings.glossElement] : null;
        const userSpelling = session.records[ref]?.userSpelling || null;
        const writtenText = bundleSettings.writtenFormElements && record
          ? bundleSettings.writtenFormElements.map(e => record[e]).filter(v => v).join(' ')
          : null;
        
        const candidates = [
          { text: glossText, priority: 1 },
          { text: userSpelling, priority: 2 },
          { text: writtenText, priority: 3 },
        ].filter(c => c.text).sort((a, b) => a.priority - b.priority);
        
        if (candidates.length > 0) {
          const title = document.createElement('div');
          title.className = 'member-title';
          title.textContent = candidates[0].text;
          memberText.appendChild(title);
          
          if (candidates.length > 1) {
            const subtitle = document.createElement('div');
            subtitle.className = 'member-subtitle';
            subtitle.textContent = candidates[1].text;
            memberText.appendChild(subtitle);
          }
        } else {
          const title = document.createElement('div');
          title.className = 'member-title';
          title.textContent = ref;
          memberText.appendChild(title);
        }
        
        memberItem.appendChild(memberText);
        
        const actions = document.createElement('div');
        actions.className = 'member-actions';
        
        const playBtn = document.createElement('button');
        playBtn.className = 'icon-button';
        playBtn.textContent = '▶';
        playBtn.onclick = (e) => {
          e.stopPropagation();
          playMemberAudio(ref);
        };
        actions.appendChild(playBtn);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'icon-button danger';
        removeBtn.textContent = '✕';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          removeWordFromGroup(ref, group.id);
        };
        actions.appendChild(removeBtn);
        
        memberItem.appendChild(actions);
        membersList.appendChild(memberItem);
      }
      
      card.appendChild(membersList);
    } else {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.color = '#999';
      emptyMsg.style.fontSize = '14px';
      emptyMsg.style.padding = '10px';
      emptyMsg.textContent = 'No members yet';
      card.appendChild(emptyMsg);
    }
    
    groupsList.appendChild(card);
  }
}

async function exportBundle() {
  const result = await ipcRenderer.invoke('export-bundle');
  if (result.success) {
    alert(`Export successful!\nSaved to: ${result.outputPath}`);
  } else {
    alert(`Export failed: ${result.error}`);
  }
}
