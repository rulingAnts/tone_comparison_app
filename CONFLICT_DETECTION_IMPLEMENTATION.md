# Conflict Detection Implementation Plan

## Overview
This document outlines the remaining work to complete the single-field grouping with conflict detection feature.

## Status: PARTIALLY IMPLEMENTED

### ✅ Completed
- [x] Bundler UI changed to radio buttons (single field selection)
- [x] Settings structure updated (`groupingField` replaces boolean flags)
- [x] `detectGroupConflicts()` function added to main.js
- [x] Radio button enable/disable logic based on field configuration

### ⏳ In Progress / Not Started
- [ ] Update `loadLegacyBundle()` to use single-field grouping
- [ ] Update hierarchical `loadSubBundle()` to use single-field grouping  
- [ ] Add conflict detection before export
- [ ] Create conflict resolution UI
- [ ] Add IPC handlers for conflict checking
- [ ] Test end-to-end workflow

---

## Implementation Details

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
