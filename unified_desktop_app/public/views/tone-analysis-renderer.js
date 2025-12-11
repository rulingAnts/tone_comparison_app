/**
 * Tone Analysis Renderer
 * Handles tone group matching interface
 */

console.log('[tone-analysis] Initializing...');

// Check for active bundle when view loads
async function checkForActiveBundle() {
  console.log('[tone-analysis] Checking for active bundle...');
  
  try {
    const bundleMetadata = await window.electronAPI.invoke('bundler:get-active-bundle');
    
    if (bundleMetadata) {
      console.log('[tone-analysis] Active bundle found:', bundleMetadata);
      loadBundle(bundleMetadata);
    } else {
      console.log('[tone-analysis] No active bundle');
      showNoBundleState();
    }
  } catch (error) {
    console.error('[tone-analysis] Error checking for active bundle:', error);
    showNoBundleState();
  }
}

function showNoBundleState() {
  document.querySelector('.no-bundle').style.display = 'block';
  document.getElementById('bundle-interface').style.display = 'none';
}

function loadBundle(metadata) {
  console.log('[tone-analysis] Loading bundle with metadata:', metadata);
  
  // Hide no-bundle state
  document.querySelector('.no-bundle').style.display = 'none';
  
  // Show bundle interface
  const bundleInterface = document.getElementById('bundle-interface');
  bundleInterface.style.display = 'block';
  
  // Update interface with bundle information
  bundleInterface.innerHTML = `
    <div class="section">
      <h2>📦 Bundle Information</h2>
      <div style="background: #e8f5e9; padding: 1rem; border-radius: 4px; border-left: 4px solid #4caf50;">
        <p><strong>Type:</strong> Linked Bundle</p>
        <p><strong>XML Source:</strong> ${metadata.linkedXmlPath}</p>
        <p><strong>Audio Folder:</strong> ${metadata.linkedAudioFolder}</p>
        <p><strong>Records:</strong> ${metadata.recordsIncluded || metadata.recordCount} included${metadata.recordsExcluded ? `, ${metadata.recordsExcluded} excluded` : ''}</p>
        <p><strong>Audio Files:</strong> ${metadata.audioFileCount}</p>
      </div>
    </div>
    
    <div class="section">
      <h2>📊 Hierarchy Structure</h2>
      <div style="background: #f5f5f5; padding: 1rem; border-radius: 4px;">
        ${renderHierarchyPreview(metadata.hierarchyTree)}
      </div>
    </div>
    
    <div class="section">
      <h2>🔧 Next Steps</h2>
      <div style="background: #fff3cd; padding: 1rem; border-radius: 4px; border-left: 4px solid #ffc107;">
        <p><strong>The matching interface is being implemented.</strong></p>
        <p>For now, you can verify that the bundle was created successfully and the data is accessible.</p>
        <p style="margin-top: 1rem;">
          <button onclick="goBackToImport()">← Back to Import</button>
          <button onclick="showBundleDetails()" style="margin-left: 0.5rem;">View Full Bundle Details</button>
        </p>
      </div>
    </div>
  `;
  
  // Store metadata globally for other functions to use
  window.currentBundleMetadata = metadata;
}

function renderHierarchyPreview(hierarchyTree) {
  if (!hierarchyTree) {
    return '<p style="color: #999;">No hierarchy defined</p>';
  }
  
  let html = '<ul style="margin: 0; padding-left: 20px;">';
  html += `<li><strong>${hierarchyTree.field || '(root)'}</strong>`;
  
  if (hierarchyTree.values && hierarchyTree.values.length > 0) {
    const includedCount = hierarchyTree.values.filter(v => v.included !== false).length;
    html += ` - ${includedCount} values`;
    
    // Show first few values as preview
    const preview = hierarchyTree.values.slice(0, 3).map(v => v.value).join(', ');
    if (hierarchyTree.values.length > 3) {
      html += ` (${preview}, ...)`;
    } else {
      html += ` (${preview})`;
    }
  }
  
  html += '</li></ul>';
  return html;
}

function goBackToImport() {
  window.electronAPI.invoke('switch-view', 'import');
}

function showBundleDetails() {
  if (!window.currentBundleMetadata) return;
  
  const details = JSON.stringify(window.currentBundleMetadata, null, 2);
  
  // Create modal to show details
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
  modal.innerHTML = `
    <div style="background: white; max-width: 800px; max-height: 80vh; overflow: auto; padding: 2rem; border-radius: 8px;">
      <h2>Bundle Metadata</h2>
      <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto;">${details}</pre>
      <button onclick="this.closest('div[style*=fixed]').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Setup button handlers
document.getElementById('load-bundle')?.addEventListener('click', async () => {
  console.log('[tone-analysis] Load bundle clicked');
  // TODO: Show file picker for .tnset files
  alert('Load Bundle feature coming soon!\n\nFor now, create a bundle from the Import tab.');
});

document.getElementById('go-to-bundler')?.addEventListener('click', () => {
  console.log('[tone-analysis] Go to bundler clicked');
  window.electronAPI.invoke('switch-view', 'import');
});

// Check for active bundle on load
checkForActiveBundle();

console.log('[tone-analysis] Initialization complete');
