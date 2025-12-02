# XML Encoding Fixes for Linked Dekereke Files

## Issues Found

Comparing `testNew.xml` (virgin Dekereke file) with `Fayu_stable_modified_by_app.xml` (app-modified):

### 1. **Missing UTF-16 LE BOM**
- **Original**: Has BOM (`FF FE` bytes at start)
- **App-modified**: Missing BOM
- **Impact**: Dekereke parser may fail to detect encoding

### 2. **Wrong Line Endings**
- **Original**: CRLF (`\r\n` = `0D 00 0A 00` in UTF-16 LE)
- **App-modified**: LF only (`\n` = `0A 00` in UTF-16 LE)
- **Impact**: Format inconsistency with Dekereke's expectations

### 3. **Wrong Indentation**
- **Original**: Uses tabs (`\t`)
- **App-modified**: Uses 2 spaces
- **Impact**: Cosmetic, but inconsistent with Dekereke format

### 4. **Wrong Empty Tag Format**
- **Original**: `<Field />` (space before self-closing)
- **App-modified**: `<Field></Field>` (paired tags)
- **Impact**: Parser compatibility (some XML parsers are picky)

## Special Characters Analysis

### Square Brackets `[]`
- **Status**: ✅ Safe - already present in original Dekereke data
- **Example**: `<Pitch>[3 K k]</Pitch>`, `<Xwater_Pitch>[]</Xwater_Pitch>`
- **Action**: No escaping needed

### Underscores `_`
- **Status**: ✅ Safe - valid XML character
- **Example**: `<data_form>`, `<CMPLalt_Pitch>`
- **Action**: No escaping needed

### XML Special Characters
- **Must escape**: `&`, `<`, `>`, `"`, `'`
- **Implementation**: `safeStringValue()` function now escapes these

### JavaScript Junk
- **Checked for**: `null`, `undefined`, `NaN`, `-1`
- **Result**: ✅ None found in modified file
- **Protection**: `safeStringValue()` converts these to `null` (self-closing tags)

## Fixes Implemented

### `linkedXmlWriter.js` Updates

1. **BOM Preservation**
   ```javascript
   // Detect BOM on read
   const hasBOM = xmlBuffer[0] === 0xFF && xmlBuffer[1] === 0xFE;
   
   // Restore BOM on write
   if (parsed.hasBOM) {
     const bomBuffer = Buffer.from([0xFF, 0xFE]);
     outputBuffer = Buffer.concat([bomBuffer, textBuffer]);
   }
   ```

2. **CRLF Line Endings**
   ```javascript
   // Detect line ending style
   const hasCRLF = xmlText.includes('\r\n');
   const lineEnding = hasCRLF ? '\r\n' : '\n';
   
   // Normalize before write
   if (lineEnding === '\r\n') {
     xmlText = xmlText.replace(/\r?\n/g, '\r\n');
   }
   ```

3. **XML Character Escaping**
   ```javascript
   const escaped = str
     .replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
     .replace(/'/g, '&apos;');
   ```

4. **Value Safety**
   ```javascript
   // Convert null/undefined/NaN to null
   if (value === null || value === undefined) return null;
   if (typeof value === 'number' && isNaN(value)) return null;
   ```

## Testing Plan

1. **Load Linked Bundle**: Open a linked Dekereke bundle in Desktop Matching App
2. **Make Changes**: Assign some words to tone groups
3. **Verify Encoding**: Check output file with hexdump
   ```bash
   hexdump -C Fayu_stable.xml | head -20
   # Should show FF FE at start
   # Should show 0D 00 0A 00 for line endings
   ```
4. **Test in Dekereke**: Open modified XML file in Dekereke to verify parser accepts it

## Reference 0021 Analysis

Record 0021 (gecko) was modified by the app:
- Added `<ToneSorting>1</ToneSorting>` (was empty)
- Added `<SurfaceMelodyGroupId>group_LH</SurfaceMelodyGroupId>` (new field)
- Contains pitch data with square brackets: `<Pitch>[3 K k]</Pitch>` (unchanged, safe)
- No problematic characters found

## Remaining Concerns

### Indentation
- Current implementation does NOT preserve tabs vs spaces
- Regex-based approach only updates text content, not structure
- **Impact**: Low (XML parsers don't care about whitespace)
- **Fix if needed**: Would require full parse/rebuild (defeats conservative approach)

### Empty Tag Format
- Current implementation may produce `<Field></Field>` instead of `<Field />`
- **Impact**: Medium (some parsers prefer self-closing)
- **Fix**: Update regex patterns to produce `<Field />` format

## Status

✅ BOM preservation implemented
✅ CRLF line ending detection and preservation implemented
✅ XML character escaping implemented
✅ JavaScript junk value protection implemented
⚠️ Indentation preservation not implemented (tabs vs spaces)
⚠️ Self-closing tag format not standardized

## Next Steps

1. Test with actual linked bundle to verify encoding
2. Monitor Dekereke parser behavior
3. Consider adding indentation preservation if needed
4. Standardize self-closing tag format if parser requires it
