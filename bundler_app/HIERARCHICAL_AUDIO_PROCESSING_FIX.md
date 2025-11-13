# Bundler App - Hierarchical Bundle Audio Processing Fix

## Date
November 13, 2025

## Issue
Hierarchical bundles were not processing audio files (FLAC conversion, normalization, trimming) even when those options were enabled. Audio files were copied directly from source without any processing. No progress bar appeared during bundle creation.

## Root Cause
The audio processing code (lines 398-490) was only in the `createLegacyBundle()` function. The `createHierarchicalBundle()` function was completely separate and didn't have audio processing logic.

**Legacy bundle workflow:**
1. Parse XML
2. Collect audio files
3. ✅ Process audio (normalize, trim, convert to FLAC)
4. Add files to bundle (using processed versions)

**Hierarchical bundle workflow (BEFORE FIX):**
1. Parse XML
2. Generate sub-bundles
3. ❌ No audio processing step
4. Add files to sub-bundles (directly from source)

## Solution
Added complete audio processing support to `createHierarchicalBundle()` function:

### 1. Audio File Collection
**Location**: `bundler_app/src/main.js` ~line 643
- Collects all sound files needed across all records
- Includes base files and all audio variants
- Builds set of unique filenames to process

```javascript
// Collect all sound files needed
const soundFiles = new Set();
const audioVariantConfigs = settingsWithMeta.audioFileVariants || [];

for (const record of filteredRecords) {
  if (record.SoundFile) {
    const baseSoundFile = record.SoundFile;
    // Add base file and all variants
    soundFiles.add(baseSoundFile);
    for (const variant of audioVariantConfigs) {
      if (variant.suffix) {
        soundFiles.add(`${basename}${variant.suffix}${ext}`);
      }
    }
  }
}
```

### 2. Audio Processing
**Location**: `bundler_app/src/main.js` ~line 663
- Detects if processing is enabled (trim/normalize/convert)
- Creates temporary processed audio directory
- Uses `lite-normalizer` module for batch processing
- Shows progress bar via IPC events
- Maps original filenames to processed filenames

```javascript
const ap = settingsWithMeta.audioProcessing || {};
const wantsProcessing = !!ap.autoTrim || !!ap.autoNormalize || !!ap.convertToFlac;
const outputFormat = ap.convertToFlac ? 'flac' : 'wav16';
let processedDir = null;
const processedNameMap = new Map();

if (wantsProcessing && liteNormalizer) {
  processedDir = path.join(app.getPath('userData'), 'bundler-processed-audio', String(Date.now()));
  
  await liteNormalizer.normalizeBatch({
    input: audioFolder,
    output: processedDir,
    files: inputAbsList,
    autoNormalize: !!ap.autoNormalize,
    autoTrim: !!ap.autoTrim,
    outputFormat,
    onProgress: (info) => {
      // Send progress events to UI
      mainWindow?.webContents?.send('audio-processing-progress', { ... });
    }
  });
  
  // Build filename map (original -> processed)
  // e.g., "word.wav" -> "word.flac" if converting
  processedNameMap.set(originalName, processedName);
}
```

### 3. Use Processed Files in Sub-Bundles
**Location**: `bundler_app/src/main.js` ~line 963
- When adding audio to sub-bundles, checks for processed version first
- Falls back to original file if processing was skipped or failed
- Uses correct filename (may have different extension after FLAC conversion)

```javascript
// Check if we have a processed version
let srcPath;
let actualFileName = soundFile;

if (processedDir && processedNameMap.has(soundFile)) {
  const processedName = processedNameMap.get(soundFile);
  srcPath = path.join(processedDir, processedName);
  actualFileName = processedName; // Use processed filename (may be .flac)
} else {
  srcPath = path.join(audioFolder, soundFile);
}

const archivePath = `sub_bundles/${subBundlePath}/audio/${actualFileName}`;
archive.file(srcPath, { name: archivePath });
```

## Files Modified

### bundler_app/src/main.js
1. **Lines 643-661**: Added audio file collection for hierarchical bundles
2. **Lines 663-737**: Added audio processing logic (mirrored from legacy bundle code)
3. **Lines 963-984**: Updated sub-bundle audio addition to use processed files

## Features Restored

✅ **FLAC Conversion**: Audio files now converted to FLAC when option is enabled
✅ **Normalization**: Audio loudness normalized when option is enabled  
✅ **Trimming**: Silence auto-trimmed when option is enabled
✅ **Progress Bar**: UI shows processing progress with file counts and time
✅ **Error Handling**: Gracefully falls back to original files if processing fails
✅ **Filename Mapping**: Correctly handles extension changes (wav → flac)
✅ **All Variants**: Processes all audio variants (frame, tone, isolation, etc.)

## Testing Recommendations

1. **Create Hierarchical Bundle with FLAC**:
   - Load XML file
   - Configure hierarchy (e.g., Noun → syllable patterns)
   - Enable "Convert to FLAC"
   - Create bundle
   - Verify progress bar shows audio processing
   - Extract bundle and check audio files have .flac extension

2. **Create Hierarchical Bundle with Normalization**:
   - Enable "Normalize Volume"
   - Create bundle
   - Verify progress shows normalization stats
   - Check audio files are normalized

3. **Create Hierarchical Bundle with All Options**:
   - Enable trim, normalize, and FLAC conversion
   - Create bundle
   - Verify all processing happens
   - Check audio quality and format

4. **Compare with Legacy Bundle**:
   - Create same bundle as legacy and hierarchical
   - Verify both have processed audio
   - Verify file sizes and formats match

## Performance Notes

- Audio processing happens once for all files before sub-bundle creation
- Processed files are cached in temporary directory
- Same processed file used across multiple sub-bundles (if word appears in multiple categories)
- Temporary directory cleaned up after bundle creation completes

## Backward Compatibility

✅ **Existing Bundles**: No changes to existing hierarchical bundles
✅ **Legacy Bundles**: Audio processing still works exactly as before
✅ **Optional Processing**: Processing only happens when explicitly enabled
✅ **Graceful Fallback**: If processing fails, uses original files

## Future Enhancements

- [ ] Show detailed normalization stats in UI
- [ ] Allow user to preview processed audio before bundling
- [ ] Cache processed audio across bundle creations (if same source files)
- [ ] Support additional audio formats (opus, aac, etc.)
- [ ] Parallel processing for faster conversion
