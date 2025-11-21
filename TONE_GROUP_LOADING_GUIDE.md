# Tone Group Loading from Existing XML Data

## Overview

The Desktop Matching App can now load existing tone group data from your XML files using **any combination** of configured fields. This allows you to work with existing tone data that may have been created manually, by another tool, or in a previous matching session.

## Configuration (Bundler App)

### Step 1: Configure Tone Fields

In the bundler app's **"5. User Input Settings"** section, configure which XML fields you want to use:

1. **Tone Group Assignment Field** - Required, stores the group number
2. **Optional Tone Fields** (check the boxes to enable):
   - **ID Field** - Unique group identifier (GUID)
   - **Pitch Field** - Pitch transcription (e.g., using Contour6 font)
   - **Abbreviation Field** - Short tone label (e.g., "LHL", "H")
   - **Exemplar Field** - Representative word for the tone pattern

### Step 2: Select Fields for Pre-Population

In the new **"Pre-populate Tone Groups from Existing Data"** section, choose which fields to use for grouping words:

- **☑ Use Group ID field** - Group by unique identifier (most reliable if available)
- **☑ Use Pitch field** - Group words with identical pitch transcriptions
- **☑ Use Abbreviation field** - Group words with identical tone labels
- **☑ Use Exemplar field** - Group words with matching exemplar values

**Notes:**
- You can select **multiple fields** - words must match on ALL selected fields to be grouped together
- Checkboxes are disabled if the corresponding field is not configured
- At least one field must be selected to enable pre-population

### Step 3: Understand the Warning

⚠️ **Important:** When you enable pre-population, the matching app will **overwrite** the configured tone fields with group-consistent values during export. This ensures all words in a group have the same metadata.

**Example scenario:**
- Your XML has existing data: some words have pitch "─────", others have "LHL" 
- You select "Use Abbreviation field" for grouping
- Result: Words with "LHL" group together, get assigned group #1
- On export: ALL words in group #1 will have the group's tone abbreviation value

**To preserve original data:**
Configure **new field names** for fields you don't want overwritten. For example:
- Original data in: `SurfaceMelody`, `SurfaceMelodyPitch`, `SurfaceMelodyEx`
- Configure output to: `NewToneGroup`, `NewPitch`, `NewAbbrev`
- Result: Original fields preserved, new fields contain matching app's group assignments

## How It Works

### Loading Process (Desktop Matching App)

When you load a bundle with existing XML data:

1. **Parse XML** - Read all configured field values from each record
2. **Build Composite Keys** - For each word, create a key from selected fields:
   ```
   Example with ID + Pitch selected:
   Word 1: "id:abc123|pitch:─────"
   Word 2: "id:abc123|pitch:─────"  ← Same key, same group
   Word 3: "id:def456|pitch:─────"  ← Different ID, different group
   ```
3. **Create Groups** - Words with matching keys go into the same group
4. **Determine Most Common Metadata** - For each group, analyze all members:
   - Count occurrences of each pitch value → pick most common
   - Count occurrences of each abbreviation value → pick most common
   - Count occurrences of each exemplar value → pick most common
5. **Initialize Queue** - Words with empty values in ALL selected fields → unsorted queue

**Example of metadata determination:**
```
Group with 5 members:
Member 1: pitch="─────", abbrev="LHL"
Member 2: pitch="─────", abbrev="LHL"  
Member 3: pitch="───",   abbrev="LHL"
Member 4: pitch="─────", abbrev="LH"
Member 5: pitch="─────", abbrev="LHL"

Result:
- Group pitch = "─────" (appears 4 times vs 1)
- Group abbreviation = "LHL" (appears 4 times vs 1)
```

### Export Process

When you export the bundle:

1. **Write Group Numbers** - All group members get same group number
2. **Write Group IDs** - All group members get same GUID
3. **Write Metadata** - All group members get group's pitch/abbreviation/exemplar values
4. **Ensure Consistency** - Even if original data had inconsistencies, exported data is uniform per group

## Use Cases

### Case 1: Dekereke Data with Manual Tone Markings

**Scenario:** Your Dekereke XML has some words with pitch transcriptions, some with abbreviations like "LHL", "HLH".

**Solution:**
```
Bundler Config:
- Abbreviation Field: SurfaceMelody
- ☑ Use Abbreviation field for grouping

Result:
- All "LHL" words → Group 1
- All "HLH" words → Group 2
- Words without SurfaceMelody → Unsorted queue
```

### Case 2: Re-importing Previous Matching Session

**Scenario:** You exported a bundle with tone groups last week, want to continue work.

**Solution:**
```
Bundler Config:
- ID Field: SurfaceMelodyId
- Pitch Field: SurfaceMelodyPitch
- Abbreviation Field: SurfaceMelody
- ☑ Use Group ID field for grouping

Result:
- Groups reconstructed by GUID
- Metadata (pitch, abbreviation) loaded automatically
- Can continue adding words or editing groups
```

### Case 3: Mixed Data Sources

**Scenario:** Some words have pitch transcriptions from acoustic analysis, others have manual tone labels, you want to group by BOTH.

**Solution:**
```
Bundler Config:
- Pitch Field: AcousticPitch
- Abbreviation Field: ManualTone
- ☑ Use Pitch field
- ☑ Use Abbreviation field

Result:
- Words must match on BOTH pitch AND abbreviation to group
- More conservative grouping (fewer auto-groups)
- Preserves distinctions in your data
```

### Case 4: Preserve Original, Create New

**Scenario:** You have existing tone data you want to keep unchanged while creating new groupings.

**Solution:**
```
Bundler Config:
- Abbreviation Field: NewToneGroup (new field)
- Pitch Field: NewPitchTranscription (new field)
- Don't check any pre-population boxes

Result:
- Original fields (SurfaceMelody, etc.) untouched
- New fields created on export with matching app's groups
- Can compare old vs new later
```

## Technical Details

### Composite Key Algorithm

```javascript
// Example: User selects ID + Pitch for grouping
Word 1: {
  SurfaceMelodyId: "abc-123",
  SurfaceMelodyPitch: "─────"
}
→ Key: "id:abc-123|pitch:─────"

Word 2: {
  SurfaceMelodyId: "abc-123",
  SurfaceMelodyPitch: "─────"
}
→ Key: "id:abc-123|pitch:─────"  // MATCH - same group

Word 3: {
  SurfaceMelodyId: "abc-123",
  SurfaceMelodyPitch: "───" // Different!
}
→ Key: "id:abc-123|pitch:───"  // DIFFERENT KEY - separate group
```

### Field Name Handling

All field names are **user-configurable** in the bundler:
- Not hardcoded to "SurfaceMelody" etc.
- Can use ANY XML element names
- Custom fields supported (e.g., "MyToneData", "PitchAnalysis")
- Export uses your configured names, not defaults

### Group Metadata Priority

When loading groups from multiple fields, the system determines **most common values** across all group members:
1. **Group ID** - If present and used for grouping, becomes the group's GUID
2. **Pitch** - Most frequently occurring pitch transcription becomes group's pitch
3. **Abbreviation** - Most frequently occurring abbreviation becomes group's
4. **Exemplar** - Most frequently occurring exemplar becomes group's

**Example:**
```
Group has 5 members:
- 3 members have pitch: "─────"
- 2 members have pitch: "───"
→ Group pitch = "─────" (most common)

- 4 members have abbreviation: "LHL"
- 1 member has abbreviation: "LH"
→ Group abbreviation = "LHL" (most common)
```

All members inherit these most-common values on export, ensuring consistency while respecting the majority pattern in your data.

## Limitations & Considerations

### Empty Values
- Words with empty values in **all** selected fields → unsorted queue
- Words with empty value in **some** fields → grouped by non-empty fields only
- Example: If using ID+Pitch, a word with ID but no Pitch can still group by ID alone

### Case Sensitivity
- Field values are case-sensitive
- "LHL" ≠ "lhl"
- Whitespace matters: "LHL" ≠ "LHL " (trailing space)

### Performance
- Large datasets (>10,000 words) with many unique values → many small groups
- Consider using ID field for faster loading if available

### Data Consistency
- **Before export:** Groups may have inconsistent metadata if manually edited
- **After export:** All group members guaranteed to have same values
- This is by design to ensure data quality

## Troubleshooting

### "No groups loaded" on re-import
- **Check:** Are the configured field names correct?
- **Check:** Did you enable at least one "Use ... field" checkbox?
- **Check:** Do your XML records actually have data in those fields?

### "All words in unsorted queue"
- **Likely cause:** Selected fields are empty in all records
- **Solution:** Check XML to verify field names and values exist

### "Groups have wrong metadata"
- **Expected:** Most common values across members become group's canonical values
- **Example:** If 3 words have "LHL" and 2 have "LH", group gets "LHL"
- **To fix:** Edit the group in matching app to set correct values
- **On export:** All members will get the corrected values

### "Original data was overwritten"
- **This is intentional** - ensures group consistency
- **To prevent:** Use different field names for output (configure new fields)
- **To recover:** Re-import from your original XML backup

## Best Practices

1. **Test with small dataset first** - Verify grouping behavior before processing thousands of words
2. **Use ID field when available** - Most reliable for re-imports
3. **Back up original XML** - Before exporting, keep a copy of source data
4. **Document your field mappings** - Note which fields contain which data types
5. **Consider field separation** - Don't mix exemplar words and abbreviations in same field
6. **Review loaded groups** - Check a few groups in matching app to verify correctness

## Example Workflow

```
1. Have existing Dekereke XML with some tone data in "SurfaceMelody" field
2. Open bundler app, load XML
3. Configure:
   - Tone Group: SurfaceMelodyGroup
   - ID Field: SurfaceMelodyId
   - Abbreviation Field: SurfaceMelody
   - ☑ Use Abbreviation field
4. Create hierarchical bundle
5. Open in desktop matching app
6. See: Words with "LHL" already grouped, ready to review
7. Add more words to groups, refine
8. Export bundle
9. Check data_updated.xml: All group members have consistent values
```
