#!/bin/bash

# Deep XML comparison script to find ANY differences that could break a parser

if [ $# -lt 2 ]; then
    echo "Usage: $0 <working_file> <broken_file> [virgin_file]"
    echo "Example: $0 Fayu_stable.xml Fayu_stable_modified_by_app.xml testNew.xml"
    exit 1
fi

WORKING="$1"
BROKEN="$2"
VIRGIN="$3"

echo "=========================================="
echo "DEEP XML COMPARISON ANALYSIS"
echo "=========================================="
echo ""
echo "Working file: $WORKING"
echo "Broken file:  $BROKEN"
if [ -n "$VIRGIN" ]; then
    echo "Virgin file:  $VIRGIN"
fi
echo ""

# Check files exist
for f in "$WORKING" "$BROKEN"; do
    if [ ! -f "$f" ]; then
        echo "ERROR: File not found: $f"
        exit 1
    fi
done

echo "=========================================="
echo "1. FILE SIZE COMPARISON"
echo "=========================================="
ls -lh "$WORKING" "$BROKEN" | awk '{print $9, $5}'
echo ""

echo "=========================================="
echo "2. FILE TYPE AND ENCODING"
echo "=========================================="
echo "Working:"
file "$WORKING"
echo ""
echo "Broken:"
file "$BROKEN"
echo ""
if [ -n "$VIRGIN" ] && [ -f "$VIRGIN" ]; then
    echo "Virgin:"
    file "$VIRGIN"
    echo ""
fi

echo "=========================================="
echo "3. BYTE ORDER MARK (BOM) ANALYSIS"
echo "=========================================="
echo "Working file first 4 bytes:"
hexdump -C "$WORKING" | head -1
WORKING_BOM=$(hexdump -C "$WORKING" | head -1 | grep "ff fe")
if [ -n "$WORKING_BOM" ]; then
    echo "✓ UTF-16 LE BOM present (FF FE)"
else
    echo "✗ No BOM detected"
fi
echo ""

echo "Broken file first 4 bytes:"
hexdump -C "$BROKEN" | head -1
BROKEN_BOM=$(hexdump -C "$BROKEN" | head -1 | grep "ff fe")
if [ -n "$BROKEN_BOM" ]; then
    echo "✓ UTF-16 LE BOM present (FF FE)"
else
    echo "✗ No BOM detected"
fi
echo ""

if [ -n "$VIRGIN" ] && [ -f "$VIRGIN" ]; then
    echo "Virgin file first 4 bytes:"
    hexdump -C "$VIRGIN" | head -1
    VIRGIN_BOM=$(hexdump -C "$VIRGIN" | head -1 | grep "ff fe")
    if [ -n "$VIRGIN_BOM" ]; then
        echo "✓ UTF-16 LE BOM present (FF FE)"
    else
        echo "✗ No BOM detected"
    fi
    echo ""
fi

echo "=========================================="
echo "4. LINE ENDING ANALYSIS"
echo "=========================================="
echo "Working file line endings:"
hexdump -C "$WORKING" | grep -E "(0d 00 0a 00|0a 00)" | head -3
WORKING_CRLF=$(hexdump -C "$WORKING" | grep "0d 00 0a 00" | head -1)
WORKING_LF=$(hexdump -C "$WORKING" | grep "0a 00" | head -1)
if [ -n "$WORKING_CRLF" ]; then
    echo "✓ CRLF line endings detected (0D 00 0A 00)"
elif [ -n "$WORKING_LF" ]; then
    echo "! LF only line endings detected (0A 00)"
fi
echo ""

echo "Broken file line endings:"
hexdump -C "$BROKEN" | grep -E "(0d 00 0a 00|0a 00)" | head -3
BROKEN_CRLF=$(hexdump -C "$BROKEN" | grep "0d 00 0a 00" | head -1)
BROKEN_LF=$(hexdump -C "$BROKEN" | grep "0a 00" | head -1)
if [ -n "$BROKEN_CRLF" ]; then
    echo "✓ CRLF line endings detected (0D 00 0A 00)"
elif [ -n "$BROKEN_LF" ]; then
    echo "! LF only line endings detected (0A 00)"
fi
echo ""

echo "=========================================="
echo "5. XML DECLARATION COMPARISON"
echo "=========================================="
echo "Working file declaration (first 200 bytes hex):"
hexdump -C "$WORKING" | head -15
echo ""

echo "Broken file declaration (first 200 bytes hex):"
hexdump -C "$BROKEN" | head -15
echo ""

echo "=========================================="
echo "6. INDENTATION ANALYSIS"
echo "=========================================="
echo "Working file indentation (looking for tabs vs spaces):"
hexdump -C "$WORKING" | grep "09 00" | head -3
WORKING_TABS=$(hexdump -C "$WORKING" | grep "09 00" | head -1)
if [ -n "$WORKING_TABS" ]; then
    echo "✓ Tabs detected (09 00)"
else
    echo "! Spaces used for indentation"
fi
echo ""

echo "Broken file indentation:"
hexdump -C "$BROKEN" | grep "09 00" | head -3
BROKEN_TABS=$(hexdump -C "$BROKEN" | grep "09 00" | head -1)
if [ -n "$BROKEN_TABS" ]; then
    echo "✓ Tabs detected (09 00)"
else
    echo "! Spaces used for indentation"
fi
echo ""

echo "=========================================="
echo "7. STRUCTURE COMPARISON (data_form count)"
echo "=========================================="
echo "Working file data_form count:"
strings "$WORKING" | grep -c "<data_form>"
echo ""
echo "Broken file data_form count:"
strings "$BROKEN" | grep -c "<data_form>"
echo ""

echo "=========================================="
echo "8. SELF-CLOSING TAG ANALYSIS"
echo "=========================================="
echo "Working file self-closing tags (sample):"
strings "$WORKING" | grep -E "<[^/>]+/>" | head -5
echo ""
echo "Broken file self-closing tags (sample):"
strings "$BROKEN" | grep -E "<[^/>]+/>" | head -5
echo ""

echo "Working file: count of ' />' (space before self-close):"
strings "$WORKING" | grep -c " />" || echo "0"
echo ""
echo "Broken file: count of ' />' (space before self-close):"
strings "$BROKEN" | grep -c " />" || echo "0"
echo ""

echo "Working file: count of '/>' (no space before self-close):"
strings "$WORKING" | grep -c "[^ ]/>" || echo "0"
echo ""
echo "Broken file: count of '/>' (no space before self-close):"
strings "$BROKEN" | grep -c "[^ ]/>" || echo "0"
echo ""

echo "=========================================="
echo "9. BYTE-BY-BYTE FIRST 1000 BYTES"
echo "=========================================="
echo "Working file:"
hexdump -C "$WORKING" | head -70
echo ""
echo "Broken file:"
hexdump -C "$BROKEN" | head -70
echo ""

echo "=========================================="
echo "10. SEARCH FOR PROBLEMATIC CHARACTERS"
echo "=========================================="
echo "Checking for NULL bytes in broken file:"
hexdump -C "$BROKEN" | grep "00 00 00 00 00 00 00 00" | head -5
if [ $? -eq 0 ]; then
    echo "! Found sequences of null bytes"
else
    echo "✓ No problematic null byte sequences"
fi
echo ""

echo "Checking for invalid UTF-16 sequences:"
# Look for orphaned surrogate pairs or invalid sequences
hexdump -C "$BROKEN" | grep -E "(ff ff|fe ff)" | head -5
if [ $? -eq 0 ]; then
    echo "! Found potential invalid UTF-16 sequences"
else
    echo "✓ No obvious invalid UTF-16 sequences"
fi
echo ""

echo "=========================================="
echo "11. XML WELL-FORMEDNESS TEST"
echo "=========================================="
echo "Attempting to parse working file with xmllint (if available):"
if command -v xmllint &> /dev/null; then
    # Convert to UTF-8 for xmllint
    iconv -f UTF-16LE -t UTF-8 "$WORKING" 2>/dev/null | xmllint --noout - 2>&1 | head -10
    if [ $? -eq 0 ]; then
        echo "✓ Working file is well-formed XML"
    fi
else
    echo "xmllint not available, skipping"
fi
echo ""

echo "Attempting to parse broken file with xmllint (if available):"
if command -v xmllint &> /dev/null; then
    iconv -f UTF-16LE -t UTF-8 "$BROKEN" 2>/dev/null | xmllint --noout - 2>&1 | head -10
    if [ $? -eq 0 ]; then
        echo "✓ Broken file is well-formed XML"
    else
        echo "✗ Broken file has XML errors"
    fi
else
    echo "xmllint not available, skipping"
fi
echo ""

echo "=========================================="
echo "12. RECORD 0021 COMPARISON (if present)"
echo "=========================================="
echo "Extracting record 0021 from working file:"
strings "$WORKING" | grep -A 50 "Reference>0021<" | head -60 > /tmp/working_0021.txt
if [ -s /tmp/working_0021.txt ]; then
    cat /tmp/working_0021.txt
else
    echo "Record 0021 not found in working file"
fi
echo ""

echo "Extracting record 0021 from broken file:"
strings "$BROKEN" | grep -A 50 "Reference>0021<" | head -60 > /tmp/broken_0021.txt
if [ -s /tmp/broken_0021.txt ]; then
    cat /tmp/broken_0021.txt
else
    echo "Record 0021 not found in broken file"
fi
echo ""

if [ -s /tmp/working_0021.txt ] && [ -s /tmp/broken_0021.txt ]; then
    echo "Differences in record 0021:"
    diff -u /tmp/working_0021.txt /tmp/broken_0021.txt || true
fi
echo ""

echo "=========================================="
echo "13. FIELD STRUCTURE COMPARISON"
echo "=========================================="
echo "Unique field names in working file (first 20):"
strings "$WORKING" | grep -oE "<[A-Za-z_][A-Za-z0-9_.-]*>" | sort -u | head -20
echo ""
echo "Unique field names in broken file (first 20):"
strings "$BROKEN" | grep -oE "<[A-Za-z_][A-Za-z0-9_.-]*>" | sort -u | head -20
echo ""

echo "Fields in broken but NOT in working:"
comm -13 <(strings "$WORKING" | grep -oE "<[A-Za-z_][A-Za-z0-9_.-]*>" | sort -u) <(strings "$BROKEN" | grep -oE "<[A-Za-z_][A-Za-z0-9_.-]*>" | sort -u)
echo ""

echo "=========================================="
echo "14. SUSPICIOUS CONTENT CHECK"
echo "=========================================="
echo "Checking for JavaScript junk in broken file:"
strings "$BROKEN" | grep -E "(>null<|>undefined<|>NaN<|>-1<|>Infinity<)" | head -10
if [ $? -eq 0 ]; then
    echo "! Found JavaScript junk values"
else
    echo "✓ No JavaScript junk found"
fi
echo ""

echo "Checking for unescaped special chars in broken file:"
strings "$BROKEN" | grep -E "(&[^amp;lt;gt;quot;apos;#]|<[^A-Za-z/?!]|>[^A-Za-z0-9<])" | head -10
echo ""

echo "=========================================="
echo "15. BINARY DIFF SUMMARY"
echo "=========================================="
echo "First byte where files differ:"
cmp -l "$WORKING" "$BROKEN" 2>/dev/null | head -20
echo ""

echo "=========================================="
echo "16. CHARACTER ENCODING VALIDATION"
echo "=========================================="
echo "Testing UTF-16 LE decode on working file:"
iconv -f UTF-16LE -t UTF-8 "$WORKING" > /tmp/working_utf8.xml 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Working file decodes cleanly as UTF-16 LE"
    wc -l /tmp/working_utf8.xml
else
    echo "✗ Working file has UTF-16 LE encoding issues"
fi
echo ""

echo "Testing UTF-16 LE decode on broken file:"
iconv -f UTF-16LE -t UTF-8 "$BROKEN" > /tmp/broken_utf8.xml 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Broken file decodes cleanly as UTF-16 LE"
    wc -l /tmp/broken_utf8.xml
else
    echo "✗ Broken file has UTF-16 LE encoding issues"
fi
echo ""

echo "=========================================="
echo "17. END OF FILE ANALYSIS"
echo "=========================================="
echo "Working file last 200 bytes:"
tail -c 200 "$WORKING" | hexdump -C
echo ""

echo "Broken file last 200 bytes:"
tail -c 200 "$BROKEN" | hexdump -C
echo ""

echo "=========================================="
echo "SUMMARY OF CRITICAL DIFFERENCES"
echo "=========================================="
echo ""

if [ -z "$WORKING_BOM" ] && [ -n "$BROKEN_BOM" ]; then
    echo "⚠️  BOM: Working has NO BOM, Broken has BOM"
elif [ -n "$WORKING_BOM" ] && [ -z "$BROKEN_BOM" ]; then
    echo "⚠️  BOM: Working has BOM, Broken has NO BOM"
else
    echo "✓ BOM: Same in both files"
fi

if [ -n "$WORKING_CRLF" ] && [ -z "$BROKEN_CRLF" ]; then
    echo "⚠️  Line endings: Working has CRLF, Broken has LF"
elif [ -z "$WORKING_CRLF" ] && [ -n "$BROKEN_CRLF" ]; then
    echo "⚠️  Line endings: Working has LF, Broken has CRLF"
else
    echo "✓ Line endings: Same in both files"
fi

if [ -n "$WORKING_TABS" ] && [ -z "$BROKEN_TABS" ]; then
    echo "⚠️  Indentation: Working uses tabs, Broken uses spaces"
elif [ -z "$WORKING_TABS" ] && [ -n "$BROKEN_TABS" ]; then
    echo "⚠️  Indentation: Working uses spaces, Broken uses tabs"
else
    echo "✓ Indentation: Same in both files"
fi

echo ""
echo "=========================================="
echo "ANALYSIS COMPLETE"
echo "=========================================="
