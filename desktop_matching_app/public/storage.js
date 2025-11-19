// IndexedDB Storage Layer for Desktop Matching PWA
// All data stored locally in browser - no server needed

class StorageManager {
  constructor() {
    this.dbName = 'DesktopMatchingDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store for session data
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }

        // Store for bundle data (XML records)
        if (!db.objectStoreNames.contains('bundles')) {
          const bundleStore = db.createObjectStore('bundles', { keyPath: 'id' });
          bundleStore.createIndex('bundleId', 'bundleId', { unique: false });
        }

        // Store for audio files (as blobs)
        if (!db.objectStoreNames.contains('audio')) {
          const audioStore = db.createObjectStore('audio', { keyPath: 'id' });
          audioStore.createIndex('bundleId', 'bundleId', { unique: false });
        }

        // Store for images (group images)
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }

        // Store for change history (undo/redo)
        if (!db.objectStoreNames.contains('changes')) {
          const changeStore = db.createObjectStore('changes', { keyPath: 'id', autoIncrement: true });
          changeStore.createIndex('bundleId', 'bundleId', { unique: false });
        }
      };
    });
  }

  // Session operations
  async saveSession(sessionData) {
    const tx = this.db.transaction(['session'], 'readwrite');
    const store = tx.objectStore('session');
    await store.put({ id: 'current', ...sessionData });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSession() {
    const tx = this.db.transaction(['session'], 'readonly');
    const store = tx.objectStore('session');
    const request = store.get('current');
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearSession() {
    const tx = this.db.transaction(['session'], 'readwrite');
    const store = tx.objectStore('session');
    await store.delete('current');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Bundle operations
  async saveBundle(bundleId, bundleData) {
    const tx = this.db.transaction(['bundles'], 'readwrite');
    const store = tx.objectStore('bundles');
    await store.put({
      id: bundleId,
      bundleId,
      data: bundleData,
      timestamp: Date.now()
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getBundle(bundleId) {
    const tx = this.db.transaction(['bundles'], 'readonly');
    const store = tx.objectStore('bundles');
    const request = store.get(bundleId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBundle(bundleId) {
    const tx = this.db.transaction(['bundles', 'audio'], 'readwrite');
    
    // Delete bundle
    const bundleStore = tx.objectStore('bundles');
    await bundleStore.delete(bundleId);
    
    // Delete associated audio
    const audioStore = tx.objectStore('audio');
    const index = audioStore.index('bundleId');
    const audioRequest = index.getAllKeys(bundleId);
    
    return new Promise((resolve, reject) => {
      audioRequest.onsuccess = async () => {
        const keys = audioRequest.result;
        for (const key of keys) {
          await audioStore.delete(key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      audioRequest.onerror = () => reject(audioRequest.error);
    });
  }

  // Audio operations
  async saveAudio(bundleId, fileName, audioBlob) {
    const tx = this.db.transaction(['audio'], 'readwrite');
    const store = tx.objectStore('audio');
    await store.put({
      id: `${bundleId}/${fileName}`,
      bundleId,
      fileName,
      blob: audioBlob,
      timestamp: Date.now()
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAudio(bundleId, fileName) {
    const tx = this.db.transaction(['audio'], 'readonly');
    const store = tx.objectStore('audio');
    const request = store.get(`${bundleId}/${fileName}`);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.blob || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllAudioForBundle(bundleId) {
    const tx = this.db.transaction(['audio'], 'readonly');
    const store = tx.objectStore('audio');
    const index = store.index('bundleId');
    const request = index.getAll(bundleId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Image operations
  async saveImage(imageId, imageDataURL) {
    const tx = this.db.transaction(['images'], 'readwrite');
    const store = tx.objectStore('images');
    await store.put({
      id: imageId,
      data: imageDataURL,
      timestamp: Date.now()
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getImage(imageId) {
    const tx = this.db.transaction(['images'], 'readonly');
    const store = tx.objectStore('images');
    const request = store.get(imageId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Change history operations (for undo/redo)
  async saveChange(bundleId, changeData) {
    const tx = this.db.transaction(['changes'], 'readwrite');
    const store = tx.objectStore('changes');
    const request = store.add({
      bundleId,
      change: changeData,
      timestamp: Date.now()
    });
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getChangesForBundle(bundleId) {
    const tx = this.db.transaction(['changes'], 'readonly');
    const store = tx.objectStore('changes');
    const index = store.index('bundleId');
    const request = index.getAll(bundleId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async clearChangesForBundle(bundleId) {
    const tx = this.db.transaction(['changes'], 'readwrite');
    const store = tx.objectStore('changes');
    const index = store.index('bundleId');
    const request = index.getAllKeys(bundleId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const keys = request.result;
        for (const key of keys) {
          await store.delete(key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Storage statistics
  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      return await navigator.storage.estimate();
    }
    return null;
  }

  async clearAllData() {
    const tx = this.db.transaction(['session', 'bundles', 'audio', 'images', 'changes'], 'readwrite');
    await tx.objectStore('session').clear();
    await tx.objectStore('bundles').clear();
    await tx.objectStore('audio').clear();
    await tx.objectStore('images').clear();
    await tx.objectStore('changes').clear();
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Export singleton instance
const storage = new StorageManager();

// Auto-initialize on load
if (typeof window !== 'undefined') {
  storage.init().then(() => {
    console.log('[Storage] IndexedDB initialized');
  }).catch(error => {
    console.error('[Storage] Failed to initialize IndexedDB:', error);
  });
}
