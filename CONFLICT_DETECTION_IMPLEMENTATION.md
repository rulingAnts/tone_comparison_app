# Conflict Detection Implementation Plan

## Overview
This document outlines the work to complete the single-field grouping with conflict detection feature.

## Status: ✅ COMPLETED (November 21, 2025)

### ✅ All Tasks Completed
- [x] Bundler UI changed to radio buttons (single field selection)
- [x] Settings structure updated (`groupingField` replaces boolean flags)
- [x] `detectGroupConflicts()` function added to main.js
- [x] Radio button enable/disable logic based on field configuration
- [x] Update `loadLegacyBundle()` to use single-field grouping
- [x] Update hierarchical `loadSubBundle()` to use single-field grouping
- [x] Add conflict detection before export
- [x] Create conflict resolution UI
- [x] Add IPC handlers for conflict checking
- [x] Wire up export workflow
- [x] Commit implementation

### 🎉 Implementation Complete

**Commit:** 62d65c9 - "feat: Complete single-field grouping with conflict detection"

**Files Modified:**
- `desktop_matching_app/src/main.js` (backend logic)
- `desktop_matching_app/public/renderer.js` (frontend logic)
- `desktop_matching_app/public/index.html` (conflict modal UI)

---

## Implementation Summary

### 1. Update Legacy Bundle Loading

**File:** `desktop_matching_app/src/main.js`  
**Function:** `loadLegacyBundle()` (around line 468)

**Current Code:** Uses multi-field composite keys

**New Logic:**
```javascript
// Determine which single field to use for grouping
const groupingField = settings.groupingField || 'none';
let groupingKey = null;

if (groupingField === 'id' && tgIdKey) {
  groupingKey = tgIdKey;
} else if (groupingField === 'pitch' && pitchKey) {
  groupingKey = pitchKey;
} else if (groupingField === 'abbreviation' && abbreviationKey) {
  groupingKey = abbreviationKey;
} else if (groupingField === 'exemplar' && exemplarKey) {
  groupingKey = exemplarKey;
}

if (groupingKey) {
  // Group by single field value
  const groupMap = new Map(); // field value -> group data
  
  dataForms.forEach(record => {
    const ref = normalizeRefString(record.Reference);
    const groupValue = record[groupingKey];
    
    if (groupValue) {
      if (!groupMap.has(groupValue)) {
        const groupId = (groupingField === 'id') 
          ? groupValue 
          : `group_${groupValue.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        groupMap.set(groupValue, {
          id: groupId,
          groupNumber: groupMap.size + 1,
          members: [],
          groupingValue: groupValue, // Store what field value was used
          // ... other properties
        });
      }
      
      groupMap.get(groupValue).members.push(ref);
      // Remove from queue...
    }
  });
  
  // Determine most common metadata for ALL fields (not just grouping field)
  sessionData.groups.forEach(group => {
    const metadata = findMostCommonGroupMetadata(
      group.members,
      dataForms,
      pitchKey,      // Check all fields
      abbreviationKey,
      exemplarKey
    );
    
    group.pitchTranscription = metadata.pitchTranscription;
    group.toneAbbreviation = metadata.toneAbbreviation;
    group.exemplarWord = metadata.exemplarWord;
  });
}
```

### 2. Update Hierarchical Bundle Loading

**File:** `desktop_matching_app/src/main.js`  
**Function:** Inside `ipcMain.handle('load-sub-bundle')` (around line 1267)

Same logic as legacy bundle, but for `subBundleSession.groups` instead of `sessionData.groups`.

### 3. Add Export Conflict Check

**File:** `desktop_matching_app/src/main.js`  
**Location:** Before `exportHierarchicalBundle()` and `exportLegacyBundle()`

**New IPC Handler:**
```javascript
ipcMain.handle('check-export-conflicts', async () => {
  if (!bundleData || !sessionData) {
    return { hasConflicts: false };
  }
  
  const settings = bundleData.settings;
  const pitchKey = settings.pitchField;
  const abbreviationKey = settings.abbreviationField;
  const exemplarKey = settings.exemplarField;
  
  let conflicts = [];
  
  if (bundleType === 'hierarchical') {
    // Check current sub-bundle or all sub-bundles?
    const groups = sessionData.groups || [];
    conflicts = detectGroupConflicts(
      groups,
      bundleData.records,
      pitchKey,
      abbreviationKey,
      exemplarKey
    );
  } else {
    // Legacy bundle
    conflicts = detectGroupConflicts(
      sessionData.groups,
      bundleData.records,
      pitchKey,
      abbreviationKey,
      exemplarKey
    );
  }
  
  return {
    hasConflicts: conflicts.length > 0,
    conflicts: conflicts,
    fieldNames: {
      pitch: pitchKey,
      abbreviation: abbreviationKey,
      exemplar: exemplarKey,
    },
  };
});
```

### 4. Conflict Resolution UI

**File:** `desktop_matching_app/public/index.html`  
**Location:** Add modal before closing `</body>`

```html
<!-- Conflict Resolution Modal -->
<div id="conflictModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 2000; overflow-y: auto;">
  <div style="background: white; margin: 50px auto; max-width: 900px; border-radius: 8px; padding: 24px;">
    <h2>⚠️ Data Conflicts Detected</h2>
    <p>
      Some words in your tone groups have values that differ from the group's majority. 
      If you proceed with export, these values will be <strong>overwritten</strong> to ensure consistency.
    </p>
    
    <div id="conflictList" style="max-height: 400px; overflow-y: auto; margin: 20px 0;">
      <!-- Conflicts will be rendered here -->
    </div>
    
    <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px; margin: 16px 0;">
      <strong>Alternative:</strong> If you don't want these values overwritten, cancel the export and either:
      <ul style="margin: 8px 0; padding-left: 24px;">
        <li>Configure different output field names to preserve original data</li>
        <li>Manually fix inconsistencies in your Dekereke XML</li>
        <li>Exclude problematic fields from bundle configuration</li>
      </ul>
    </div>
    
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="cancelConflictBtn" style="padding: 8px 16px;">Cancel Export</button>
      <button id="approveConflictBtn" style="padding: 8px 16px; background: #dc3545; color: white;">
        Overwrite Conflicts and Export
      </button>
    </div>
  </div>
</div>
```

### 5. Renderer Logic

**File:** `desktop_matching_app/public/renderer.js`

**Add to export button click handler:**
```javascript
document.getElementById('exportBtn').addEventListener('click', async () => {
  // Check for conflicts first
  const conflictResult = await ipcRenderer.invoke('check-export-conflicts');
  
  if (conflictResult.hasConflicts) {
    // Show conflict modal
    showConflictModal(conflictResult);
  } else {
    // No conflicts, proceed with export
    proceedWithExport();
  }
});

function showConflictModal(conflictData) {
  const modal = document.getElementById('conflictModal');
  const conflictList = document.getElementById('conflictList');
  
  // Build conflict display
  let html = '';
  conflictData.conflicts.forEach(groupConflict => {
    html += `
      <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 12px; border-radius: 4px;">
        <h4>Group ${groupConflict.groupNumber} (${groupConflict.groupingValue})</h4>
    `;
    
    if (groupConflict.pitchConflicts.length > 0) {
      html += `<p><strong>Pitch (${conflictData.fieldNames.pitch}):</strong></p><ul>`;
      groupConflict.pitchConflicts.forEach(c => {
        html += `<li>Ref ${c.reference}: "${c.currentValue}" → "${c.willBecome}"</li>`;
      });
      html += `</ul>`;
    }
    
    if (groupConflict.abbreviationConflicts.length > 0) {
      html += `<p><strong>Abbreviation (${conflictData.fieldNames.abbreviation}):</strong></p><ul>`;
      groupConflict.abbreviationConflicts.forEach(c => {
        html += `<li>Ref ${c.reference}: "${c.currentValue}" → "${c.willBecome}"</li>`;
      });
      html += `</ul>`;
    }
    
    if (groupConflict.exemplarConflicts.length > 0) {
      html += `<p><strong>Exemplar (${conflictData.fieldNames.exemplar}):</strong></p><ul>`;
      groupConflict.exemplarConflicts.forEach(c => {
        html += `<li>Ref ${c.reference}: "${c.currentValue}" → "${c.willBecome}"</li>`;
      });
      html += `</ul>`;
    }
    
    html += `</div>`;
  });
  
  conflictList.innerHTML = html;
  modal.style.display = 'block';
}

document.getElementById('cancelConflictBtn').addEventListener('click', () => {
  document.getElementById('conflictModal').style.display = 'none';
});

document.getElementById('approveConflictBtn').addEventListener('click', async () => {
  document.getElementById('conflictModal').style.display = 'none';
  // User approved, proceed with export
  proceedWithExport();
});

async function proceedWithExport() {
  const result = await ipcRenderer.invoke('export-bundle');
  if (result.success) {
    alert(`Bundle exported successfully to:\n${result.outputPath}`);
  } else {
    alert(`Export failed: ${result.error}`);
  }
}
```

### 6. Session Storage for Approval

**Optional Enhancement:** Store that user approved conflicts for this session

```javascript
sessionData.conflictsApproved = true;  // Skip modal on subsequent exports
```

---

## Testing Checklist

### Unit Tests
- [ ] `detectGroupConflicts()` returns empty array when no conflicts
- [ ] `detectGroupConflicts()` detects pitch conflicts correctly
- [ ] `detectGroupConflicts()` detects abbreviation conflicts correctly
- [ ] `detectGroupConflicts()` detects exemplar conflicts correctly
- [ ] Single-field grouping creates correct groups

### Integration Tests
- [ ] Bundle with ID field grouping loads correctly
- [ ] Bundle with pitch field grouping loads correctly
- [ ] Bundle with abbreviation field grouping loads correctly
- [ ] Conflict modal appears when conflicts exist
- [ ] Cancel button prevents export
- [ ] Approve button proceeds with export and overwrites data
- [ ] Re-importing exported bundle shows no conflicts

### Edge Cases
- [ ] Empty grouping field (no groups created)
- [ ] All words have same values (no conflicts)
- [ ] Mixed: some words have values, some don't
- [ ] Grouping by field that doesn't exist in XML
- [ ] Very large groups (100+ members) with conflicts

---

## Migration Guide for Existing Bundles

### For Users with Old Bundles

**Old format:**
```json
{
  "loadGroupsFromId": true,
  "loadGroupsFromPitch": true,
  "loadGroupsFromAbbreviation": false,
  "loadGroupsFromExemplar": false
}
```

**New format:**
```json
{
  "groupingField": "id"  // or "pitch", "abbreviation", "exemplar", "none"
}
```

**Migration:**
If `loadGroupsFromId === true`, use `"groupingField": "id"`  
Else if `loadGroupsFromPitch === true`, use `"groupingField": "pitch"`  
Else if `loadGroupsFromAbbreviation === true`, use `"groupingField": "abbreviation"`  
Else if `loadGroupsFromExemplar === true`, use `"groupingField": "exemplar"`  
Else use `"groupingField": "none"`

**Handling Logic:**
Add backward compatibility in bundle loading:
```javascript
if (settings.groupingField === undefined) {
  // Old bundle format, migrate
  if (settings.loadGroupsFromId) settings.groupingField = 'id';
  else if (settings.loadGroupsFromPitch) settings.groupingField = 'pitch';
  else if (settings.loadGroupsFromAbbreviation) settings.groupingField = 'abbreviation';
  else if (settings.loadGroupsFromExemplar) settings.groupingField = 'exemplar';
  else settings.groupingField = 'none';
}
```

---

## Documentation Updates Needed

1. **TONE_GROUP_LOADING_GUIDE.md**
   - Update to reflect single-field selection
   - Add conflict resolution workflow section
   - Add examples of conflict scenarios
   - Update "How It Works" section

2. **README.md**
   - Mention conflict detection feature
   - Note about data consistency guarantee

3. **RELEASE_NOTES**
   - Mark as breaking change
   - Explain migration path

---

## Estimated Complexity

- **Backend changes:** Medium (2-3 hours)
  - Update both bundle loaders
  - Add conflict detection call before export
  
- **Frontend changes:** Medium (2-3 hours)
  - Create conflict modal UI
  - Wire up conflict display
  - Handle user approval/cancellation

- **Testing:** High (3-4 hours)
  - Many edge cases
  - Integration testing needed
  - Test with real Dekereke data

**Total:** ~8-10 hours of development + testing

---

## Benefits of This Approach

1. **User Control:** User explicitly chooses grouping strategy
2. **Transparency:** User sees exactly what will be overwritten
3. **Data Safety:** Cancel option prevents unwanted changes
4. **Flexibility:** Can choose different output fields to preserve data
5. **Simplicity:** Single field grouping is easier to understand than composite keys
6. **Debuggability:** Conflict report shows exactly what's inconsistent

---

## Quick Testing Guide

### Test Setup
1. **Create a test bundle** in bundler_app with:
   - At least one grouping field configured (e.g., pitch, abbreviation, or ID)
   - Select that field using the radio button in "Re-import Group Assignments" section
   
2. **Prepare test XML data** with intentional conflicts:
   ```xml
   <!-- Group A: Same pitch "──" but different abbreviations -->
   <data_form Reference="0001">
     <Pitch>──</Pitch>
     <ToneAbbrev>L</ToneAbbrev>
   </data_form>
   <data_form Reference="0002">
     <Pitch>──</Pitch>
     <ToneAbbrev>M</ToneAbbrev>  <!-- Conflict! -->
   </data_form>
   ```

### Test Scenarios

#### ✅ Scenario 1: No Conflicts
1. Load bundle with all words having consistent values
2. Create/edit groups in matching app
3. Click "Export Results"
4. **Expected:** Direct export without modal (no conflicts detected)

#### ✅ Scenario 2: Conflicts Detected
1. Load bundle with conflicting values in same group
2. Click "Export Results"
3. **Expected:** Modal appears showing:
   - Group number and ID
   - Each conflicting field with reference numbers
   - "Current Value" → "Will Become" for each conflict
4. Click "Cancel Export"
5. **Expected:** Modal closes, no export happens
6. Click "Export Results" again, then "Overwrite Conflicts and Export"
7. **Expected:** Export proceeds, XML contains most-common values

#### ✅ Scenario 3: Hierarchical Bundles
1. Load hierarchical bundle (.tnset)
2. Navigate through sub-bundles
3. Add groups with conflicting data
4. Click "Export Complete Session"
5. **Expected:** Modal shows conflicts from ALL sub-bundles
   - Each conflict indicates which sub-bundle it's from
   - Can cancel or approve all at once

#### ✅ Scenario 4: Backward Compatibility
1. Open old bundle created with multi-field checkboxes
2. **Expected:** Settings automatically migrate to single `groupingField`
   - Priority: ID > Pitch > Abbreviation > Exemplar
3. Groups load correctly using migrated field
4. Export workflow functions normally

### Manual Verification Points

**After Export:**
1. Open exported `data_updated.xml`
2. Verify conflicting words now have majority values
3. Re-import the exported bundle
4. **Expected:** No conflicts detected (data now consistent)

**UI/UX Checks:**
- [ ] Conflict modal is readable and well-formatted
- [ ] Reference numbers are clearly visible
- [ ] Field names match configured XML elements
- [ ] Sub-bundle paths shown for hierarchical bundles
- [ ] Modal scrolls if many conflicts exist
- [ ] Cancel button works correctly
- [ ] Approve button triggers export

**Edge Cases:**
- [ ] Empty groups (no members)
- [ ] Groups with only one member (no conflicts possible)
- [ ] All three fields (pitch, abbreviation, exemplar) have conflicts
- [ ] Very long field values don't break modal layout
- [ ] Special characters in values display correctly

---

## How to Use This Feature

### For Bundler App Users:

1. **Choose Your Grouping Strategy:**
   - Open bundle configuration in bundler_app
   - Scroll to "Re-import Group Assignments" section
   - Select ONE field using radio buttons:
     - **None:** Don't pre-populate groups (manual grouping only)
     - **ID:** Group by tone group ID field
     - **Pitch:** Group by pitch transcription
     - **Abbreviation:** Group by tone abbreviation
     - **Exemplar:** Group by exemplar word

2. **Configure Field Mappings:**
   - Ensure the field you select has a valid XML element configured
   - Example: If selecting "Pitch", make sure "Pitch Transcription Field" is set

3. **Build Bundle:**
   - Create bundle as normal
   - Bundle will contain your grouping preference

### For Desktop Matching App Users:

1. **Load Bundle:**
   - Open bundle in desktop_matching_app
   - If it's a re-import (has `data_updated.xml`), groups will automatically load based on configured field

2. **Work with Groups:**
   - Add/edit/review groups as normal
   - The app uses most-common values for group metadata

3. **Export with Confidence:**
   - Click "Export Results"
   - If conflicts exist, you'll see a detailed report
   - Review the changes that will be made
   - Choose to cancel or proceed
   - Your source data is never modified until you approve

4. **Alternative Actions if Conflicts Found:**
   - **Cancel and reconfigure:** Change bundle's output field names to avoid overwriting
   - **Cancel and fix source:** Edit your Dekereke XML to resolve inconsistencies
   - **Cancel and adjust fields:** Exclude problematic fields from bundle configuration
   - **Approve:** Let the app standardize values to most-common

---

## Migration from Old Bundles

### If You Have Bundles Created with Old Multi-Field System:

**What Changed:**
- Old: Multiple checkboxes (could select ID + Pitch + Abbreviation simultaneously)
- New: Single radio button (choose ONE primary field)

**Migration is Automatic:**
- When you load an old bundle, the app detects missing `groupingField`
- It automatically converts based on priority:
  1. If "Load from ID" was checked → `groupingField: 'id'`
  2. Else if "Load from Pitch" was checked → `groupingField: 'pitch'`
  3. Else if "Load from Abbreviation" was checked → `groupingField: 'abbreviation'`
  4. Else if "Load from Exemplar" was checked → `groupingField: 'exemplar'`
  5. Otherwise → `groupingField: 'none'`

**What You Need to Do:**
- Nothing! Migration happens automatically
- However, you may want to **rebuild bundles** to update the configuration UI

**To Update Bundle Configuration:**
1. Open bundle source data in bundler_app
2. Load your settings
3. Review the "Re-import Group Assignments" radio button selection
4. Adjust if needed
5. Rebuild bundle

This ensures future users see the correct radio button selected in bundler UI.

---

## Feature Complete! 🎉

All implementation tasks are complete. The feature is ready for testing and production use.
