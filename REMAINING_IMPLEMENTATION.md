# Remaining Implementation Tasks for Desktop Matching App

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

## 2. XML Export Functionality

### Export Handler Needed

```javascript
ipcMain.handle('export-hierarchical-bundle', async (event, options) => {
  // For new structure bundles only
  if (!bundleData.usesNewStructure) {
    return { success: false, error: 'Old structure uses different export method' };
  }
  
  // 1. Copy working_data.xml to export location
  const workingXmlPath = path.join(extractedPath, 'xml', 'working_data.xml');
  const exportPath = options.outputPath;
  fs.copyFileSync(workingXmlPath, exportPath);
  
  // 2. Optionally generate change report
  const changes = changeTracker.generateReport();
  const reportPath = exportPath.replace('.xml', '_changes.json');
  fs.writeFileSync(reportPath, JSON.stringify(changes, null, 2));
  
  return { 
    success: true, 
    xmlPath: exportPath,
    reportPath: reportPath
  };
});
```

### Validation Before Export
- Check working_data.xml is well-formed
- Verify UTF-16 encoding preserved
- Ensure all References still valid
- Compare structure to original_data.xml

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
