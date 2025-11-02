import 'dart:io';
import 'dart:convert';
import 'package:archive/archive.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import '../models/app_settings.dart';
import '../models/word_record.dart';
import '../models/tone_group.dart';
import 'xml_service.dart';

/// Service for loading and exporting data bundles
class BundleService {
  static const String settingsFileName = 'settings.json';
  static const String xmlFileName = 'data.xml';
  static const String audioFolderName = 'audio';
  
  /// Load a bundle from a zip file
  static Future<BundleData> loadBundle(String zipFilePath) async {
    final bytes = File(zipFilePath).readAsBytesSync();
    final archive = ZipDecoder().decodeBytes(bytes);

    // Extract to app directory
    final appDir = await getApplicationDocumentsDirectory();
    final bundleDir = Directory(path.join(appDir.path, 'current_bundle'));
    
    // Clear existing bundle
    if (await bundleDir.exists()) {
      await bundleDir.delete(recursive: true);
    }
    await bundleDir.create(recursive: true);

    // Extract all files
    for (final file in archive) {
      final filename = file.name;
      final filePath = path.join(bundleDir.path, filename);
      
      if (file.isFile) {
        final data = file.content as List<int>;
        File(filePath)
          ..createSync(recursive: true)
          ..writeAsBytesSync(data);
      } else {
        Directory(filePath).create(recursive: true);
      }
    }

    // Load settings
    final settingsFile = File(path.join(bundleDir.path, settingsFileName));
    final settingsJson = jsonDecode(await settingsFile.readAsString()) as Map<String, dynamic>;
    final settings = AppSettings.fromJson(settingsJson);

    // Load and parse XML
    final xmlFile = path.join(bundleDir.path, xmlFileName);
    final parsedXml = await XmlService.parseXml(xmlFile, settings);

    return BundleData(
      settings: settings,
      records: parsedXml.records,
      xmlDocument: parsedXml.document,
      xmlPath: xmlFile,
      bundlePath: bundleDir.path,
      originalXmlDeclaration: parsedXml.originalDeclaration,
    );
  }

  /// Export results to a zip file
  static Future<String> exportResults(
    BundleData bundleData,
    List<ToneGroup> toneGroups,
  ) async {
    final tempDir = await getTemporaryDirectory();
    final exportDir = Directory(path.join(tempDir.path, 'export_${DateTime.now().millisecondsSinceEpoch}'));
    await exportDir.create(recursive: true);

    // 1. Write updated XML
    final xmlOutputPath = path.join(exportDir.path, xmlFileName);
    await XmlService.writeXml(
      xmlOutputPath,
      bundleData.xmlDocument,
      bundleData.records,
      bundleData.settings,
      bundleData.originalXmlDeclaration,
    );

    // 2. Write CSV summary
    final csvPath = path.join(exportDir.path, 'tone_groups.csv');
    final csvContent = _generateCsv(toneGroups, bundleData.settings);
    await File(csvPath).writeAsString(csvContent);

    // 3. Copy exemplar images
    final imagesDir = Directory(path.join(exportDir.path, 'images'));
    await imagesDir.create();
    
    for (final group in toneGroups) {
      if (group.imagePath != null && group.imagePath!.isNotEmpty) {
        final imageFile = File(group.imagePath!);
        if (await imageFile.exists()) {
          final imageName = 'tone_group_${group.groupNumber}${path.extension(group.imagePath!)}';
          await imageFile.copy(path.join(imagesDir.path, imageName));
        }
      }
    }

    // 4. Create zip archive
    final archive = Archive();
    
    // Add all files from export directory
    await _addDirectoryToArchive(exportDir, archive, exportDir.path);

    // Write zip file
    final outputDir = await getApplicationDocumentsDirectory();
    final zipPath = path.join(
      outputDir.path,
      'export_${DateTime.now().millisecondsSinceEpoch}.zip',
    );
    
    final zipData = ZipEncoder().encode(archive);
    if (zipData != null) {
      File(zipPath).writeAsBytesSync(zipData);
    }

    // Clean up temporary export directory
    await exportDir.delete(recursive: true);

    return zipPath;
  }

  /// Generate CSV content for tone groups
  static String _generateCsv(List<ToneGroup> toneGroups, AppSettings settings) {
    final buffer = StringBuffer();
    
    // Header
    buffer.writeln('Tone Group,Reference Number,Written Form,Image File');

    // Sort groups by number
    final sortedGroups = List<ToneGroup>.from(toneGroups)
      ..sort((a, b) => a.groupNumber.compareTo(b.groupNumber));

    for (final group in sortedGroups) {
      final exemplar = group.exemplar;
      final writtenForm = exemplar.userSpelling ??
          exemplar.getDisplayText(settings.writtenFormElements);
      final imageName = group.imagePath != null
          ? 'tone_group_${group.groupNumber}${path.extension(group.imagePath!)}'
          : '';
      
      buffer.writeln(
        '${group.groupNumber},${exemplar.reference},"$writtenForm",$imageName',
      );
    }

    return buffer.toString();
  }

  /// Recursively add directory contents to archive
  static Future<void> _addDirectoryToArchive(
    Directory dir,
    Archive archive,
    String basePath,
  ) async {
    await for (final entity in dir.list(recursive: false)) {
      if (entity is File) {
        final bytes = await entity.readAsBytes();
        final relativePath = path.relative(entity.path, from: basePath);
        archive.addFile(
          ArchiveFile(relativePath, bytes.length, bytes),
        );
      } else if (entity is Directory) {
        await _addDirectoryToArchive(entity, archive, basePath);
      }
    }
  }
}

/// Container for loaded bundle data
class BundleData {
  final AppSettings settings;
  final List<WordRecord> records;
  final dynamic xmlDocument;
  final String xmlPath;
  final String bundlePath;
  final String? originalXmlDeclaration;

  BundleData({
    required this.settings,
    required this.records,
    required this.xmlDocument,
    required this.xmlPath,
    required this.bundlePath,
    this.originalXmlDeclaration,
  });
}
