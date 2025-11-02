import '../utils/ref_utils.dart';

/// Represents a single word/data record from the Dekereke XML

class WordRecord {
  /// The reference number for this record
  final String reference;

  /// The base sound file name
  final String soundFile;

  /// Map of element name to value for all data_form children
  final Map<String, String> fields;

  /// User-entered spelling (if requireUserSpelling is enabled)
  String? userSpelling;

  /// Assigned tone group number (1-based)
  int? toneGroup;

  /// Assigned tone group stable id (GUID)
  String? toneGroupId;

  WordRecord({
    required this.reference,
    required this.soundFile,
    required this.fields,
    this.userSpelling,
    this.toneGroup,
    this.toneGroupId,
  });

  /// Numeric form of the reference for sorting (preserves original string elsewhere)
  int? get numericReference => RefUtils.numericRef(reference);

  /// Get the display text based on written form elements
  String getDisplayText(List<String> writtenFormElements) {
    for (final element in writtenFormElements) {
      final value = fields[element];
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }
    return reference; // Fallback to reference if no written form found
  }

  /// Get the actual sound file path including optional suffix
  String getSoundFilePath(String? suffix) {
    if (suffix == null || suffix.isEmpty) {
      return soundFile;
    }

    // Insert suffix before file extension
    final lastDot = soundFile.lastIndexOf('.');
    if (lastDot == -1) {
      return soundFile + suffix;
    }

    return soundFile.substring(0, lastDot) +
        suffix +
        soundFile.substring(lastDot);
  }

  Map<String, dynamic> toJson() {
    return {
      'reference': reference,
      'soundFile': soundFile,
      'fields': fields,
      'userSpelling': userSpelling,
      'toneGroup': toneGroup,
      'toneGroupId': toneGroupId,
    };
  }

  factory WordRecord.fromJson(Map<String, dynamic> json) {
    return WordRecord(
      reference: json['reference'] as String,
      soundFile: json['soundFile'] as String,
      fields: Map<String, String>.from(json['fields'] as Map),
      userSpelling: json['userSpelling'] as String?,
      toneGroup: json['toneGroup'] as int?,
      toneGroupId: json['toneGroupId'] as String?,
    );
  }
}
