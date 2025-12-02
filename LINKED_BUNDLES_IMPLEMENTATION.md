# Linked Bundles Implementation

## Overview
This document describes the implementation of **Linked Bundles** functionality, which allows hierarchical bundles to reference external XML files and audio folders instead of embedding them within the bundle archive.

## Features Implemented

### 1. Linked Bundle Creation (Bundler App)

#### UI Changes (`bundler_app/public/index.html`)
- Added checkbox option "Create Linked Bundle" in the hierarchical bundle section
- Only visible when "Hierarchical Macro-Bundle" is selected
- Includes informational text explaining linked bundles and requirements

#### Backend Changes (`bundler_app/src/main.js`)
- Modified `createHierarchicalBundle()` function to support linked bundles
- When `createLinkedBundle` setting is enabled:
  - Stores file paths instead of copying files into bundle
  - Creates `link_metadata.json` with:
    - `linkedBundle: true`
    - `linkedXmlPath`: absolute path to original XML file
    - `linkedAudioFolder`: absolute path to original audio folder
    - Bundle creation metadata (timestamp, hostname)
  - Does NOT copy XML files to `xml/` folder
  - Does NOT copy audio files to `audio/` folder
- When linked bundle is disabled (default):
  - Works as before: embeds XML and audio files in the bundle

#### Settings Persistence (`bundler_app/public/renderer.js`)
- Added `createLinkedBundle` setting to `collectCurrentSettings()`
- Added `handleLinkedBundleChange()` function to show/hide info text
- Restores linked bundle checkbox state from persisted settings
- Resets checkbox when switching to legacy bundle type

### 2. Linked Bundle Loading (Desktop Matching App)

#### Detection and Loading (`desktop_matching_app/src/main.js`)
- Modified `loadHierarchicalBundle()` function to detect linked bundles
- Checks for `link_metadata.json` file in extracted bundle
- **For Linked Bundles:**
  - Reads linked file paths from `link_metadata.json`
  - Verifies linked XML file exists (shows error if missing)
  - Verifies linked audio folder exists (shows error if missing)
  - Uses linked paths directly for all operations
- **For Embedded Bundles:**
  - Uses `xml/working_data.xml` and `audio/` folder as before
- Stores bundle type information in `bundleData`:
  - `isLinkedBundle`: boolean flag
  - `linkMetadata`: stored metadata from linked bundle
  - `xmlPath`: path to XML (linked or embedded)
  - `audioFolder`: path to audio folder (linked or embedded)

#### Direct XML Updates (`desktop_matching_app/src/main.js`)
- Modified `updateWorkingXmlWithSessionData()` function:
  - **For Linked Bundles:** Writes changes directly to the original XML file
  - **For Embedded Bundles:** Writes to `working_data.xml` in bundle
  - Updates in-memory data after writing linked XML
- Modified `saveSession()` function:
  - Automatically calls `updateWorkingXmlWithSessionData()` for linked bundles
  - Ensures changes are immediately persisted to the original XML file
  - Changes apply in real-time as user works

#### Audio File Access (`desktop_matching_app/src/main.js`)
- Modified `get-audio-path` handler:
  - Uses `bundleData.audioFolder` path (works for both linked and embedded)
  - Automatically resolves to correct folder based on bundle type
  - No changes needed in renderer code

### 3. Copy Reference Numbers Feature

#### Tone Group Cards (`desktop_matching_app/public/renderer.js`)
- Added "📋 Copy Refs" button to each tone group card header
- Button appears next to Edit button
- Copies all reference numbers from the group to clipboard
- Shows brief notification when copied

#### Hierarchical Navigation (`desktop_matching_app/public/renderer.js`)
- Added copy button to each sub-bundle item
- Added copy button to each category header (copies all refs in category)
- Added copy button to each organizational group header
- Buttons styled consistently: 📋 emoji, small padding, gray background

#### Copy Functionality (`desktop_matching_app/public/renderer.js`)
- `copyReferencesToClipboard(references)` function:
  - Joins references with spaces (preserves leading zeros)
  - Uses Electron's clipboard API
  - Shows success notification (green toast, 2 second duration)
  - Logs count of references copied
- `collectCategoryReferences(children, orgGroups)` helper:
  - Recursively collects all references from categories and subcategories
  - Used by category header copy buttons

## User Workflows

### Creating a Linked Bundle
1. Open Bundler App
2. Select "Hierarchical Macro-Bundle"
3. Check "Create Linked Bundle" checkbox
4. Select XML file and audio folder as usual
5. Configure hierarchy
6. Create bundle
7. Result: Small `.tnset` file containing only metadata and hierarchy, no embedded files

### Using a Linked Bundle
1. Open Desktop Matching App
2. Load the linked `.tnset` bundle
3. App verifies linked files exist
4. Work normally - all changes save directly to original XML file
5. Audio plays from original audio folder
6. Changes are immediately visible in Dekereke if XML is reloaded

### Copying Reference Numbers
1. **From Tone Group:** Click "📋 Copy Refs" button on group card
2. **From Sub-bundle:** Click 📋 button on sub-bundle item in navigation
3. **From Category:** Click 📋 button on category header
4. References copied to clipboard (space-separated, with leading zeros)
5. Paste into Dekereke to load those records

## Technical Details

### Linked Bundle Structure
```
bundle.tnset (ZIP archive)
├── link_metadata.json     # Contains paths to linked files
├── hierarchy.json         # Hierarchy structure with references
└── settings.json          # Bundle settings
```

### Link Metadata Format
```json
{
  "linkedBundle": true,
  "linkedXmlPath": "/absolute/path/to/original.xml",
  "linkedAudioFolder": "/absolute/path/to/audio/",
  "bundleCreatedAt": "2025-12-02T12:34:56.789Z",
  "bundleCreatedOn": "hostname"
}
```

### Embedded Bundle Structure (unchanged)
```
bundle.tnset (ZIP archive)
├── xml/
│   ├── original_data.xml
│   └── working_data.xml
├── audio/
│   ├── sound1.wav
│   ├── sound2.wav
│   └── ...
├── hierarchy.json
└── settings.json
```

## Benefits

### Linked Bundles
- **Small file size:** Only metadata, no audio or XML data
- **Real-time updates:** Changes immediately visible in source system
- **No duplication:** Single source of truth for data
- **Direct editing:** Work directly on production files
- **Fast creation:** No need to copy large audio files

### Copy Reference Numbers
- **Easy lookup:** Quickly view records in Dekereke
- **Batch operations:** Copy entire categories at once
- **Dekereke integration:** Paste references directly into Dekereke
- **Workflow efficiency:** Seamlessly move between apps

## Limitations and Requirements

### Linked Bundles
- **Path stability:** XML and audio files must remain in original locations
- **Access required:** Desktop app must have read/write access to linked files
- **Portability:** Bundle is not portable to other machines
- **Backup:** Changes to XML are immediate and permanent
- **Hierarchical only:** Linked bundles only work with hierarchical bundles, not legacy

### When to Use Each Type

**Use Linked Bundles when:**
- Working on local machine with files in stable locations
- Want changes to immediately update source files
- Bundle size is a concern
- Need to avoid data duplication

**Use Embedded Bundles when:**
- Need to share bundles with others
- Want to work offline or on different machine
- Need to preserve original data unchanged
- Want self-contained archive

## Files Modified

### Bundler App
- `bundler_app/public/index.html` - Added linked bundle checkbox UI
- `bundler_app/public/renderer.js` - Added linked bundle handlers and settings
- `bundler_app/src/main.js` - Implemented linked bundle creation logic

### Desktop Matching App
- `desktop_matching_app/src/main.js` - Added linked bundle detection, loading, and direct XML updates
- `desktop_matching_app/public/renderer.js` - Added copy reference buttons and clipboard functionality

## Testing Checklist

- [ ] Create linked hierarchical bundle
- [ ] Load linked bundle in desktop app
- [ ] Verify XML file path resolution
- [ ] Verify audio file path resolution
- [ ] Add word to tone group
- [ ] Verify XML file updated on disk
- [ ] Close and reopen bundle
- [ ] Verify changes persisted
- [ ] Copy references from tone group
- [ ] Copy references from sub-bundle
- [ ] Copy references from category
- [ ] Paste references into Dekereke
- [ ] Verify Dekereke loads correct records
- [ ] Create embedded bundle (verify still works)
- [ ] Load embedded bundle (verify backward compatibility)
- [ ] Test with missing linked XML (should show error)
- [ ] Test with missing linked audio folder (should show error)
