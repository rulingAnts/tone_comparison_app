# URL Integration Guide

This document explains how to send XML data to the Dekereke Pivot Tables PWA via URL.

## Task: Send XML data to Dekereke Pivot Tables PWA via URL

You need to pass XML data from your application to the Dekereke Pivot Tables web app at `http://localhost:8000` (or the production URL once deployed) using the URL hash method with gzip compression.

## Requirements

1. Read the XML file contents as a string
2. Compress the XML string using gzip compression
3. Base64 encode the compressed data
4. Construct a URL with the format: `http://localhost:8000/#gz:{base64-encoded-data}`
5. Open that URL in a browser or redirect to it

## Implementation Example (Pseudo-code)

```
xmlString = readFile("path/to/file.xml")
compressedData = gzip.compress(xmlString)
base64Data = base64.encode(compressedData)
url = "http://localhost:8000/#gz:" + base64Data
openURL(url)
```

## Command-line Example (bash/zsh)

```bash
gzip -c file.xml | base64 | sed 's/$//' | xargs -I {} open "http://localhost:8000/#gz:{}"
```

## Important Notes

- The prefix `gz:` in the hash tells the app the data is gzip-compressed
- Without the `gz:` prefix, the app expects uncompressed base64-encoded XML
- The XML should be valid UTF-8 or UTF-16 encoded
- Gzip compression typically reduces 3.3MB XML files to ~400KB, making URLs manageable
- The receiving app will automatically decompress, parse the XML, and load it into the pivot table interface

## Expected XML Structure

The XML should contain `<data_form>` elements with child elements representing fields and their values, like:

```xml
<phon_data>
  <data_form>
    <Reference>001</Reference>
    <Gloss>example</Gloss>
    <!-- other fields -->
  </data_form>
  <!-- more data_form elements -->
</phon_data>
```
