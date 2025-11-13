# Tree-Based Hierarchy Refactor Plan

## Problem
Current implementation treats hierarchy as a fixed array of levels that apply uniformly to all branches. This prevents:
- Different branches having different sub-levels (e.g., Verbs → VerbClass vs Nouns → SyllableProfile)
- Different branch depths (Verbs might have 3 levels, Nouns might have 2)
- Independent audio variant inheritance per branch

## Solution: True Tree Structure

### Data Model Change

**OLD (Flat Levels)**:
```javascript
hierarchyLevels = [
  {field: 'WordClass', values: [{value: 'Noun', ...}, {value: 'Verb', ...}]},
  {field: 'SyllableProfile', values: [{value: 'CVCV', ...}]},  // Applies to ALL level-1 values
  {field: 'TonePattern', values: [{value: 'HH', ...}]}  // Applies to ALL level-2 values
]
```

**NEW (True Tree)**:
```javascript
hierarchyTree = {
  field: 'WordClass',
  values: [
    {
      value: 'Noun',
      label: 'Noun',
      count: 50,
      included: true,
      audioVariants: [0, 1],
      children: {
        field: 'SyllableProfile',
        values: [
          {
            value: 'CVCV',
            label: 'CVCV',
            count: 30,
            included: true,
            audioVariants: [0, 1],  // Inherits from Noun
            children: {
              field: 'TonePattern',
              values: [...]
            }
          }
        ]
      }
    },
    {
      value: 'Verb',
      label: 'Verb', 
      count: 40,
      included: true,
      audioVariants: [0],  // Only audio variant 0
      children: {
        field: 'VerbClass',  // DIFFERENT field than Noun branch!
        values: [...]
      }
    }
  ]
}
```

### UI Changes

1. **Rendering**: Recursive tree rendering where each value can have "Add Child Level" button
2. **Audio Inheritance**: Parent audioVariants constrain child, but only within same branch
3. **Field Selection**: Each "Add Child Level" gets its own field dropdown, independent of other branches
4. **Visual Hierarchy**: Indentation shows tree depth, making branch structure clear

### Key Functions to Rewrite

1. `addHierarchyLevel()` → `addChildLevel(parentPath)` - Takes path to parent value
2. `updateHierarchyField()` → `updateNodeField(path, field)` - Works on specific tree node
3. `toggleHierarchyValue()` → `toggleNodeValue(path)` - Path-based addressing
4. `toggleAudioVariant()` → Takes path instead of level/value indices
5. `propagateAudioVariants()` → Only affects children of specific value, not all same-level values
6. `renderHierarchyTree()` → Recursive rendering with proper paths
7. `getFilteredRecords()` → Follow path down tree to get records for specific branch

### Path-Based Addressing

Use array paths to address any node:
```javascript
// Root level value "Noun"
path = [0]  // First value of root

// Noun → CVCV
path = [0, 1]  // First value of root → second value of its children

// Noun → CVCV → HH
path = [0, 1, 2]  // First value of root → second child value → third child value
```

### Backend Changes

Update `main.js` to:
1. Accept tree structure instead of flat levels
2. Recursively walk tree to generate sub-bundles
3. Track audioVariants along specific paths
4. Build hierarchy.json from tree structure

## Implementation Order

1. ✅ Update data model (hierarchyTree instead of hierarchyLevels)
2. ✅ Rewrite core tree manipulation functions with path-based addressing
3. ✅ Rewrite UI rendering to be fully recursive
4. ✅ Update audio variant inheritance to work per-branch
5. ✅ Update state save/load with legacy migration support
6. ✅ Update backend to accept and process tree structure
7. 🔄 TEST with real data (Noun vs Verb branches with different sub-levels)

## Example User Flow

1. Load XML with WordClass, SyllableProfile, VerbClass, TonePattern fields
2. Add root level → Select "WordClass" → Shows: Noun, Verb, Adjective
3. Click "Noun" → Click "Add Child Level" for Noun only
4. Select "SyllableProfile" for Noun's children → Shows: CVCV, CVV, etc.
5. Click "Verb" → Click "Add Child Level" for Verb only  
6. Select "VerbClass" for Verb's children → Shows: Transitive, Intransitive
7. Configure audio variants:
   - Noun: Enable variants [0, 1]
   - Noun → CVCV: Inherits [0, 1], can disable to [0] only
   - Verb: Enable only variant [0]
   - Verb → Transitive: Inherits [0], can't enable [1] (parent doesn't have it)

Each branch is completely independent!
