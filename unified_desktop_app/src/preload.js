/**
 * Preload script for Tone Matching Suite
 * 
 * Exposes safe IPC communication to renderer processes
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // View Management
  switchView: (viewName) => ipcRenderer.invoke('switch-view', viewName),
  getCurrentView: () => ipcRenderer.invoke('get-current-view'),
  onSwitchView: (callback) => ipcRenderer.on('switch-view', (event, viewName) => callback(viewName)),

  // Bundler APIs
  bundler: {
    selectXml: () => ipcRenderer.invoke('bundler:select-xml'),
    selectAudioFolder: () => ipcRenderer.invoke('bundler:select-audio-folder'),
    createBundle: (options) => ipcRenderer.invoke('bundler:create-bundle', options),
    createAndOpen: (options) => ipcRenderer.invoke('bundler:create-and-open', options),
  },

  // Matching APIs
  matching: {
    loadBundle: () => ipcRenderer.invoke('matching:load-bundle'),
    onBundleLoaded: (callback) => ipcRenderer.on('bundle-loaded', (event, data) => callback(data)),
  },
});
