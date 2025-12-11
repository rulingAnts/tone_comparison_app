// Main Window Tab Switching Logic

// Track which views have been loaded
const loadedViews = new Set();

// Load a view's HTML content dynamically
async function loadViewContent(viewName) {
  if (loadedViews.has(viewName)) {
    return; // Already loaded
  }

  const viewContainer = document.getElementById(`${viewName}-view`);
  if (!viewContainer) return;

  try {
    const viewFiles = {
      'import': 'views/import-data.html',
      'analysis': 'views/tone-analysis.html',
      'export': 'views/export-mobile.html',
      'import-mobile': 'views/import-mobile.html'
    };

    const response = await fetch(viewFiles[viewName]);
    const html = await response.text();
    
    // Parse the HTML to extract just the body content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Copy styles from the loaded HTML
    const styles = doc.querySelectorAll('style');
    styles.forEach(style => {
      const newStyle = document.createElement('style');
      newStyle.textContent = style.textContent;
      viewContainer.appendChild(newStyle);
    });
    
    // Copy body content
    viewContainer.innerHTML += doc.body.innerHTML;
    
    // Load and execute scripts
    const scripts = doc.querySelectorAll('script[src]');
    for (const script of scripts) {
      const newScript = document.createElement('script');
      let srcPath = script.getAttribute('src');
      
      // Adjust relative paths to be relative to index.html instead of the view file
      if (srcPath.startsWith('../')) {
        // Remove ../ prefix (e.g., ../filter-functions.js -> filter-functions.js)
        srcPath = srcPath.substring(3);
      } else if (!srcPath.startsWith('/') && !srcPath.startsWith('http')) {
        // Add views/ prefix for relative paths (e.g., import-data-renderer.js -> views/import-data-renderer.js)
        srcPath = 'views/' + srcPath;
      }
      
      newScript.src = srcPath;
      await new Promise((resolve, reject) => {
        newScript.onload = resolve;
        newScript.onerror = reject;
        viewContainer.appendChild(newScript);
      });
    }
    
    // Execute inline scripts
    const inlineScripts = doc.querySelectorAll('script:not([src])');
    inlineScripts.forEach(script => {
      const newScript = document.createElement('script');
      newScript.textContent = script.textContent;
      viewContainer.appendChild(newScript);
    });
    
    loadedViews.add(viewName);
  } catch (error) {
    console.error(`Error loading view ${viewName}:`, error);
  }
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const viewName = tab.getAttribute('data-view');
    switchView(viewName);
  });
});

async function switchView(viewName) {
  // Load view content if not already loaded
  await loadViewContent(viewName);
  
  // Update tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
  });
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
  });
  document.getElementById(`${viewName}-view`).classList.add('active');

  // Notify main process of view change
  window.electronAPI.switchView(viewName);
}

// Listen for view switch requests from main process
window.electronAPI.onSwitchView((viewName) => {
  switchView(viewName);
});

// Load the initial view on page load
window.addEventListener('DOMContentLoaded', () => {
  loadViewContent('import'); // Load the default view
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + 1 = Import Data
  if ((e.metaKey || e.ctrlKey) && e.key === '1') {
    e.preventDefault();
    switchView('import');
  }
  // Cmd/Ctrl + 2 = Tone Analysis
  if ((e.metaKey || e.ctrlKey) && e.key === '2') {
    e.preventDefault();
    switchView('analysis');
  }
  // Cmd/Ctrl + 3 = Export to Mobile
  if ((e.metaKey || e.ctrlKey) && e.key === '3') {
    e.preventDefault();
    switchView('export');
  }
  // Cmd/Ctrl + 4 = Import from Mobile
  if ((e.metaKey || e.ctrlKey) && e.key === '4') {
    e.preventDefault();
    switchView('import-mobile');
  }
  // Cmd/Ctrl + R = Force reload current view (development)
  if ((e.metaKey || e.ctrlKey) && e.key === 'r' && !e.shiftKey) {
    e.preventDefault();
    const currentTab = document.querySelector('.tab.active');
    if (currentTab) {
      const viewName = currentTab.getAttribute('data-view');
      console.log('[main-window] Force reloading view:', viewName);
      loadedViews.delete(viewName); // Remove from cache
      const viewContainer = document.getElementById(`${viewName}-view`);
      if (viewContainer) {
        viewContainer.innerHTML = ''; // Clear content
      }
      loadViewContent(viewName).then(() => {
        console.log('[main-window] View reloaded');
      });
    }
  }
});
