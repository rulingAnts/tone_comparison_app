# Remaining Implementation Tasks for Desktop Matching App

## Known Issues

### Audio Variant Assignment in Hierarchy
**Status**: Not working correctly in bundler_app  
**Description**: Associating different audio file variants with different parts of the hierarchy tree is not functioning as expected. Currently, all hierarchy nodes inherit the global audio variants configuration rather than respecting per-node variant assignments.  
**Impact**: Low - Current work focuses on nouns only with consistent audio variant requirements across all hierarchy branches.  
**Priority**: Deferred - Save for future enhancement when working with more complex hierarchies requiring different audio variants per category.

## 1. Simplified move-word-to-sub-bundle Handler

### Current Status
The old handler copies audio files between sub-bundle directories and updates XML in multiple locations.

### New Implementation Needed
For bundles with `usesNewStructure === true`:

1. **Update hierarchy.json**:
   - Remove Reference from source sub-bundle's `references` array
   - Add Reference to target sub-bundle's `references` array
   - Update `recordCount` fields
   - Write updated hierarchy.json to disk

2. **Update working_data.xml**:
   - Read `xml/working_data.xml`
   - Find data_form by Reference
   - Update category fields to match target sub-bundle's criteria
   - Get field/value pairs by traversing hierarchy tree path
   - Write updated XML with UTF-16 encoding and proper XML declaration

3. **Update session data**:
   - Remove ref from current sub-bundle queue/groups
   - Add ref to target sub-bundle queue
   - Update counts
   - NO audio file movement needed!

4. **Track changes**:
   - Call changeTracker.logSubBundleMove() with field changes

### Key Helper Functions Needed

```javascript
// Get category field updates from hierarchy tree path
function getCategoryUpdatesForPath(targetPath, hierarchy) {
  // Parse path like "Noun/CVCV" 
  // Walk hierarchy tree to determine field=value pairs
  // Example: path "Noun/CVCV" => { Category: "Noun", SyllableProfile: "CVCV" }
}

// Update hierarchy.json with Reference move
function updateHierarchyJson(hierarchyPath, currentPath, targetPath, ref) {
  // Read hierarchy.json
  // Find leaf node at currentPath, remove ref from references array
  // Find leaf node at targetPath, add ref to references array
  // Update recordCount fields
  // Write back to disk
}

// Update working_data.xml with field changes
function updateWorkingDataXml(xmlPath, ref, fieldUpdates) {
  // Read xml/working_data.xml with UTF-16 encoding
  // Parse with fast-xml-parser
  // Find data_form where Reference === ref
  // Update fields: Object.entries(fieldUpdates).forEach(([k,v]) => record[k] = v)
  // Build XML with XMLBuilder
  // Prepend XML declaration: '<?xml version="1.0" encoding="utf-16"?>\n'
  // Write with UTF-16 encoding: fs.writeFileSync(path, xml, 'utf16le')
}
```

## 2. XML Export Functionality ✅ COMPLETED

### Implementation Status: COMPLETE
**Date**: November 26, 2025

The export functionality has been fully implemented with the following features:

1. **Automatic XML Update Before Export**:
   - `updateWorkingXmlWithSessionData()` function updates `working_data.xml` with all session changes
   - Applies all tone group assignments (group number, group ID, metadata fields)
   - Applies all user spelling corrections
   - Processes all sub-bundles in hierarchical bundles
   - Preserves UTF-16 encoding

2. **Complete Bundle Export**:
   - `exportHierarchicalBundle()` updates XML then packages complete .tnset
   - Includes updated `xml/working_data.xml` with all changes
   - Includes `xml/original_data.xml` (unchanged reference)
   - Includes `audio/` folder with all audio files
   - Includes `hierarchy.json` with current structure
   - Includes `settings.json` with bundle configuration
   - Includes `change_history.json` with all tracked changes
   - Includes `fonts/` folder if present

3. **UI Integration**:
   - "Export Complete Session" button exports full hierarchical bundle
   - Checks for metadata conflicts before export
   - Shows conflict modal if group metadata would overwrite existing values
   - User can approve or cancel export after reviewing conflicts

### What Gets Exported
- ✅ All tone group assignments (finished groups)
- ✅ User spelling corrections (confirmed spellings)
- ✅ Group metadata (pitch, abbreviation, exemplar)
- ✅ Unfinished work (words still in queue preserved as-is)
- ✅ Change history for tracking and undo
- ✅ Original XML for reference/comparison

### Validation Features
- ✅ UTF-16 encoding preserved in XML
- ✅ XML structure validated during build
- ✅ Group metadata conflicts detected and reported
- ✅ Error handling for missing files or malformed data

## 3. Graceful Audio Missing Handling

### Already Partially Implemented
The `get-audio-path` handler already returns `null` when audio not found.

### Additional UI Improvements Needed (Renderer Side)
In `public/renderer.js`:
- Check if audio path is null before playing
- Show user-friendly toast: "Audio recording not available for this word"
- Disable play button when audio missing
- Add visual indicator (grayed out speaker icon)

## 4. Testing Checklist

### Test with New Structure Bundle
- [ ] Create hierarchical bundle with bundler_app (verify xml/, audio/, hierarchy.json)
- [ ] Load in desktop_matching_app
- [ ] Navigate sub-bundles, verify words load
- [ ] Check audio playback from centralized audio/ folder
- [ ] Move word to different sub-bundle:
  - [ ] Verify hierarchy.json updated
  - [ ] Verify working_data.xml updated
  - [ ] Verify word appears in target sub-bundle queue
  - [ ] Verify category fields changed
- [ ] Export working_data.xml
- [ ] Verify exported XML has UTF-16 encoding
- [ ] Verify category changes preserved in export

### Test Backward Compatibility
- [ ] Load old structure bundle (sub_bundles/ folders)
- [ ] Verify all operations work as before
- [ ] Move word between sub-bundles (old way with audio copying)

### Test Error Handling
- [ ] Delete an audio file, try to play it (should show graceful message)
- [ ] Provide XML with duplicate References to bundler (should show error)
- [ ] Try to move word to invalid sub-bundle (should show error)

## 5. Code Quality

### Follow Existing Patterns
- Use normalizeRefString() for all Reference comparisons
- Use XMLParser with same options throughout
- Use XMLBuilder with format: true, indentBy: '  '
- Log with appropriate prefixes: [move-word], [export], etc.

### Error Handling
- Wrap all file operations in try-catch
- Return { success: false, error: message } for failures
- Log errors to console with context

### Performance
- New structure is faster: no XML parsing per sub-bundle
- Array filtering is O(n) but with small n (typically < 1000 words per sub-bundle)
- Keep allDataForms in memory to avoid repeated I/O

## 6. Documentation Updates

After implementation complete:
- Update IMPLEMENTATION.md with new architecture details
- Add migration guide for old to new structure
- Document hierarchy.json schema
- Add examples of category field updates
