# Organizational (Virtual) Nodes in Hierarchical Bundles

## Overview

Organizational nodes allow you to create **virtual grouping levels** in your hierarchy tree. Instead of defining new XML fields, organizational nodes let you **sort and group existing XML values** into custom categories for better organization and navigation.

## Key Concept: Grouping, Not Filtering

**Organizational nodes work like folders in a file system:**
- Each XML value can only be in **one group at a time** (or unassigned)
- You **drag values** between groups to organize them
- Groups are purely for UI organization - they don't add new XML fields
- Moving a word between organizational groups **does not change its XML data**

## Example Use Case

### Scenario: Organizing Syllable Profiles

You have a `SyllableProfile` field with many values: CV, CVC, VC, CVCV, CCVCV, VCV, CCVCC, CVCVC, etc.

**Without organizational nodes:**
```
Noun
└─ SyllableProfile (flat list)
   ├─ CV (20 words)
   ├─ CVC (35 words)
   ├─ VC (15 words)
   ├─ CVCV (45 words)
   ├─ CCVCV (30 words)
   ├─ VCV (25 words)
   ├─ CCVCC (12 words)
   └─ ... (many more)
```

**With organizational nodes:**
```
Noun
└─ SyllableProfile (ORGANIZATIONAL)
   ├─ 1 Syllable (GROUP)
   │  ├─ CV (20 words)
   │  ├─ CVC (35 words)
   │  └─ VC (15 words)
   ├─ 2 Syllables (GROUP)
   │  ├─ CVCV (45 words)
   │  ├─ CCVCV (30 words)
   │  └─ VCV (25 words)
   ├─ 3+ Syllables (GROUP)
   │  └─ CCVCC (12 words)
   └─ Unassigned
      └─ (any new patterns not yet sorted)
```

**Important**: CV, CVC, CVCV, etc. are still actual `SyllableProfile` XML values. The groups ("1 Syllable", "2 Syllables") are virtual containers that only exist in `hierarchy.json`.

## How to Create and Use Organizational Nodes

### Step 1: Set Up the Base Field

1. Create a child level under a value (e.g., under "Noun")
2. Select an XML field (e.g., "SyllableProfile")
3. The UI will show all available values for that field

### Step 2: Enable Organizational Mode

1. Check the **"Organizational (virtual grouping)"** checkbox
2. The field becomes locked and labeled "Virtual Grouping"
3. All values move to an **"Unassigned Values"** section
4. The node background turns orange

### Step 3: Create Groups

1. Click **"+ Add Organizational Group"**
2. Enter a group name (e.g., "1 Syllable", "Simple Patterns", "Common")
3. Repeat to create as many groups as needed
4. Each group appears as a blue-bordered container
5. **Reorder groups** by dragging them up/down using the drag handle (⋮⋮)

**Tip**: The order of groups affects how they appear in the desktop Matching App, so arrange them logically (e.g., "1 Syllable" before "2 Syllables").

### Step 4: Assign Values to Groups

1. **Drag and drop** values from "Unassigned" into groups
2. Drag values between groups to reorganize
3. **Reorder values within a group** by dragging them left/right
4. Drag values back to "Unassigned" if needed
5. Each value can only be in one location at a time

**Reordering tip**: When dragging within the same group, you'll see a blue border on the left or right side of the target value indicating where the dragged value will be inserted.

### Step 5: Include/Exclude Groups and Values

Each organizational group and value has a **checkbox** that controls whether it will be included in the bundle export:

1. **Unchecking a group** excludes that entire group and all its values from the bundle
2. **Unchecking individual values** excludes just those values
3. Excluded items appear **grayed out** in the UI
4. Inclusion states are saved in your bundler profile for later use

**Use cases**:
- Organize your full data structure but only export certain groups
- Keep rarely-used patterns organized but excluded by default
- Temporarily exclude groups for testing without deleting them
- Save different export configurations in different profiles

### Visual Interface

```
┌─────────────────────────────────────────────────────┐
│ ℹ️ Organizing field: SyllableProfile                │
│ Drag values between groups to organize them.        │
└─────────────────────────────────────────────────────┘

┌─ ☑ ⋮⋮ 📁 1 Syllable (3 values) ────────────────────┐
│  [☑ ⋮⋮ CV (20)]  [☑ ⋮⋮ CVC (35)]  [☑ ⋮⋮ VC (15)]  │
└─────────────────────────────────────────────────────┘

┌─ ☑ ⋮⋮ 📁 2 Syllables (3 values) ───────────────────┐
│  [☑ ⋮⋮ CVCV (45)]  [☐ ⋮⋮ CCVCV (30)]  [☑ ⋮⋮ VCV] │
└─────────────────────────────────────────────────────┘
        ^ This value is excluded (grayed out)

┌─ ☐ ⋮⋮ 📁 3+ Syllables (1 value) ───────────────────┐
│  [☐ ⋮⋮ CCVCC (12)]                                 │
└─────────────────────────────────────────────────────┘
  ^ This entire group is excluded (grayed out)

┌─ 📋 Unassigned Values (1) ─────────────────────────┐
│  [☑ ⋮⋮ CVCVC (18)]                                 │
└─────────────────────────────────────────────────────┘

              [+ Add Organizational Group]
```

**Legend**:
- ☑ = Included in bundle export
- ☐ = Excluded from bundle export (grayed out)
- ⋮⋮ = Drag handle

## Data Structure

### In hierarchy.json
```javascript
{
  field: "Category",
  values: [
    {
      value: "Noun",
      children: {
        field: "Virtual Grouping",
        isOrganizational: true,
        organizationalBaseField: "SyllableProfile",  // The actual XML field
        organizationalGroups: [
          {
            name: "1 Syllable",
            children: {
              field: "SyllableProfile",
              values: [
                { value: "CV", count: 20, included: true },
                { value: "CVC", count: 35, included: true },
                { value: "VC", count: 15, included: true }
              ]
            }
          },
          {
            name: "2 Syllables",
            children: {
              field: "SyllableProfile",
              values: [
                { value: "CVCV", count: 45, included: true },
                { value: "CCVCV", count: 30, included: true },
                { value: "VCV", count: 25, included: true }
              ]
            }
          }
        ],
        unassignedValues: [
          { value: "CCVCC", count: 12, included: true },
          { value: "CVCVC", count: 18, included: true }
        ]
      }
    }
  ]
}
```

### Key Properties

- **`isOrganizational: true`**: Marks this as an organizational node
- **`organizationalBaseField`**: The actual XML field being organized (e.g., "SyllableProfile")
- **`organizationalGroups`**: Array of virtual groups, each with a name and children values
- **`unassignedValues`**: Values not yet assigned to any group
- Each group's `children.values` contains the actual XML field values assigned to that group

## XML Changes When Moving Words

### Moving Between Organizational Groups (No XML Change)

**Scenario**: Move a word from "1 Syllable/CV" to "2 Syllables/CV"

```
From: Category=Noun, SyllableProfile=CV (in group "1 Syllable")
To:   Category=Noun, SyllableProfile=CV (in group "2 Syllables")
```

**XML Change**: **NONE** - The word still has `SyllableProfile=CV`, just organized differently in the UI

### Moving to Different XML Value (XML Change Required)

**Scenario**: Move a word from "1 Syllable/CV" to "1 Syllable/CVC"

```
From: Category=Noun, SyllableProfile=CV
To:   Category=Noun, SyllableProfile=CVC
```

**XML Change**: `SyllableProfile` changes from "CV" to "CVC"

### Moving Across Parent Categories (XML Change Required)

**Scenario**: Move a word from "Noun/1 Syllable/CV" to "Verb/1 Syllable/CV"

```
From: Category=Noun, SyllableProfile=CV
To:   Category=Verb, SyllableProfile=CV
```

**XML Change**: `Category` changes from "Noun" to "Verb" (SyllableProfile stays CV)

## Multiple Organizational Levels

You can nest multiple organizational levels to create complex hierarchies:

### Example: Multi-Level Organization

```
Category
└─ Noun
   └─ Complexity (ORGANIZATIONAL - groups SyllableProfile)
      ├─ Simple (GROUP)
      │  ├─ CV (4 words)
      │  ├─ CVC (8 words)
      │  └─ VC (3 words)
      │  └─ NumSyllables (ORGANIZATIONAL - nested within Simple)
      │     ├─ 1 Syllable (GROUP)
      │     │  └─ Tone (XML field)
      │     │     ├─ High
      │     │     └─ Low
      │     └─ 2 Syllables (GROUP)
      │        └─ Tone (XML field)
      │           └─ Rising
      └─ Complex (GROUP)
         ├─ CCVCC (5 words)
         └─ CVCVC (7 words)
```

### How to Create Nested Organizational Levels

1. Create your first organizational level as usual
2. Add groups and assign values to them
3. Click **"+ Add Child Level to Group"** on any group
4. Choose to either:
   - **Add an XML field** (e.g., "Tone", "Category") - creates a regular hierarchy level
   - **Add another organizational level** (leave field name empty) - creates a nested organizational grouping

**Path example**: `Noun/Complexity:Simple/NumSyllables:1-Syllable/Tone:High`

**XML**: Still just `Category=Noun, SyllableProfile=CV, Tone=High`

The organizational levels ("Complexity" and "NumSyllables") don't appear in XML at all.

## Workflow Tips

### When to Use Organizational Nodes

**Good use cases**:
- Grouping syllable patterns by count (1-syl, 2-syl, 3-syl)
- Grouping tones by register (high, mid, low)
- Organizing by frequency (common, rare)
- Creating semantic categories (body parts, animals, actions)
- Simplifying navigation of large value sets

**Not recommended**:
- When the grouping should be in the XML data itself
- For very simple hierarchies (< 10 values total)
- When you need to query/filter by the grouping in other tools

### Best Practices

1. **Plan your groups first**: Think about how you want to organize before enabling organizational mode
2. **Keep group names clear**: Use descriptive names like "1 Syllable" not "Group A"
3. **Don't over-nest**: 2-3 organizational levels max is usually sufficient
4. **Assign systematically**: Work through unassigned values methodically
5. **Document your logic**: Note why you grouped things as you did
6. **Mix organizational and XML levels**: You can add XML field children to organizational groups for flexible hierarchies

### Managing Unassigned Values

- Unassigned values are **valid** - not everything needs to be grouped
- Common to leave rare/unusual patterns unassigned
- Can create an "Other" or "Misc" group if needed
- New values from XML updates will appear as unassigned

### Include/Exclude for Bundle Generation

When creating a `.tnset` bundle:
- **Only included groups and values** are exported
- Excluded groups (unchecked) are completely omitted from the bundle
- Excluded values (unchecked) within included groups are skipped
- **Organizational structure is preserved** in `hierarchy.json` even if some groups are excluded
- Inclusion states are **saved in your profile** so you can have different export configurations

**Workflow example**:
1. Organize all your data into groups (even patterns you rarely use)
2. For a beginner bundle, uncheck the "3+ Syllables" group
3. For an advanced bundle, include everything
4. Save different profiles for different export scenarios

## Drag and Drop Interactions

### What You Can Drag

- **Individual value chips** (shown with ⋮⋮ icon inside the chip)
- **Organizational groups** (drag the entire group container by its header)
- Drag from any group or from unassigned

### Where You Can Drop

**For values:**
- Into any organizational group (adds to end or inserts at specific position)
- Back to unassigned section
- Between values in the same group to reorder them
- Hover over drop zones for visual feedback (blue highlight for containers, blue border for insertion points)

**For groups:**
- Above or below other groups to change the order
- Orange top/bottom border shows where the group will be inserted

### Reordering Groups

To change the order of organizational groups:
1. Grab a group by its drag handle (⋮⋮) in the header or anywhere on the group container
2. Drag up or down
3. **Orange top border** = will insert before that group
4. **Orange bottom border** = will insert after that group
5. Release to drop in the new position

The group order is preserved in the bundle and affects the navigation order in the Matching App.

### Reordering Within Groups

When dragging a value within the same group:
1. Hover over another value to see insertion indicators
2. **Blue left border** = will insert before that value
3. **Blue right border** = will insert after that value
4. The order you set will be preserved in the bundle and reflected in the Matching App UI

### What You Cannot Do

- Cannot have same value in multiple groups simultaneously
- Cannot drag groups themselves into values or vice versa (they're separate drag systems)
- Cannot drag across different organizational nodes (only within the same base field)
- Cannot nest groups within other groups

## Persistence and Compatibility

### Saved in Bundle

Organizational structure is saved in `hierarchy.json`:
- `organizationalGroups` with group names and assigned values
- `unassignedValues` list
- `organizationalBaseField` tracking

### Saved in Profile

When you save a bundler profile, the complete organizational structure is included.

### Desktop App

The desktop matching app will:
- Recognize organizational nodes from `hierarchy.json`
- Display the organized hierarchy
- Skip organizational groups when updating XML (only update actual field values)
- Navigate through groups correctly

### Backward Compatibility

- Bundles created before this feature will load normally
- Toggling organizational mode off converts back to regular nodes
- All XML values are preserved during conversions

## Troubleshooting

### Issue: Values don't move when I drag them
- **Cause**: Dragging outside valid drop zone
- **Solution**: Drag directly onto the blue group container or unassigned section, wait for blue highlight

### Issue: Lost values after toggling organizational mode
- **Cause**: Values moved to unassigned
- **Solution**: Scroll to "Unassigned Values" section - all values should be there

### Issue: Can't create organizational groups
- **Cause**: Organizational mode not enabled, or no base field selected
- **Solution**: 1) Select an XML field first, 2) Check "Organizational (virtual grouping)" checkbox, 3) Then add groups

### Issue: Word counts show 0
- **Cause**: Values not included or not yet assigned
- **Solution**: Ensure values are checked/included in their assigned groups

### Issue: Same value appears in multiple places
- **This should not happen**: Each value can only be in one group. Report as a bug if seen.

## Summary

Organizational nodes provide a powerful way to **sort and group** existing XML values without modifying your data structure. Think of them as **file folders** for your linguistic data - they help you organize and navigate, but the actual files (XML records) remain unchanged. Use drag-and-drop to arrange values into groups that make sense for your research workflow.


## Key Concepts

### XML-Backed Nodes (Default)
- Tied to actual XML `data_form` elements (e.g., `Category`, `SyllableProfile`)
- Values are auto-detected from your XML data
- Moving words between these nodes requires XML field updates
- Example: Moving from "Noun" to "Verb" changes the `Category` field

### Organizational Nodes (Virtual)
- **Not tied to any XML field**
- Created manually for convenience and clarity
- Moving words between organizational siblings requires **no XML changes**
- Used to group related values together
- Marked with a **VIRTUAL** badge and orange background

## Example Use Case

### Before (Flat Structure)
```
Category
├─ Noun
│  └─ SyllableProfile
│     ├─ CV (20 words)
│     ├─ CVC (35 words)
│     ├─ CVCV (45 words)
│     ├─ CCVCV (30 words)
│     ├─ VCV (25 words)
│     ├─ CCVCC (15 words)
│     ├─ CVCVC (40 words)
│     └─ ... (many more)
```

### After (Organized with Virtual Groupings)
```
Category
├─ Noun
│  └─ NumSyllables (VIRTUAL - organizational)
│     ├─ 1 Syllable (VIRTUAL)
│     │  ├─ CV (20 words)
│     │  ├─ CVC (35 words)
│     │  └─ VCV (25 words)
│     ├─ 2 Syllables (VIRTUAL)
│     │  ├─ CVCV (45 words)
│     │  ├─ CCVCV (30 words)
│     │  └─ CVCVC (40 words)
│     └─ 3+ Syllables (VIRTUAL)
│        ├─ CCVCC (15 words)
│        └─ ...
```

**Important**: `NumSyllables`, `1 Syllable`, `2 Syllables`, etc. are organizational only. The actual XML still only has `Category=Noun` and `SyllableProfile=CVCV` (etc.).

## How to Create Organizational Nodes

### Step 1: Add a Child Level
1. Select a value in your tree (e.g., "Noun")
2. Click **"+ Add Child Level"** button

### Step 2: Mark as Organizational
1. Check the **"Organizational (virtual grouping)"** checkbox
2. The field selector will be disabled
3. The node background turns orange to indicate it's virtual

### Step 3: Add Grouping Values
1. Click **"+ Add Grouping Value"** button
2. Enter a name (e.g., "1 Syllable", "High Tone", "Common Words")
3. Repeat to add more groupings

### Step 4: Add Children Under Groupings
1. Select a grouping value (e.g., "1 Syllable")
2. Click **"+ Add Child Level"**
3. Select an XML field (e.g., "SyllableProfile")
4. Check the boxes for values that belong in this grouping (CV, CVC, VCV)

## How It Works

### Data Structure
```javascript
{
  field: "Category",
  values: [
    {
      value: "Noun",
      children: {
        field: "Virtual Grouping",
        isOrganizational: true,  // ← Marks this as virtual
        values: [
          {
            value: "1 Syllable",
            isOrganizational: true,  // ← Virtual value
            children: {
              field: "SyllableProfile",  // ← Real XML field
              values: [
                { value: "CV", included: true },
                { value: "CVC", included: true }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

### XML Changes When Moving Words

**Scenario 1**: Moving within organizational siblings (no XML change needed)
- From: `Noun → 1 Syllable → CV`
- To: `Noun → 2 Syllables → CV`
- **XML Change**: NONE (CV stays CV, Noun stays Noun)

**Scenario 2**: Moving between real XML values (requires XML update)
- From: `Noun → 1 Syllable → CV`
- To: `Noun → 1 Syllable → CVC`
- **XML Change**: `SyllableProfile` changes from "CV" to "CVC"

**Scenario 3**: Moving across categories (requires XML update)
- From: `Noun → 1 Syllable → CV`
- To: `Verb → 1 Syllable → CV`
- **XML Change**: `Category` changes from "Noun" to "Verb" (SyllableProfile stays "CV")

### Record Filtering

When calculating word counts:
- **XML-backed nodes**: Filter records by field value
- **Organizational nodes**: Pass through all records from parent (no filtering)
- Counts aggregate upward from leaf nodes

Example:
```
Noun (150 words total)
└─ NumSyllables (VIRTUAL - 150 words, no filtering)
   ├─ 1 Syllable (VIRTUAL - 80 words, sum of children)
   │  ├─ CV (20 words, filtered by SyllableProfile=CV)
   │  ├─ CVC (35 words, filtered by SyllableProfile=CVC)
   │  └─ VCV (25 words, filtered by SyllableProfile=VCV)
   └─ 2 Syllables (VIRTUAL - 70 words, sum of children)
      └─ CVCV (70 words, filtered by SyllableProfile=CVCV)
```

## Visual Indicators

### Organizational Node Level
- **Orange dashed border** around the node
- **Yellow background** (#fff8e1)
- **"Organizational (virtual grouping)"** checkbox checked
- Field selector shows: "— Organizational Node (no XML field) —"

### Organizational Value
- **"VIRTUAL"** badge (orange, white text) next to value name
- Tooltip: "This is an organizational grouping (not tied to XML field)"

## Workflow Tips

### When to Use Organizational Nodes

**Good use cases**:
- Grouping by syllable count when XML only has syllable pattern
- Grouping by tone height when XML only has tone pattern
- Creating "frequent/rare" groupings based on word frequency
- Organizing complex taxonomies into manageable sections

**Not recommended**:
- When you could just use an existing XML field
- For very simple hierarchies (adds unnecessary complexity)
- When you plan to export and need to maintain exact XML structure

### Best Practices

1. **Keep organizational levels shallow**: One level of virtual grouping is usually enough
2. **Use clear names**: "1 Syllable" is better than "Short" or "Type A"
3. **Document your choices**: Note why you created virtual groupings in your profile
4. **Test thoroughly**: Verify word counts aggregate correctly

### Combining with Other Features

- **Drag and drop**: Organizational values can be reordered like any other value
- **Collapse/expand**: Useful for hiding complex organizational branches
- **Audio variants**: Inherited normally through organizational nodes

## Persistence

### Saved in Bundle
Organizational nodes are saved in `hierarchy.json`:
```json
{
  "tree": {
    "field": "Category",
    "values": [
      {
        "value": "Noun",
        "children": {
          "field": "Virtual Grouping",
          "isOrganizational": true,
          "values": [...]
        }
      }
    ]
  }
}
```

### Saved in Profile
When you save a bundler profile, organizational nodes are included in the `hierarchyTree` structure.

### Desktop App Compatibility
The desktop matching app will:
- Recognize organizational nodes from `hierarchy.json`
- Display the virtual hierarchy correctly
- Skip organizational nodes when updating XML fields
- Aggregate counts properly across virtual groupings

## Troubleshooting

### Issue: Word counts show 0 for organizational values
- **Cause**: No children with actual XML-backed leaf nodes
- **Solution**: Add child levels with real XML fields under the organizational value

### Issue: Can't select XML field after checking "Organizational"
- **Cause**: Field selector is intentionally disabled for organizational nodes
- **Solution**: Uncheck "Organizational" if you need an XML-backed node instead

### Issue: Moving words doesn't update organizational counts
- **Cause**: Counts are calculated from leaf nodes upward
- **Solution**: Word counts will update when you move words between actual XML values (the organizational nodes automatically aggregate)

### Issue: Organizational node appears in exported XML
- **Cause**: Bug in export logic
- **Solution**: Organizational nodes should never appear in XML—only in `hierarchy.json`. Report this as a bug.

## Advanced: Multiple Organizational Levels

You can nest organizational nodes, but keep it reasonable:

```
Category
├─ Noun
│  └─ Complexity (VIRTUAL)
│     ├─ Simple (VIRTUAL)
│     │  └─ NumSyllables (VIRTUAL)
│     │     ├─ 1 Syllable (VIRTUAL)
│     │     │  └─ SyllableProfile (XML-backed)
│     │     │     ├─ CV
│     │     │     └─ VC
│     │     └─ 2 Syllables (VIRTUAL)
│     │        └─ SyllableProfile (XML-backed)
│     │           └─ CVCV
│     └─ Complex (VIRTUAL)
│        └─ ... (similar structure)
```

**Warning**: Too many organizational levels can make the hierarchy confusing. Usually one or two levels max is sufficient.

## Limitations

1. **No automatic population**: You must manually create organizational groupings—they won't auto-populate from XML
2. **Manual maintenance**: If you add new XML values later, you must manually assign them to organizational groups
3. **Desktop app dependency**: Older versions of the desktop app may not recognize organizational nodes
4. **Export complexity**: When exporting updated XML, the system must correctly skip organizational nodes

## Summary

Organizational nodes provide powerful flexibility to organize your tone data without modifying the underlying XML structure. Use them to create logical groupings that make sense for your research workflow, while keeping your data files clean and standard-compliant.
