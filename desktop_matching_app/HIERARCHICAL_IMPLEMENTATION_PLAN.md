# Desktop Matching App - Hierarchical Bundle Implementation Plan

## STATUS: ✅ DESKTOP APP COMPLETE (November 12, 2025)

**All 10 tasks for the Desktop Matching App have been successfully implemented.**

See `IMPLEMENTATION_COMPLETE.md` for full details of the completed implementation.

---

## Overview

This document outlined the implementation plan for adding hierarchical bundle (.tnset) support to the Desktop Matching app while maintaining full backward compatibility with legacy .tncmp bundles.

**Desktop Implementation**: ✅ Complete  
**Mobile Implementation**: ⏳ Pending (see Mobile App Phase below)

---

## Desktop App Implementation Status

### Phase 1: Core Infrastructure ✅ COMPLETE
- **Task 1**: Bundle Type Detection and Loading ✅
- **Task 2**: Sub-Bundle Navigation Screen ✅

### Phase 2: Enhanced Display ✅ COMPLETE
- **Task 3**: Enhanced Tone Group Display ✅
- **Task 4**: Tone Group Editing Enhancements ✅
- **Task 5**: Reference Number Display ✅

### Phase 3: Advanced Features ✅ COMPLETE
- **Task 6**: Word Movement Between Sub-Bundles ✅
- **Task 7**: Review Status Management ✅

### Phase 4: Export ✅ COMPLETE
- **Task 8**: Export Hierarchical Session ✅
- **Task 9**: Export Individual Sub-Bundle ✅

### Phase 5: Testing ✅ COMPLETE
- **Task 10**: Test Bundle Loading ✅

**Total**: 10/10 tasks complete (~2,090 lines of code added)

---

## Mobile App Implementation (PENDING)

The mobile app (Flutter) requires similar hierarchical bundle support. The following tasks are needed:

### Phase 1: Core Infrastructure (Mobile)
- [ ] **Task 1**: Bundle type detection and loading (.tnset vs .tncmp)
- [ ] **Task 2**: Sub-bundle navigation screen with tree view
- [ ] **Task 3**: Sub-bundle selection and session management

### Phase 2: Enhanced Display (Mobile)
- [ ] **Task 4**: Load and render Contour6 font for pitch transcription
- [ ] **Task 5**: Enhanced tone group display with metadata
- [ ] **Task 6**: Reference number display throughout UI
- [ ] **Task 7**: Group editing with pitch, abbreviation, exemplar fields

### Phase 3: Word Management (Mobile)
- [ ] **Task 8**: Word movement between sub-bundles
- [ ] **Task 9**: Swipe gestures for word operations
- [ ] **Task 10**: Review status management per sub-bundle

### Phase 4: Export & Sync (Mobile)
- [ ] **Task 11**: Export hierarchical session
- [ ] **Task 12**: Export individual sub-bundle
- [ ] **Task 13**: Cloud sync for hierarchical bundles (if applicable)

### Phase 5: Testing (Mobile)
- [ ] **Task 14**: Comprehensive testing across iOS and Android
- [ ] **Task 15**: Cross-platform compatibility testing

**Estimated Effort**: 3-4 weeks (similar to desktop implementation)

**Key Mobile Considerations**:
- Flutter package for Contour6 font rendering
- Efficient sub-bundle switching on mobile
- Touch-optimized hierarchy tree navigation
- Memory management for large bundles on mobile devices
- Offline support for hierarchical bundles

---

## Original Implementation Plan (Desktop - Now Complete)

## Phase 1: Core Infrastructure (Tasks 1-2) ✅

### Task 1: Bundle Type Detection and Loading ✓ In Progress

**Changes needed in `src/main.js`:**

```javascript
// Add global bundleType variable
let bundleType = 'legacy'; // 'legacy' or 'hierarchical'
let hierarchyConfig = null; // For hierarchical bundles
let currentSubBundlePath = null; // Track which sub-bundle is loaded

// Modify load-bundle handler:
ipcMain.handle('load-bundle', async (event, filePath) => {
  // 1. Detect bundle type from file extension
  bundleType = filePath.endsWith('.tnset') ? 'hierarchical' : 'legacy';
  
  // 2. Extract bundle
  // 3. Read manifest.json (if hierarchical)
  // 4. Read hierarchy.json (if hierarchical)
  // 5. For hierarchical: present sub-bundle navigation
  // 6. For legacy: proceed with current flow
});
```

**Files to modify:**
- `src/main.js`: Add bundle type detection
- `public/renderer.js`: Handle bundle type in UI
- `public/index.html`: Add navigation screen container

### Task 2: Sub-Bundle Navigation Screen

**New UI Components:**
- Navigation tree view with collapsible hierarchy
- Progress indicators per sub-bundle
- "Back to Navigation" button (when in sub-bundle)
- Sub-bundle selection handler

**Data Structure:**
```javascript
sessionData = {
  bundleId: string,
  bundleType: 'legacy' | 'hierarchical',
  
  // For hierarchical bundles:
  hierarchyConfig: {
    levels: [...],
    subBundles: [
      {
        path: 'Noun/CVCV',
        displayPath: ['Noun', 'CVCV'],
        recordCount: 15,
        assignedCount: 10,
        reviewed: false
      },
      ...
    ]
  },
  currentSubBundle: 'Noun/CVCV' | null,
  
  // Existing fields:
  queue: [...],
  groups: [...],
  records: {...},
  locale: 'en'
};
```

**IPC Handlers to Add:**
```javascript
ipcMain.handle('get-hierarchy', async () => { ... });
ipcMain.handle('load-sub-bundle', async (event, subBundlePath) => { ... });
ipcMain.handle('get-sub-bundle-progress', async () => { ... });
```

---

## Phase 2: Enhanced Display (Tasks 3-5)

### Task 3: Enhanced Tone Group Display

**Changes to group cards:**
- Load and apply Contour6SILDoulos font
- Add pitch transcription display (if configured)
- Add tone abbreviation display (if configured)
- Add exemplar word display (if configured)
- Show reference numbers based on settings

**Font Loading:**
```javascript
// In renderer.js
const fontFace = new FontFace(
  'Contour6SILDoulos',
  'url(fonts/Contour6SILDoulos.ttf)'
);
await fontFace.load();
document.fonts.add(fontFace);
```

**Group Card HTML Template:**
```html
<div class="group-card">
  <h3>Group {number} {reviewStatus}</h3>
  <div class="group-display">
    <div class="pitch-transcription" style="font-family: Contour6SILDoulos">
      {pitch}
    </div>
    <div class="tone-abbreviation">{abbreviation}</div>
    <div class="exemplar-word">{exemplar} {ref}</div>
  </div>
  <div class="group-members">{count} words</div>
  <button>Add Word</button>
  <button>Edit</button>
</div>
```

### Task 4: Tone Group Editing Enhancements

**Edit Modal Additions:**
```html
<div id="editGroupModal">
  <h2>Edit Group {number}</h2>
  
  <!-- Existing fields -->
  <label>Exemplar Image:</label>
  <input type="file" id="groupImage">
  
  <!-- New fields -->
  <label>Pitch Transcription:</label>
  <textarea id="pitchTranscription" 
            style="font-family: Contour6SILDoulos"
            rows="4"></textarea>
  
  <label>Tone Abbreviation:</label>
  <input type="text" id="toneAbbreviation" 
         placeholder="e.g., LHL">
  
  <label>Exemplar Word:</label>
  <input type="text" id="exemplarWord">
  
  <label>
    <input type="checkbox" id="markReviewed">
    Mark as Reviewed
  </label>
  
  <button>Save</button>
  <button>Cancel</button>
</div>
```

**Data Structure Update:**
```javascript
group = {
  id: string,
  groupNumber: number,
  members: [ref1, ref2, ...],
  image: path | null,
  
  // New fields:
  pitchTranscription: string | null,
  toneAbbreviation: string | null,
  exemplarWord: string | null,
  exemplarWordRef: string | null, // Reference number if showing
  
  reviewed: boolean,
  additionsSinceReview: number,
  requiresReview: boolean
};
```

### Task 5: Reference Number Display

**Changes:**
- Read `showReferenceNumbers` from bundle settings
- Add settings toggle in UI
- Show/hide ref in word cards and group exemplars

**UI Addition:**
```html
<div class="settings-panel">
  <label>
    <input type="checkbox" id="showReferenceNumbers">
    Show Reference Numbers
  </label>
</div>
```

---

## Phase 3: Advanced Features (Tasks 6-7)

### Task 6: Word Movement Between Sub-Bundles

**For Hierarchical Bundles Only:**

**New Modal:**
```html
<div id="moveWordModal">
  <h2>Move "{word}" to different sub-bundle</h2>
  <div id="subBundleTree">
    <!-- Hierarchical tree with radio buttons -->
  </div>
  <button id="moveWordBtn">Move</button>
  <button id="cancelMoveBtn">Cancel</button>
</div>
```

**IPC Handler:**
```javascript
ipcMain.handle('move-word-to-subbundle', async (event, ref, targetPath) => {
  // 1. Update word's field values in record
  // 2. Remove from current sub-bundle session
  // 3. Add to target sub-bundle session
  // 4. Save session
  return { success: true };
});
```

**Swipe Interaction:**
1. First swipe right: Remove from group → back to queue
2. Second swipe right (on queued word): Show move modal

### Task 7: Review Status Management

**Per Sub-Bundle Review:**
- Each sub-bundle tracks its own review status
- "Mark All Reviewed" button marks current sub-bundle
- Auto-unmark on word addition/removal

**Session Data Update:**
```javascript
sessionData.subBundleSessions = {
  'Noun/CVCV': {
    queue: [...],
    groups: [...],
    reviewed: false
  },
  'Noun/VCV': {
    queue: [...],
    groups: [...],
    reviewed: true
  },
  ...
};
```

---

## Phase 4: Export (Tasks 8-9)

### Task 8: Export Hierarchical Session

**Create .tnset with updated data:**

```javascript
ipcMain.handle('export-hierarchical-bundle', async (event, outputPath) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // Copy manifest.json, hierarchy.json, settings.json
  // For each sub-bundle:
  //   - Create updated data.xml with tone assignments
  //   - Copy audio files
  //   - Add group images
  //   - Create metadata.json with review status
  
  // Copy fonts/
  // Add export_meta.json with timestamp
  
  await archive.finalize();
});
```

**Export Structure:**
```
export.tnset/
├── manifest.json
├── hierarchy.json
├── settings.json
├── fonts/
│   └── Contour6SILDoulos.ttf
├── sub_bundles/
│   ├── Noun_CVCV/
│   │   ├── data.xml (original)
│   │   ├── data_updated.xml (with tone groups)
│   │   ├── metadata.json (review status, progress)
│   │   ├── audio/
│   │   └── images/
│   └── Noun_VCV/
│       └── ...
└── export_meta.json
```

### Task 9: Export Individual Sub-Bundle

**Export single sub-bundle as legacy .zip:**

```javascript
ipcMain.handle('export-sub-bundle', async (event, subBundlePath, outputPath) => {
  // Create .zip with:
  // - data.xml (original records for this sub-bundle)
  // - data_updated.xml (with tone groups)
  // - audio/ (only for this sub-bundle's records)
  // - images/ (from groups)
  // - settings.json
  // - meta.json
});
```

---

## Phase 5: Testing (Task 10)

### Test Scenarios

1. **Legacy Bundle Loading**
   - Load existing .tncmp bundle
   - Verify existing workflow unchanged
   - Export and verify format

2. **Hierarchical Bundle Loading**
   - Load .tnset with 2-level hierarchy
   - Navigate tree structure
   - Load different sub-bundles

3. **Enhanced Display**
   - Verify font loads correctly
   - Test pitch transcription display
   - Test tone abbreviation display
   - Toggle reference numbers

4. **Word Movement**
   - Move words between sub-bundles
   - Verify field values update
   - Check cross-sub-bundle consistency

5. **Export**
   - Export hierarchical bundle
   - Verify structure matches spec
   - Export individual sub-bundle
   - Reimport and verify data integrity

---

## Implementation Order

**Week 1: Core Infrastructure**
- Task 1: Bundle detection (Day 1-2)
- Task 2: Navigation screen (Day 3-5)

**Week 2: Display Enhancements**
- Task 3: Enhanced group display (Day 1-2)
- Task 4: Group editing (Day 3-4)
- Task 5: Reference numbers (Day 5)

**Week 3: Advanced Features**
- Task 6: Word movement (Day 1-3)
- Task 7: Review management (Day 4-5)

**Week 4: Export & Testing**
- Task 8: Hierarchical export (Day 1-2)
- Task 9: Sub-bundle export (Day 3)
- Task 10: Comprehensive testing (Day 4-5)

---

## Key Considerations

### Backward Compatibility
- Legacy bundles must work exactly as before
- No changes to .tncmp export format
- Session migration for existing users

### Performance
- Lazy-load sub-bundles (don't load all into memory)
- Cache parsed XML per sub-bundle
- Efficient tree rendering for large hierarchies

### User Experience
- Clear visual distinction between bundle types
- Smooth navigation between sub-bundles
- Progress visibility across entire macro-bundle
- Undo/redo for word movements?

### Data Integrity
- Validate sub-bundle paths on load
- Handle missing sub-bundles gracefully
- Preserve all original data on export
- Session backup before major operations

---

## Files to Modify

### Backend (src/)
- `src/main.js` - Primary changes for bundle loading, IPC handlers, export
- `src/utils/refUtils.js` - No changes needed

### Frontend (public/)
- `public/index.html` - Add navigation UI, modals, enhanced controls
- `public/renderer.js` - Major changes for navigation, display, interaction
- `public/localization.js` - Add new translation keys

### Assets
- `public/fonts/` - Add Contour6SILDoulos.ttf (copy from bundled .tnset)

### Documentation
- `README.md` - Update with hierarchical bundle documentation
- `TESTING_HIERARCHICAL.md` - Create testing guide

---

---

## Summary

### Desktop App: ✅ COMPLETE
All 10 tasks implemented successfully. The Desktop Matching App now fully supports:
- Hierarchical bundle (.tnset) loading and navigation
- Sub-bundle management with tree-based navigation
- Enhanced metadata display (pitch transcription, tone abbreviation, exemplar)
- Word movement between sub-bundles
- Review status tracking per sub-bundle
- Dual export (complete session + individual sub-bundles)
- 100% backward compatible with legacy .tncmp bundles

**See**: `IMPLEMENTATION_COMPLETE.md` for full implementation details

### Mobile App: ⏳ PENDING
Requires similar implementation with Flutter-specific adaptations:
- 15 tasks estimated
- 3-4 weeks development time
- Touch-optimized UI for hierarchy navigation
- Memory-efficient bundle loading for mobile devices

### Next Steps
1. ✅ Desktop app ready for production use
2. ⏳ Begin mobile app Phase 1 when resources available
3. ⏳ Plan cross-platform testing strategy
4. ⏳ Document mobile-specific considerations

---

## References

**Desktop Implementation Docs**:
- `IMPLEMENTATION_COMPLETE.md` - Complete status and summary
- `EXPORT_IMPLEMENTATION.md` - Export functionality details
- `TEST_PLAN.md` - Comprehensive test scenarios
- `HIERARCHICAL_FEATURE_SPEC.md` - Original specification

**Mobile App Planning**:
- Location: `/mobile_app/` (Flutter project)
- Status: Awaiting Phase 1 implementation
- Priority: Medium (desktop provides full functionality)

---

**Last Updated**: November 12, 2025  
**Desktop Status**: ✅ Complete  
**Mobile Status**: ⏳ Pending
