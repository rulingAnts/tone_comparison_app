# Bundler App - Hierarchical Bundle Fixes Required

## Issues Identified

### 1. ❌ hierarchy.json Not Being Created Properly
**Current State**: Only basic level/field information saved
**Required**: Full hierarchical structure with values and audio config per value

**Desktop App Expects**:
```json
{
  "levels": [
    {
      "level": 0,
      "field": "Category",
      "values": [
        {
          "value": "Noun",
          "label": "Noun",
          "audioVariants": ["default", "slow"],  // Which variants to include
          "children": [...]  // Next level values
        },
        {
          "value": "Verb",
          "label": "Verb",
          "audioVariants": ["default"],
          "children": [...]
        }
      ]
    },
    {
      "level": 1,
      "field": "SyllableShape", 
      "values": [...]
    }
  ]
}
```

### 2. ❌ All Audio Files Being Included
**Current**: Copies all audio files from source folder
**Required**: Only copy audio files that match:
- Records in the sub-bundle (filtered by category path)
- Audio variants selected for that value path
- Suffix patterns from audio variants

### 3. ❌ Audio Configuration UI Wrong
**Current**: Audio config per hierarchy level
**Required**: Audio config per VALUE at each level, with inheritance

---

## Required Changes

### Change 1: Fix hierarchy.json Generation

**File**: `bundler_app/src/main.js`

**Current Code** (lines ~651-660):
```javascript
const hierarchy = {
  levels: hierarchyLevels.map((level, index) => ({
    level: index,
    field: level.field,
    values: level.values.filter(v => v.included).map(v => v.value),
    audioConfig: level.audioConfig || { includeAudio: true, suffix: '' }
  }))
};
```

**Should Be**:
```javascript
const hierarchy = {
  levels: hierarchyLevels.map((level, index) => ({
    level: index,
    field: level.field,
    values: level.values
      .filter(v => v.included)
      .map(v => ({
        value: v.value,
        label: v.label || v.value,
        audioVariants: v.audioVariants || [],  // Which variant indices are enabled
        recordCount: v.count || 0
      }))
  }))
};
```

### Change 2: Fix Audio File Filtering

**File**: `bundler_app/src/main.js` (lines ~680-705)

**Current** (copies all audio):
```javascript
// Add audio files if configured
if (subBundle.audioConfig.includeAudio) {
  const audioSuffix = subBundle.audioConfig.suffix || '';
  for (const record of subBundle.records) {
    if (record.SoundFile) {
      let soundFile = record.SoundFile;
      if (audioSuffix) {
        const lastDot = soundFile.lastIndexOf('.');
        if (lastDot !== -1) {
          soundFile = soundFile.substring(0, lastDot) + audioSuffix + soundFile.substring(lastDot);
        }
      }
      const srcPath = path.join(audioFolder, soundFile);
      if (fs.existsSync(srcPath)) {
        archive.file(srcPath, { name: `sub_bundles/${subBundlePath}/audio/${soundFile}` });
      }
    }
  }
}
```

**Should Be** (only copy files for enabled variants + records in sub-bundle):
```javascript
// Add audio files for enabled variants only
if (subBundle.audioVariants && subBundle.audioVariants.length > 0) {
  const addedFiles = new Set();  // Prevent duplicates
  
  for (const variantIndex of subBundle.audioVariants) {
    const variant = settingsWithMeta.audioFileVariants[variantIndex];
    if (!variant) continue;
    
    const suffix = variant.suffix || '';
    
    for (const record of subBundle.records) {
      if (!record.SoundFile) continue;
      
      // Build audio filename with suffix
      let audioFilename = record.SoundFile;
      if (suffix) {
        const baseName = path.basename(audioFilename, path.extname(audioFilename));
        const ext = path.extname(audioFilename);
        audioFilename = baseName + suffix + ext;
      }
      
      // Skip if already added
      if (addedFiles.has(audioFilename)) continue;
      
      const srcPath = path.join(audioFolder, audioFilename);
      if (fs.existsSync(srcPath)) {
        archive.file(srcPath, { name: `sub_bundles/${subBundlePath}/audio/${audioFilename}` });
        addedFiles.add(audioFilename);
      } else {
        console.warn(`[bundler] Audio file not found: ${audioFilename}`);
      }
    }
  }
}
```

### Change 3: Redesign Audio Configuration UI

**File**: `bundler_app/public/index.html`

#### Current UI Structure:
```
Hierarchy Level 1: Category
  Audio Config: [suffix field]
  Values:
    ☑ Noun (15 words)
    ☑ Verb (23 words)
```

#### New UI Structure:
```
Audio Variants (Project-Wide):
  ☑ [0] Yohanis (-phon) [folder: /audio]
  ☑ [1] Barnabas (-bdoi) [folder: /audio]
  ☑ [2] + kuti (besar) (tf_Xbig_bdoi)
  ...

Hierarchy Level 1: Category
  
  Value: Noun (15 words)
    Audio Variants for this value:
      ☑ [0] Yohanis
      ☑ [1] Barnabas  
      ☑ [2] + kuti (besar)
      ...
  
  Value: Verb (23 words)
    Audio Variants for this value:
      ☑ [0] Yohanis
      ☐ [1] Barnabas (unchecked - won't be included)
      ...
      
Hierarchy Level 2: SyllableShape (under Noun)
  Value: CVCV (8 words)
    Audio Variants: (inherited from Noun)
      ☑ [0] Yohanis (inherited, can override)
      ☑ [1] Barnabas (inherited, can override)
  
  Value: VCV (5 words)
    Audio Variants:
      ☐ [0] Yohanis (unchecked at parent level, disabled here)
      ☑ [1] Barnabas (can still enable if parent had it)
```

**Inheritance Rules**:
1. By default, all variants enabled for all values
2. When unchecked at a value, descendants inherit the unchecked state
3. Descendants can only enable variants that ancestors have enabled
4. Can override at any level (expand to show checkboxes)

**UI Components Needed**:
```html
<!-- For each hierarchy value -->
<div class="hierarchy-value">
  <div class="value-header">
    <input type="checkbox" id="include-noun" checked>
    <label>Noun (15 words)</label>
    <button class="audio-config-toggle">Configure Audio ▼</button>
  </div>
  
  <div class="audio-config-panel" style="display:none">
    <p>Select which audio variants to include for <strong>Noun</strong>:</p>
    <div class="variant-checkboxes">
      <label>
        <input type="checkbox" data-variant="0" checked>
        [0] Yohanis (-phon)
      </label>
      <label>
        <input type="checkbox" data-variant="1" checked>
        [1] Barnabas (-bdoi)
      </label>
      <label>
        <input type="checkbox" data-variant="2" checked>
        [2] + kuti (besar) (tf_Xbig_bdoi)
      </label>
      <!-- ... more variants ... -->
    </div>
    <p class="inheritance-note">
      ℹ️ Child values will inherit these selections by default
    </p>
  </div>
</div>
```

### Change 4: Update Data Structures

**File**: `bundler_app/public/renderer.js`

**Current**:
```javascript
hierarchyLevels = [
  {
    field: 'Category',
    values: [
      { value: 'Noun', included: true, count: 15 },
      { value: 'Verb', included: true, count: 23 }
    ],
    audioConfig: { includeAudio: true, suffix: '-phon' }
  }
]
```

**Should Be**:
```javascript
hierarchyLevels = [
  {
    field: 'Category',
    values: [
      {
        value: 'Noun',
        label: 'Noun',
        included: true,
        count: 15,
        audioVariants: [0, 1, 2, 3, 4, 5, 6, 7],  // Indices of enabled variants
        parentAudioVariants: null  // null = root, inherits project defaults
      },
      {
        value: 'Verb',
        label: 'Verb',
        included: true,
        count: 23,
        audioVariants: [0, 1, 2],  // Only first 3 variants
        parentAudioVariants: null
      }
    ]
  },
  {
    field: 'SyllableShape',
    values: [
      {
        value: 'CVCV',
        label: 'CVCV',
        included: true,
        count: 8,
        audioVariants: [0, 1, 2],  // Inherited from parent Noun
        parentAudioVariants: [0, 1, 2, 3, 4, 5, 6, 7],  // What parent had
        parentValue: 'Noun'  // Track which parent this belongs to
      }
    ]
  }
]
```

### Change 5: Update Sub-Bundle Generation

**File**: `bundler_app/src/main.js` - `generateSubBundles()` function

**Add**: Track audio variants through the path

```javascript
function generateSubBundles(records, hierarchyLevels, levelIndex, pathPrefix, categoryPath, parentAudioVariants, settings) {
  const subBundles = [];
  
  if (levelIndex >= hierarchyLevels.length) {
    // Leaf node - create a sub-bundle
    return [{
      path: pathPrefix || 'root',
      categoryPath: categoryPath || [],
      records: records,
      audioVariants: parentAudioVariants || []  // Which variant indices to include
    }];
  }
  
  const level = hierarchyLevels[levelIndex];
  const field = level.field;
  
  for (const valueConfig of level.values) {
    if (!valueConfig.included) continue;
    
    const value = valueConfig.value;
    const valueRecords = records.filter(r => r[field] === value);
    
    if (valueRecords.length === 0 && !valueConfig.manuallyAdded) continue;
    
    const newPath = pathPrefix ? `${pathPrefix}/${sanitizePath(value)}` : sanitizePath(value);
    const newCategoryPath = [...(categoryPath || []), value];
    
    // Get audio variants for this value (inherits from parent if not overridden)
    const audioVariants = valueConfig.audioVariants || parentAudioVariants || [];
    
    const childBundles = generateSubBundles(
      valueRecords,
      hierarchyLevels,
      levelIndex + 1,
      newPath,
      newCategoryPath,
      audioVariants,  // Pass down to children
      settings
    );
    
    subBundles.push(...childBundles);
  }
  
  return subBundles;
}
```

---

## Implementation Plan

### Phase 1: Data Structure Changes (2 hours)
1. Update `hierarchyLevels` structure in renderer.js
2. Add `audioVariants` array to each value
3. Update save/load state functions

### Phase 2: UI Changes (4 hours)
1. Add "Configure Audio" button per value
2. Create expandable audio variant selection panel
3. Implement inheritance logic (disable child checkboxes based on parent)
4. Update hierarchy rendering to show audio config per value

### Phase 3: Backend Changes (3 hours)
1. Update `generateSubBundles()` to track audioVariants
2. Fix audio file filtering to use variant indices
3. Update hierarchy.json generation with full structure
4. Update metadata.json per sub-bundle with audioVariants

### Phase 4: Testing (2 hours)
1. Create test bundle with mixed audio variants
2. Verify hierarchy.json structure matches desktop app expectations
3. Verify only correct audio files included per sub-bundle
4. Test inheritance (uncheck parent → child disabled)
5. Test override (re-enable at child level)

**Total Estimated Time**: 11 hours

---

## Testing Checklist

- [ ] hierarchy.json created with full value structure
- [ ] hierarchy.json includes audioVariants per value
- [ ] Desktop app can load and parse hierarchy.json
- [ ] Only audio files matching sub-bundle records are included
- [ ] Only audio files for enabled variants are included
- [ ] Audio variant inheritance works (parent → child)
- [ ] Can override variants at child level
- [ ] Unchecked variants at parent level disable at child level
- [ ] Sub-bundle metadata.json includes audioVariants
- [ ] Bundle size significantly smaller (only needed audio)

---

## Breaking Changes

### For Users
- Existing hierarchical bundles will need to be recreated
- UI has changed - audio config now per-value instead of per-level

### For Desktop App
- Desktop app already expects correct structure (no changes needed)
- Will properly load new hierarchy.json format

---

## Priority

**HIGH PRIORITY** - Current implementation is broken:
1. Desktop app cannot properly load hierarchical structure
2. Bundle sizes are unnecessarily large (all audio included)
3. Cannot control audio per category value

Recommend implementing all changes together as they are interdependent.
