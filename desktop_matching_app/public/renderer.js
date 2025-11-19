// ipcRenderer is now provided by api-client.js
// State
let bundleSettings = null;
let session = null;
let currentWord = null;
let currentGroupId = null;
let recordCache = new Map(); // Cache for fetched records
let editingGroupId = null; // For edit modal
let movingWordRef = null; // For move word modal
let selectedTargetSubBundle = null; // For move word modal
let bundleType = null; // Track bundle type (hierarchical vs legacy)
let currentSubBundle = null; // Track current sub-bundle for hierarchical bundles

const REVIEW_THRESHOLD = 5;

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
  // Load Contour6 font for pitch transcription
  try {
    const fontFace = new FontFace(
      'Contour6SILDoulos',
      'url(fonts/Contour6SILDoulos.ttf)'
    );
    await fontFace.load();
    document.fonts.add(fontFace);
    console.log('[desktop_matching] Contour6SILDoulos font loaded');
  } catch (error) {
    console.warn('[desktop_matching] Failed to load Contour6 font:', error.message);
  }

  // Load previous locale if session exists
  try {
    const existingSession = await ipcRenderer.invoke('get-session');
    const initialLocale = existingSession?.locale || 'en';
    const localeSelect = document.getElementById('localeSelect');
    if (localeSelect) {
      localeSelect.value = initialLocale;
    }
    await window.i18n.loadLocale(initialLocale);
  } catch {
    await window.i18n.loadLocale('en');
  }

  // Set up keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Locale change listener
  const localeSelect = document.getElementById('localeSelect');
  if (localeSelect) {
    localeSelect.addEventListener('change', async () => {
      const newLocale = localeSelect.value;
      await window.i18n.loadLocale(newLocale);
      // Persist
      await ipcRenderer.invoke('update-session', { locale: newLocale });
      // Re-render dynamic text that isn't auto-bound
      updateProgressIndicator();
      if (!currentWord) {
        // If welcome screen, ensure hints translated
        const addWordHint = document.getElementById('addWordHint');
        if (addWordHint && addWordHint.classList.contains('hidden') === false) {
          // text will be replaced automatically if key didn't change
        }
      }
    });
  }

  // Check if bundle was restored from previous session
  try {
    const restored = await ipcRenderer.invoke('check-restored-bundle');
    if (restored.restored) {
      console.log('[desktop_matching] Restoring previous session');
      bundleSettings = restored.settings;
      session = restored.session;
      bundleType = restored.bundleType;
      
      if (bundleType === 'hierarchical') {
        // Hierarchical bundle restored
        if (restored.requiresNavigation) {
          // Show navigation screen
          document.getElementById('welcomeScreen').classList.add('hidden');
          document.getElementById('navigationScreen').classList.remove('hidden');
          document.getElementById('workArea').classList.add('hidden');
          renderHierarchyTree(restored.hierarchy, restored.session.subBundles);
        } else {
          // Resume work in current sub-bundle
          document.getElementById('welcomeScreen').classList.add('hidden');
          document.getElementById('navigationScreen').classList.add('hidden');
          document.getElementById('workArea').classList.remove('hidden');
          
          // Show sub-bundle indicator
          document.getElementById('subBundleIndicator').classList.remove('hidden');
          document.getElementById('subBundlePath').textContent = session.currentSubBundle;
          document.getElementById('backToNavBtn').classList.remove('hidden');
          
          // Initialize UI
          initializeAudioVariants();
          updateProgressIndicator();
          initializeReferenceToggle();
          
          // Load current word and groups
          await loadCurrentWord();
          renderGroups();
        }
      } else {
        // Legacy bundle restored
        document.getElementById('welcomeScreen').classList.add('hidden');
        document.getElementById('navigationScreen').classList.add('hidden');
        document.getElementById('workArea').classList.remove('hidden');
        
        // Initialize UI
        initializeAudioVariants();
        updateProgressIndicator();
        initializeReferenceToggle();
        
        // Load current word and groups
        await loadCurrentWord();
        renderGroups();
      }
    }
  } catch (error) {
    console.warn('[desktop_matching] Failed to restore bundle:', error.message);
  }

  // Show references toggle listener
  const showReferencesCheckbox = document.getElementById('showReferencesCheckbox');
  if (showReferencesCheckbox) {
    showReferencesCheckbox.addEventListener('change', async () => {
      const showReferences = showReferencesCheckbox.checked;
      // Persist in session
      await ipcRenderer.invoke('update-session', { showReferenceNumbers: showReferences });
      // Update session state
      if (session) {
        session.showReferenceNumbers = showReferences;
      }
      // Re-render to show/hide references
      await loadCurrentWord();
      await renderGroups();
    });
  }
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
      alert(window.i18n.t('tm_failed_load_bundle', { error: result.error }));
      return;
    }
    
    bundleSettings = result.settings;
    session = result.session;
    bundleType = result.bundleType || (result.requiresNavigation ? 'hierarchical' : 'legacy');
    
    // Check if this is a hierarchical bundle
    if (result.requiresNavigation && result.bundleType === 'hierarchical') {
      // Show navigation screen for hierarchical bundles
      document.getElementById('welcomeScreen').classList.add('hidden');
      document.getElementById('navigationScreen').classList.remove('hidden');
      document.getElementById('workArea').classList.add('hidden');
      
      // Render hierarchy tree
      renderHierarchyTree(result.hierarchy, result.session.subBundles);
      return;
    }
    
    // Legacy bundle or returning from sub-bundle
    // Notify user if this is a re-import
    if (result.isReimport && result.importedGroups > 0) {
      alert(window.i18n.t('tm_reimport_success', { 
        count: result.importedGroups 
      }));
    }
    
    // Initialize UI
    initializeAudioVariants();
    updateProgressIndicator();
    initializeReferenceToggle();
    
    // Show work area
    document.getElementById('welcomeScreen').classList.add('hidden');
    document.getElementById('navigationScreen').classList.add('hidden');
    document.getElementById('workArea').classList.remove('hidden');
    
    // Show sub-bundle indicator if hierarchical
    if (session.bundleType === 'hierarchical' && session.currentSubBundle) {
      currentSubBundle = session.currentSubBundle;
      document.getElementById('subBundleIndicator').classList.remove('hidden');
      document.getElementById('subBundlePath').textContent = currentSubBundle;
      document.getElementById('backToNavBtn').classList.remove('hidden');
      // Show hierarchical export section
      document.getElementById('hierarchicalExportSection').classList.remove('hidden');
      document.getElementById('legacyExportSection').classList.add('hidden');
    } else {
      document.getElementById('subBundleIndicator').classList.add('hidden');
      document.getElementById('backToNavBtn').classList.add('hidden');
      // Show legacy export section
      document.getElementById('hierarchicalExportSection').classList.add('hidden');
      document.getElementById('legacyExportSection').classList.remove('hidden');
    }
    
    // Load current word and groups
    await loadCurrentWord();
    renderGroups();
    updateUndoRedoButtons();
    
  } catch (error) {
    alert(window.i18n.t('tm_error_loading_bundle', { error: error.message }));
  }
}

function renderHierarchyTree(hierarchy, subBundles) {
  const treeContainer = document.getElementById('hierarchyTree');
  treeContainer.innerHTML = '';
  
  // Build tree structure from flat sub-bundle list
  const tree = buildTreeStructure(subBundles);
  
  // Render tree nodes
  const rootNode = document.createElement('div');
  rootNode.className = 'hierarchy-level';
  renderTreeNode(tree, rootNode, subBundles);
  treeContainer.appendChild(rootNode);
}

function buildTreeStructure(subBundles) {
  const tree = {};
  
  subBundles.forEach(sb => {
    const parts = sb.path.split('/');
    let current = tree;
    
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          isLeaf: index === parts.length - 1,
          subBundle: index === parts.length - 1 ? sb : null,
          children: {}
        };
      }
      current = current[part].children;
    });
  });
  
  return tree;
}

function renderTreeNode(treeNode, container, subBundles, depth = 0) {
  Object.keys(treeNode).forEach(key => {
    const node = treeNode[key];
    
    if (node.isLeaf && node.subBundle) {
      // Leaf node - render as sub-bundle item
      const item = createSubBundleItem(node.subBundle);
      container.appendChild(item);
    } else {
      // Category node - render as collapsible category
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'category-node';
      
      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = `
        <span class="toggle">▼</span>
        <span class="label">${node.name}</span>
        <span class="count">${countSubBundles(node.children)} items</span>
      `;
      
      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'category-children';
      
      // Toggle functionality
      header.addEventListener('click', () => {
        childrenDiv.classList.toggle('collapsed');
        header.querySelector('.toggle').textContent = childrenDiv.classList.contains('collapsed') ? '▶' : '▼';
      });
      
      categoryDiv.appendChild(header);
      categoryDiv.appendChild(childrenDiv);
      container.appendChild(categoryDiv);
      
      // Recursively render children
      renderTreeNode(node.children, childrenDiv, subBundles, depth + 1);
    }
  });
}

function countSubBundles(children) {
  let count = 0;
  Object.keys(children).forEach(key => {
    const node = children[key];
    if (node.isLeaf) {
      count++;
    } else {
      count += countSubBundles(node.children);
    }
  });
  return count;
}

function createSubBundleItem(subBundle) {
  const item = document.createElement('div');
  item.className = 'sub-bundle-item';
  
  const assignedCount = subBundle.assignedCount || 0;
  const totalCount = subBundle.recordCount || 0;
  const progressPercent = totalCount > 0 ? (assignedCount / totalCount * 100) : 0;
  const isComplete = assignedCount === totalCount && totalCount > 0;
  const isPartial = assignedCount > 0 && assignedCount < totalCount;
  
  // Review status icons
  let reviewIcon = '○'; // Not started
  if (subBundle.reviewed && isComplete) {
    reviewIcon = '✓'; // Reviewed and complete
  } else if (isComplete && !subBundle.reviewed) {
    reviewIcon = '⚠️'; // Complete but needs review
  } else if (isPartial) {
    reviewIcon = '◐'; // In progress
  }
  
  item.innerHTML = `
    <div class="info">
      <div class="name">${subBundle.path.split('/').pop()}</div>
      <div class="progress-bar">
        <div class="progress-fill ${isPartial ? 'partial' : ''}" style="width: ${progressPercent}%"></div>
      </div>
      <div class="stats">${assignedCount} / ${totalCount} words assigned</div>
    </div>
    <div class="review-status" title="${getReviewStatusText(subBundle, isComplete)}">${reviewIcon}</div>
  `;
  
  item.addEventListener('click', () => selectSubBundle(subBundle.path));
  
  return item;
}

function getReviewStatusText(subBundle, isComplete) {
  if (subBundle.reviewed && isComplete) return 'Reviewed';
  if (isComplete && !subBundle.reviewed) return 'Needs review';
  if (subBundle.assignedCount > 0) return 'In progress';
  return 'Not started';
}

async function selectSubBundle(subBundlePath) {
  try {
    const result = await ipcRenderer.invoke('load-sub-bundle', subBundlePath);
    if (!result.success) {
      alert(`Failed to load sub-bundle: ${result.error}`);
      return;
    }
    
    // Update session (but keep bundleSettings from initial bundle load)
    session = result.session;
    // Note: bundleSettings remains from the initial bundle load
    
    // Notify if re-import
    if (result.isReimport && result.importedGroups > 0) {
      alert(`Re-import successful! Loaded ${result.importedGroups} tone groups.`);
    }
    
    // Initialize UI
    initializeAudioVariants();
    updateProgressIndicator();
    initializeReferenceToggle();
    
    // Show work area
    document.getElementById('navigationScreen').classList.add('hidden');
    document.getElementById('workArea').classList.remove('hidden');
    
    // Show sub-bundle indicator and back button
    document.getElementById('subBundleIndicator').classList.remove('hidden');
    document.getElementById('subBundlePath').textContent = subBundlePath;
    document.getElementById('backToNavBtn').classList.remove('hidden');
    
    // Load current word and groups
    await loadCurrentWord();
    renderGroups();
    
  } catch (error) {
    alert(`Error loading sub-bundle: ${error.message}`);
  }
}

async function backToNavigation() {
  try {
    const result = await ipcRenderer.invoke('navigate-to-hierarchy');
    if (!result.success) {
      alert(`Failed to return to navigation: ${result.error}`);
      return;
    }
    
    // Update session
    session = result.session || session;
    
    // Hide work area and back button
    document.getElementById('workArea').classList.add('hidden');
    document.getElementById('backToNavBtn').classList.add('hidden');
    
    // Show navigation screen
    document.getElementById('navigationScreen').classList.remove('hidden');
    
    // Re-render hierarchy tree with updated progress
    renderHierarchyTree(result.hierarchy, result.subBundles);
    
  } catch (error) {
    alert(`Error returning to navigation: ${error.message}`);
  }
}

function initializeAudioVariants() {
  const select = document.getElementById('audioVariantSelect');
  select.innerHTML = '';
  
  const variants = bundleSettings.audioFileVariants || [{ description: window.i18n.t('tm_defaultVariant'), suffix: '' }];
  variants.forEach((variant, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = variant.description || window.i18n.t('tm_variant_number', { number: index + 1 });
    select.appendChild(option);
  });
  
  select.value = session.selectedAudioVariantIndex || 0;
  select.addEventListener('change', async () => {
    session.selectedAudioVariantIndex = parseInt(select.value);
    await ipcRenderer.invoke('update-session', { selectedAudioVariantIndex: session.selectedAudioVariantIndex });
  });
}

function initializeReferenceToggle() {
  const checkbox = document.getElementById('showReferencesCheckbox');
  if (!checkbox) return;
  
  // Priority: session preference > bundleSettings > default (true)
  let showReferences = true;
  if (session.showReferenceNumbers !== undefined) {
    showReferences = session.showReferenceNumbers;
  } else if (bundleSettings.showReferenceNumbers !== undefined) {
    showReferences = bundleSettings.showReferenceNumbers;
  }
  
  checkbox.checked = showReferences;
  
  // Update session to reflect current state
  if (session.showReferenceNumbers === undefined) {
    session.showReferenceNumbers = showReferences;
  }
}

function updateProgressIndicator() {
  const total = session.queue.length + getTotalAssignedWords();
  const completed = getTotalAssignedWords();
  document.getElementById('progressIndicator').textContent = window.i18n.t('tm_progressFormat', { completed, total });
}

function getTotalAssignedWords() {
  return session.groups.reduce((sum, g) => sum + (g.members || []).length, 0);
}

async function loadCurrentWord() {
  currentWord = await ipcRenderer.invoke('get-current-word');
  
  if (!currentWord) {
    // No more words - check if this is completion
    checkCompletion();
    document.querySelector('.word-panel').innerHTML = `<h2>${window.i18n.t('tm_allWordsAssigned_title')}</h2><p>${window.i18n.t('tm_allWordsAssigned_message')}</p>`;
    return;
  }
  
  // Hide completion message if word exists
  document.getElementById('completionMessage').classList.add('hidden');
  
  // Update written form
  const writtenFormLine = document.getElementById('writtenFormLine');
  if (bundleSettings.showWrittenForm && bundleSettings.writtenFormElements) {
    const writtenParts = bundleSettings.writtenFormElements
      .map(elem => currentWord[elem])
      .filter(val => val != null && val !== '');
  writtenFormLine.textContent = writtenParts.join(' ') || window.i18n.t('tm_no_written_form');
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
  
  // Update reference number
  const referenceLine = document.getElementById('referenceLine');
  const showReferences = session.showReferenceNumbers !== undefined 
    ? session.showReferenceNumbers 
    : (bundleSettings.showReferenceNumbers !== undefined ? bundleSettings.showReferenceNumbers : true);
  
  if (showReferences && currentWord.Reference) {
    referenceLine.textContent = `Reference: ${currentWord.Reference}`;
    referenceLine.style.display = 'block';
  } else {
    referenceLine.style.display = 'none';
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
  
  // Update Move Word button state (hierarchical bundles only)
  updateMoveWordButton();
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
    alert(window.i18n.t('tm_enter_spelling_alert'));
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
    addWordHint.textContent = window.i18n.t('tm_addWord_hint_needGroup');
    addWordHint.classList.remove('hidden');
  } else if (needsSpelling && !hasSpelling) {
    addWordHint.textContent = window.i18n.t('tm_addWord_hint_needSpelling');
    addWordHint.classList.remove('hidden');
  } else {
    addWordHint.classList.add('hidden');
  }
}

function updateMoveWordButton() {
  const moveWordBtn = document.getElementById('moveWordBtn');
  
  if (!moveWordBtn) return;
  
  console.log('[updateMoveWordButton] session.bundleType:', session?.bundleType);
  console.log('[updateMoveWordButton] currentWord:', currentWord?.Reference);
  
  // Only show for hierarchical bundles
  if (session.bundleType !== 'hierarchical') {
    moveWordBtn.style.display = 'none';
    return;
  }
  
  moveWordBtn.style.display = 'inline-block';
  
  // Check if current word is in any group
  const ref = currentWord?.Reference;
  if (!ref) {
    moveWordBtn.disabled = true;
    return;
  }
  
  const isInGroup = session.groups.some(group => 
    group.members && group.members.includes(ref)
  );
  
  console.log('[updateMoveWordButton] isInGroup:', isInGroup, 'will disable:', isInGroup);
  moveWordBtn.disabled = isInGroup;
}

async function initiateWordMove() {
  console.log('[initiateWordMove] Called, currentWord:', currentWord?.Reference);
  if (!currentWord) return;
  
  const ref = currentWord.Reference;
  
  // Check if word is in any group
  const isInGroup = session.groups.some(group => 
    group.members && group.members.includes(ref)
  );
  
  console.log('[initiateWordMove] isInGroup:', isInGroup);
  
  if (isInGroup) {
    alert(window.i18n.t('tm_wordMustBeUnassigned'));
    return;
  }
  
  console.log('[initiateWordMove] Opening modal...');
  // Open the move modal
  await openMoveWordModal(ref, currentWord);
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
    alert(window.i18n.t('tm_group_review_alert', { groupNumber: group.groupNumber, additions: group.additionsSinceReview }));
    await ipcRenderer.invoke('update-group', currentGroupId, { requiresReview: true });
  }
  
  // Update UI
  updateProgressIndicator();
  renderGroups();
  await loadCurrentWord();
  
  // Update move button state since word was added to group
  updateMoveWordButton();
}

async function removeWordFromGroup(ref, groupId) {
  await ipcRenderer.invoke('remove-word-from-group', ref, groupId);
  
  // Update session locally
  const group = session.groups.find(g => g.id === groupId);
  if (group) {
    group.members = (group.members || []).filter(m => m !== ref);
    // Auto-unmark if group was reviewed
    if (group.additionsSinceReview !== undefined) {
      group.additionsSinceReview++;
    }
  }
  
  // Add to front of queue
  if (!session.queue.includes(ref)) {
    session.queue.unshift(ref);
  }
  
  // Update UI
  updateProgressIndicator();
  renderGroups();
  await loadCurrentWord();
  
  // Update move button state since word was removed from group
  updateMoveWordButton();
}

async function getCachedRecord(ref) {
  if (recordCache.has(ref)) {
    return recordCache.get(ref);
  }
  const record = await ipcRenderer.invoke('get-record-by-ref', ref);
  if (record) {
    recordCache.set(ref, record);
  }
  return record;
}

async function playMemberAudio(ref) {
  const record = await getCachedRecord(ref);
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
    groupsList.innerHTML = `<div class="no-bundle">${window.i18n.t('tm_noGroups')}.</div>`;
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
  groupNumber.textContent = window.i18n.t('tm_groupNumber', { number: group.groupNumber });
    header.appendChild(groupNumber);
    
    // Button container for header actions
    const headerActions = document.createElement('div');
    headerActions.style.display = 'flex';
    headerActions.style.gap = '8px';
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️ Edit';
    editBtn.className = 'secondary';
    editBtn.style.fontSize = '12px';
    editBtn.style.padding = '4px 8px';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openEditGroupModal(group.id);
    };
    headerActions.appendChild(editBtn);
    
    if (group.requiresReview) {
      const reviewBadge = document.createElement('button');
  reviewBadge.textContent = `✓ ${window.i18n.t('tm_markReviewed')}`;
      reviewBadge.className = 'secondary';
      reviewBadge.style.fontSize = '12px';
      reviewBadge.style.padding = '4px 8px';
      reviewBadge.onclick = (e) => {
        e.stopPropagation();
        markGroupReviewed(group.id);
      };
      headerActions.appendChild(reviewBadge);
    }
    
    header.appendChild(headerActions);
    
    card.appendChild(header);
    
    // Enhanced Display (pitch transcription, tone abbreviation, exemplar)
    if (group.pitchTranscription || group.toneAbbreviation || group.exemplarWord) {
      const enhancedDisplay = document.createElement('div');
      enhancedDisplay.className = 'group-enhanced-display';
      
      if (group.pitchTranscription) {
        const pitchDiv = document.createElement('div');
        pitchDiv.className = 'group-pitch-transcription';
        pitchDiv.textContent = group.pitchTranscription;
        enhancedDisplay.appendChild(pitchDiv);
      }
      
      if (group.toneAbbreviation) {
        const abbrevDiv = document.createElement('div');
        abbrevDiv.className = 'group-tone-abbreviation';
        abbrevDiv.textContent = group.toneAbbreviation;
        enhancedDisplay.appendChild(abbrevDiv);
      }
      
      if (group.exemplarWord) {
        const exemplarDiv = document.createElement('div');
        exemplarDiv.className = 'group-exemplar';
        exemplarDiv.textContent = group.exemplarWord;
        
        // Add reference number if configured and available
        const showReferences = session.showReferenceNumbers !== undefined 
          ? session.showReferenceNumbers 
          : (bundleSettings.showReferenceNumbers !== undefined ? bundleSettings.showReferenceNumbers : true);
        
        if (showReferences && group.exemplarWordRef) {
          const refSpan = document.createElement('span');
          refSpan.className = 'ref';
          refSpan.textContent = `(${group.exemplarWordRef})`;
          exemplarDiv.appendChild(refSpan);
        }
        
        enhancedDisplay.appendChild(exemplarDiv);
      }
      
      card.appendChild(enhancedDisplay);
    }
    
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
  removeImgBtn.textContent = window.i18n.t('tm_removeImage');
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
  placeholder.textContent = window.i18n.t('tm_clickAddImage');
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
      
      // Batch fetch all records for this group
      const memberRecords = await Promise.all(
        group.members.map(ref => getCachedRecord(ref))
      );
      
      for (let i = 0; i < group.members.length; i++) {
        const ref = group.members[i];
        const record = memberRecords[i];
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        
        const memberText = document.createElement('div');
        memberText.className = 'member-text';
        
        // Get display lines
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
        
        // Add reference number if enabled
        const showReferences = session.showReferenceNumbers !== undefined 
          ? session.showReferenceNumbers 
          : (bundleSettings.showReferenceNumbers !== undefined ? bundleSettings.showReferenceNumbers : true);
        
        if (showReferences && ref) {
          const refLine = document.createElement('div');
          refLine.className = 'member-ref';
          refLine.style.color = '#999';
          refLine.style.fontSize = '11px';
          refLine.style.marginTop = '2px';
          refLine.textContent = ref;
          memberText.appendChild(refLine);
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
      emptyMsg.textContent = window.i18n.t('tm_noMembersYet');
      card.appendChild(emptyMsg);
    }
    
    groupsList.appendChild(card);
  }
  
  // Update review status display
  updateReviewStatusDisplay();
}

async function exportBundle() {
  const result = await ipcRenderer.invoke('export-bundle');
  if (result.success) {
    alert(window.i18n.t('tm_export_success', { outputPath: result.outputPath }));
  } else {
    alert(window.i18n.t('tm_export_failed', { error: result.error }));
  }
}

async function exportHierarchicalBundle() {
  if (bundleType !== 'hierarchical') {
    alert('This function is only available for hierarchical bundles');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-bundle');
  if (result.success) {
    alert(`Complete session exported successfully!\n\nLocation: ${result.outputPath}`);
  } else {
    alert(`Export failed: ${result.error}`);
  }
}

async function exportCurrentSubBundle() {
  if (bundleType !== 'hierarchical' || !currentSubBundle) {
    alert('No sub-bundle selected');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-sub-bundle', { subBundlePath: currentSubBundle });
  if (result.success) {
    alert(`Sub-bundle exported successfully!\n\nLocation: ${result.outputPath}`);
  } else {
    alert(`Export failed: ${result.error}`);
  }
}

async function resetSession() {
  const result = await ipcRenderer.invoke('reset-session');
  
  if (result.cancelled) {
    // User cancelled
    return;
  }
  
  if (!result.success) {
    alert(window.i18n.t('tm_reset_failed', { error: result.error || 'Unknown error' }));
    return;
  }
  
  // Update local session
  session = result.session;
  currentGroupId = null;
  recordCache.clear();
  
  // Refresh UI
  updateProgressIndicator();
  renderGroups();
  await loadCurrentWord();
  
  alert(window.i18n.t('tm_reset_success', 'Session has been reset'));
}

// Undo/Redo Functions

async function undo() {
  const result = await ipcRenderer.invoke('undo');
  if (result.success) {
    // Refresh UI
    await loadCurrentWord();
    renderGroups();
    updateProgressIndicator();
    updateUndoRedoButtons();
  } else {
    alert(`Undo failed: ${result.error}`);
  }
}

async function redo() {
  const result = await ipcRenderer.invoke('redo');
  if (result.success) {
    // Refresh UI
    await loadCurrentWord();
    renderGroups();
    updateProgressIndicator();
    updateUndoRedoButtons();
  } else {
    alert(`Redo failed: ${result.error}`);
  }
}

async function updateUndoRedoButtons() {
  const state = await ipcRenderer.invoke('get-undo-redo-state');
  document.getElementById('undoBtn').disabled = !state.canUndo;
  document.getElementById('redoBtn').disabled = !state.canRedo;
}

// Edit Group Modal Functions

function openEditGroupModal(groupId) {
  const group = session.groups.find(g => g.id === groupId);
  if (!group) return;
  
  editingGroupId = groupId;
  
  // Populate form fields
  document.getElementById('editGroupTitle').textContent = `Edit Group ${group.groupNumber}`;
  document.getElementById('pitchTranscriptionInput').value = group.pitchTranscription || '';
  document.getElementById('toneAbbreviationInput').value = group.toneAbbreviation || '';
  document.getElementById('exemplarWordInput').value = group.exemplarWord || '';
  document.getElementById('exemplarWordRefInput').value = group.exemplarWordRef || '';
  document.getElementById('markReviewedCheckbox').checked = false;
  
  // Show modal
  document.getElementById('editGroupModal').classList.remove('hidden');
}

function closeEditGroupModal() {
  editingGroupId = null;
  document.getElementById('editGroupModal').classList.add('hidden');
  
  // Clear form
  document.getElementById('pitchTranscriptionInput').value = '';
  document.getElementById('toneAbbreviationInput').value = '';
  document.getElementById('exemplarWordInput').value = '';
  document.getElementById('exemplarWordRefInput').value = '';
  document.getElementById('markReviewedCheckbox').checked = false;
}

async function saveGroupEdits() {
  if (!editingGroupId) return;
  
  const group = session.groups.find(g => g.id === editingGroupId);
  if (!group) return;
  
  // Get values from form
  const pitchTranscription = document.getElementById('pitchTranscriptionInput').value.trim() || null;
  const toneAbbreviation = document.getElementById('toneAbbreviationInput').value.trim() || null;
  const exemplarWord = document.getElementById('exemplarWordInput').value.trim() || null;
  const exemplarWordRef = document.getElementById('exemplarWordRefInput').value.trim() || null;
  const markReviewed = document.getElementById('markReviewedCheckbox').checked;
  
  // Check if metadata changed (for auto-unmark)
  const metadataChanged = 
    group.pitchTranscription !== pitchTranscription ||
    group.toneAbbreviation !== toneAbbreviation ||
    group.exemplarWord !== exemplarWord ||
    group.exemplarWordRef !== exemplarWordRef;
  
  // Update group in session
  group.pitchTranscription = pitchTranscription;
  group.toneAbbreviation = toneAbbreviation;
  group.exemplarWord = exemplarWord;
  group.exemplarWordRef = exemplarWordRef;
  
  if (markReviewed) {
    group.additionsSinceReview = 0;
    group.requiresReview = false;
  } else if (metadataChanged && group.additionsSinceReview === 0) {
    // Auto-unmark if metadata changed and group was previously reviewed
    group.additionsSinceReview = 1;
  }
  
  // Update via IPC
  await ipcRenderer.invoke('update-group', editingGroupId, {
    pitchTranscription,
    toneAbbreviation,
    exemplarWord,
    exemplarWordRef,
    ...(markReviewed ? { additionsSinceReview: 0, requiresReview: false } : 
        metadataChanged && group.additionsSinceReview > 0 ? { additionsSinceReview: group.additionsSinceReview } : {})
  });
  
  // Update session
  await ipcRenderer.invoke('update-session', { groups: session.groups });
  
  // Close modal and re-render
  closeEditGroupModal();
  renderGroups();
  updateReviewStatusDisplay();
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('editGroupModal');
  if (e.target === modal) {
    closeEditGroupModal();
  }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const editModal = document.getElementById('editGroupModal');
    if (!editModal.classList.contains('hidden')) {
      closeEditGroupModal();
    }
    const moveModal = document.getElementById('moveWordModal');
    if (!moveModal.classList.contains('hidden')) {
      closeMoveWordModal();
    }
  }
});

// Move Word Modal Functions (Hierarchical bundles only)

async function openMoveWordModal(ref, record) {
  // Only for hierarchical bundles
  if (session.bundleType !== 'hierarchical') {
    return;
  }
  
  movingWordRef = ref;
  selectedTargetSubBundle = null;
  
  // Get word display text
  let wordText = ref;
  if (record) {
    const glossText = bundleSettings.glossElement && record[bundleSettings.glossElement];
    const userSpelling = session.records[ref]?.userSpelling;
    wordText = glossText || userSpelling || ref;
  }
  
  document.getElementById('moveWordText').textContent = wordText;
  
  // Get hierarchy data from session or backend
  const hierarchyData = await ipcRenderer.invoke('get-hierarchy-data');
  if (!hierarchyData.success) {
    alert('Failed to load hierarchy data');
    return;
  }
  
  // Render tree
  renderMoveWordTree(hierarchyData.hierarchy, hierarchyData.subBundles);
  
  // Show modal
  document.getElementById('moveWordModal').classList.remove('hidden');
  document.getElementById('confirmMoveBtn').disabled = true;
}

function closeMoveWordModal() {
  // Allow closing - user is canceling the move operation
  document.getElementById('moveWordModal').classList.add('hidden');
  movingWordRef = null;
  selectedTargetSubBundle = null;
}

function renderMoveWordTree(hierarchy, subBundles) {
  const treeContainer = document.getElementById('moveWordTree');
  if (!treeContainer) {
    console.error('[renderMoveWordTree] moveWordTree element not found');
    return;
  }
  
  treeContainer.innerHTML = '';
  
  console.log('[renderMoveWordTree] hierarchy:', hierarchy);
  console.log('[renderMoveWordTree] subBundles:', subBundles);
  
  function renderNode(nodes, level = 0) {
    if (!Array.isArray(nodes)) {
      console.error('[renderNode] nodes is not an array:', nodes);
      return;
    }
    
    nodes.forEach(node => {
      const hasChildren = node.children && node.children.length > 0;
      
      if (hasChildren) {
        // Category node - render as non-selectable header
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'move-tree-category';
        categoryDiv.style.paddingLeft = `${level * 20}px`;
        categoryDiv.textContent = node.label || node.value;
        treeContainer.appendChild(categoryDiv);
        
        // Recursively render children
        renderNode(node.children, level + 1);
      } else {
        // Bottom-level node - render as selectable sub-bundle
        const subBundlePath = node.value;
        const subBundle = subBundles.find(sb => sb.path === subBundlePath);
        
        if (subBundle) {
          const isCurrent = subBundlePath === session.currentSubBundle;
          
          const itemDiv = document.createElement('div');
          itemDiv.className = 'move-tree-sub-bundle';
          if (isCurrent) {
            itemDiv.classList.add('current');
          }
          itemDiv.style.paddingLeft = `${level * 20}px`;
          
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'targetSubBundle';
          radio.value = subBundlePath;
          radio.disabled = isCurrent;
          radio.onchange = () => selectTargetSubBundle(subBundlePath);
          
          const label = document.createElement('span');
          label.className = 'move-tree-sub-bundle-label';
          label.textContent = node.label || subBundle.path.split('/').pop();
          
          const info = document.createElement('span');
          info.className = 'move-tree-sub-bundle-info';
          if (isCurrent) {
            info.textContent = '(current)';
          } else {
            info.textContent = `(${subBundle.assignedCount || 0}/${subBundle.recordCount || 0} words)`;
          }
          
          itemDiv.appendChild(radio);
          itemDiv.appendChild(label);
          itemDiv.appendChild(info);
          
          if (!isCurrent) {
            itemDiv.onclick = () => {
              radio.checked = true;
              selectTargetSubBundle(subBundlePath);
            };
          }
          
          treeContainer.appendChild(itemDiv);
        }
      }
    });
  }
  
  // Handle new tree structure: {tree: {field, values: [...]}, audioVariants}
  let treeData;
  if (hierarchy.tree && hierarchy.tree.values) {
    // New hierarchical structure
    treeData = hierarchy.tree.values;
  } else if (hierarchy.tree && Array.isArray(hierarchy.tree)) {
    // Legacy structure with tree as array
    treeData = hierarchy.tree;
  } else if (Array.isArray(hierarchy)) {
    // Direct array
    treeData = hierarchy;
  } else {
    console.error('[renderMoveWordTree] Invalid hierarchy structure:', hierarchy);
    treeData = [];
  }
  
  console.log('[renderMoveWordTree] Using treeData:', treeData);
  renderNode(treeData);
}

function selectTargetSubBundle(subBundlePath) {
  console.log('[selectTargetSubBundle] Selected:', subBundlePath);
  selectedTargetSubBundle = subBundlePath;
  
  // Update visual selection
  document.querySelectorAll('.move-tree-sub-bundle').forEach(item => {
    item.classList.remove('selected');
  });
  
  const selectedRadio = document.querySelector(`input[name="targetSubBundle"][value="${subBundlePath}"]`);
  if (selectedRadio) {
    selectedRadio.closest('.move-tree-sub-bundle').classList.add('selected');
  }
  
  // Enable move button
  document.getElementById('confirmMoveBtn').disabled = false;
}

async function confirmMoveWord() {
  console.log('[confirmMoveWord] movingWordRef:', movingWordRef, 'selectedTargetSubBundle:', selectedTargetSubBundle);
  
  if (!movingWordRef || !selectedTargetSubBundle) {
    alert('Please select a target sub-bundle');
    return;
  }
  
  // Save the current sub-bundle to return to after move
  const originalSubBundle = session.currentSubBundle;
  
  // Call backend to move word
  const result = await ipcRenderer.invoke('move-word-to-sub-bundle', {
    ref: movingWordRef,
    targetSubBundle: selectedTargetSubBundle,
    returnToOriginal: true
  });
  
  if (result.success) {
    // Save target name before closing modal (which clears selectedTargetSubBundle)
    const targetName = selectedTargetSubBundle.includes('/') 
      ? selectedTargetSubBundle.split('/').pop() 
      : selectedTargetSubBundle;
    
    // Update session
    session = result.session;
    
    // Close modal
    closeMoveWordModal();
    
    // Show success message
    alert(`Moved word to ${targetName}. You can return to this word later.`);
    
    // Re-render UI - should still be in original sub-bundle
    updateProgressIndicator();
    renderGroups();
    await loadCurrentWord();
  } else {
    alert(`Failed to move word: ${result.error}`);
  }
}

// Review Status Management

function checkCompletion() {
  // Only for hierarchical bundles when all words assigned
  if (session.bundleType !== 'hierarchical') {
    return;
  }
  
  const totalWords = session.queue.length + getTotalAssignedWords();
  const assignedWords = getTotalAssignedWords();
  
  if (assignedWords === totalWords && totalWords > 0) {
    // All words assigned
    const reviewedGroups = session.groups.filter(g => !g.requiresReview && g.additionsSinceReview === 0).length;
    const totalGroups = session.groups.length;
    
    let detailsText = `${totalGroups} tone groups created`;
    if (reviewedGroups < totalGroups) {
      detailsText += `, ${reviewedGroups} reviewed`;
    } else {
      detailsText += `, all reviewed ✓`;
    }
    
    document.getElementById('completionDetails').textContent = detailsText;
    document.getElementById('completionMessage').classList.remove('hidden');
    
    // Show mark all reviewed button in header if not all reviewed
    const markBtn = document.getElementById('markAllReviewedBtn');
    if (markBtn && reviewedGroups < totalGroups) {
      markBtn.style.display = 'block';
    } else if (markBtn) {
      markBtn.style.display = 'none';
    }
  } else {
    document.getElementById('completionMessage').classList.add('hidden');
  }
}

async function markAllGroupsReviewed() {
  if (!session || !session.groups) {
    return;
  }
  
  // Mark all groups as reviewed
  for (const group of session.groups) {
    group.additionsSinceReview = 0;
    group.requiresReview = false;
  }
  
  // Update via IPC
  await ipcRenderer.invoke('mark-all-groups-reviewed');
  
  // Update session
  await ipcRenderer.invoke('update-session', { groups: session.groups });
  
  // Update sub-bundle reviewed status for hierarchical bundles
  if (session.bundleType === 'hierarchical') {
    await ipcRenderer.invoke('mark-sub-bundle-reviewed', { reviewed: true });
  }
  
  // Re-render
  renderGroups();
  checkCompletion();
  
  alert('All groups marked as reviewed');
}

function updateReviewStatusDisplay() {
  // Update mark all reviewed button visibility
  if (session.bundleType === 'hierarchical') {
    const markBtn = document.getElementById('markAllReviewedBtn');
    if (markBtn) {
      const allReviewed = session.groups.every(g => !g.requiresReview && g.additionsSinceReview === 0);
      markBtn.style.display = allReviewed ? 'none' : 'block';
    }
  }
}
