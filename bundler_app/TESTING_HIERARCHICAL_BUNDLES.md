# Testing Hierarchical Bundle Creation

This guide provides step-by-step instructions for testing the hierarchical bundle (.tnset) creation feature in the Tone Matching Bundler app.

## Prerequisites

1. Bundler app installed and running
2. Sample XML data file (e.g., from `private/tone_matching_xml/data_original.xml`)
3. Corresponding audio files folder

## Test Scenarios

### Test 1: Simple 2-Level Hierarchy

**Objective**: Create a basic hierarchical bundle with 2 category levels.

**Steps**:
1. Launch the bundler app
2. Select **Bundle Type**: "Hierarchical Macro-Bundle (.tnset)"
3. Load XML file and audio folder
4. Configure Display Settings and User Input Settings as usual
5. In **Hierarchical Organization** section:
   - Click "Add Category Level"
   - Level 1: Select field "WordClass" (or similar category field)
   - Verify unique values appear with word counts
   - Uncheck 1-2 values to test filtering
   - Click "Add Category Level" again
   - Level 2: Select field "SyllableShape" (or another category field)
   - Verify word counts update based on Level 1 filters
   - Configure audio settings (e.g., leave "Include audio" checked)
6. Click "Create Macro-Bundle"
7. Save as `test_2level.tnset`

**Expected Results**:
- Bundle creates successfully
- Output file has `.tnset` extension
- File size appropriate for selected records and audio

**Verification**:
```bash
# Extract the bundle
unzip test_2level.tnset -d test_2level_extracted

# Check structure
ls -R test_2level_extracted

# Expected structure:
# manifest.json
# hierarchy.json
# settings.json
# fonts/Contour6SILDoulos.ttf
# sub_bundles/
#   Category1Value1/
#     Category2Value1/
#       data.xml
#       metadata.json
#       audio/
#     Category2Value2/
#       ...

# Validate JSON files
cat test_2level_extracted/manifest.json
cat test_2level_extracted/hierarchy.json

# Check sub-bundle structure
ls test_2level_extracted/sub_bundles/
```

**Checklist**:
- [ ] manifest.json contains correct metadata (version, bundleType, recordCount, subBundleCount)
- [ ] hierarchy.json contains 2 levels with correct field names and values
- [ ] settings.json contains all bundle configuration
- [ ] fonts/Contour6SILDoulos.ttf exists
- [ ] sub_bundles/ directory contains category folders
- [ ] Each leaf sub-bundle has data.xml, metadata.json, and audio/ folder
- [ ] data.xml files contain only records matching the category path
- [ ] Audio files correspond to records in data.xml
- [ ] Total records across all sub-bundles equals original filtered count

---

### Test 2: 3-Level Hierarchy

**Objective**: Create a deeper hierarchy with 3 category levels.

**Steps**:
1. Create new hierarchical bundle
2. Add 3 hierarchy levels:
   - Level 1: "WordClass"
   - Level 2: "SyllableShape"
   - Level 3: "InitialConsonant" (or similar)
3. Select subset of values at each level
4. Create bundle as `test_3level.tnset`

**Verification**:
```bash
unzip test_3level.tnset -d test_3level_extracted
cd test_3level_extracted/sub_bundles

# Check nesting depth
find . -name "data.xml" | head -5

# Expected paths like:
# ./Noun/CV/p/data.xml
# ./Noun/CV/t/data.xml
# ./Verb/CVC/b/data.xml
```

**Checklist**:
- [ ] 3 levels in hierarchy.json
- [ ] Sub-bundles nested 3 levels deep
- [ ] Word counts decrease appropriately at each level
- [ ] No duplicate records across sub-bundles
- [ ] All records accounted for

---

### Test 3: Audio Configuration Options

**Test 3a: Text-Only Sub-Bundles**

**Steps**:
1. Create hierarchical bundle
2. Add 2 hierarchy levels
3. At Level 1: Uncheck "Include audio in sub-bundles"
4. Create bundle as `test_no_audio.tnset`

**Verification**:
```bash
unzip test_no_audio.tnset -d test_no_audio_extracted

# Check for absence of audio folders
find test_no_audio_extracted/sub_bundles -type d -name "audio"

# Expected: No audio folders found
```

**Checklist**:
- [ ] No audio/ folders in sub-bundles
- [ ] Bundle size significantly smaller
- [ ] metadata.json shows `includeAudio: false`

**Test 3b: Audio Suffix Variants**

**Steps**:
1. Create hierarchical bundle
2. Add 2 hierarchy levels
3. At Level 2: Set audio suffix to "-slow"
4. Ensure audio files with "-slow" suffix exist in audio folder
5. Create bundle as `test_audio_suffix.tnset`

**Verification**:
```bash
unzip test_audio_suffix.tnset -d test_audio_suffix_extracted

# Check audio files have suffix
ls test_audio_suffix_extracted/sub_bundles/*/*/audio/

# Expected: Files like "word-slow.wav"
```

**Checklist**:
- [ ] Audio files have correct suffix applied
- [ ] metadata.json shows suffix configuration
- [ ] Files load correctly (no missing audio)

---

### Test 4: Value Filtering

**Objective**: Verify that unchecked values are excluded from sub-bundles.

**Steps**:
1. Create hierarchical bundle
2. Add 1 hierarchy level (e.g., "WordClass")
3. Note total word count
4. Uncheck half the values (e.g., uncheck "Verb" and "Adjective")
5. Note new total word count
6. Create bundle as `test_filtered.tnset`

**Verification**:
```bash
unzip test_filtered.tnset -d test_filtered_extracted

# Count sub-bundles
ls test_filtered_extracted/sub_bundles/ | wc -l

# Expected: Only checked values have folders

# Count total records
grep -r "<data_form>" test_filtered_extracted/sub_bundles | wc -l
```

**Checklist**:
- [ ] Only checked values have sub-bundle folders
- [ ] Unchecked values completely absent
- [ ] Total record count matches filtered count
- [ ] manifest.json shows reduced totalRecords

---

### Test 5: Edge Cases

**Test 5a: Single Level Hierarchy**

**Steps**:
1. Create bundle with only 1 hierarchy level
2. Verify it still creates proper structure

**Test 5b: Many Values**

**Steps**:
1. Use field with 20+ unique values
2. Verify all display correctly in tree
3. Verify bundle creates successfully

**Test 5c: Empty Categories**

**Steps**:
1. Create hierarchy that would result in empty sub-bundles
2. Verify system handles gracefully (skip empty categories or show 0 words)

**Test 5d: Special Characters in Values**

**Steps**:
1. Use field with values containing spaces, Unicode, punctuation
2. Verify safe folder names generated (e.g., "C₁V₂" → "C_V_")
3. Verify bundle creates successfully

---

## Bundle Validation Script

For comprehensive validation, you can use this bash script:

```bash
#!/bin/bash
# validate_tnset.sh - Validates hierarchical bundle structure

BUNDLE="$1"

if [ -z "$BUNDLE" ]; then
    echo "Usage: $0 <bundle.tnset>"
    exit 1
fi

TEMP_DIR=$(mktemp -d)
echo "Extracting $BUNDLE to $TEMP_DIR..."
unzip -q "$BUNDLE" -d "$TEMP_DIR"

echo "Validating structure..."

# Check required files
for file in manifest.json hierarchy.json settings.json; do
    if [ ! -f "$TEMP_DIR/$file" ]; then
        echo "ERROR: Missing $file"
        exit 1
    fi
done

# Check font
if [ ! -f "$TEMP_DIR/fonts/Contour6SILDoulos.ttf" ]; then
    echo "WARNING: Missing Contour6 font"
fi

# Check sub_bundles directory
if [ ! -d "$TEMP_DIR/sub_bundles" ]; then
    echo "ERROR: Missing sub_bundles directory"
    exit 1
fi

# Count sub-bundles
SUB_BUNDLE_COUNT=$(find "$TEMP_DIR/sub_bundles" -name "data.xml" | wc -l)
echo "Found $SUB_BUNDLE_COUNT sub-bundles"

# Validate each sub-bundle
TOTAL_RECORDS=0
find "$TEMP_DIR/sub_bundles" -name "data.xml" | while read xmlfile; do
    dir=$(dirname "$xmlfile")
    
    # Check metadata.json
    if [ ! -f "$dir/metadata.json" ]; then
        echo "ERROR: Missing metadata.json in $dir"
        continue
    fi
    
    # Count records
    RECORDS=$(grep -c "<data_form>" "$xmlfile")
    TOTAL_RECORDS=$((TOTAL_RECORDS + RECORDS))
    
    echo "  $(basename $(dirname $dir))/$(basename $dir): $RECORDS records"
done

echo "Total records across all sub-bundles: $TOTAL_RECORDS"

# Clean up
rm -rf "$TEMP_DIR"

echo "Validation complete!"
```

---

## Success Criteria

All tests pass when:

1. **Structure**: Bundle has correct directory structure with manifest, hierarchy, settings, fonts, and sub_bundles
2. **Data Integrity**: Total records across sub-bundles equals expected count
3. **Hierarchy**: Sub-bundle paths match hierarchy configuration
4. **Audio**: Audio files present (or absent) based on configuration
5. **Metadata**: All JSON files valid and contain expected data
6. **Font**: Contour6 font included in fonts/ folder
7. **No Errors**: Bundle creation completes without errors
8. **File Extension**: Output has .tnset extension
9. **Filtering**: Only selected values appear in sub-bundles
10. **Counts**: Word counts in UI match actual sub-bundle contents

---

## Reporting Issues

If you encounter issues during testing, please report with:

1. Test scenario number
2. Steps to reproduce
3. Expected vs actual results
4. Console error messages (if any)
5. Sample bundle file (if possible)
6. Screenshot of UI configuration

---

## Next Steps After Testing

Once all tests pass:

1. Test bundle loading in matching apps (mobile/desktop)
2. Verify cross-bundle matching suggestions work
3. Test export functionality with hierarchical bundles
4. Performance test with large datasets (500+ records, 50+ sub-bundles)
