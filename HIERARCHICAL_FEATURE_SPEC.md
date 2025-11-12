# Feature Implementation: Hierarchical Bundle System for Tone Comparison App Suite

## Overview
Add hierarchical multi-bundle support (.tnset) to the Tone Comparison App Suite while maintaining full backward compatibility with legacy single bundles (.tncmp). This implements the tone analysis workflow from Keith Snider's "Tone Analysis for Field Linguists" methodology.

**Attribution Required**: Keith Snider for Contour6 SILDoulos font and tone analysis methodology. See https://casali.canil.ca/ and https://www.canil.ca/wordpress/u_member/keith-snider/

## Apps Requiring Changes
1. **Bundler App** (Desktop - Electron)
2. **Desktop Matching App** (Desktop - Electron)
3. **Mobile Matching App** (Android - Flutter)

---

## 1. BUNDLER APP CHANGES

### 1.1 Main UI Enhancement: Bundle Type Selection

Add prominent toggle at top of bundler UI:
```
[●] Legacy Single Bundle (.tncmp)    [ ] Hierarchical Macro-Bundle (.tnset)
```

**Legacy Mode**: Existing UI unchanged, creates .tncmp exactly as before

**Macro-Bundle Mode**: Show new hierarchical configuration UI (described below)

### 1.2 Enhanced Tone Field Configuration (Both Modes)

Replace current simple text inputs with enhanced field selectors:

**Current behavior**: User types field name, app concatenates "Id"
**New behavior**: Three separate field configurations:

```
Tone Group Base Field:
  [Dropdown: Select existing field ▼] OR [Text input: Create new field]
  Default: "SurfaceMelody"

Tone Group ID Field (GUID):
  [Text input with default: "SurfaceMelodyId"]
  ℹ️ Stores unique group identifier

Pitch Transcription Field:
  [Text input with default: "SurfaceMelodyPitch"]
  ☑ Enable pitch transcription input in matching apps
  ℹ️ Uses Contour6 SILDoulos font for display

Tone Abbreviation Field:
  [Text input with default: "SurfaceMelody"]
  ☑ Enable tone abbreviation input (e.g., LHL, HLH)

Exemplar Word Field:
  [Text input with default: "SurfaceMelodyEx"]
  ☑ Enable exemplar word input in matching apps
```

**Validation Rules**:
- Warn if user selects same field for multiple purposes
- Parse XML on load to populate dropdown with existing `<data_form>` child elements
- Allow creating new fields (will be added to XML on export)
- For each field, show checkbox to enable/disable matching app user modifications

### 1.3 Spelling/Transcription Field Configuration

**Current**: Text input for new field name
**New**: Enhanced selector with validation

```
User Spelling/Transcription Field:
  [Dropdown: Select existing field ▼] OR [Text input: Create new field]
  
  ⚠️ WARNING: If this matches "Written Form" field, conflicts will occur
  ℹ️ If no written form displayed, this field will be shown and editable
  
  [ ] Show "Written Form" field in matching apps
      Written Form Field: [Dropdown: Select field ▼]
```

**Validation**:
- If spelling field === written form field, show error: "Spelling field cannot match Written Form field. Either disable Written Form display or choose different spelling field."
- If written form disabled and spelling field has existing data, show info: "Existing data will be displayed and user can modify it"

### 1.4 Reference Number Display Toggle

```
☑ Show reference numbers in matching apps
    (Users can toggle this in matching app settings)
```

### 1.5 Initial Tone Group Detection

**New Section**: "Pre-populate Tone Groups"

```
☑ Use existing tone group data from source XML

If any of these fields have data, words will be pre-grouped:
  • Pitch transcription field: [SurfaceMelodyPitch]
  • Tone abbreviation field: [SurfaceMelody]  
  • Exemplar word field: [SurfaceMelodyEx]

Words with matching values will be grouped together.
Words without values will go to sorting queue.

⚠️ If mixing systems in same field (e.g., some "LHL", some "parrot"),
   recommend using separate fields. Continue anyway? [Yes] [No]
```

**Detection Logic**:
1. Parse specified fields in all `<data_form>` elements
2. Group words with identical non-empty values
3. Create initial tone groups with auto-generated GUIDs
4. Words with empty values → unsorted queue
5. If field appears to contain mixed content types (detect patterns like all-caps vs sentence case), warn user

### 1.6 Hierarchical Bundle Configuration UI (Macro-Bundle Mode Only)

**Main Configuration Panel**: Tree-based UI

```
═══════════════════════════════════════════════════
HIERARCHICAL BUNDLE CONFIGURATION
═══════════════════════════════════════════════════

Build Sub-Bundle Hierarchy:

[+ Add Top-Level Category]

┌─ Category: [Dropdown: XML field ▼] OR [Manual values...]
│  
│  ☑ Noun (15 words)
│  │  Audio Suffixes: [_good, _careful] [Apply to: ● This level  ○ Children]
│  │  
│  │  [+ Add Sub-Level] → [SyllableProfile ▼]
│  │     ☑ CVCV (8 words)
│  │     ☑ VCV (5 words)  
│  │     ☐ V (0 words) [manually added]
│  │     ☑ CVV (2 words)
│  │     [+ Add manual value...]
│  │  
│  │  [+ Add Another Sub-Level]
│  │
│  ☑ Verb (23 words)
│  │  
│  │  [+ Add Sub-Level] → [Transitivity ▼]
│  │     ☑ Transitive (15 words)
│  │     │  Audio Suffixes: [quickly _, _ slowly] [Apply to: ○ This level ● Children]
│  │     │  
│  │     │  [+ Add Sub-Level] → [Voice ▼]
│  │     │     ☑ Active (10 words)
│  │     │     │  Audio Suffixes: [Override: do _] [Apply to: ● This level]
│  │     │     ☑ Passive (5 words)
│  │     │
│  │     ☑ Intransitive (8 words)
│  │        Audio Suffixes: [do not _] [Apply to: ● This level]
│  │
│  ☐ Adjective (0 words) [category exists but excluded]
│
└─ [+ Add Top-Level Category]

───────────────────────────────────────────────────
OPTIONS:

☑ Allow matching app users to create new bottom-level sub-bundles
☑ Allow matching app users to move words between sub-bundles
☑ Suggest tone group matching between sub-bundles after review
  (Based on matching tone abbreviation labels, case-insensitive)

═══════════════════════════════════════════════════
```

**Tree Controls**:
- **Add/Remove**: Add categories at any level, remove categories
- **Promote/Demote**: Change field priority (up/down arrows)
- **Checkboxes**: Include/exclude specific values from bundle
- **Auto-detect**: When field selected, scan XML and populate all unique values
- **Manual values**: Add values not in source data (for future use)
- **Word counts**: Show how many words match each leaf node
- **Audio suffix inheritance**: Child nodes inherit parent suffixes unless overridden

**Audio Suffix Configuration**:
```
Audio Suffixes: [_good, carefully _] 
  Apply to: ● This level only  ○ All children  ○ Selected children
  
  If "Selected children":
    ☑ CVCV
    ☑ VCV
    ☐ V
```

**Suffix Matching Logic**:
- `_good` matches files ending with `_good.mp3`
- `quickly _` matches files starting with `quickly_`
- `_ carefully _` matches files containing `_carefully_`
- Only bundle audio files matching specified suffixes for each sub-bundle
- Words without matching audio → skip or warn user

### 1.7 Field Labeling Options (Macro-Bundle Mode)

For each field used in hierarchy:

```
SyllableProfile Field Display Options:
  ☑ Display as label in matching app UI
  ☑ Render as pitch transcription (uses Contour6 SILDoulos font)
     Font size: [14pt] Height: [4-5 lines]
  
Category Field Display Options:
  ☑ Display as label in matching app UI
  ☐ Render as pitch transcription
```

### 1.8 Bundle Generation (Macro-Bundle Mode)

When user clicks "Create Macro-Bundle":

1. **Validate Configuration**:
   - All leaf nodes have at least 1 word OR are manually added
   - Audio files exist for all words with specified suffixes
   - No circular dependencies in field selection
   - Required fields (tone group base, ID, etc.) are specified

2. **Generate .tnset Archive Structure**:
```
macro_bundle.tnset (ZIP archive)
├── manifest.json
├── data_original.xml (unchanged Dekereke XML)
├── settings.json
├── hierarchy.json
├── sub_bundles/
│   ├── noun_CVCV/
│   │   ├── data.xml (filtered to this sub-bundle)
│   │   ├── audio/
│   │   │   ├── 45_2_1_good.mp3
│   │   │   └── 45_3_7_good.mp3
│   │   └── meta.json
│   ├── noun_VCV/
│   │   ├── data.xml
│   │   ├── audio/
│   │   └── meta.json
│   ├── verb_transitive_active/
│   │   ├── data.xml
│   │   ├── audio/
│   │   │   ├── quickly_46_1_2.mp3
│   │   │   └── do_46_3_4.mp3
│   │   └── meta.json
│   └── ...
└── fonts/
    └── Contour6SILDoulos.ttf
```

3. **manifest.json Structure**:
```json
{
  "bundleType": "hierarchical",
  "bundleId": "uuid-v4",
  "bundleDescription": "User description",
  "createdAt": "2025-11-12T10:30:00Z",
  "createdBy": "desktop-bundler",
  "language": "en",
  "toneGroupBaseField": "SurfaceMelody",
  "toneGroupIdField": "SurfaceMelodyId",
  "pitchField": "SurfaceMelodyPitch",
  "abbreviationField": "SurfaceMelody",
  "exemplarField": "SurfaceMelodyEx",
  "spellingField": "Phonetic",
  "writtenFormField": "Word",
  "showWrittenForm": true,
  "showReferenceNumbers": true,
  "reviewedField": "SurfaceMelodyReviewed",
  "allowCreateSubBundles": true,
  "allowMoveWords": true,
  "suggestCrossMatching": true,
  "enabledLabels": {
    "pitch": true,
    "abbreviation": true,
    "exemplar": true
  },
  "userCanModify": {
    "pitch": true,
    "abbreviation": false,
    "exemplar": true
  }
}
```

4. **hierarchy.json Structure**:
```json
{
  "tree": [
    {
      "field": "Category",
      "displayAsLabel": true,
      "renderAsPitch": false,
      "values": [
        {
          "value": "Noun",
          "audioSuffixes": ["_good", "_careful"],
          "applyTo": "this",
          "children": [
            {
              "field": "SyllableProfile",
              "displayAsLabel": true,
              "renderAsPitch": false,
              "values": [
                {
                  "value": "CVCV",
                  "subBundleId": "noun_CVCV",
                  "wordCount": 8,
                  "audioSuffixes": ["_good", "_careful"]
                },
                {
                  "value": "VCV",
                  "subBundleId": "noun_VCV",
                  "wordCount": 5,
                  "audioSuffixes": ["_good", "_careful"]
                }
              ]
            }
          ]
        },
        {
          "value": "Verb",
          "audioSuffixes": [],
          "children": [
            {
              "field": "Transitivity",
              "values": [
                {
                  "value": "Transitive",
                  "audioSuffixes": ["quickly _", "_ slowly"],
                  "applyTo": "children",
                  "children": [
                    {
                      "field": "Voice",
                      "values": [
                        {
                          "value": "Active",
                          "subBundleId": "verb_transitive_active",
                          "wordCount": 10,
                          "audioSuffixes": ["do _"]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

5. **sub_bundles/[name]/meta.json**:
```json
{
  "subBundleId": "noun_CVCV",
  "path": ["Category:Noun", "SyllableProfile:CVCV"],
  "displayPath": "Nouns > CVCV",
  "localizedPath": {
    "en": "Nouns > CVCV",
    "id": "Kata Benda > CVCV",
    "tpi": "Nem bilong samting > CVCV"
  },
  "wordCount": 8,
  "audioSuffixes": ["_good", "_careful"],
  "fieldCriteria": {
    "Category": "Noun",
    "SyllableProfile": "CVCV"
  }
}
```

6. **Pre-populate tone groups** if enabled:
   - Parse specified fields (pitch/abbreviation/exemplar)
   - Create initial groups in each sub-bundle's `data.xml`
   - Assign GUIDs to pre-populated groups
   - Set reviewed status to `false`

---

## 2. DESKTOP MATCHING APP CHANGES

### 2.1 Bundle Loading Enhancement

**Existing**: Load single `.tncmp` bundle
**New**: Support both `.tncmp` and `.tnset`

**Detection Logic**:
```javascript
function detectBundleType(file) {
  if (file.name.endsWith('.tncmp')) {
    return 'legacy';
  } else if (file.name.endsWith('.tnset')) {
    return 'hierarchical';
  }
  // Also check manifest.json after extraction
}
```

### 2.2 Legacy Bundle Handling (No Changes)

If `.tncmp` loaded:
- Use existing UI/workflow exactly as before
- Single bundle, single session
- Export as `.zip` with same structure as before

### 2.3 Hierarchical Bundle UI (New)

**Welcome Screen Addition**:
```
Load Bundle:
  [Select .tncmp file] - Single bundle (legacy)
  [Select .tnset file] - Hierarchical bundle (new)
```

**After loading .tnset**: Show navigation UI

#### 2.3.1 Sub-Bundle Navigation Screen

```
═══════════════════════════════════════════════════
MACRO-BUNDLE: [Bundle Description]
Progress: 145 of 312 words assigned (46%)
═══════════════════════════════════════════════════

Select Sub-Bundle to Sort:

┌─ Nouns (23 words total, 15 assigned)
│  ├─ CVCV (8 words, 6 assigned) ✓ Reviewed
│  ├─ VCV (5 words, 3 assigned) [Select to Sort]
│  ├─ CVV (2 words, 0 assigned) [Select to Sort]
│  └─ V (0 words, 0 assigned) [Empty - manually added]
│
└─ Verbs (35 words total, 12 assigned)
   └─ Transitivity
      ├─ Transitive (20 words, 8 assigned)
      │  └─ Voice
      │     ├─ Active (12 words, 5 assigned) [Select to Sort]
      │     └─ Passive (8 words, 3 assigned) [Select to Sort]
      └─ Intransitive (15 words, 4 assigned) [Select to Sort]

═══════════════════════════════════════════════════

[Export Current Progress (.tnset)] [Export Sub-Bundle (.zip)]

Settings: [Language ▼] [☑ Show Reference Numbers]
```

**Visual Indicators**:
- ✓ Green checkmark: All words assigned and marked reviewed
- ⚠️ Yellow warning: All words assigned but not marked reviewed
- ○ Gray circle: Partially assigned
- ✕ Red X: No words assigned yet
- 📝 Pencil icon: Currently selected sub-bundle

**Click leaf node** → Load sub-bundle sorting interface

#### 2.3.2 Sub-Bundle Sorting Interface

**Header Changes**:
```
Current Sub-Bundle: Nouns > CVCV (8 words, 6 assigned, 75%)
[← Back to Navigation] | [Mark All Reviewed] [Export Sub-Bundle]
```

**Main Sorting UI**: Same as existing, with additions:

**Current Word Card Additions**:
```
┌─────────────────────────────────────────┐
│  mbàra                                   │
│  Ref: 45.2.1 (toggle off in settings)   │
│  [▶ Play] [Skip] [← Swipe to move]      │
└─────────────────────────────────────────┘
```

**Swipe Right Interaction**:
1. First swipe right: Removes from current tone group → back to queue
2. Second swipe right on queued word: Shows sub-bundle picker modal

**Sub-Bundle Picker Modal**:
```
Move "mbàra" to different sub-bundle:

┌─ Nouns
│  ├─ ● CVCV (current)
│  ├─ ○ VCV
│  ├─ ○ CVV
│  └─ ○ V
│
└─ Verbs
   └─ Transitivity
      └─ ...

[Cancel] [Move]
```

**On Move**:
- Update word's field values in session (e.g., `SyllableProfile: "CVCV"` → `"VCV"`)
- Remove from current sub-bundle session
- Add to target sub-bundle session (doesn't switch UI, stays in current)
- Show toast: "Moved mbàra to Nouns > VCV"

**Tone Group Cards Enhancement**:

Current group card shows:
```
┌────────────────────────────┐
│ Group 1 ✓                  │
│ ─────── (pitch example)    │  ← If pitch enabled
│ LHL                        │  ← If abbreviation enabled
│ parrot (45.1.3)            │  ← If exemplar enabled
│ 5 words                    │
│ [Add Word] [⚙️ Edit]        │
└────────────────────────────┘
```

**Edit Menu Additions**:
```
Edit Group:
  • Change exemplar word
  • Assign image
  • Edit pitch transcription [Text area, 4-5 lines, Contour6 font]
  • Edit tone abbreviation [Text input, e.g., LHL]
  • Edit exemplar word [Text input]
  • [☑ Mark as Reviewed] / [☐ Unmark Reviewed]
  • View all words
  • Delete group
```

**Pitch Transcription Input**:
- Text area with Contour6 SILDoulos font loaded
- Font size: 14pt
- Height: 4-5 lines
- Display preview in group card

**Group Reordering**:
- Drag and drop group cards to reorder
- Or up/down arrows on each card
- Order persists in session and export

#### 2.3.3 Review Status Handling

**Prompt After 5 Words Added**:
```
Group 3 now has 5 words. Would you like to review it?
[Review Now] [Skip] [Don't Ask Again for This Group]
```

**Review Modal** (if user clicks "Review Now"):
```
Review Group 3

Tone Label: LHL
Pitch: ─────── (editable)
Exemplar: parrot

All words in group:
• mbàra (45.2.1) [▶ Play] [Remove]
• ndòŋa (45.3.7) [▶ Play] [Remove]
• kpàla (46.1.2) [▶ Play] [Remove]
• ... (2 more)

[☑ Mark as Reviewed] [Close]
```

**Auto-Unmark on Changes**:
If group marked reviewed, any of these actions unmark it:
- Add word to group
- Remove word from group
- Change pitch/abbreviation/exemplar
- Reorder groups (only unmarks affected group)

**Review Status Display**:
- Group card shows green checkmark badge if reviewed
- Sub-bundle navigation shows "✓ Reviewed" if all groups reviewed
- Progress indicator: "6 of 8 words assigned, 2 groups reviewed"

#### 2.3.4 Completion Indicators

**Never block user** - always allow continued sorting

**Green Snackbar Messages**:
```
✓ All words in "Nouns > CVCV" have been assigned!
  [Mark All Reviewed] [Continue Reviewing] [Back to Navigation]

✓ All sub-bundles have been reviewed!
  [Export Complete Project] [Review Again] [Back to Navigation]
```

#### 2.3.5 Cross-Sub-Bundle Tone Matching (Optional Feature)

If enabled in bundler settings, after marking all sub-bundles reviewed:

```
═══════════════════════════════════════════════════
SUGGEST TONE GROUP MATCHES ACROSS SUB-BUNDLES
═══════════════════════════════════════════════════

Based on tone abbreviation labels (case-insensitive):

Suggested Match: "LHL"
  • Nouns > CVCV > Group 2 (LHL) - 5 words
  • Nouns > VCV > Group 1 (lhl) - 3 words
  • Verbs > Intransitive > Group 4 (LHL) - 7 words
  
  [Match These Groups] [Skip] [Review Words]

Suggested Match: "HLH"
  • Nouns > CVCV > Group 5 (HLH) - 4 words
  • Verbs > Transitive > Active > Group 2 (HLH) - 6 words
  
  [Match These Groups] [Skip] [Review Words]

═══════════════════════════════════════════════════
[Apply All Matches] [Skip All] [Close]
```

**If "Match These Groups"**:
- Assign all words in matched groups to same tone group GUID
- Update all affected sub-bundles
- Show confirmation: "Matched 3 groups containing 15 words"

**Algorithm**:
1. Scan all tone abbreviation fields in all sub-bundles
2. Normalize: trim whitespace, convert to lowercase
3. Find groups with identical normalized abbreviations
4. Present as suggestions (don't auto-apply)

### 2.4 Session Storage Enhancement

**Legacy .tncmp session**: Store as before in `desktop_matching_session.json`

**Hierarchical .tnset session**: New structure

```json
{
  "bundleType": "hierarchical",
  "bundleId": "uuid",
  "currentSubBundle": "noun_CVCV",
  "subBundleSessions": {
    "noun_CVCV": {
      "groups": [...],
      "currentIndex": 3,
      "skippedWords": [...],
      "reviewed": false
    },
    "noun_VCV": {
      "groups": [...],
      "currentIndex": 0,
      "skippedWords": [],
      "reviewed": false
    }
  },
  "wordMoves": [
    {
      "ref": "45.2.1",
      "fromSubBundle": "noun_CVCV",
      "toSubBundle": "noun_VCV",
      "timestamp": "2025-11-12T10:30:00Z",
      "fieldUpdates": {
        "SyllableProfile": { "old": "CVCV", "new": "VCV" }
      }
    }
  ],
  "crossMatches": [
    {
      "abbreviation": "LHL",
      "matchedGroups": [
        { "subBundleId": "noun_CVCV", "groupGuid": "guid-1" },
        { "subBundleId": "noun_VCV", "groupGuid": "guid-2" }
      ],
      "appliedAt": "2025-11-12T11:00:00Z"
    }
  ],
  "deviceHistory": [
    {
      "deviceId": "machine-id-1",
      "timestamp": "2025-11-12T10:00:00Z",
      "action": "created_session"
    }
  ]
}
```

### 2.5 Export Options

**Sub-Bundle Export** (.zip):
Same structure as legacy export:
```
noun_CVCV_export.zip
├── data_original.xml (filtered to this sub-bundle)
├── data_updated.xml (with tone assignments for this sub-bundle)
├── tone_groups.csv
├── images/
└── meta.json
```

**Full Project Export** (.tnset):
```
project_export.tnset
├── manifest.json (updated with latest device ID)
├── data_original.xml (unchanged)
├── data_updated.xml (merged updates from ALL sub-bundles)
├── settings.json
├── hierarchy.json
├── sub_bundles/ (each with updated data.xml)
│   ├── noun_CVCV/
│   │   ├── data.xml (updated)
│   │   ├── audio/
│   │   ├── tone_groups.csv
│   │   ├── images/
│   │   └── meta.json
│   └── ...
├── change_history.json (detailed change tracking)
└── fonts/
```

**change_history.json Structure**:
```json
{
  "devices": [
    {
      "deviceId": "machine-id-1",
      "timestamp": "2025-11-12T10:00:00Z",
      "sessionDuration": "01:23:45",
      "changes": [
        {
          "subBundleId": "noun_CVCV",
          "ref": "45.2.1",
          "field": "SurfaceMelodyId",
          "oldValue": "",
          "newValue": "guid-123",
          "action": "assigned_to_group",
          "timestamp": "2025-11-12T10:05:32Z"
        },
        {
          "subBundleId": "noun_CVCV",
          "ref": "45.2.1",
          "field": "SurfaceMelodyPitch",
          "oldValue": "",
          "newValue": "─────",
          "action": "added_pitch_transcription",
          "timestamp": "2025-11-12T10:06:15Z"
        },
        {
          "subBundleId": "noun_CVCV",
          "ref": "45.2.1",
          "field": "SyllableProfile",
          "oldValue": "CVCV",
          "newValue": "VCV",
          "action": "moved_to_different_subbundle",
          "timestamp": "2025-11-12T10:15:00Z"
        },
        {
          "subBundleId": "noun_CVCV",
          "groupGuid": "guid-123",
          "field": "SurfaceMelodyReviewed",
          "oldValue": "false",
          "newValue": "true",
          "action": "marked_reviewed",
          "timestamp": "2025-11-12T10:20:00Z"
        }
      ]
    },
    {
      "deviceId": "machine-id-2",
      "timestamp": "2025-11-13T09:00:00Z",
      "sessionDuration": "00:45:12",
      "changes": [...]
    }
  ]
}
```

### 2.6 Re-import Support

**Loading exported .tnset**:
1. Detect if `data_updated.xml` exists and has tone assignments
2. Reconstruct tone groups from XML for each sub-bundle
3. Restore session state from `change_history.json` if present
4. Add current device to device history
5. Continue where previous user left off

**Device History Display**:
Show in settings or info panel:
```
Bundle History:
  1. Desktop (machine-id-1) - 2025-11-12 10:00 - Added 45 assignments
  2. Mobile (android-id-abc) - 2025-11-12 14:30 - Added 23 assignments
  3. Desktop (machine-id-2) - 2025-11-13 09:00 - Added 12 assignments
  → Current device (machine-id-1)
```

---

## 3. MOBILE MATCHING APP CHANGES (Flutter)

All changes from Desktop Matching App section apply to mobile, with platform-specific adaptations:

### 3.1 UI Adaptations

**Sub-Bundle Navigation**: Use expandable tree view (Flutter ExpansionTile)
```dart
ExpansionTile(
  title: Text('Nouns (23 words, 15 assigned)'),
  children: [
    ListTile(
      title: Text('CVCV (8 words, 6 assigned)'),
      trailing: Icon(Icons.check_circle, color: Colors.green),
      onTap: () => loadSubBundle('noun_CVCV'),
    ),
    // ...
  ],
)
```

**Swipe Gestures**: Use Dismissible widget
```dart
Dismissible(
  key: Key(word.ref),
  direction: DismissDirection.endToStart,
  onDismissed: (direction) {
    if (isInGroup) {
      removeFromGroup(word);
    } else {
      showSubBundlePicker(word);
    }
  },
  child: WordCard(word: word),
)
```

**Pitch Transcription Input**: 
- Use TextField with Contour6 font loaded
- Keyboard: Allow custom characters or provide tone picker UI
- Font rendering: Test on Android to ensure proper display

### 3.2 Font Integration

**pubspec.yaml**:
```yaml
fonts:
  - family: Contour6
    fonts:
      - asset: fonts/Contour6SILDoulos.ttf
```

**Usage in TextStyle**:
```dart
TextStyle(
  fontFamily: 'Contour6',
  fontSize: 14,
  height: 1.5, // Line height for 4-5 line display
)
```

### 3.3 File Associations and Sharing

**Android Manifest Updates** (`android/app/src/main/AndroidManifest.xml`):

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="file" />
    <data android:scheme="content" />
    <data android:mimeType="*/*" />
    <data android:pathPattern=".*\\.tncmp" />
    <data android:pathPattern=".*\\.tnset" />
    <data android:host="*" />
</intent-filter>

<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="application/zip" />
    <data android:mimeType="application/octet-stream" />
</intent-filter>
```

**Handle Incoming Files**:
```dart
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

// In initState or main
ReceiveSharingIntent.getInitialMedia().then((List<SharedMediaFile> value) {
  if (value != null && value.isNotEmpty) {
    String filePath = value.first.path;
    if (filePath.endsWith('.tncmp') || filePath.endsWith('.tnset')) {
      loadBundle(filePath);
    }
  }
});

// Listen for files shared while app is running
_streamSubscription = ReceiveSharingIntent.getMediaStream()
    .listen((List<SharedMediaFile> value) {
  if (value != null && value.isNotEmpty) {
    String filePath = value.first.path;
    if (filePath.endsWith('.tncmp') || filePath.endsWith('.tnset')) {
      loadBundle(filePath);
    }
  }
});
```

### 3.4 Session Storage

Use `shared_preferences` for session state, same JSON structure as desktop.

For hierarchical bundles, consider file-based storage for large sessions:
```dart
import 'dart:io';
import 'package:path_provider/path_provider.dart';

Future<void> saveSession(HierarchicalSession session) async {
  final directory = await getApplicationDocumentsDirectory();
  final file = File('${directory.path}/hierarchical_session_${session.bundleId}.json');
  await file.writeAsString(jsonEncode(session.toJson()));
}

Future<HierarchicalSession?> loadSession(String bundleId) async {
  final directory = await getApplicationDocumentsDirectory();
  final file = File('${directory.path}/hierarchical_session_$bundleId.json');
  if (await file.exists()) {
    String contents = await file.readAsString();
    return HierarchicalSession.fromJson(jsonDecode(contents));
  }
  return null;
}
```

### 3.5 Export Sharing

**Share exported bundles** using `share_plus`:
```dart
import 'package:share_plus/share_plus.dart';

Future<void> shareExport(String filePath, String fileName) async {
  await Share.shareXFiles(
    [XFile(filePath)],
    subject: 'Tone Analysis Export: $fileName',
    text: 'Exported tone analysis bundle',
  );
}
```

### 3.6 Mobile-Specific UI Enhancements

**Bottom Navigation for Hierarchical Bundles**:
```
┌─────────────────────────────────────────┐
│  Nouns > CVCV                           │
│  ─────────────────────────────────────  │
│                                         │
│  [Current Word Display]                 │
│  [Tone Groups]                          │
│  [Recent Words]                         │
│                                         │
└─────────────────────────────────────────┘
  [Navigate] [Sort] [Export] [Settings]
```

**Quick Actions FAB** (Floating Action Button):
```
Long-press FAB → Show menu:
  • Quick review group
  • Mark all reviewed
  • Export sub-bundle
  • Switch sub-bundle
  • Settings
```

---

## 4. DETAILED DATA STRUCTURES

### 4.1 Dekereke XML Structure Updates

**Original data_form**:
```xml
<data_form>
  <Word>mbàra</Word>
  <Ref>45.2.1</Ref>
  <Sound FileName="audio_45_2_1.mp3">
    <Variant Name="careful">audio_45_2_1_careful.mp3</Variant>
    <Variant Name="fast">audio_45_2_1_fast.mp3</Variant>
  </Sound>
  <Category>Noun</Category>
  <SyllableProfile>CVCV</SyllableProfile>
  <Gloss>parrot</Gloss>
  <!-- Existing fields... -->
</data_form>
```

**Updated data_form after matching** (all new fields added):
```xml
<data_form>
  <Word>mbàra</Word>
  <Ref>45.2.1</Ref>
  <Sound FileName="audio_45_2_1.mp3">
    <Variant Name="careful">audio_45_2_1_careful.mp3</Variant>
    <Variant Name="fast">audio_45_2_1_fast.mp3</Variant>
  </Sound>
  <Category>Noun</Category>
  <SyllableProfile>CVCV</SyllableProfile>
  <Gloss>parrot</Gloss>
  
  <!-- NEW: Tone group assignments -->
  <SurfaceMelody>LHL</SurfaceMelody>
  <SurfaceMelodyId>a1b2c3d4-e5f6-4789-abcd-ef0123456789</SurfaceMelodyId>
  <SurfaceMelodyPitch>─────</SurfaceMelodyPitch>
  <SurfaceMelodyEx>parrot</SurfaceMelodyEx>
  <SurfaceMelodyReviewed>true</SurfaceMelodyReviewed>
  
  <!-- NEW: User spelling confirmation (if enabled) -->
  <Phonetic>mbàra</Phonetic>
  
  <!-- Existing fields unchanged... -->
</data_form>
```

**If word moved between sub-bundles**:
```xml
<data_form>
  <!-- ... -->
  <SyllableProfile>VCV</SyllableProfile> <!-- Changed from CVCV -->
  <!-- ... -->
</data_form>
```

### 4.2 Reviewed Status Handling

**Field**: `<SurfaceMelodyReviewed>` (or user-specified name)
**Values**: 
- `true` - Group marked as reviewed
- `false` or empty - Not reviewed or review status revoked

**Update Logic**:
```javascript
// When marking group as reviewed
function markGroupReviewed(groupGuid) {
  const words = getWordsInGroup(groupGuid);
  words.forEach(word => {
    updateXMLField(word.ref, reviewedField, 'true');
  });
  
  // Log change
  logChange({
    groupGuid: groupGuid,
    field: reviewedField,
    oldValue: 'false',
    newValue: 'true',
    action: 'marked_reviewed',
    timestamp: new Date().toISOString()
  });
}

// When modifying a reviewed group
function onGroupModified(groupGuid) {
  const words = getWordsInGroup(groupGuid);
  const wasReviewed = words.some(word => 
    getXMLField(word.ref, reviewedField) === 'true'
  );
  
  if (wasReviewed) {
    words.forEach(word => {
      updateXMLField(word.ref, reviewedField, 'false');
    });
    
    showToast('Group unmarked as reviewed due to changes');
    
    logChange({
      groupGuid: groupGuid,
      field: reviewedField,
      oldValue: 'true',
      newValue: 'false',
      action: 'auto_unmarked_on_modification',
      timestamp: new Date().toISOString()
    });
  }
}
```

### 4.3 Cross-Sub-Bundle Matching Data

When user applies cross-bundle matching:

**Before**:
```
Sub-bundle: noun_CVCV
  Group 2: guid-abc (LHL)
    - mbàra (45.2.1)
    - ndòŋa (45.3.7)

Sub-bundle: noun_VCV  
  Group 1: guid-def (lhl)
    - kúrú (46.8.3)
    - lúmú (47.1.5)
```

**After matching** (all words get same GUID):
```
Sub-bundle: noun_CVCV
  Group 2: guid-abc (LHL)
    - mbàra (45.2.1) → SurfaceMelodyId: guid-abc
    - ndòŋa (45.3.7) → SurfaceMelodyId: guid-abc

Sub-bundle: noun_VCV
  Group 1: guid-abc (lhl → normalized to LHL)
    - kúrú (46.8.3) → SurfaceMelodyId: guid-abc (changed from guid-def)
    - lúmú (47.1.5) → SurfaceMelodyId: guid-abc (changed from guid-def)
```

**Log changes**:
```json
{
  "action": "cross_subbundle_match_applied",
  "abbreviation": "LHL",
  "timestamp": "2025-11-12T11:00:00Z",
  "changes": [
    {
      "ref": "46.8.3",
      "field": "SurfaceMelodyId",
      "oldValue": "guid-def",
      "newValue": "guid-abc",
      "subBundleId": "noun_VCV"
    },
    {
      "ref": "47.1.5",
      "field": "SurfaceMelodyId",
      "oldValue": "guid-def",
      "newValue": "guid-abc",
      "subBundleId": "noun_VCV"
    }
  ]
}
```

---

## 5. IMPLEMENTATION CHECKLIST

### 5.1 Bundler App

- [ ] Add bundle type toggle (Legacy vs Hierarchical)
- [ ] Enhanced tone field configuration UI
  - [ ] Dropdown populated from XML fields
  - [ ] Three separate fields (ID, Pitch, Abbreviation, Exemplar)
  - [ ] Checkboxes for enabling user modifications
- [ ] Enhanced spelling field configuration
  - [ ] Dropdown + text input
  - [ ] Validation against written form field
  - [ ] Warning for conflicts
- [ ] Reference number display toggle
- [ ] Initial tone group detection
  - [ ] Parse specified fields
  - [ ] Group words by matching values
  - [ ] Warn about mixed content types
- [ ] Hierarchical configuration UI
  - [ ] Tree builder with add/remove/promote/demote
  - [ ] Auto-detect field values
  - [ ] Manual value addition
  - [ ] Include/exclude checkboxes
  - [ ] Word count display
  - [ ] Audio suffix configuration per node
  - [ ] Apply-to level selection
- [ ] Field labeling options (pitch font rendering)
- [ ] Bundle generation logic
  - [ ] Validate configuration
  - [ ] Generate sub-bundle directories
  - [ ] Filter XML per sub-bundle
  - [ ] Copy audio files with suffix matching
  - [ ] Generate manifest.json, hierarchy.json, meta.json
  - [ ] Bundle Contour6 font
- [ ] Pre-populate tone groups if enabled
- [ ] Legacy bundle creation (unchanged)

### 5.2 Desktop Matching App

- [ ] Bundle type detection (file extension + manifest)
- [ ] Legacy bundle handling (no changes)
- [ ] Sub-bundle navigation UI
  - [ ] Tree view with expand/collapse
  - [ ] Progress indicators
  - [ ] Review status badges
- [ ] Sub-bundle sorting interface
  - [ ] Header with path breadcrumb
  - [ ] Swipe-to-move interaction
  - [ ] Sub-bundle picker modal
  - [ ] Word field updates on move
- [ ] Enhanced tone group cards
  - [ ] Pitch transcription display (Contour6 font)
  - [ ] Tone abbreviation display
  - [ ] Exemplar word display
  - [ ] Edit menu with all label types
- [ ] Pitch transcription input
  - [ ] Text area with Contour6 font
  - [ ] 4-5 line height
  - [ ] Font size 14pt
- [ ] Group reordering (drag-drop or arrows)
- [ ] Review status handling
  - [ ] Prompt after 5 words
  - [ ] Review modal
  - [ ] Auto-unmark on changes
  - [ ] Visual indicators (checkmarks)
- [ ] Completion indicators (green snackbars)
- [ ] Cross-sub-bundle matching
  - [ ] Scan abbreviations
  - [ ] Normalize and match
  - [ ] Present suggestions
  - [ ] Apply matches (update GUIDs)
- [ ] Hierarchical session storage
  - [ ] Per-sub-bundle sessions
  - [ ] Word move tracking
  - [ ] Cross-match tracking
  - [ ] Device history
- [ ] Export options
  - [ ] Sub-bundle export (.zip)
  - [ ] Full project export (.tnset)
  - [ ] Generate change_history.json
- [ ] Re-import support
  - [ ] Detect existing assignments
  - [ ] Reconstruct groups
  - [ ] Restore state
  - [ ] Update device history
- [ ] Settings: Reference number toggle

### 5.3 Mobile Matching App

All items from Desktop Matching App, plus:

- [ ] Mobile UI adaptations
  - [ ] ExpansionTile for navigation
  - [ ] Dismissible for swipe gestures
  - [ ] Bottom navigation
  - [ ] FAB for quick actions
- [ ] Contour6 font integration
  - [ ] Add to pubspec.yaml
  - [ ] Test rendering on Android
  - [ ] Pitch input field configuration
- [ ] File associations
  - [ ] AndroidManifest.xml updates
  - [ ] Handle .tncmp and .tnset intents
  - [ ] Receive sharing intent
- [ ] Session storage
  - [ ] File-based for large hierarchical sessions
  - [ ] Auto-save per sub-bundle
- [ ] Export sharing
  - [ ] share_plus integration
  - [ ] Share .zip and .tnset files

---

## 6. TESTING REQUIREMENTS

### 6.1 Bundler App Testing

**Legacy Mode**:
- [ ] Create legacy bundle with existing workflow
- [ ] Verify .tncmp format unchanged
- [ ] Test with old matching app versions

**Hierarchical Mode**:
- [ ] Single-level hierarchy (e.g., Category only)
- [ ] Multi-level hierarchy (3+ levels)
- [ ] Different hierarchies per branch
- [ ] Manual value addition
- [ ] Include/exclude specific values
- [ ] Audio suffix matching
  - [ ] Prefix patterns: `quickly _`
  - [ ] Suffix patterns: `_good`
  - [ ] Infix patterns: `_ carefully _`
  - [ ] Multiple suffixes per node
- [ ] Field validation
  - [ ] Spelling field = written form (should error)
  - [ ] Missing required fields (should error)
- [ ] Initial tone group detection
  - [ ] Exemplar words: group words with same exemplar
  - [ ] Tone abbreviations: group by matching abbreviation
  - [ ] Pitch transcriptions: group by matching transcription
  - [ ] Mixed content: warn user
  - [ ] Empty values: go to queue
- [ ] Font bundling: verify Contour6 in .tnset

### 6.2 Matching App Testing (Both Desktop and Mobile)

**Legacy Bundles**:
- [ ] Load .tncmp created by old bundler
- [ ] Load .tncmp created by new bundler (legacy mode)
- [ ] Verify existing workflow unchanged
- [ ] Export and verify .zip format

**Hierarchical Bundles**:
- [ ] Load .tnset with 2-level hierarchy
- [ ] Load .tnset with 4+ level hierarchy
- [ ] Navigate hierarchy tree
- [ ] Load sub-bundle for sorting
- [ ] Switch between sub-bundles (session persistence)
- [ ] Sort words within sub-bundle
- [ ] Move word to different sub-bundle (swipe gesture)
  - [ ] Verify XML field updates
  - [ ] Verify word appears in target sub-bundle
- [ ] Create new tone group
- [ ] Add pitch transcription
  - [ ] Verify Contour6 font renders correctly
  - [ ] Test multi-line input
- [ ] Add tone abbreviation
- [ ] Add exemplar word
- [ ] Edit existing group labels
- [ ] Reorder groups
- [ ] Mark group as reviewed
  - [ ] Verify checkmark appears
  - [ ] Verify XML field updated
- [ ] Modify reviewed group
  - [ ] Verify auto-unmark
  - [ ] Verify toast notification
- [ ] Complete sub-bundle (all words assigned)
  - [ ] Verify green snackbar
  - [ ] Verify can still continue
- [ ] Complete all sub-bundles
  - [ ] Verify project-level green snackbar
- [ ] Cross-sub-bundle matching (if enabled)
  - [ ] Verify suggestions based on abbreviations
  - [ ] Apply match: verify GUID updates across sub-bundles
  - [ ] Skip match: verify no changes
- [ ] Export sub-bundle (.zip)
  - [ ] Verify filtered XML
  - [ ] Verify tone_groups.csv
  - [ ] Verify images folder
  - [ ] Verify meta.json
- [ ] Export full project (.tnset)
  - [ ] Verify all sub-bundles included
  - [ ] Verify data_updated.xml merged correctly
  - [ ] Verify change_history.json complete
  - [ ] Verify device history updated
- [ ] Re-import exported .tnset
  - [ ] Verify groups reconstructed
  - [ ] Verify session restored
  - [ ] Verify device history appended
- [ ] Pass bundle between devices
  - [ ] Export from Device A
  - [ ] Import to Device B
  - [ ] Make changes on Device B
  - [ ] Export from Device B
  - [ ] Import back to Device A
  - [ ] Verify device history tracks all changes

**Mobile-Specific**:
- [ ] File association: tap .tncmp in file manager
- [ ] File association: tap .tnset in file manager
- [ ] Share .tncmp to app (from email, messaging, etc.)
- [ ] Share .tnset to app
- [ ] Export and share .zip via share sheet
- [ ] Export and share .tnset via share sheet

### 6.3 Edge Cases

- [ ] Empty sub-bundles (manually added, no words)
- [ ] Sub-bundle with 1 word
- [ ] Sub-bundle with 100+ words
- [ ] Words with no audio files
- [ ] Audio files with no matching words
- [ ] Malformed XML in bundle
- [ ] Missing fonts folder
- [ ] Corrupted session file
- [ ] Very deep hierarchy (5+ levels)
- [ ] Very wide hierarchy (10+ branches at one level)
- [ ] Special characters in field names
- [ ] Unicode in word data, tone labels
- [ ] Very long pitch transcriptions
- [ ] Empty tone abbreviations
- [ ] Duplicate GUIDs (shouldn't happen, but test handling)
- [ ] Moving word to non-existent sub-bundle
- [ ] Deleting group while marked reviewed
- [ ] Cross-match with no matching abbreviations
- [ ] Cross-match with 10+ matching groups

### 6.4 Backward Compatibility

- [ ] Old bundler → new matching apps (should load as legacy)
- [ ] New bundler (legacy mode) → old matching apps (should work)
- [ ] New bundler (hierarchical) → old matching apps (should gracefully fail with message)
- [ ] Mixing old and new export formats in same workflow

---

## 7. LOCALIZATION

All new UI text must be added to existing locale files (12 languages):

**New strings needed**:

```json
{
  "bundler": {
    "bundle_type_toggle": "Bundle Type",
    "legacy_bundle": "Legacy Single Bundle (.tncmp)",
    "hierarchical_bundle": "Hierarchical Macro-Bundle (.tnset)",
    "tone_field_config": "Tone Field Configuration",
    "pitch_field": "Pitch Transcription Field",
    "abbreviation_field": "Tone Abbreviation Field",
    "exemplar_field": "Exemplar Word Field",
    "enable_user_modifications": "Allow users to modify in matching app",
    "spelling_field_config": "Spelling/Transcription Field",
    "select_existing_field": "Select existing field",
    "create_new_field": "Create new field",
    "spelling_equals_written_warning": "Spelling field cannot match Written Form field",
    "show_reference_numbers": "Show reference numbers in matching apps",
    "prepopulate_groups": "Pre-populate Tone Groups",
    "use_existing_data": "Use existing tone group data from XML",
    "mixed_content_warning": "Warning: Field appears to contain mixed content types (exemplar words and abbreviations). Recommend using separate fields.",
    "hierarchy_config": "Hierarchical Bundle Configuration",
    "add_top_level": "Add Top-Level Category",
    "add_sub_level": "Add Sub-Level",
    "audio_suffixes": "Audio Suffixes",
    "apply_to_this": "This level",
    "apply_to_children": "All children",
    "word_count": "{{count}} words",
    "manually_added": "manually added",
    "allow_create_subbundles": "Allow users to create new sub-bundles",
    "allow_move_words": "Allow users to move words between sub-bundles",
    "suggest_cross_matching": "Suggest tone group matching across sub-bundles",
    "field_display_options": "Field Display Options",
    "display_as_label": "Display as label in matching app",
    "render_as_pitch": "Render as pitch transcription (Contour6 font)",
    "create_bundle": "Create Bundle"
  },
  "matching": {
    "macro_bundle": "Macro-Bundle",
    "select_subbundle": "Select Sub-Bundle to Sort",
    "current_subbundle": "Current Sub-Bundle",
    "back_to_navigation": "Back to Navigation",
    "mark_all_reviewed": "Mark All Reviewed",
    "export_subbundle": "Export Sub-Bundle",
    "export_project": "Export Full Project",
    "reviewed": "Reviewed",
    "swipe_to_move": "Swipe right to remove or move",
    "move_to_subbundle": "Move to different sub-bundle",
    "moved_word_toast": "Moved {{word}} to {{subbundle}}",
    "pitch_transcription": "Pitch Transcription",
    "tone_abbreviation": "Tone Abbreviation",
    "exemplar_word": "Exemplar Word",
    "review_group": "Review Group",
    "mark_reviewed": "Mark as Reviewed",
    "unmark_reviewed": "Unmark Reviewed",
    "auto_unmarked_toast": "Group unmarked as reviewed due to changes",
    "all_assigned_subbundle": "All words in \"{{subbundle}}\" have been assigned!",
    "all_reviewed_project": "All sub-bundles have been reviewed!",
    "continue_reviewing": "Continue Reviewing",
    "cross_matching_title": "Suggest Tone Group Matches Across Sub-Bundles",
    "suggested_match": "Suggested Match: \"{{abbreviation}}\"",
    "match_groups": "Match These Groups",
    "skip_match": "Skip",
    "review_words": "Review Words",
    "apply_all_matches": "Apply All Matches",
    "skip_all": "Skip All",
    "matched_groups_toast": "Matched {{count}} groups containing {{wordCount}} words",
    "device_history": "Bundle History",
    "current_device": "Current device"
  }
}
```

Translate to all 12 languages: en, id, tpi, de, fr, es, pt, it, nl, af, ar, zh

---

## 8. PERFORMANCE CONSIDERATIONS

### 8.1 Large Hierarchies

- Lazy-load sub-bundles (don't load all into memory)
- Paginate tree view if >100 nodes
- Cache parsed XML per sub-bundle
- Use virtual scrolling for long word lists

### 8.2 Audio Files

- Don't pre-load all audio, load on-demand
- Cache recently played audio (max 10 files)
- Clear audio buffers when switching sub-bundles
- Compress audio in exports if >50MB

### 8.3 Session Storage

- Debounce session saves (max 1 save per 2 seconds)
- For mobile, use file storage for sessions >5MB
- Compress session JSON if >1MB
- Auto-cleanup old session files (>30 days)

### 8.4 Change History

- Append-only to change_history.json (don't rewrite entire file)
- Limit to last 10,000 changes
- Archive old changes if >100MB

---

## 9. KNOWN LIMITATIONS & FUTURE ENHANCEMENTS

### Current Scope Limitations

- Cross-bundle matching only by tone abbreviation (not pitch or exemplar)
- No automatic conflict resolution in comparison app
- No real-time collaboration
- No cloud sync
- Pitch transcription uses legacy font (not IPA or Unicode)

### Potential Future Features (Not in current scope)

- AI-powered tone group suggestions
- Waveform visualization in matching apps
- Automatic exemplar word matching
- Git-style merge conflict resolution in comparison app
- Web-based matching app (PWA)
- Real-time multi-user collaboration
- Unicode pitch notation support
- Spectrogram display
- Bulk operations (move multiple words at once)

---

## 10. ATTRIBUTION & DOCUMENTATION

### Required Attribution in About/Credits

```
Tone Analysis Methodology:
  Based on "Tone Analysis for Field Linguists"
  by Dr. Keith Snider
  https://www.canil.ca/wordpress/u_member/keith-snider/

Contour6 SILDoulos Font:
  Created by Dr. Keith Snider
  Available at: https://casali.canil.ca/
  Licensed for use in linguistic research

Dekereke Database Format:
  Created by Dr. Rod Casali
  https://casali.canil.ca/
```

### Update Documentation Website

Add new sections to https://rulingants.github.io/tone_comparison_app:

- Hierarchical bundles workflow
- Keith Snider methodology overview
- Video tutorial: Creating macro-bundles
- Video tutorial: Sorting hierarchical bundles
- FAQ: When to use legacy vs hierarchical
- Troubleshooting: Font rendering issues

---

## 11. IMPLEMENTATION PRIORITY

### Phase 1 (Critical Path)
1. Bundler: Bundle type toggle
2. Bundler: Enhanced field configuration
3. Bundler: Hierarchical tree builder
4. Bundler: Sub-bundle generation
5. Desktop Matching: Bundle type detection
6. Desktop Matching: Sub-bundle navigation
7. Desktop Matching: Sub-bundle sorting
8. Desktop Matching: Export (.zip and .tnset)

### Phase 2 (Core Features)
9. Desktop Matching: Word moving between sub-bundles
10. Desktop Matching: Tone label editing (pitch, abbreviation, exemplar)
11. Desktop Matching: Review status handling
12. Desktop Matching: Re-import support
13. Mobile Matching: All Phase 1 & 2 desktop features

### Phase 3 (Polish)
14. Both Matching: Cross-sub-bundle matching
15. Both Matching: Device history tracking
16. Both Matching: Detailed change logging
17. Bundler: Initial tone group detection
18. Mobile: File associations and sharing
19. All: Localization for 12 languages

### Phase 4 (Testing & Docs)
20. Comprehensive testing (all edge cases)
21. Backward compatibility verification
22. Documentation updates
23. Video tutorials
24. Performance optimization

---

## FINAL NOTES

This implementation maintains **full backward compatibility** with existing .tncmp bundles and legacy matching app versions. Users can choose to continue using the simple workflow or adopt the hierarchical approach based on their research needs.

The hierarchical system is designed to scale from simple 2-level categorizations (e.g., Noun > SyllableProfile) to complex multi-level taxonomies (e.g., Verb > Transitivity > Voice > Valency > SyllableProfile > TonePattern).

All changes are tracked at a granular level to enable future merge functionality in the comparison app, following a git-like workflow for linguistic data management.