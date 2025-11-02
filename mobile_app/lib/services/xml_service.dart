import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:xml/xml.dart';
import '../models/word_record.dart';
import '../models/app_settings.dart';

/// Service for parsing and writing Dekereke XML files
class XmlService {
  /// Parse Dekereke XML and extract word records
  ///
  /// Preserves the original XML declaration and encoding
  static Future<ParsedXmlData> parseXml(
    String xmlFilePath,
    AppSettings settings,
  ) async {
    final file = File(xmlFilePath);
    final bytes = await file.readAsBytes();

    // Decode bytes with BOM/encoding detection (UTF-16LE/BE or UTF-8)
    final decoded = _decodeXmlBytes(bytes);
    final xmlContent = decoded.content;
    final String? originalDeclaration = decoded.declaration;

    final document = XmlDocument.parse(xmlContent);
    final phonData = document.findElements('phon_data').first;
    final dataForms = phonData.findElements('data_form');

    final records = <WordRecord>[];

    for (final dataForm in dataForms) {
      // Extract reference number
      final referenceElement = dataForm.findElements('Reference').firstOrNull;
      if (referenceElement == null) continue;

      final reference = referenceElement.innerText.trim();

      // Filter by reference numbers if specified
      if (settings.referenceNumbers.isNotEmpty &&
          !settings.referenceNumbers.contains(reference)) {
        continue;
      }

      // Extract sound file
      final soundFileElement = dataForm.findElements('SoundFile').firstOrNull;
      if (soundFileElement == null) continue;

      final soundFile = soundFileElement.innerText.trim();

      // Extract all fields
      final fields = <String, String>{};
      for (final child in dataForm.childElements) {
        fields[child.name.local] = child.innerText.trim();
      }

      // Check if user spelling or tone group already exists
      final userSpelling = fields[settings.userSpellingElement];
      final toneGroupStr = fields[settings.toneGroupElement];
      final toneGroup = toneGroupStr != null && toneGroupStr.isNotEmpty
          ? int.tryParse(toneGroupStr)
          : null;
      final toneGroupId = fields[settings.toneGroupIdElement];

      records.add(
        WordRecord(
          reference: reference,
          soundFile: soundFile,
          fields: fields,
          userSpelling: userSpelling,
          toneGroup: toneGroup,
          toneGroupId: toneGroupId,
        ),
      );
    }

    return ParsedXmlData(
      document: document,
      records: records,
      originalDeclaration: originalDeclaration,
      encoding: decoded.encoding,
      utf8Bom: decoded.utf8Bom,
      lineEnding: decoded.lineEnding,
    );
  }

  /// Write updated word records back to XML
  ///
  /// Preserves original encoding and XML declaration
  static Future<void> writeXml(
    String xmlFilePath,
    XmlDocument document,
    List<WordRecord> records,
    AppSettings settings,
    String? originalDeclaration, {
    required String encoding,
    required String lineEnding,
    bool utf8Bom = false,
  }) async {
    // Update the document with new values
    final phonData = document.findElements('phon_data').first;
    final dataForms = phonData.findElements('data_form').toList();

    for (final record in records) {
      // Find matching data_form by reference
      final dataForm = dataForms.firstWhere(
        (df) {
          final ref = df.findElements('Reference').firstOrNull;
          return ref?.innerText.trim() == record.reference;
        },
        orElse: () => throw Exception(
          'No data_form found for reference ${record.reference}',
        ),
      );

      // Update user spelling if provided
      if (record.userSpelling != null && record.userSpelling!.isNotEmpty) {
        final spellingElement = dataForm
            .findElements(settings.userSpellingElement)
            .firstOrNull;
        if (spellingElement != null) {
          spellingElement.innerText = record.userSpelling!;
        } else {
          // Create new element if it doesn't exist
          dataForm.children.add(
            XmlElement(XmlName(settings.userSpellingElement), [], [
              XmlText(record.userSpelling!),
            ]),
          );
        }
      }

      // Update tone group number if assigned (for human readability)
      if (record.toneGroup != null) {
        final toneGroupElement = dataForm
            .findElements(settings.toneGroupElement)
            .firstOrNull;
        if (toneGroupElement != null) {
          toneGroupElement.innerText = record.toneGroup.toString();
        } else {
          // Create new element if it doesn't exist
          dataForm.children.add(
            XmlElement(XmlName(settings.toneGroupElement), [], [
              XmlText(record.toneGroup.toString()),
            ]),
          );
        }
      }

      // Update tone group GUID if assigned
      if (record.toneGroupId != null && record.toneGroupId!.isNotEmpty) {
        final tgIdEl = dataForm
            .findElements(settings.toneGroupIdElement)
            .firstOrNull;
        if (tgIdEl != null) {
          tgIdEl.innerText = record.toneGroupId!;
        } else {
          dataForm.children.add(
            XmlElement(XmlName(settings.toneGroupIdElement), [], [
              XmlText(record.toneGroupId!),
            ]),
          );
        }
      }
    }

    // Convert back to string
    String xmlString = document.toXmlString(pretty: true, indent: '  ');

    // Ensure no stray declaration in body
    xmlString = xmlString.replaceFirst(RegExp(r'^\s*<\?xml[^?]*\?>\s*'), '');

    // Normalize line endings to \n, then apply requested line ending
    xmlString = xmlString.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

    // Compose with declaration
    final String declaration =
        originalDeclaration ??
        (encoding.toLowerCase().startsWith('utf-16')
            ? '<?xml version="1.0" encoding="utf-16"?>'
            : '<?xml version="1.0" encoding="utf-8"?>');
    final String withDecl = [declaration, xmlString].join(lineEnding);
    final String content = lineEnding == '\n'
        ? withDecl
        : withDecl.replaceAll('\n', lineEnding);

    // Encode bytes according to original encoding
    final Uint8List outputBytes;
    final lowerEnc = encoding.toLowerCase();
    if (lowerEnc == 'utf-16le' || lowerEnc == 'utf-16') {
      outputBytes = _encodeUtf16(content, Endian.little, includeBom: true);
    } else if (lowerEnc == 'utf-16be') {
      outputBytes = _encodeUtf16(content, Endian.big, includeBom: true);
    } else {
      final bytes = utf8.encode(content);
      outputBytes = utf8Bom
          ? Uint8List.fromList([0xEF, 0xBB, 0xBF, ...bytes])
          : Uint8List.fromList(bytes);
    }

    // Write bytes
    final file = File(xmlFilePath);
    await file.writeAsBytes(outputBytes, flush: true);
  }

  /// Decode XML bytes respecting BOM and common encodings.
  /// Supports UTF-8 (with/without BOM), UTF-16LE, and UTF-16BE.
  static _DecodedXml _decodeXmlBytes(Uint8List bytes) {
    if (bytes.length >= 2) {
      // UTF-16 BOMs
      if (bytes[0] == 0xFF && bytes[1] == 0xFE) {
        // UTF-16 LE with BOM
        final content = _decodeUtf16(bytes.sublist(2), Endian.little);
        return _DecodedXml._fromContent(
          content,
          encoding: 'utf-16le',
          utf8Bom: false,
        );
      }
      if (bytes[0] == 0xFE && bytes[1] == 0xFF) {
        // UTF-16 BE with BOM
        final content = _decodeUtf16(bytes.sublist(2), Endian.big);
        return _DecodedXml._fromContent(
          content,
          encoding: 'utf-16be',
          utf8Bom: false,
        );
      }
      // UTF-8 BOM
      if (bytes.length >= 3 &&
          bytes[0] == 0xEF &&
          bytes[1] == 0xBB &&
          bytes[2] == 0xBF) {
        final content = utf8.decode(bytes.sublist(3));
        return _DecodedXml._fromContent(
          content,
          encoding: 'utf-8',
          utf8Bom: true,
        );
      }
    }

    // Heuristic: try UTF-8 first; if it fails, try UTF-16LE then UTF-16BE
    try {
      final content = utf8.decode(bytes);
      return _DecodedXml._fromContent(
        content,
        encoding: 'utf-8',
        utf8Bom: false,
      );
    } catch (_) {
      try {
        final content = _decodeUtf16(bytes, Endian.little);
        return _DecodedXml._fromContent(
          content,
          encoding: 'utf-16le',
          utf8Bom: false,
        );
      } catch (_) {
        final content = _decodeUtf16(bytes, Endian.big);
        return _DecodedXml._fromContent(
          content,
          encoding: 'utf-16be',
          utf8Bom: false,
        );
      }
    }
  }

  static String _decodeUtf16(Uint8List bytes, Endian endian) {
    final bd = ByteData.view(
      bytes.buffer,
      bytes.offsetInBytes,
      bytes.lengthInBytes,
    );
    final codeUnits = <int>[];
    for (var i = 0; i + 1 < bytes.length; i += 2) {
      final unit = bd.getUint16(i, endian);
      codeUnits.add(unit);
    }
    return String.fromCharCodes(codeUnits);
  }

  static Uint8List _encodeUtf16(
    String content,
    Endian endian, {
    bool includeBom = true,
  }) {
    final codeUnits = content.codeUnits;
    final bytes = BytesBuilder();
    if (includeBom) {
      if (endian == Endian.little) {
        bytes.add([0xFF, 0xFE]);
      } else {
        bytes.add([0xFE, 0xFF]);
      }
    }
    final bd = ByteData(2);
    for (final cu in codeUnits) {
      bd.setUint16(0, cu, endian);
      bytes.add(bd.buffer.asUint8List());
    }
    return bytes.toBytes();
  }
}

class _DecodedXml {
  final String content;
  final String? declaration;
  final String encoding; // 'utf-8' | 'utf-16le' | 'utf-16be'
  final bool utf8Bom;
  final String lineEnding; // '\n' or '\r\n'

  _DecodedXml(
    this.content,
    this.declaration,
    this.encoding,
    this.utf8Bom,
    this.lineEnding,
  );

  factory _DecodedXml._fromContent(
    String content, {
    required String encoding,
    required bool utf8Bom,
  }) {
    final declMatch = RegExp(r'<\?xml[^?]*\?>').firstMatch(content);
    final hasCRLF = content.contains('\r\n');
    final lineEnding = hasCRLF ? '\r\n' : '\n';
    return _DecodedXml(
      content,
      declMatch?.group(0),
      encoding,
      utf8Bom,
      lineEnding,
    );
  }
}

/// Container for parsed XML data
class ParsedXmlData {
  final XmlDocument document;
  final List<WordRecord> records;
  final String? originalDeclaration;
  final String encoding; // 'utf-8' | 'utf-16le' | 'utf-16be'
  final bool utf8Bom;
  final String lineEnding; // '\n' or '\r\n'

  ParsedXmlData({
    required this.document,
    required this.records,
    this.originalDeclaration,
    required this.encoding,
    required this.utf8Bom,
    required this.lineEnding,
  });
}
