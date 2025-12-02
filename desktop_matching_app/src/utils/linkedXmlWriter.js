/**
 * linkedXmlWriter.js
 * 
 * CONSERVATIVE XML writer for updating linked Dekereke XML files.
 * 
 * CRITICAL REQUIREMENTS:
 * - UTF-16 LE encoding (no BOM changes)
 * - Windows-style CRLF line endings
 * - Minimal changes: only update text content of specific fields
 * - Preserve XML structure, tag order, attributes, formatting
 * - Never write null, undefined, NaN, or non-string values
 * - Trim whitespace from field values (left/right only, preserve internal)
 * - Self-closing tags for empty values
 * 
 * ISOLATION:
 * This module is ONLY for linked Dekereke XML updates.
 * Does NOT affect embedded bundle XML processing.
 */

const fs = require('fs');
const path = require('path');

/**
 * Safely convert value to string, handling null/undefined/NaN and XML escaping
 * @param {any} value - Value to convert
 * @returns {string|null} - String value or null for empty
 */
function safeStringValue(value) {
  // Explicitly handle falsy values
  if (value === null || value === undefined) {
    return null;
  }
  
  // Handle NaN
  if (typeof value === 'number' && isNaN(value)) {
    return null;
  }
  
  // Convert to string and trim
  const str = String(value).trim();
  
  // Return null for empty strings to use self-closing tags
  if (str.length === 0) {
    return null;
  }
  
  // XML escape special characters
  // & must be escaped first to avoid double-escaping
  const escaped = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  return escaped;
}

/**
 * Normalize reference string for comparison (strip leading zeros in memory only)
 */
function normalizeRefString(ref) {
  if (!ref) return '';
  const refStr = String(ref).trim();
  const num = parseInt(refStr, 10);
  return isNaN(num) ? refStr : String(num);
}

/**
 * Parse UTF-16 LE XML conservatively
 * Preserves original structure, only extracts data_form records
 */
function parseLinkedXml(xmlPath) {
  // Read as buffer to preserve BOM
  const xmlBuffer = fs.readFileSync(xmlPath);
  
  // Check for UTF-16 LE BOM (FF FE)
  const hasBOM = xmlBuffer.length >= 2 && xmlBuffer[0] === 0xFF && xmlBuffer[1] === 0xFE;
  
  // Convert to text (BOM is automatically handled by toString)
  const xmlText = xmlBuffer.toString('utf16le');
  
  // Detect line ending style (preserve original)
  const hasCRLF = xmlText.includes('\r\n');
  const lineEnding = hasCRLF ? '\r\n' : '\n';
  
  // Extract XML declaration (preserve exactly as-is)
  const declMatch = xmlText.match(/^<\?xml[^?]*\?>/);
  const xmlDeclaration = declMatch ? declMatch[0] : '<?xml version="1.0" encoding="utf-16"?>';
  
  // Split into lines for processing
  const lines = xmlText.split(/\r?\n/);
  
  return {
    xmlText,
    lines,
    lineEnding,
    xmlDeclaration,
    hasBOM,
  };
}

/**
 * Update a single field value in XML text conservatively
 * Only changes the text content between opening and closing tags
 * 
 * @param {string} xmlText - Full XML text
 * @param {string} reference - Reference number of record to update
 * @param {string} fieldName - Field name (XML tag name)
 * @param {string|null} newValue - New value (null for self-closing tag)
 * @returns {string} - Updated XML text
 */
function updateFieldInPlace(xmlText, reference, fieldName, newValue) {
  // Normalize reference for matching (but preserve original in XML)
  const normalizedRef = normalizeRefString(reference);
  
  // Find the data_form record with this Reference
  // Pattern: <data_form>...</data_form> containing <Reference>refValue</Reference>
  const dataFormPattern = /<data_form>[\s\S]*?<\/data_form>/g;
  
  let updatedXml = xmlText;
  let match;
  
  while ((match = dataFormPattern.exec(xmlText)) !== null) {
    const recordXml = match[0];
    
    // Check if this record has the matching Reference
    const refMatch = recordXml.match(/<Reference>(.*?)<\/Reference>/);
    if (!refMatch) continue;
    
    const recordRef = normalizeRefString(refMatch[1]);
    if (recordRef !== normalizedRef) continue;
    
    // Found the right record - now update the field
    const safeValue = safeStringValue(newValue);
    
    // Build field replacement patterns
    // Pattern 1: <Field>oldValue</Field>
    const fieldPattern1 = new RegExp(
      `(<${fieldName}>)(.*?)(</${fieldName}>)`,
      's'
    );
    
    // Pattern 2: <Field />
    const fieldPattern2 = new RegExp(`<${fieldName}\\s*/>`, 'g');
    
    let updatedRecord = recordXml;
    
    if (safeValue === null) {
      // Empty value - use self-closing tag
      if (fieldPattern1.test(updatedRecord)) {
        // Replace existing value with self-closing tag
        updatedRecord = updatedRecord.replace(fieldPattern1, `<${fieldName} />`);
      }
      // If already self-closing, no change needed
    } else {
      // Non-empty value
      if (fieldPattern1.test(updatedRecord)) {
        // Update existing value
        updatedRecord = updatedRecord.replace(
          fieldPattern1,
          `$1${safeValue}$3`
        );
      } else if (fieldPattern2.test(updatedRecord)) {
        // Replace self-closing tag with value
        updatedRecord = updatedRecord.replace(
          fieldPattern2,
          `<${fieldName}>${safeValue}</${fieldName}>`
        );
      } else {
        // Field doesn't exist - insert before </data_form>
        updatedRecord = updatedRecord.replace(
          /<\/data_form>/,
          `  <${fieldName}>${safeValue}</${fieldName}>\r\n</data_form>`
        );
      }
    }
    
    // Replace the entire record in the full XML
    updatedXml = updatedXml.replace(recordXml, updatedRecord);
    
    // Break after updating first match
    break;
  }
  
  return updatedXml;
}

/**
 * Update multiple records in linked Dekereke XML file
 * 
 * @param {string} xmlPath - Path to linked XML file
 * @param {Array} updates - Array of {reference, fields: {fieldName: value}}
 * @returns {Object} - {success, updatedCount, error}
 */
function updateLinkedXml(xmlPath, updates) {
  try {
    console.log('[linkedXmlWriter] Reading linked XML from:', xmlPath);
    
    // Verify file exists
    if (!fs.existsSync(xmlPath)) {
      return { success: false, error: 'XML file not found' };
    }
    
    // Read original XML
    const parsed = parseLinkedXml(xmlPath);
    let xmlText = parsed.xmlText;
    const lineEnding = parsed.lineEnding;
    
    console.log('[linkedXmlWriter] Line ending style:', lineEnding === '\r\n' ? 'CRLF' : 'LF');
    console.log('[linkedXmlWriter] Processing', updates.length, 'record updates');
    
    let updatedCount = 0;
    
    // Apply each update
    for (const update of updates) {
      const { reference, fields } = update;
      
      // Update each field for this reference
      for (const [fieldName, value] of Object.entries(fields)) {
        xmlText = updateFieldInPlace(xmlText, reference, fieldName, value);
      }
      
      updatedCount++;
    }
    
    // Normalize line endings to match original
    if (lineEnding === '\r\n') {
      // Ensure CRLF throughout
      xmlText = xmlText.replace(/\r?\n/g, '\r\n');
    }
    
    // Write back with UTF-16 LE encoding
    console.log('[linkedXmlWriter] Writing updated XML with', lineEnding === '\r\n' ? 'CRLF' : 'LF', 'and', parsed.hasBOM ? 'BOM' : 'no BOM');
    
    // Convert to buffer with BOM if original had it
    let outputBuffer;
    if (parsed.hasBOM) {
      // Write UTF-16 LE with BOM
      const textBuffer = Buffer.from(xmlText, 'utf16le');
      const bomBuffer = Buffer.from([0xFF, 0xFE]);
      outputBuffer = Buffer.concat([bomBuffer, textBuffer]);
    } else {
      // Write UTF-16 LE without BOM
      outputBuffer = Buffer.from(xmlText, 'utf16le');
    }
    
    fs.writeFileSync(xmlPath, outputBuffer);
    
    console.log('[linkedXmlWriter] Successfully updated', updatedCount, 'records');
    
    return { success: true, updatedCount };
    
  } catch (error) {
    console.error('[linkedXmlWriter] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Build update list from session data
 * Converts session structure to update array format
 */
function buildUpdatesFromSession(sessionData, settings) {
  const updates = [];
  const processedRefs = new Set();
  
  // Get field names from settings
  const tgKey = settings.toneGroupElement || 'SurfaceMelodyGroup';
  const tgIdKey = settings.toneGroupIdElement || settings.toneGroupIdField || 'SurfaceMelodyGroupId';
  const userSpellingKey = settings.userSpellingElement || 'Orthographic';
  const pitchKey = settings.pitchField;
  const abbreviationKey = settings.abbreviationField;
  const exemplarKey = settings.exemplarField;
  
  // Collect all group assignments from sub-bundles
  if (sessionData.subBundles && Array.isArray(sessionData.subBundles)) {
    sessionData.subBundles.forEach(subBundleSession => {
      if (subBundleSession.groups && subBundleSession.groups.length > 0) {
        subBundleSession.groups.forEach(group => {
          (group.members || []).forEach(ref => {
            if (processedRefs.has(ref)) return;
            processedRefs.add(ref);
            
            const fields = {};
            
            // Tone group assignment
            fields[tgKey] = String(group.groupNumber);
            fields[tgIdKey] = group.id;
            
            // Metadata fields (only if non-null and field configured)
            if (group.pitchTranscription && pitchKey) {
              fields[pitchKey] = group.pitchTranscription;
            }
            if (group.toneAbbreviation && abbreviationKey) {
              fields[abbreviationKey] = group.toneAbbreviation;
            }
            if (group.exemplarWord && exemplarKey) {
              fields[exemplarKey] = group.exemplarWord;
            }
            
            updates.push({ reference: ref, fields });
          });
        });
      }
    });
  }
  
  // Add user spelling edits
  if (sessionData.records) {
    Object.entries(sessionData.records).forEach(([ref, edits]) => {
      if (edits.userSpelling && userSpellingKey) {
        // Find existing update or create new one
        let update = updates.find(u => normalizeRefString(u.reference) === normalizeRefString(ref));
        if (!update) {
          update = { reference: ref, fields: {} };
          updates.push(update);
        }
        update.fields[userSpellingKey] = edits.userSpelling;
      }
    });
  }
  
  return updates;
}

module.exports = {
  updateLinkedXml,
  buildUpdatesFromSession,
  safeStringValue,
  normalizeRefString,
};
