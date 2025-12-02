#!/bin/bash

# Test script to verify XML encoding matches Dekereke format

echo "=== XML Encoding Verification ==="
echo ""

if [ $# -eq 0 ]; then
    echo "Usage: $0 <xml_file>"
    echo "Example: $0 /path/to/Fayu_stable.xml"
    exit 1
fi

XML_FILE="$1"

if [ ! -f "$XML_FILE" ]; then
    echo "Error: File not found: $XML_FILE"
    exit 1
fi

echo "Testing file: $XML_FILE"
echo ""

# Test 1: Check encoding with file command
echo "1. File encoding:"
file "$XML_FILE"
echo ""

# Test 2: Check for BOM
echo "2. UTF-16 LE BOM check:"
hexdump -C "$XML_FILE" | head -1 | grep "ff fe" > /dev/null
if [ $? -eq 0 ]; then
    echo "   ✓ BOM present (FF FE)"
else
    echo "   ✗ BOM missing"
fi
echo ""

# Test 3: Check line endings
echo "3. Line ending check:"
hexdump -C "$XML_FILE" | head -20 | grep "0d 00 0a 00" > /dev/null
if [ $? -eq 0 ]; then
    echo "   ✓ CRLF line endings detected (0D 00 0A 00)"
else
    hexdump -C "$XML_FILE" | head -20 | grep "0a 00" > /dev/null
    if [ $? -eq 0 ]; then
        echo "   ✗ LF only line endings detected (0A 00)"
    else
        echo "   ? Could not detect line endings"
    fi
fi
echo ""

# Test 4: Check for JavaScript junk
echo "4. JavaScript junk value check:"
JUNK_COUNT=$(strings "$XML_FILE" | grep -E "(>null<|>undefined<|>NaN<)" | wc -l)
if [ $JUNK_COUNT -eq 0 ]; then
    echo "   ✓ No null/undefined/NaN values found"
else
    echo "   ✗ Found $JUNK_COUNT JavaScript junk values:"
    strings "$XML_FILE" | grep -E "(>null<|>undefined<|>NaN<)" | head -5
fi
echo ""

# Test 5: Check indentation style
echo "5. Indentation style:"
hexdump -C "$XML_FILE" | head -30 | grep "09 00" > /dev/null
if [ $? -eq 0 ]; then
    echo "   Tabs (09 00) detected"
else
    echo "   Spaces detected (or no indentation)"
fi
echo ""

# Test 6: Show first few lines
echo "6. First 200 bytes (hex):"
hexdump -C "$XML_FILE" | head -15
echo ""

# Test 7: Show XML declaration
echo "7. XML declaration:"
strings "$XML_FILE" | head -1
echo ""

echo "=== Verification Complete ==="
