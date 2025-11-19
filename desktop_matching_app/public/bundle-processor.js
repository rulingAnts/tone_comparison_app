// Client-side Bundle Processor
// Handles .tnset file loading, extraction, and export entirely in browser

// Load JSZip from CDN and use native XMLHandler
// <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
// <script src="xml-handler.js"></script>

class BundleProcessor {
  constructor(storageManager) {
    this.storage = storageManager;
    this.xmlHandler = null;
  }

  initXMLParser() {
    if (!this.xmlHandler) {
      console.log('[Bundle] Initializing XML handler...');
      
      if (typeof XMLHandler !== 'undefined') {
        this.xmlHandler = new XMLHandler();
        console.log('[Bundle] Using UTF-16 capable XMLHandler');
        return;
      }
      
      throw new Error('XMLHandler not loaded. Make sure xml-handler.js is included before bundle-processor.js');
    }
  }

  async loadBundleFile(file) {
    try {
      this.initXMLParser();
      const bundleId = file.name.replace('.tnset', '');
      
      console.log('[Bundle] Loading:', bundleId);
      
      // Use JSZip to extract
      const zip = await JSZip.loadAsync(file);
      
      // Check bundle type
      const hasHierarchy = zip.file('hierarchy.json') !== null;
      const hasXmlFolder = zip.folder('xml').length > 0;
      const hasAudioFolder = zip.folder('audio').length > 0;
      
      let bundleType, bundleData;
      
      if (hasHierarchy && hasXmlFolder && hasAudioFolder) {
        // Hierarchical bundle
        bundleData = await this.loadHierarchicalBundle(zip, bundleId);
        bundleType = 'hierarchical';
      } else {
        // Legacy bundle
        bundleData = await this.loadLegacyBundle(zip, bundleId);
        bundleType = 'legacy';
      }
      
      // Save to IndexedDB
      await this.storage.saveBundle(bundleId, bundleData);
      
      console.log('[Bundle] Loaded successfully:', bundleType, bundleId);
      
      return {
        success: true,
        bundleId,
        bundleType,
        bundleData
      };
      
    } catch (error) {
      console.error('[Bundle] Load error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async loadLegacyBundle(zip, bundleId) {
    // Extract XML
    const xmlFile = zip.file('tone_matching_data.xml');
    if (!xmlFile) {
      throw new Error('Missing tone_matching_data.xml');
    }
    
    // Parse XML (handle UTF-16 encoding)
    const xmlData = await xmlFile.async('arraybuffer');
    const parsed = await this.xmlHandler.parseFromString(xmlData);
    let records = parsed.ToneMatchingData?.Records || [];
    if (!Array.isArray(records)) {
      records = [records];
    }
    
    // Extract audio files
    const audioFiles = zip.folder('audio');
    for (const fileName in audioFiles.files) {
      if (fileName.startsWith('audio/') && !fileName.endsWith('/')) {
        const audioFile = audioFiles.files[fileName];
        const audioBlob = await audioFile.async('blob');
        const audioFileName = fileName.replace('audio/', '');
        await this.storage.saveAudio(bundleId, audioFileName, audioBlob);
      }
    }
    
    // Load settings if available
    const settingsFile = zip.file('settings.json');
    let groups = [];
    if (settingsFile) {
      const settingsText = await settingsFile.async('string');
      const settings = JSON.parse(settingsText);
      groups = settings.groups || [];
    }
    
    return {
      type: 'legacy',
      records,
      groups,
      currentWordIndex: 0
    };
  }

  async loadHierarchicalBundle(zip, bundleId) {
    // Load hierarchy
    const hierarchyFile = zip.file('hierarchy.json');
    const hierarchyText = await hierarchyFile.async('string');
    const hierarchy = JSON.parse(hierarchyText);
    
    // Load settings
    const settingsFile = zip.file('settings.json');
    let groups = [];
    if (settingsFile) {
      const settingsText = await settingsFile.async('string');
      const settings = JSON.parse(settingsText);
      groups = settings.groups || [];
    }
    
    // Extract all XML files from sub-bundles
    const xmlFiles = zip.folder('xml');
    const subBundles = {};
    
    for (const fileName in xmlFiles.files) {
      if (fileName.endsWith('.xml') && !fileName.endsWith('/')) {
        const xmlFile = xmlFiles.files[fileName];
        // Parse XML (handle UTF-16 encoding)
        const xmlData = await xmlFile.async('arraybuffer');
        const parsed = await this.xmlHandler.parseFromString(xmlData);
        let records = parsed.ToneMatchingData?.Records || [];
        if (!Array.isArray(records)) {
          records = [records];
        }
        const subBundleName = fileName.replace('xml/', '').replace('/tone_matching_data.xml', '');
        subBundles[subBundleName] = records;
      }
    }
    
    // Extract audio files
    const audioFiles = zip.folder('audio');
    for (const fileName in audioFiles.files) {
      if (fileName.startsWith('audio/') && !fileName.endsWith('/')) {
        const audioFile = audioFiles.files[fileName];
        const audioBlob = await audioFile.async('blob');
        const audioFileName = fileName.replace('audio/', '');
        await this.storage.saveAudio(bundleId, audioFileName, audioBlob);
      }
    }
    
    return {
      type: 'hierarchical',
      hierarchy,
      subBundles,
      groups,
      currentSubBundle: null
    };
  }

  async exportBundle(bundleId, bundleData, groups) {
    try {
      this.initXMLParser();
      const zip = new JSZip();
      
      if (bundleData.type === 'legacy') {
        // Export legacy bundle
        await this.exportLegacyBundle(zip, bundleId, bundleData, groups);
      } else {
        // Export hierarchical bundle
        await this.exportHierarchicalBundle(zip, bundleId, bundleData, groups);
      }
      
      // Generate zip file
      const blob = await zip.generateAsync({ type: 'blob' });
      
      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bundleId}_modified.tnset`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('[Bundle] Exported:', bundleId);
      return { success: true };
      
    } catch (error) {
      console.error('[Bundle] Export error:', error);
      return { success: false, error: error.message };
    }
  }

  async exportLegacyBundle(zip, bundleId, bundleData, groups) {
    // Build XML with UTF-16 encoding
    const xmlObj = {
      ToneMatchingData: {
        Records: bundleData.records
      },
      _xmlDeclaration: {
        version: '1.0',
        encoding: 'UTF-16'
      }
    };
    const xmlString = this.xmlHandler.buildXMLString(xmlObj, 'ToneMatchingData');
    
    // Encode to UTF-16 with BOM
    const xmlBuffer = this.xmlHandler.encodeToUTF16(xmlString);
    zip.file('tone_matching_data.xml', xmlBuffer);
    
    // Add audio files
    const audioFiles = await this.storage.getAllAudioForBundle(bundleId);
    for (const audioFile of audioFiles) {
      zip.file(`audio/${audioFile.fileName}`, audioFile.blob);
    }
    
    // Add settings
    const settings = {
      bundleId,
      groups,
      exportDate: new Date().toISOString()
    };
    zip.file('settings.json', JSON.stringify(settings, null, 2));
  }

  async exportHierarchicalBundle(zip, bundleId, bundleData, groups) {
    // Add hierarchy
    zip.file('hierarchy.json', JSON.stringify(bundleData.hierarchy, null, 2));
    
    // Add XML files for each sub-bundle (UTF-16 encoded)
    for (const [subBundleName, records] of Object.entries(bundleData.subBundles)) {
      const xmlObj = {
        ToneMatchingData: {
          Records: records
        },
        _xmlDeclaration: {
          version: '1.0',
          encoding: 'UTF-16'
        }
      };
      const xmlString = this.xmlHandler.buildXMLString(xmlObj, 'ToneMatchingData');
      const xmlBuffer = this.xmlHandler.encodeToUTF16(xmlString);
      zip.file(`xml/${subBundleName}/tone_matching_data.xml`, xmlBuffer);
    }
    
    // Add audio files
    const audioFiles = await this.storage.getAllAudioForBundle(bundleId);
    for (const audioFile of audioFiles) {
      zip.file(`audio/${audioFile.fileName}`, audioFile.blob);
    }
    
    // Add settings
    const settings = {
      bundleId,
      groups,
      exportDate: new Date().toISOString()
    };
    zip.file('settings.json', JSON.stringify(settings, null, 2));
  }

  async getAudioURL(bundleId, fileName, suffix = '') {
    let fullFileName = fileName;
    if (suffix && fileName.endsWith('.wav')) {
      fullFileName = fileName.replace('.wav', `${suffix}.wav`);
    }
    
    const audioBlob = await this.storage.getAudio(bundleId, fullFileName);
    if (!audioBlob) {
      console.warn('[Bundle] Audio not found:', fullFileName);
      return null;
    }
    
    return URL.createObjectURL(audioBlob);
  }
}

// Export singleton
const bundleProcessor = new BundleProcessor(storage);
