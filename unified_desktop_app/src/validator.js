// validator.js
// Validates that every <SoundFile> referenced in a parsed XML dataset has a corresponding file in the audio folder
// after optional processing (e.g., FLAC conversion). It detects leftover .wav/.flac mismatches.
//
// Usage (from main):
//   const report = await validateBundleAudio({
//     records,                 // Array of data_form objects (already filtered)
//     audioFolder,             // Original audio folder
//     processedDir,            // Optional processed output directory
//     processedNameMap,        // Map<string,string> originalRelName -> processedRelName
//     variants                 // Array<{ suffix: string }>
//   });
//   // report = { missing: string[], checked: number }

const fs = require('fs');
const path = require('path');
const { normalizeRefString } = require('./utils/refUtils');

function insertSuffix(fileName, suffix) {
  if (!suffix) return fileName;
  const i = fileName.lastIndexOf('.');
  return i === -1 ? fileName + suffix : fileName.substring(0, i) + suffix + fileName.substring(i);
}

function replaceExt(name, newExt) {
  const i = name.lastIndexOf('.');
  return i === -1 ? name + newExt : name.substring(0, i) + newExt;
}

function existsCaseInsensitive(dir, candidate) {
  try {
    const list = fs.readdirSync(dir);
    const lc = candidate.toLowerCase();
    const match = list.find((f) => f.toLowerCase() === lc);
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

function checkOne(dir, name) {
  const full = path.join(dir, name);
  if (fs.existsSync(full)) return full;
  // try case-insensitive
  const ci = existsCaseInsensitive(dir, name);
  if (ci) return ci;
  return null;
}

async function validateBundleAudio({ records, audioFolder, processedDir, processedNameMap, variants }) {
  const missing = [];
  let checked = 0;

  const tryDirs = [];
  if (processedDir) tryDirs.push(processedDir);
  if (audioFolder) tryDirs.push(audioFolder);

  for (const rec of records) {
    const base = rec.SoundFile;
    if (!base) continue;
    for (const v of variants || [{ suffix: '' }]) {
      const withSuffix = insertSuffix(base, v.suffix || '');

      // First try exact name in both dirs
      let found = false;
      for (const dir of tryDirs) {
        if (checkOne(dir, withSuffix)) { found = true; break; }
      }
      // If not found, try extension fallbacks (.flac vs .wav)
      if (!found) {
        const candidates = [
          replaceExt(withSuffix, '.flac'),
          replaceExt(withSuffix, '.wav'),
        ];
        for (const dir of tryDirs) {
          for (const c of candidates) {
            if (checkOne(dir, c)) { found = true; break; }
          }
          if (found) break;
        }
      }
      
      if (!found) {
        missing.push(withSuffix);
      }
      checked++;
    }
  }

  return { missing, checked };
}

/**
 * Check for duplicate Reference values in an array of data_form records.
 * Returns array of duplicate References (with leading zeros preserved).
 * 
 * @param {Array} records - Array of data_form objects
 * @returns {Array<string>} - Array of duplicate Reference values
 */
function checkDuplicateReferences(records) {
  const refCounts = new Map();
  const duplicates = [];
  
  for (const record of records) {
    if (!record || record.Reference == null) continue;
    
    // Preserve the exact Reference string (with leading zeros)
    const refStr = normalizeRefString(record.Reference);
    if (!refStr) continue;
    
    const count = refCounts.get(refStr) || 0;
    refCounts.set(refStr, count + 1);
    
    // Add to duplicates list when we encounter it the second time
    if (count === 1) {
      duplicates.push(refStr);
    }
  }
  
  return duplicates.sort((a, b) => {
    // Sort numerically if possible, otherwise alphabetically
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });
}

module.exports = { validateBundleAudio, checkDuplicateReferences };
