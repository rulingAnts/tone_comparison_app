# Advanced Filter System Implementation

## Overview

The bundler app now includes a comprehensive filtering system that allows users to define complex filter conditions to pre-filter XML records before hierarchy configuration. Filters are applied at the top level of the app, and the hierarchy system works with the filtered subset of records.

## Features

### Filter Groups
- **Multiple Groups**: Add as many filter groups as needed
- **AND Logic Between Groups**: All top-level groups must pass for a record to be included
- **Configurable Within-Group Logic**: Each group can use AND (all items) or OR (any item) logic
- **Nested Groups**: Add nested groups within any group for complex boolean expressions
- **Unlimited Nesting Depth**: Groups can be nested arbitrarily deep

### Filter Conditions
Each condition consists of:
- **Field**: Select from available XML fields
- **Operator**: Choose from 11 comparison operators
- **Value**: Enter comparison value (type depends on operator)
- **NOT Toggle**: Negate the condition result

### Complex Boolean Logic
With nested groups, you can create sophisticated filter expressions:
- `(A AND B) OR (C AND D)` - Create a group with OR logic containing two nested AND groups
- `A AND (B OR C) AND D` - Create a group with AND logic, include B/C in a nested OR group
- `(A OR B) AND (C OR D) AND (E OR F)` - Multiple nested OR groups within an AND group
- Any arbitrary combination of AND/OR/NOT operations

### Supported Operators

1. **Equals**: Exact match (case-insensitive)
2. **Not Equals**: Does not match (case-insensitive)
3. **Contains**: Field contains substring (case-insensitive)
4. **Does Not Contain**: Field does not contain substring (case-insensitive)
5. **Starts With**: Field starts with value (case-insensitive)
6. **Ends With**: Field ends with value (case-insensitive)
7. **Is Empty**: Field is empty or blank
8. **Is Not Empty**: Field has any value
9. **In List**: Field value matches one of the selected list items
10. **Not In List**: Field value does not match any selected list items
11. **Regex**: Field matches JavaScript regular expression pattern

### Special Features

#### Multi-Select List
- For "In List" and "Not In List" operators
- Dynamically populated from unique values in the XML field
- Scrollable checkbox list for easy multi-selection

#### Regex Support
- Uses JavaScript RegExp syntax
- Link to regex101.com for testing patterns
- Error handling for invalid patterns

#### NOT Operator
- Available for all condition types
- Checkbox to negate the condition result
- Applies after operator evaluation

## UI Location

Filters appear at the top of the bundler UI, before the "1. XML File" section. This ensures filters are configured before any other bundle settings.

## Workflow

1. **Load XML File**: Select your XML file
2. **Configure Filters** (Optional): Add filter groups and conditions
   - Click "Add Filter Group" to create a new group
   - Click "+ Add Condition" within a group to add conditions
   - Configure each condition's field, operator, and value
   - Use "Test Filters" to see how many records match
3. **Configure Hierarchy**: Set up your hierarchy levels (operates on filtered records)
4. **Create Bundle**: Filtered records are used throughout bundle creation

## Filter Application

### Processing Order
1. **Load XML**: Parse all records from XML file
2. **Apply Filters**: Filter records based on filter groups (main.js)
3. **Reference Number Filter**: Apply reference number restrictions (if any)
4. **Hierarchy Processing**: Build sub-bundles from filtered records
5. **Bundle Creation**: Include only filtered records in final bundle

### Integration Points

#### Frontend (renderer.js)
- Filter configuration UI rendering
- Filter state management (filterGroups array)
- Settings persistence (save/load filter configuration)
- XML info display shows filter status

#### Backend (main.js)
- Filter application in createLegacyBundle()
- Filter application in createHierarchicalBundle()
- Logging of filter results (records before/after)

## File Structure

### Frontend Files
- **public/filter-functions.js**: Complete filter UI and logic
  - Filter group/condition management
  - UI rendering
  - Filter evaluation for testing
  - List value population
  - Regex validation

- **public/index.html**: Filter UI structure and CSS
  - "Record Filters" section
  - Filter container
  - Test/Clear buttons
  - Comprehensive styling

- **public/renderer.js**: Integration and state
  - Filter state variables (filterGroups, IDs)
  - Settings collection (includes filterGroups)
  - Settings restoration (load saved filters)
  - Filter UI refresh on XML load

### Backend Files
- **src/filter-engine.js**: Node.js filter evaluation
  - applyFilters(): Main filter application function
  - evaluateFilterGroup(): Group-level logic (AND/OR)
  - evaluateCondition(): Condition-level evaluation
  - All 11 operators implemented
  - NOT operator support

- **src/main.js**: Bundle creation integration
  - Import filter-engine module
  - Apply filters in createLegacyBundle()
  - Apply filters in createHierarchicalBundle()
  - Console logging of filter results

## Examples

### Example 1: Filter by Part of Speech
**Goal**: Include only nouns

**Filter Group 1** (Match ALL):
- Condition: `Part of Speech` `Equals` `Noun`

### Example 2: Multi-Syllable Words with Tone 1 or 2
**Goal**: Words with 2+ syllables and tone 1 or tone 2

**Filter Group 1** (Match ALL):
- Condition 1: `Syllables` `Not Equals` `1`
- Condition 2: `Syllables` `Is Not Empty`

**Filter Group 2** (Match ANY):
- Condition 1: `Tone` `Equals` `1`
- Condition 2: `Tone` `Equals` `2`

(Both groups must pass, so this gives multi-syllable words with tone 1 OR 2)

### Example 3: Exclude Draft/Test Records
**Goal**: Remove records with "test" or "draft" in any field

**Filter Group 1** (Match ALL):
- Condition 1: `Phonetic` `Does Not Contain` `test`
- Condition 2: `Phonetic` `Does Not Contain` `draft`

### Example 4: Regex Pattern Matching
**Goal**: Include only words starting with vowels

**Filter Group 1** (Match ALL):
- Condition: `Phonetic` `Regex` `^[aeiouAEIOU]`

### Example 5: Specific Word List
**Goal**: Include only specific words

**Filter Group 1** (Match ALL):
- Condition: `Phonetic` `In List` [select multiple words from checkbox list]

### Example 6: Complex Nested Logic
**Goal**: (Nouns with tone 1) OR (Verbs with tone 2 or 3)

**Filter Group 1** (Match ANY):
- **Nested Group 1.1** (Match ALL):
  - Condition: `Part of Speech` `Equals` `Noun`
  - Condition: `Tone` `Equals` `1`
- **Nested Group 1.2** (Match ALL):
  - Condition: `Part of Speech` `Equals` `Verb`
  - **Nested Group 1.2.1** (Match ANY):
    - Condition: `Tone` `Equals` `2`
    - Condition: `Tone` `Equals` `3`

### Example 7: Advanced Multi-Criteria
**Goal**: High-frequency words (frequency > 100) that are either (2-syllable nouns) OR (1-syllable verbs with tone 1)

**Filter Group 1** (Match ALL):
- Condition: `Frequency` `Regex` `^([1-9][0-9]{2,}|[1-9][0-9]{3,})$` (matches 100+)
- **Nested Group 1.1** (Match ANY):
  - **Nested Group 1.1.1** (Match ALL):
    - Condition: `Syllables` `Equals` `2`
    - Condition: `Part of Speech` `Equals` `Noun`
  - **Nested Group 1.1.2** (Match ALL):
    - Condition: `Syllables` `Equals` `1`
    - Condition: `Part of Speech` `Equals` `Verb`
    - Condition: `Tone` `Equals` `1`

## Testing Filters

Use the "Test Filters" button to see how many records pass your filter configuration:
- Shows count and percentage of matching records
- Updates in real-time as you modify filters
- Helps validate filter logic before bundle creation

The XML info display also shows filter status:
- "✓ Loaded 500 records" (no filters)
- "✓ Loaded 500 records (120 match filters)" (with filters)

## Persistence

Filter configurations are automatically saved and restored with bundle settings:
- Saved when settings change
- Restored when app reopens
- Included in exported bundle configurations

## Performance

- Filters are applied once during bundle creation (not repeatedly)
- Both embedded and linked bundles respect filters
- Large XML files (1000+ records) filter efficiently
- Regex patterns are compiled once per evaluation

## Error Handling

- Invalid regex patterns are caught and logged
- Empty/missing fields are handled gracefully
- Conditions with missing values default to non-matching
- UI validates inputs before filter application

## Future Enhancements (Not Yet Implemented)

- Filter presets/templates
- Import/export filter configurations separately
- Filter summary display (human-readable description)
- Field value statistics in filter UI
- Filter performance profiling for very large files
