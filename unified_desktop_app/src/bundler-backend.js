/**
 * Bundler Backend Logic
 * 
 * This module contains all the complex bundler logic extracted from bundler_app/src/main.js
 * Including: XML parsing, conflict detection, bundle creation (legacy & hierarchical)
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { XMLParser } = require('fast-xml-parser');

// Import utility functions
const BLANK_VALUE = '(blank)';

function normalizeBlankValue(value) {
  if (value === null || value === undefined || value === '') {
    return BLANK_VALUE;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return BLANK_VALUE;
  }
  return value;
}

function isBlankValue(value) {
  return value === null || value === undefined || value === '' || 
         (typeof value === 'string' && value.trim() === '') ||
         value === BLANK_VALUE;
}

function normalizeRefString(ref) {
  if (ref == null) return '';
  return String(ref).trim();
}

function toNumericRef(refStr) {
  const clean = String(refStr).replace(/^0+/, '');
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
}

function sortByNumericRef(records) {
  return records.slice().sort((a, b) => {
    const refA = a.Reference != null ? normalizeRefString(a.Reference) : '';
    const refB = b.Reference != null ? normalizeRefString(b.Reference) : '';
    const numA = toNumericRef(refA);
    const numB = toNumericRef(refB);
    if (numA !== numB) return numA - numB;
    return refA.localeCompare(refB);
  });
}

function generateUuid() {
  try {
    return require('crypto').randomUUID();
  } catch {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }
}

// Parse XML and extract field information
async function parseXmlFile(xmlPath) {
  try {
    const xmlData = fs.readFileSync(xmlPath, 'utf16le');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });
    const result = parser.parse(xmlData);
    
    if (!result.phon_data || !result.phon_data.data_form) {
      return {
        success: false,
        error: 'Invalid XML structure: missing phon_data or data_form elements',
      };
    }
    
    const phonData = result.phon_data;
    const dataForms = Array.isArray(phonData.data_form) 
      ? phonData.data_form 
      : [phonData.data_form];
    
    if (dataForms.length === 0) {
      return {
        success: false,
        error: 'No records found in XML file',
      };
    }
    
    // Extract available fields from first record
    const firstRecord = dataForms[0];
    const availableFields = Object.keys(firstRecord)
      .filter(k => !k.startsWith('@_'))
      .sort();
    
    // Return parsed data
    return {
      success: true,
      fields: availableFields,
      recordCount: dataForms.length,
      records: dataForms, // Full records for hierarchy analysis
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Detect conflicts in hierarchy configuration
function detectHierarchyConflicts(records, hierarchyTree) {
  // TODO: Implement conflict detection
  // This should check for inconsistent metadata in groups
  return {
    success: true,
    conflicts: [],
  };
}

// Check for duplicate Reference values
function checkDuplicateReferences(dataForms) {
  const seen = new Map();
  const duplicates = [];
  
  for (const df of dataForms) {
    const ref = normalizeRefString(df.Reference);
    if (ref && seen.has(ref)) {
      if (!duplicates.includes(ref)) {
        duplicates.push(ref);
      }
    } else if (ref) {
      seen.set(ref, true);
    }
  }
  
  return duplicates;
}

// Apply filters to data forms
function applyFilters(dataForms, filterGroups) {
  if (!filterGroups || filterGroups.length === 0) {
    return dataForms;
  }
  
  // Load filter functions
  let filterFunctions;
  try {
    filterFunctions = require('../public/filter-functions.js');
  } catch (e) {
    console.warn('[bundler] filter-functions.js not found, skipping filters');
    return dataForms;
  }
  
  return filterFunctions.applyFilters(dataForms, filterGroups);
}

// Validate bundle audio files
async function validateBundleAudio({ records, audioFolder, processedDir, processedNameMap, variants }) {
  const missing = [];
  
  for (const record of records) {
    if (record.SoundFile) {
      const baseSoundFile = record.SoundFile;
      const lastDot = baseSoundFile.lastIndexOf('.');
      const basename = lastDot !== -1 ? baseSoundFile.substring(0, lastDot) : baseSoundFile;
      const ext = lastDot !== -1 ? baseSoundFile.substring(lastDot) : '';
      
      // Check each variant
      for (const variant of variants) {
        let checkFile = baseSoundFile;
        if (variant.suffix) {
          checkFile = `${basename}${variant.suffix}${ext}`;
        }
        
        let found = false;
        
        // Check in processed dir first
        if (processedDir && processedNameMap && processedNameMap.has(checkFile)) {
          const processedName = processedNameMap.get(checkFile);
          const processedPath = path.join(processedDir, processedName);
          if (fs.existsSync(processedPath)) {
            found = true;
          }
        }
        
        // Check in original audio folder
        if (!found) {
          const originalPath = path.join(audioFolder, checkFile);
          if (fs.existsSync(originalPath)) {
            found = true;
          }
        }
        
        if (!found) {
          missing.push(checkFile);
        }
      }
    }
  }
  
  return { missing };
}

module.exports = {
  parseXmlFile,
  detectHierarchyConflicts,
  checkDuplicateReferences,
  applyFilters,
  validateBundleAudio,
  normalizeBlankValue,
  isBlankValue,
  normalizeRefString,
  sortByNumericRef,
  generateUuid,
  BLANK_VALUE,
};
