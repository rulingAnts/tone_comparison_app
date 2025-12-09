// Main Window Tab Switching Logic

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const viewName = tab.getAttribute('data-view');
    switchView(viewName);
  });
});

function switchView(viewName) {
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + 1 = Bundler
  if ((e.metaKey || e.ctrlKey) && e.key === '1') {
    e.preventDefault();
    switchView('bundler');
  }
  // Cmd/Ctrl + 2 = Matching
  if ((e.metaKey || e.ctrlKey) && e.key === '2') {
    e.preventDefault();
    switchView('matching');
  }
});
