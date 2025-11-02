import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';

import '../models/app_settings.dart';
import '../models/tone_group.dart';
import '../models/word_record.dart';
import 'xml_service.dart';

/// Clean implementation of BundleService (replaces corrupted bundle_service.dart)
class BundleService {
  static const String settingsFileName = 'settings.json';
  static const String xmlFileName = 'data.xml';
  static const String audioFolderName = 'audio';

  /// Load a bundle from a zip file
  static Future<BundleData> loadBundle(String zipFilePath) async {
    final bytes = await File(zipFilePath).readAsBytes();
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
        await File(filePath).create(recursive: true);
        await File(filePath).writeAsBytes(data);
      } else {
        await Directory(filePath).create(recursive: true);
      }
    }

    // Load settings
    final settingsFile = File(path.join(bundleDir.path, settingsFileName));
    final settingsJson =
        jsonDecode(await settingsFile.readAsString()) as Map<String, dynamic>;
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
      encoding: parsedXml.encoding,
      utf8Bom: parsedXml.utf8Bom,
      lineEnding: parsedXml.lineEnding,
    );
  }

  /// Export results to a zip file
  static Future<String> exportResults(
    BundleData bundleData,
    List<ToneGroup> toneGroups,
  ) async {
    final tempDir = await getTemporaryDirectory();
    final exportDir = Directory(
      path.join(
        tempDir.path,
        'export_${DateTime.now().millisecondsSinceEpoch}',
      ),
    );
    await exportDir.create(recursive: true);

    // 1. Write updated XML (subset only)
    final xmlOutputPath = path.join(exportDir.path, xmlFileName);
    final updatedSubset = _buildMinimalUpdatedXml(
      bundleData.records,
      bundleData.settings,
      declaration: bundleData.originalXmlDeclaration,
      lineEnding: bundleData.lineEnding,
    );
    await File(xmlOutputPath).writeAsString(updatedSubset, flush: true);

    // 2. Write CSV summary
    final csvPath = path.join(exportDir.path, 'tone_groups.csv');
    final csvContent = _generateCsv(toneGroups, bundleData.settings);
    await File(csvPath).writeAsString(csvContent, flush: true);

    // 3. Copy exemplar images
    final imagesDir = Directory(path.join(exportDir.path, 'images'));
    await imagesDir.create();

    for (final group in toneGroups) {
      if (group.imagePath != null && group.imagePath!.isNotEmpty) {
        final imageFile = File(group.imagePath!);
        if (await imageFile.exists()) {
          final imageName =
              'tone_group_${group.groupNumber}${path.extension(group.imagePath!)}';
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
      await File(zipPath).writeAsBytes(zipData, flush: true);
    }

    // Clean up temporary export directory
    await exportDir.delete(recursive: true);

    return zipPath;
  }

  /// Create a zip containing the original data.xml and the updated XML,
  /// preserving original encoding, declaration, and line endings. Returns the
  /// path to the created zip file (in a temporary directory).
  static Future<String> createShareZip(
    BundleData bundleData,
    List<ToneGroup> toneGroups,
  ) async {
    final tempDir = await getTemporaryDirectory();
    final sessionDir = Directory(
      path.join(tempDir.path, 'share_${DateTime.now().millisecondsSinceEpoch}'),
    );
    await sessionDir.create(recursive: true);

    // 1) Copy original XML bytes exactly
    final originalXmlBytes = await File(bundleData.xmlPath).readAsBytes();
    final originalCopyPath = path.join(sessionDir.path, 'data_original.xml');
    await File(originalCopyPath).writeAsBytes(originalXmlBytes, flush: true);

    // 2) Write updated XML (subset only)
    final updatedXmlPath = path.join(sessionDir.path, 'data_updated.xml');
    final updatedSubset = _buildMinimalUpdatedXml(
      bundleData.records,
      bundleData.settings,
      declaration: bundleData.originalXmlDeclaration,
      lineEnding: bundleData.lineEnding,
    );
    await File(updatedXmlPath).writeAsString(updatedSubset, flush: true);

    // 3) Create CSV (use CRLF for Windows-friendly line endings)
    final csvPath = path.join(sessionDir.path, 'tone_groups.csv');
    final csvContent = _generateCsv(
      toneGroups,
      bundleData.settings,
    ).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\r\n');
    await File(csvPath).writeAsString(csvContent, flush: true);

    // 4) Copy exemplar images into images/
    final imagesDir = Directory(path.join(sessionDir.path, 'images'));
    await imagesDir.create(recursive: true);
    for (final group in toneGroups) {
      if (group.imagePath != null && group.imagePath!.isNotEmpty) {
        final imageFile = File(group.imagePath!);
        if (await imageFile.exists()) {
          final imageName =
              'tone_group_${group.groupNumber}${path.extension(group.imagePath!)}';
          await imageFile.copy(path.join(imagesDir.path, imageName));
        }
      }
    }

    // 5) Zip files: original XML, updated XML, CSV, and images/
    final archive = Archive();
    final originalStat = await File(originalCopyPath).stat();
    final originalBytes = await File(originalCopyPath).readAsBytes();
    archive.addFile(
      ArchiveFile('data_original.xml', originalStat.size, originalBytes),
    );

    final updatedStat = await File(updatedXmlPath).stat();
    final updatedBytes = await File(updatedXmlPath).readAsBytes();
    archive.addFile(
      ArchiveFile('data_updated.xml', updatedStat.size, updatedBytes),
    );

    // Add CSV
    final csvStat = await File(csvPath).stat();
    final csvBytes = await File(csvPath).readAsBytes();
    archive.addFile(ArchiveFile('tone_groups.csv', csvStat.size, csvBytes));

    // Add images directory (if any)
    await _addDirectoryToArchive(imagesDir, archive, sessionDir.path);

    final zipData = ZipEncoder().encode(archive);
    final outZipPath = path.join(
      tempDir.path,
      'tone_matching_xml_${DateTime.now().millisecondsSinceEpoch}.zip',
    );
    if (zipData != null) {
      await File(outZipPath).writeAsBytes(zipData, flush: true);
    }

    return outZipPath;
  }

  /// Generate CSV content for tone groups
  static String _generateCsv(List<ToneGroup> toneGroups, AppSettings settings) {
    final buffer = StringBuffer();
    if (settings.showGloss && (settings.glossElement != null)) {
      buffer.writeln(
        'Tone Group (Num),Tone Group ID,Reference Number,Written Form,Gloss,Image File',
      );
    } else {
      buffer.writeln(
        'Tone Group (Num),Tone Group ID,Reference Number,Written Form,Image File',
      );
    }

    final sortedGroups = List<ToneGroup>.from(toneGroups)
      ..sort((a, b) => a.groupNumber.compareTo(b.groupNumber));

    for (final group in sortedGroups) {
      final exemplar = group.exemplar;
      final writtenForm =
          exemplar.userSpelling ??
          exemplar.getDisplayText(settings.writtenFormElements);
      final imageName = group.imagePath != null
          ? 'tone_group_${group.groupNumber}${path.extension(group.imagePath!)}'
          : '';
      final groupId = group.id;

      if (settings.showGloss && (settings.glossElement != null)) {
        final gloss = exemplar.fields[settings.glossElement!] ?? '';
        buffer.writeln(
          '${group.groupNumber},$groupId,${exemplar.reference},"$writtenForm","$gloss",$imageName',
        );
      } else {
        buffer.writeln(
          '${group.groupNumber},$groupId,${exemplar.reference},"$writtenForm",$imageName',
        );
      }
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
        archive.addFile(ArchiveFile(relativePath, bytes.length, bytes));
      } else if (entity is Directory) {
        await _addDirectoryToArchive(entity, archive, basePath);
      }
    }
  }

  /// Build a minimal updated XML document string containing only the provided records,
  /// including updated user spelling, tone group number, and tone group GUID.
  static String _buildMinimalUpdatedXml(
    List<WordRecord> records,
    AppSettings settings, {
    String? declaration,
    String lineEnding = '\n',
  }) {
    String esc(String s) => s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

    final parts = <String>[];
    parts.add(declaration ?? '<?xml version="1.0" encoding="utf-8"?>');
    parts.add('<phon_data>');

    for (final r in records) {
      final written = <String>[];
      // Ensure Reference and SoundFile first
      written.add('  <Reference>${esc(r.reference)}</Reference>');
      written.add('  <SoundFile>${esc(r.soundFile)}</SoundFile>');

      // Write all other fields excluding tone group fields and dup keys
      final tgKey = settings.toneGroupElement;
      final tgIdKey = settings.toneGroupIdElement;
      for (final entry in r.fields.entries) {
        final k = entry.key;
        if (k == 'Reference' ||
            k == 'SoundFile' ||
            k == tgKey ||
            k == tgIdKey) {
          continue;
        }
        final v = entry.value;
        if (v.isEmpty) continue;
        written.add('  <${k}>${esc(v)}</${k}>');
      }

      // User spelling override/add
      if (r.userSpelling != null && r.userSpelling!.isNotEmpty) {
        written.add(
          '  <${settings.userSpellingElement}>${esc(r.userSpelling!)}<\/${settings.userSpellingElement}>',
        );
      }

      // Tone group number
      if (r.toneGroup != null) {
        written.add('  <${tgKey}>${r.toneGroup}<\/${tgKey}>');
      }

      // Tone group GUID
      if (r.toneGroupId != null && r.toneGroupId!.isNotEmpty) {
        written.add('  <${tgIdKey}>${esc(r.toneGroupId!)}<\/${tgIdKey}>');
      }

      parts.add('<data_form>');
      parts.addAll(written);
      parts.add('</data_form>');
    }

    parts.add('</phon_data>');

    return parts.join(lineEnding);
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
  final String encoding;
  final bool utf8Bom;
  final String lineEnding;

  BundleData({
    required this.settings,
    required this.records,
    required this.xmlDocument,
    required this.xmlPath,
    required this.bundlePath,
    this.originalXmlDeclaration,
    required this.encoding,
    required this.utf8Bom,
    required this.lineEnding,
  });
}
