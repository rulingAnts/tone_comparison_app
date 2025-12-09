/**
 * Preload script for Tone Matching Suite
 * 
 * Exposes safe IPC communication to renderer processes
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic IPC communication for bundler
  invoke: (channel, ...args) => {
    // Whitelist allowed channels for security
    const validChannels = [
      'switch-view',
      'get-current-view',
      'bundler:get-settings',
      'bundler:set-settings',
      'bundler:select-xml-file',
      'bundler:select-audio-folder',
      'bundler:select-output-file',
      'bundler:parse-xml',
      'bundler:check-conflicts',
      'bundler:create-bundle',
      'bundler:save-profile',
      'bundler:open-profile',
      'bundler:create-and-open',
      'matching:load-bundle',
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid IPC channel: ${channel}`);
  },
  
  on: (channel, callback) => {
    // Whitelist allowed channels for event listeners
    const validChannels = [
      'switch-view',
      'audio-processing-progress',
      'archive-progress',
      'bundle-loaded',
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      throw new Error(`Invalid IPC channel: ${channel}`);
    }
  },
  
  // View Management (legacy, keeping for compatibility)
  switchView: (viewName) => ipcRenderer.invoke('switch-view', viewName),
  getCurrentView: () => ipcRenderer.invoke('get-current-view'),
  onSwitchView: (callback) => ipcRenderer.on('switch-view', (event, viewName) => callback(viewName)),

  // Bundler APIs (legacy, keeping for compatibility)
  bundler: {
    selectXml: () => ipcRenderer.invoke('bundler:select-xml'),
    selectAudioFolder: () => ipcRenderer.invoke('bundler:select-audio-folder'),
    createBundle: (options) => ipcRenderer.invoke('bundler:create-bundle', options),
    createAndOpen: (options) => ipcRenderer.invoke('bundler:create-and-open', options),
  },

  // Matching APIs (legacy, keeping for compatibility)
  matching: {
    loadBundle: () => ipcRenderer.invoke('matching:load-bundle'),
    onBundleLoaded: (callback) => ipcRenderer.on('bundle-loaded', (event, data) => callback(data)),
  },
});
