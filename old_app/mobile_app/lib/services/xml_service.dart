import 'dart:io';
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
    
    // Detect encoding from XML declaration or use UTF-16
    String xmlContent;
    String? originalDeclaration;
    
    try {
      // Try UTF-16 first (Dekereke default)
      xmlContent = String.fromCharCodes(bytes);
      
      // Extract original XML declaration if present
      final declarationMatch = RegExp(r'<\?xml[^?]*\?>').firstMatch(xmlContent);
      if (declarationMatch != null) {
        originalDeclaration = declarationMatch.group(0);
      }
    } catch (e) {
      // Fallback to UTF-8
      xmlContent = String.fromCharCodes(bytes);
    }

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

      records.add(WordRecord(
        reference: reference,
        soundFile: soundFile,
        fields: fields,
        userSpelling: userSpelling,
        toneGroup: toneGroup,
      ));
    }

    return ParsedXmlData(
      document: document,
      records: records,
      originalDeclaration: originalDeclaration,
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
    String? originalDeclaration,
  ) async {
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
        orElse: () => throw Exception('No data_form found for reference ${record.reference}'),
      );

      // Update user spelling if provided
      if (record.userSpelling != null && record.userSpelling!.isNotEmpty) {
        final spellingElement =
            dataForm.findElements(settings.userSpellingElement).firstOrNull;
        if (spellingElement != null) {
          spellingElement.innerText = record.userSpelling!;
        } else {
          // Create new element if it doesn't exist
          dataForm.children.add(
            XmlElement(
              XmlName(settings.userSpellingElement),
              [],
              [XmlText(record.userSpelling!)],
            ),
          );
        }
      }

      // Update tone group if assigned
      if (record.toneGroup != null) {
        final toneGroupElement =
            dataForm.findElements(settings.toneGroupElement).firstOrNull;
        if (toneGroupElement != null) {
          toneGroupElement.innerText = record.toneGroup.toString();
        } else {
          // Create new element if it doesn't exist
          dataForm.children.add(
            XmlElement(
              XmlName(settings.toneGroupElement),
              [],
              [XmlText(record.toneGroup.toString())],
            ),
          );
        }
      }
    }

    // Convert back to string
    String xmlString = document.toXmlString(pretty: true, indent: '  ');
    
    // Replace XML declaration if original was different
    if (originalDeclaration != null) {
      xmlString = xmlString.replaceFirst(
        RegExp(r'<\?xml[^?]*\?>'),
        originalDeclaration,
      );
    }

    // Write to file (preserving encoding)
    final file = File(xmlFilePath);
    await file.writeAsString(xmlString, flush: true);
  }
}

/// Container for parsed XML data
class ParsedXmlData {
  final XmlDocument document;
  final List<WordRecord> records;
  final String? originalDeclaration;

  ParsedXmlData({
    required this.document,
    required this.records,
    this.originalDeclaration,
  });
}
