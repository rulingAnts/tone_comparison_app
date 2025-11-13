# Desktop Matching App - Hierarchical Bundle Test Plan

To add further:
The ability to type in a name for and create new elements if the user doesn't select an existing one (ask about and clarify the existing behavior on this first). Also, guid fields should always be included (we can remove these during re-import/merge into Dekereke DB again).

## Test Date
November 12, 2025

## Objective
Validate all hierarchical bundle features (Tasks 1-9) work correctly end-to-end.

## Test Environment
- **OS**: macOS
- **Apps**: Bundler App v1.0.0, Desktop Matching App Phase 2
- **Sample Data**: `/private/tone_matching_xml/data_original.xml`
- **Audio Files**: `/private/tone_matching_xml/` (if available)

---

## Pre-Test Setup

### 1. Prepare Sample Data
- [x] Verify `data_original.xml` exists
- [ ] Verify audio files exist
- [ ] Note record count and category fields

### 2. Start Applications
- [x] Start Bundler App (`npm run start` from bundler_app/)
- [ ] Start Desktop Matching App (`npm run debug` from desktop_matching_app/)

---

## Test Suite 1: Create Hierarchical Bundle (Bundler App)

### Test 1.1: Create 2-Level Hierarchy
**Objective**: Create a basic hierarchical bundle for testing

**Steps**:
1. [ ] Launch bundler app
2. [ ] Select "Hierarchical Macro-Bundle (.tnset)"
3. [ ] Load XML: `/private/tone_matching_xml/data_original.xml`
4. [ ] Select audio folder (if available) or skip
5. [ ] Configure Display Settings:
   - [ ] Written Form Field: "Tulisan"
   - [ ] Phonetic Form Field: "Phonetic"
   - [ ] Audio File Field: "SoundFile"
   - [ ] Reference Field: "Reference"
6. [ ] Add Hierarchy Level 1:
   - [ ] Field: "Category"
   - [ ] Note unique values and counts
   - [ ] Leave all values checked
7. [ ] Add Hierarchy Level 2 (if available, otherwise skip):
   - [ ] Select another category field
   - [ ] Leave all values checked
8. [ ] Click "Create Macro-Bundle"
9. [ ] Save as: `/private/test_hierarchical.tnset`

**Expected Results**:
- [ ] Bundle creates without errors
- [ ] File size > 0 bytes
- [ ] Success message displayed

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 2: Load Hierarchical Bundle (Desktop Matching App)

### Test 2.1: Initial Load and Navigation
**Objective**: Verify Task 1 (detection) and Task 2 (navigation)

**Steps**:
1. [ ] Launch Desktop Matching App
2. [ ] Click "Load Bundle"
3. [ ] Select `/private/test_hierarchical.tnset`
4. [ ] Wait for extraction and loading

**Expected Results**:
- [ ] Bundle type detected as "hierarchical"
- [ ] Navigation screen appears (not work area)
- [ ] Hierarchy tree displayed with correct structure
- [ ] Each node shows label and word count
- [ ] No console errors

**Actual Results**:
```
[Record observations here]
```

### Test 2.2: Sub-Bundle Selection
**Objective**: Verify navigation and sub-bundle loading

**Steps**:
1. [ ] Click on a leaf node in hierarchy tree
2. [ ] Observe transition to work area

**Expected Results**:
- [ ] Navigation screen hides
- [ ] Work area appears
- [ ] Sub-bundle indicator shows current path
- [ ] "Back to Navigation" button visible
- [ ] First word from queue loads
- [ ] Queue shows remaining words
- [ ] Export section shows hierarchical options (not legacy)

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 3: Enhanced Display Features

### Test 3.1: Reference Number Display (Task 5)
**Objective**: Verify reference numbers show correctly

**Steps**:
1. [ ] Check current word display area
2. [ ] Look for reference number display

**Expected Results**:
- [ ] Reference number visible for current word
- [ ] Reference numbers visible in queue (if applicable)
- [ ] Reference numbers show in tone groups when words added

**Actual Results**:
```
[Record observations here]
```

### Test 3.2: Enhanced Tone Group Display (Task 3)
**Objective**: Verify enhanced metadata displays

**Steps**:
1. [ ] Create a new tone group
2. [ ] Add a word to the group
3. [ ] Check group card display

**Expected Results**:
- [ ] Group number displays
- [ ] Members list shows words with references
- [ ] Placeholder for pitch transcription visible
- [ ] Placeholder for tone abbreviation visible
- [ ] Placeholder for exemplar word visible
- [ ] Image placeholder visible

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 4: Tone Group Editing

### Test 4.1: Edit Group Metadata (Task 4)
**Objective**: Test enhanced editing modal

**Steps**:
1. [ ] Click edit button on a tone group
2. [ ] Modal opens with fields

**Expected Results**:
- [ ] Modal displays with all fields:
  - [ ] Pitch Transcription input (Contour6 font)
  - [ ] Tone Abbreviation input
  - [ ] Exemplar Word dropdown (populated with group members)
  - [ ] Add Image button
- [ ] Can enter pitch transcription
- [ ] Can enter tone abbreviation
- [ ] Can select exemplar word from dropdown
- [ ] Can add image from file system

**Actual Results**:
```
[Record observations here]
```

### Test 4.2: Save Group Edits
**Steps**:
1. [ ] Enter pitch: "˥˧˩"
2. [ ] Enter abbreviation: "HML"
3. [ ] Select an exemplar word
4. [ ] Add an image
5. [ ] Click "Save Changes"

**Expected Results**:
- [ ] Modal closes
- [ ] Group card updates with new metadata
- [ ] Pitch renders in Contour6 font
- [ ] Abbreviation displays
- [ ] Exemplar word highlighted or marked
- [ ] Image displays in group card
- [ ] Group auto-unmarked as reviewed (if was reviewed)

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 5: Word Movement Between Sub-Bundles

### Test 5.1: Move Word to Different Sub-Bundle (Task 6)
**Objective**: Test word movement functionality

**Steps**:
1. [ ] Add several words to a tone group
2. [ ] Click move button (↗) on a member card
3. [ ] Modal opens with hierarchy tree

**Expected Results**:
- [ ] Move modal displays
- [ ] Hierarchy tree shows all sub-bundles
- [ ] Current sub-bundle indicated/disabled
- [ ] Can expand/collapse nodes
- [ ] Can select a different leaf sub-bundle

**Actual Results**:
```
[Record observations here]
```

### Test 5.2: Confirm Word Move
**Steps**:
1. [ ] Select a different sub-bundle in move modal
2. [ ] Click "Move Word"

**Expected Results**:
- [ ] Modal closes
- [ ] Word removed from current group
- [ ] Word removed from current sub-bundle queue
- [ ] Success message or confirmation
- [ ] Group auto-unmarked as reviewed (if was reviewed)
- [ ] If group now empty, consider deletion behavior

**Actual Results**:
```
[Record observations here]
```

### Test 5.3: Verify Word in Target Sub-Bundle
**Steps**:
1. [ ] Click "Back to Navigation"
2. [ ] Navigate to the target sub-bundle
3. [ ] Check queue

**Expected Results**:
- [ ] Moved word appears in target queue
- [ ] Word not assigned to any group yet
- [ ] Word can be sorted normally

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 6: Review Status Management

### Test 6.1: Mark Group as Reviewed (Task 7)
**Objective**: Test review status functionality

**Steps**:
1. [ ] Create a group with 5+ members
2. [ ] Click "Mark Reviewed" button on group card

**Expected Results**:
- [ ] Group marked as reviewed (visual indicator)
- [ ] Mark Reviewed button changes state

**Actual Results**:
```
[Record observations here]
```

### Test 6.2: Auto-Unmark on Edits
**Steps**:
1. [ ] Mark a group as reviewed
2. [ ] Add a new word to the group

**Expected Results**:
- [ ] Group automatically unmarked
- [ ] Visual indicator updates

**Also Test**:
- [ ] Remove word from reviewed group → auto-unmark
- [ ] Edit group metadata → auto-unmark

**Actual Results**:
```
[Record observations here]
```

### Test 6.3: Mark All Reviewed
**Steps**:
1. [ ] Create multiple groups with 5+ members each
2. [ ] Assign all words in queue
3. [ ] Completion banner appears

**Expected Results**:
- [ ] "Mark All Reviewed" button visible in header
- [ ] Click button
- [ ] All groups with 5+ members marked as reviewed
- [ ] Completion banner displays correctly
- [ ] Banner shows stats (e.g., "32/32 words assigned")

**Actual Results**:
```
[Record observations here]
```

### Test 6.4: Sub-Bundle Review Status
**Steps**:
1. [ ] Mark all groups reviewed in current sub-bundle
2. [ ] Navigate back to navigation screen

**Expected Results**:
- [ ] Current sub-bundle shows reviewed indicator in tree
- [ ] Can navigate to other sub-bundles

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 7: Session Persistence

### Test 7.1: Save and Reload Session
**Objective**: Verify session saves automatically

**Steps**:
1. [ ] Create several tone groups with words
2. [ ] Add metadata to groups
3. [ ] Mark some groups as reviewed
4. [ ] Close Desktop Matching App
5. [ ] Reopen Desktop Matching App
6. [ ] Click "Load Bundle"
7. [ ] Select the same `.tnset` file

**Expected Results**:
- [ ] Session loads with all previous work
- [ ] Tone groups preserved with members
- [ ] Group metadata preserved (pitch, abbreviation, exemplar, image)
- [ ] Review status preserved
- [ ] Queue position preserved
- [ ] Can continue working from where left off

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 8: Export Functionality

### Test 8.1: Export Complete Hierarchical Session (Task 8)
**Objective**: Test full session export

**Steps**:
1. [ ] Work on multiple sub-bundles (sort words, add metadata)
2. [ ] Return to any sub-bundle
3. [ ] Click "Export Complete Session" button
4. [ ] Save dialog appears
5. [ ] Save as `/private/test_export_complete.tnset`

**Expected Results**:
- [ ] Export completes without errors
- [ ] Success message with file path
- [ ] File created with `.tnset` extension

**Verification**:
```bash
# Extract and examine structure
unzip /Users/Seth/GIT/tone_comparison_app/private/test_export_complete.tnset -d /tmp/test_export
cd /tmp/test_export

# Check structure
ls -la  # Should see: manifest.json, hierarchy.json, settings.json, fonts/, sub_bundles/, export_meta.json

# Check manifest
cat manifest.json | grep -E "exportedAt|bundleId|subBundleCount"

# Check export meta
cat export_meta.json

# Check sub-bundles
ls sub_bundles/*/

# Check data_updated.xml files exist
find sub_bundles -name "data_updated.xml"

# Verify tone group assignments in XML
grep -A5 "SurfaceMelodyGroup" sub_bundles/*/data_updated.xml | head -20
```

**Expected in Exported Bundle**:
- [ ] manifest.json has `exportedAt` timestamp
- [ ] export_meta.json exists with statistics
- [ ] Each sub-bundle has `data_updated.xml` with tone assignments
- [ ] metadata.json per sub-bundle with review status
- [ ] Group images copied to sub-bundle images/ folders
- [ ] fonts/ folder with Contour6 font

**Actual Results**:
```
[Record observations here]
```

### Test 8.2: Export Single Sub-Bundle (Task 9)
**Objective**: Test sub-bundle export as legacy format

**Steps**:
1. [ ] Navigate to a specific sub-bundle
2. [ ] Sort some words into groups
3. [ ] Click "Export Sub-Bundle" button
4. [ ] Save dialog appears
5. [ ] Save as `/private/test_export_subbundle.zip`

**Expected Results**:
- [ ] Export completes without errors
- [ ] Success message displayed
- [ ] File created with `.zip` extension

**Verification**:
```bash
# Extract and examine
unzip /Users/Seth/GIT/tone_comparison_app/private/test_export_subbundle.zip -d /tmp/test_subbundle
cd /tmp/test_subbundle

# Check structure (should be legacy format)
ls -la  # Should see: data.xml, data_updated.xml, meta.json, settings.json, audio/, images/

# Check meta
cat meta.json | grep -E "subBundle|bundleId"

# Verify only this sub-bundle's records
grep -c "<data_form>" data_updated.xml

# Check tone assignments
grep "SurfaceMelodyGroup" data_updated.xml | head -5
```

**Expected in Exported ZIP**:
- [ ] Legacy .tncmp structure (not hierarchical)
- [ ] data.xml and data_updated.xml present
- [ ] Only records from this sub-bundle
- [ ] meta.json includes `subBundle` field
- [ ] Audio files from this sub-bundle only
- [ ] Group images included

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 9: Re-Import and Compatibility

### Test 9.1: Re-Import Hierarchical Export
**Objective**: Test loading exported hierarchical bundle

**Steps**:
1. [ ] Close Desktop Matching App
2. [ ] Reopen Desktop Matching App
3. [ ] Load the exported bundle: `/private/test_export_complete.tnset`

**Expected Results**:
- [ ] Bundle loads successfully
- [ ] Navigation screen appears
- [ ] All sub-bundles present in hierarchy tree
- [ ] Navigate to a sub-bundle that had tone groups
- [ ] All tone groups loaded correctly
- [ ] Group members correct
- [ ] Metadata preserved (pitch, abbreviation, exemplar, image)
- [ ] Review status preserved
- [ ] Can continue editing and sorting

**Actual Results**:
```
[Record observations here]
```

### Test 9.2: Load Sub-Bundle Export in Legacy Mode
**Objective**: Verify sub-bundle export is legacy-compatible

**Steps**:
1. [ ] Close Desktop Matching App
2. [ ] Reopen Desktop Matching App
3. [ ] Load the sub-bundle export: `/private/test_export_subbundle.zip`

**Expected Results**:
- [ ] Bundle loads successfully
- [ ] Work area appears directly (no navigation screen)
- [ ] Legacy export UI shown (not hierarchical export options)
- [ ] Tone groups from sub-bundle imported
- [ ] Can work in legacy mode
- [ ] Can export in legacy format

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 10: Edge Cases and Error Handling

### Test 10.1: Empty Sub-Bundle
**Steps**:
1. [ ] Navigate to sub-bundle with no words (if any exist)
2. [ ] Observe behavior

**Expected Results**:
- [ ] App handles gracefully
- [ ] Shows message about no words
- [ ] Can navigate back

**Actual Results**:
```
[Record observations here]
```

### Test 10.2: Large Sub-Bundle
**Steps**:
1. [ ] Navigate to sub-bundle with 100+ words
2. [ ] Add words to groups
3. [ ] Test performance

**Expected Results**:
- [ ] UI remains responsive
- [ ] Word loading is smooth
- [ ] Group rendering performant

**Actual Results**:
```
[Record observations here]
```

### Test 10.3: Special Characters
**Steps**:
1. [ ] Work with words containing Unicode characters
2. [ ] Export and re-import

**Expected Results**:
- [ ] Characters display correctly
- [ ] Export/import preserves characters
- [ ] No encoding issues

**Actual Results**:
```
[Record observations here]
```

### Test 10.4: Missing Audio Files
**Steps**:
1. [ ] Load bundle where some audio files are missing

**Expected Results**:
- [ ] App handles gracefully
- [ ] Play button disabled or shows error
- [ ] Can still sort words without audio

**Actual Results**:
```
[Record observations here]
```

---

## Test Suite 11: Backward Compatibility

### Test 11.1: Load Legacy .tncmp Bundle
**Objective**: Ensure legacy bundles still work

**Steps**:
1. [ ] Create or find a legacy `.tncmp` bundle
2. [ ] Load in Desktop Matching App

**Expected Results**:
- [ ] Bundle loads successfully
- [ ] Work area appears (no navigation screen)
- [ ] Legacy export options shown
- [ ] All features work as before
- [ ] Can export as `.zip`

**Actual Results**:
```
[Record observations here]
```

---

## Summary and Sign-Off

### Test Results Summary

| Test Suite | Tests Passed | Tests Failed | Notes |
|------------|--------------|--------------|-------|
| 1. Create Bundle | _ / _ | _ / _ | |
| 2. Load & Navigate | _ / _ | _ / _ | |
| 3. Display Features | _ / _ | _ / _ | |
| 4. Group Editing | _ / _ | _ / _ | |
| 5. Word Movement | _ / _ | _ / _ | |
| 6. Review Status | _ / _ | _ / _ | |
| 7. Session Persistence | _ / _ | _ / _ | |
| 8. Export | _ / _ | _ / _ | |
| 9. Re-Import | _ / _ | _ / _ | |
| 10. Edge Cases | _ / _ | _ / _ | |
| 11. Backward Compat | _ / _ | _ / _ | |
| **TOTAL** | **_ / _** | **_ / _** | |

### Issues Found
```
[List any bugs, issues, or unexpected behavior discovered during testing]
```

### Recommendations
```
[Any suggestions for improvements or additional testing needed]
```

### Sign-Off
- [ ] All critical tests passed
- [ ] All tasks (1-9) verified working
- [ ] Ready for deployment

**Tester**: _______________  
**Date**: November 12, 2025  
**Version**: Phase 2 (Hierarchical Bundle Support)
