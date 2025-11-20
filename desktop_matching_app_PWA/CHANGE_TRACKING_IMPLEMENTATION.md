# Change Tracking Implementation

## Overview
Complete implementation of change tracking system for hierarchical bundles. Tracks all modifications made to bundle data to enable intelligent 3-way merge back to Dekereke database.

## Implementation Date
November 13, 2025

## Components

### 1. Change Tracker Module
**File**: `src/utils/changeTracker.js`

Singleton module that tracks all data modifications:
- Device identification and persistence
- Session metadata (start time, duration, change count)
- Individual change records with timestamps
- Load/save change_history.json

**Key Functions**:
- `initialize(bundlePath, existingHistory)` - Start tracking session
- `getDeviceId()` - Generate/retrieve unique device ID
- `logChange(change)` - Record individual change
- `logToneGroupAssignment(subBundleId, ref, groupGuid, wordData)` - Track group assignments
- `logToneGroupRemoval(subBundleId, ref, oldGroupGuid)` - Track group removals
- `logFieldChange(subBundleId, ref, field, oldValue, newValue, action)` - Track field edits
- `logPitchChange()`, `logToneAbbreviationChange()`, `logExemplarChange()`, `logSpellingChange()` - Specialized tracking
- `logSubBundleMove(ref, oldSubBundle, newSubBundle, categoryField, oldValue, newValue)` - Track moves
- `logGroupReviewed(subBundleId, groupGuid)` - Track review actions
- `saveChangeHistory()` - Write change_history.json to bundle
- `loadChangeHistory(bundlePath)` - Read existing history (static method)

### 2. Main.js Integration

#### Initialization
**Location**: `loadHierarchicalBundle()` function (~line 365)
- Loads existing `change_history.json` if present
- Initializes changeTracker with bundle path and existing history
- Logs initialization success

#### Tone Group Operations
**Location**: IPC handlers

**`add-word-to-group`** (~line 527):
- Captures old group ID before assignment
- Logs assignment with group size metadata
- Tracks oldValue → newValue for tone group field

**`remove-word-from-group`** (~line 558):
- Logs removal with old group GUID
- Tracks newValue as empty string

**`update-group`** (~line 587):
- Tracks pitch transcription changes (`added_pitch_transcription`)
- Tracks tone abbreviation changes (`added_tone_abbreviation`)
- Tracks exemplar word designation (`marked_as_exemplar`)
- Uses exemplarWordRef for change attribution, falls back to first group member

#### User Spelling Changes
**Location**: `confirm-spelling` handler (~line 514)
- Captures old spelling value
- Logs change with configured field name (from settings.userSpellingElement)
- Only tracks if value actually changed

#### Sub-Bundle Moves
**Location**: `move-word-to-sub-bundle` handler (~line 1498)
- Extracts category field information from hierarchy paths
- Logs move with field name, old category, new category
- Uses helper function `extractCategoryFieldsFromPath()` to parse hierarchy

**Helper Function**: `extractCategoryFieldsFromPath()` (~line 1587)
- Parses old/new sub-bundle paths (e.g., "noun_CVCV" vs "verb_VCV")
- Determines which hierarchy field changed
- Returns field name, oldValue, newValue

#### Review Tracking
**Location**: `mark-all-groups-reviewed` handler (~line 1615)
- Logs each group marked as reviewed
- Records review action per group with group GUID

#### Export Integration
**Location**: `exportHierarchicalBundle()` function (~line 1063)
- Calls `changeTracker.saveChangeHistory()` before finalizing archive
- Adds `change_history.json` to bundle root (alongside manifest.json, hierarchy.json)
- Logs success/failure of change history export
- Continues export even if change history save fails (graceful degradation)

## Data Structure

### change_history.json Format
```json
{
  "devices": [
    {
      "deviceId": "desktop-a1b2c3d4-lmnop",
      "deviceName": "researcher-macbook",
      "platform": "darwin",
      "timestamp": "2025-11-13T10:00:00Z",
      "sessionDuration": "01:23:45",
      "changeCount": 87,
      "changes": [
        {
          "subBundleId": "noun_CVCV",
          "ref": "45.2.1",
          "field": "SurfaceMelodyId",
          "oldValue": "",
          "newValue": "group_1731495600_abc123",
          "action": "assigned_to_group",
          "timestamp": "2025-11-13T10:05:32Z",
          "metadata": {
            "groupSize": 5
          }
        },
        {
          "subBundleId": "noun_CVCV",
          "ref": "45.2.1",
          "field": "pitchTranscription",
          "oldValue": "",
          "newValue": "˦˨˧",
          "action": "added_pitch_transcription",
          "timestamp": "2025-11-13T10:12:15Z"
        },
        {
          "ref": "45.2.1",
          "oldSubBundleId": "noun_CVCV",
          "newSubBundleId": "verb_VCV",
          "field": "WordClass",
          "oldValue": "Noun",
          "newValue": "Verb",
          "action": "moved_to_different_subbundle",
          "timestamp": "2025-11-13T10:45:00Z"
        }
      ]
    }
  ],
  "totalChanges": 87,
  "lastModified": "2025-11-13T11:23:45Z"
}
```

### Device ID Storage
**Location**: `{userData}/device-id.txt`
**Format**: `desktop-{hash8}-{timestamp36}`
**Example**: `desktop-a1b2c3d4-lmnop`

Persisted across application launches to maintain consistent device identity.

## Tracked Actions

| Action | Trigger | Fields Tracked |
|--------|---------|----------------|
| `assigned_to_group` | Word added to tone group | SurfaceMelodyId (empty → GUID) |
| `removed_from_group` | Word removed from tone group | SurfaceMelodyId (GUID → empty) |
| `added_pitch_transcription` | Group pitch transcription edited | pitchTranscription |
| `added_tone_abbreviation` | Group tone abbreviation edited | toneAbbreviation |
| `marked_as_exemplar` | Exemplar word designated | exemplarWord |
| `updated_spelling` | User confirms/edits spelling | Orthographic (or configured field) |
| `moved_to_different_subbundle` | Word moved between sub-bundles | Category field (e.g., WordClass, SyllableProfile) |
| `marked_reviewed` | Group marked as reviewed | SurfaceMelodyReviewed (false → true) |
| `field_modified` | Generic field change | Any field |

## Session Metadata

Each device session records:
- **deviceId**: Unique device identifier
- **deviceName**: OS hostname
- **platform**: OS platform (darwin, win32, linux)
- **timestamp**: Session start time (ISO 8601)
- **sessionDuration**: Duration in HH:MM:SS format
- **changeCount**: Total changes in this session
- **changes**: Array of change records

## Merge Workflow Integration

The change tracking system enables a 3-way merge:

1. **Common Ancestor**: `data_original.xml` (UTF-16 preserved from bundler)
2. **User's Changes**: Current Dekereke database (UTF-16)
3. **Our Changes**: `change_history.json` (this implementation)

**Merge Tool** (future implementation) will:
- Parse all three sources
- Identify fields we modified (from change_history.json)
- Identify fields user modified independently (by comparing Dekereke to original)
- Detect conflicts (both modified same field)
- Merge non-conflicting changes automatically
- Present conflicts for manual resolution
- Export merged result to UTF-16 XML with exact declaration preserved

## Testing Recommendations

1. **Load Bundle**: Verify changeTracker initializes, device ID created
2. **Assign Words**: Check `assigned_to_group` logged with correct ref, groupId
3. **Edit Group Fields**: Verify pitch, abbreviation, exemplar changes tracked
4. **Remove from Group**: Check `removed_from_group` logged
5. **Edit Spelling**: Verify `updated_spelling` with old/new values
6. **Move Between Sub-bundles**: Check `moved_to_different_subbundle` with correct category field
7. **Mark Reviewed**: Verify `marked_reviewed` actions logged
8. **Export Bundle**: Confirm change_history.json in .tnset with all changes
9. **Re-import**: Load exported bundle, verify existing history loaded
10. **Multiple Sessions**: Make changes, export, re-import, make more changes, export again - verify both device sessions preserved

## Benefits

- **Non-destructive**: Original XML always preserved
- **Multi-device**: Each device's changes tracked separately
- **Auditable**: Complete history of who changed what and when
- **Merge-ready**: Structured format for conflict detection
- **Backward Compatible**: Old bundles without change_history.json still load fine
- **Graceful Degradation**: Export succeeds even if change tracking fails

## Notes

- Change tracking only active for **hierarchical bundles** (.tnset)
- Legacy bundles (.tncmp) do not use change tracking
- Device ID persists in VS Code workspace userData folder
- Session duration calculated on export
- Empty change history (no changes made) not written to bundle
- All timestamps in ISO 8601 UTC format
- Field names use configured element names from settings.json

## Files Modified

1. **src/utils/changeTracker.js** - New module (complete)
2. **src/main.js** - Integrated tracking hooks:
   - Line 12: Import changeTracker
   - Line 365: Load existing history
   - Line 376: Initialize tracker
   - Line 514: Track spelling changes
   - Line 527: Track group assignments
   - Line 558: Track group removals
   - Line 587: Track field modifications
   - Line 1063: Export change_history.json
   - Line 1498: Track sub-bundle moves
   - Line 1587: Helper for path parsing
   - Line 1615: Track review actions

## Future Enhancements

- [ ] Display change history in UI (timeline view)
- [ ] Filter changes by device, date, action type
- [ ] Undo/redo based on change history
- [ ] Visual diff view comparing original vs current
- [ ] Export change report (CSV, PDF)
- [ ] Merge tool implementation
- [ ] Conflict resolution UI
- [ ] Change statistics and analytics
