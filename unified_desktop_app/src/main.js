/**
 * Tone Matching Suite - Unified Desktop App
 * 
 * Combines bundler and matching functionality into a single application.
 * Phase 1: Basic architecture with view switching
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

let mainWindow;
let currentView = 'bundler';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset', // macOS style
    show: false, // Don't show until ready
  });

  mainWindow.loadFile(path.join(__dirname, '../public/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in debug mode
  if (process.env.ELECTRON_ENABLE_LOGGING) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// IPC Handlers - Phase 1: View Management
// ============================================================================

ipcMain.handle('switch-view', async (event, viewName) => {
  console.log('[main] Switching to view:', viewName);
  currentView = viewName;
  return { success: true, view: viewName };
});

ipcMain.handle('get-current-view', async () => {
  return { view: currentView };
});

// ============================================================================
// IPC Handlers - Bundler (Stubs for Phase 2)
// ============================================================================

ipcMain.handle('bundler:select-xml', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'XML Files', extensions: ['xml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  return {
    canceled: false,
    filePath: result.filePaths[0],
  };
});

ipcMain.handle('bundler:select-audio-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  return {
    canceled: false,
    folderPath: result.filePaths[0],
  };
});

ipcMain.handle('bundler:create-bundle', async (event, options) => {
  console.log('[main] Create bundle requested:', options);
  // Stub - will implement in Phase 2
  return {
    success: false,
    error: 'Bundle creation not yet implemented',
  };
});

ipcMain.handle('bundler:create-and-open', async (event, options) => {
  console.log('[main] Create bundle and open in matching:', options);
  // Stub - will implement in Phase 4
  return {
    success: false,
    error: 'Direct bundle-to-matching flow not yet implemented',
  };
});

// ============================================================================
// IPC Handlers - Matching (Stubs for Phase 3)
// ============================================================================

ipcMain.handle('matching:load-bundle', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Tone Bundle', extensions: ['tnset', 'tncmp', 'zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  console.log('[main] Load bundle requested:', result.filePaths[0]);
  // Stub - will implement in Phase 3
  return {
    success: false,
    error: 'Bundle loading not yet implemented',
  };
});

// ============================================================================
// Logging
// ============================================================================

console.log('[main] Tone Matching Suite starting...');
console.log('[main] Electron version:', process.versions.electron);
console.log('[main] Node version:', process.versions.node);
console.log('[main] App path:', app.getAppPath());
