// Client-side API wrapper using IndexedDB (no server needed)
// Uses storage.js and bundle-processor.js for all operations

class APIClient {
  constructor() {
    this.storage = storage; // From storage.js
    this.bundleProcessor = bundleProcessor; // From bundle-processor.js
    this.session = null;
    this.bundleData = null;
    this.changeHistory = [];
    this.changeIndex = -1;
    
    // Initialize session
    this.initSession();
  }

  async initSession() {
    // Try to load existing session
    this.session = await this.storage.getSession();
    
    if (!this.session) {
      // Create new session
      this.session = {
        bundleId: null,
        bundleType: 'legacy',
        locale: localStorage.getItem('locale') || 'en',
        groups: [],
        showReferenceNumbers: true,
        selectedAudioVariantIndex: 0,
        currentWordIndex: 0,
        currentSubBundlePath: null
      };
      await this.storage.saveSession(this.session);
    }
    
    // Load bundle if session has one
    if (this.session.bundleId) {
      this.bundleData = await this.storage.getBundle(this.session.bundleId);
    }
  }

  // Session methods
  async getSession() {
    return { ...this.session };
  }

  async updateSession(updates) {
    Object.assign(this.session, updates);
    await this.storage.saveSession(this.session);
    return { success: true, session: this.session };
  }

  async resetSession() {
    // Clear bundle data if exists
    if (this.session.bundleId) {
      await this.storage.deleteBundle(this.session.bundleId);
    }
    
    // Reset session
    this.session = {
      bundleId: null,
      bundleType: 'legacy',
      locale: this.session.locale || 'en',
      groups: [],
      showReferenceNumbers: true,
      selectedAudioVariantIndex: 0,
      currentWordIndex: 0,
      currentSubBundlePath: null
    };
    
    this.bundleData = null;
    this.changeHistory = [];
    this.changeIndex = -1;
    
    await this.storage.saveSession(this.session);
    return { success: true, session: this.session };
  }

  // Bundle methods
  async selectBundleFile() {
    // Use HTML5 File API
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.tnset';
      input.onchange = () => {
        if (input.files.length > 0) {
          resolve(input.files[0]);
        } else {
          reject(new Error('No file selected'));
        }
      };
      input.click();
    });
  }

  async loadBundle(file) {
    const result = await this.bundleProcessor.loadBundleFile(file);
    
    if (result.success) {
      this.session.bundleId = result.bundleId;
      this.session.bundleType = result.bundleType;
      this.session.currentWordIndex = 0;
      this.session.groups = result.bundleData.groups || [];
      this.bundleData = result.bundleData;
      
      await this.storage.saveSession(this.session);
      
      return {
        success: true,
        bundleType: result.bundleType,
        wordCount: result.bundleData.records?.length || 0,
        hierarchy: result.bundleData.hierarchy,
        session: this.session
      };
    }
    
    return result;
  }

  async checkRestoredBundle() {
    const hasBundle = this.session.bundleId && this.bundleData;
    return {
      restored: hasBundle,
      session: this.session
    };
  }

  // Word methods
  async getCurrentWord() {
    if (!this.bundleData || !this.bundleData.records) {
      throw new Error('No bundle loaded');
    }
    
    const word = this.bundleData.records[this.session.currentWordIndex];
    return {
      word,
      index: this.session.currentWordIndex,
      total: this.bundleData.records.length
    };
  }

  async getRecordByRef(ref) {
    if (!this.bundleData) {
      throw new Error('No bundle loaded');
    }
    
    const normalizeRef = (r) => r.toString().trim().toLowerCase();
    
    if (this.bundleData.type === 'hierarchical' && this.session.currentSubBundlePath) {
      const records = this.bundleData.subBundles[this.session.currentSubBundlePath];
      const record = records?.find(r => normalizeRef(r.Ref) === normalizeRef(ref));
      return { record };
    }
    
    const record = this.bundleData.records?.find(r => normalizeRef(r.Ref) === normalizeRef(ref));
    return { record };
  }

  async confirmSpelling(ref, userSpelling) {
    if (!this.bundleData) {
      throw new Error('No bundle loaded');
    }
    
    const normalizeRef = (r) => r.toString().trim().toLowerCase();
    let record;
    
    if (this.bundleData.type === 'hierarchical' && this.session.currentSubBundlePath) {
      const records = this.bundleData.subBundles[this.session.currentSubBundlePath];
      record = records?.find(r => normalizeRef(r.Ref) === normalizeRef(ref));
    } else {
      record = this.bundleData.records?.find(r => normalizeRef(r.Ref) === normalizeRef(ref));
    }
    
    if (record) {
      const oldValue = record.Lexeme;
      record.Lexeme = userSpelling;
      
      // Save change for undo
      this.pushChange({
        type: 'spelling',
        ref,
        oldValue,
        newValue: userSpelling,
        subBundle: this.session.currentSubBundlePath
      });
      
      // Save updated bundle
      await this.storage.saveBundle(this.session.bundleId, this.bundleData);
    }
    
    return { success: true };
  }

  // Group methods
  async createGroup(groupData) {
    const groupId = this.generateId();
    const newGroup = {
      id: groupId,
      words: [],
      image: null,
      requiresReview: false,
      ...groupData
    };
    
    this.session.groups.push(newGroup);
    await this.storage.saveSession(this.session);
    
    return { success: true, group: newGroup };
  }

  async updateGroup(groupId, updates) {
    const group = this.session.groups.find(g => g.id === groupId);
    if (!group) {
      throw new Error('Group not found');
    }
    
    Object.assign(group, updates);
    await this.storage.saveSession(this.session);
    
    return { success: true, group };
  }

  async addWordToGroup(ref, groupId) {
    // Remove from other groups
    this.session.groups.forEach(g => {
      const idx = g.words.indexOf(ref);
      if (idx !== -1) {
        g.words.splice(idx, 1);
      }
    });
    
    // Add to target group
    const group = this.session.groups.find(g => g.id === groupId);
    if (group && !group.words.includes(ref)) {
      group.words.push(ref);
      
      this.pushChange({
        type: 'grouping',
        ref,
        groupId,
        action: 'add'
      });
    }
    
    await this.storage.saveSession(this.session);
    return { success: true, group };
  }

  async removeWordFromGroup(ref, groupId) {
    const group = this.session.groups.find(g => g.id === groupId);
    if (group) {
      const idx = group.words.indexOf(ref);
      if (idx !== -1) {
        group.words.splice(idx, 1);
        
        this.pushChange({
          type: 'grouping',
          ref,
          groupId,
          action: 'remove'
        });
      }
    }
    
    await this.storage.saveSession(this.session);
    return { success: true, group };
  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // File selection
  async selectImageFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        if (input.files.length > 0) {
          const file = input.files[0];
          // Convert to base64 for storage
          const reader = new FileReader();
          reader.onload = async () => {
            const imageId = this.generateId();
            await this.storage.saveImage(imageId, reader.result);
            resolve(imageId);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        } else {
          reject(new Error('No file selected'));
        }
      };
      input.click();
    });
  }

  async getImageData(imageId) {
    return await this.storage.getImage(imageId);
  }

  // Audio
  async getAudioPath(soundFile, suffix = '') {
    if (!this.session.bundleId) {
      throw new Error('No bundle loaded');
    }
    
    return await this.bundleProcessor.getAudioURL(this.session.bundleId, soundFile, suffix);
  }

  // Export
  async exportBundle() {
    if (!this.session.bundleId || !this.bundleData) {
      throw new Error('No bundle loaded');
    }
    
    return await this.bundleProcessor.exportBundle(
      this.session.bundleId,
      this.bundleData,
      this.session.groups
    );
  }

  // Undo/Redo
  pushChange(change) {
    // Remove any redo history
    this.changeHistory = this.changeHistory.slice(0, this.changeIndex + 1);
    this.changeHistory.push(change);
    this.changeIndex++;
    
    // Save to IndexedDB
    if (this.session.bundleId) {
      this.storage.saveChange(this.session.bundleId, change);
    }
  }

  async undo() {
    if (this.changeIndex < 0) {
      return { success: false, message: 'Nothing to undo' };
    }
    
    const change = this.changeHistory[this.changeIndex];
    this.changeIndex--;
    
    // Apply undo logic (would need to reverse the change)
    // For now, just return the change info
    return { success: true, change };
  }

  async redo() {
    if (this.changeIndex >= this.changeHistory.length - 1) {
      return { success: false, message: 'Nothing to redo' };
    }
    
    this.changeIndex++;
    const change = this.changeHistory[this.changeIndex];
    
    // Apply redo logic
    return { success: true, change };
  }

  async getUndoRedoState() {
    return {
      canUndo: this.changeIndex >= 0,
      canRedo: this.changeIndex < this.changeHistory.length - 1
    };
  }

  // Mark reviewed
  async markAllGroupsReviewed() {
    this.session.groups.forEach(g => g.requiresReview = false);
    await this.storage.saveSession(this.session);
    return { success: true };
  }

  async markSubBundleReviewed(options) {
    // Update session
    await this.updateSession({ subBundleReviewed: options.reviewed });
    return { success: true };
  }
}

// Create global API client to replace ipcRenderer
const ipcRenderer = {
  _apiClient: new APIClient(),
  
  async invoke(channel, ...args) {
    const api = this._apiClient;
    
    switch (channel) {
      case 'get-session':
        return api.getSession();
      
      case 'update-session':
        return api.updateSession(args[0]);
      
      case 'reset-session':
        return api.resetSession();
      
      case 'select-bundle-file':
        return api.selectBundleFile();
      
      case 'load-bundle':
        return api.loadBundle(args[0]);
      
      case 'check-restored-bundle':
        return api.checkRestoredBundle();
      
      case 'get-current-word':
        return api.getCurrentWord();
      
      case 'get-record-by-ref':
        return api.getRecordByRef(args[0]);
      
      case 'confirm-spelling':
        return api.confirmSpelling(args[0], args[1]);
      
      case 'create-group':
        return api.createGroup(args[0]);
      
      case 'update-group':
        return api.updateGroup(args[0], args[1]);
      
      case 'add-word-to-group':
        return api.addWordToGroup(args[0], args[1]);
      
      case 'remove-word-from-group':
        return api.removeWordFromGroup(args[0], args[1]);
      
      case 'select-image-file':
        return api.selectImageFile();
      
      case 'get-audio-path':
        return api.getAudioPath(args[0], args[1]);
      
      case 'export-bundle':
        return api.exportBundle();
      
      case 'undo':
        return api.undo();
      
      case 'redo':
        return api.redo();
      
      case 'get-undo-redo-state':
        return api.getUndoRedoState();
      
      case 'mark-all-groups-reviewed':
        return api.markAllGroupsReviewed();
      
      case 'mark-sub-bundle-reviewed':
        return api.markSubBundleReviewed(args[0]);
      
      default:
        console.warn(`Unhandled IPC channel: ${channel}`);
        return { error: 'Not implemented', channel };
    }
  }
};

// Export for use in renderer.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ipcRenderer };
}
