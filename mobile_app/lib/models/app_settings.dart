// Settings configuration for the tone matching app
import 'audio_variant.dart';

class AppSettings {
  /// Which daughter elements of `data_form` to show as written forms
  final List<String> writtenFormElements;

  /// Whether to show written forms
  final bool showWrittenForm;

  /// Optional single suffix to add to sound file names (legacy)
  final String? audioFileSuffix;

  /// Audio variants with descriptions and suffixes (first variant is default)
  final List<AudioVariant> audioFileVariants;

  /// Reference numbers to filter (comma/space/newline separated)
  final List<String> referenceNumbers;

  /// Whether user should type their own spelling
  final bool requireUserSpelling;

  /// Which element to store user spelling in
  final String userSpellingElement;

  /// Which element to store tone group assignment
  final String toneGroupElement;

  /// Which element to store tone group GUID
  final String toneGroupIdElement;

  /// Optional: show a gloss line beneath the written form
  final bool showGloss;

  /// Element name to read gloss from (e.g., 'Gloss')
  final String? glossElement;

  /// Persistent ID for the bundle configuration (assigned by bundler profiles)
  final String? bundleId;

  /// Human description for this bundle configuration
  final String? bundleDescription;

  AppSettings({
    this.writtenFormElements = const ['Phonetic'],
    this.showWrittenForm = true,
    this.audioFileSuffix,
    this.audioFileVariants = const [AudioVariant(description: 'Default', suffix: '')],
    this.referenceNumbers = const [],
    this.requireUserSpelling = false,
    this.userSpellingElement = 'Orthographic',
    this.toneGroupElement = 'SurfaceMelodyGroup',
    this.toneGroupIdElement = 'SurfaceMelodyGroupId',
    this.showGloss = false,
    this.glossElement,
    this.bundleId,
    this.bundleDescription,
  });

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      writtenFormElements:
          (json['writtenFormElements'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const ['Phonetic'],
      showWrittenForm: json['showWrittenForm'] as bool? ?? true,
      audioFileSuffix: json['audioFileSuffix'] as String?,
      audioFileVariants: (json['audioFileVariants'] is List)
          ? (json['audioFileVariants'] as List)
              .map((e) => AudioVariant.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : [
              AudioVariant(
                description: 'Default',
                suffix: (json['audioFileSuffix'] as String?)?.trim() ?? '',
              ),
            ],
      referenceNumbers:
          (json['referenceNumbers'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      requireUserSpelling: json['requireUserSpelling'] as bool? ?? false,
      userSpellingElement:
          json['userSpellingElement'] as String? ?? 'Orthographic',
      toneGroupElement:
          json['toneGroupElement'] as String? ?? 'SurfaceMelodyGroup',
      toneGroupIdElement:
          json['toneGroupIdElement'] as String? ?? 'SurfaceMelodyGroupId',
      showGloss: json['showGloss'] as bool? ?? false,
      glossElement: json['glossElement'] as String?,
      bundleId: json['bundleId'] as String?,
      bundleDescription: json['bundleDescription'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'writtenFormElements': writtenFormElements,
      'showWrittenForm': showWrittenForm,
      // Maintain backward compatibility: keep audioFileSuffix equal to first variant's suffix
      'audioFileSuffix': (audioFileVariants.isNotEmpty
              ? (audioFileVariants.first.suffix.isEmpty
                  ? null
                  : audioFileVariants.first.suffix)
              : audioFileSuffix),
      'audioFileVariants': audioFileVariants.map((v) => v.toJson()).toList(),
      'referenceNumbers': referenceNumbers,
      'requireUserSpelling': requireUserSpelling,
      'userSpellingElement': userSpellingElement,
      'toneGroupElement': toneGroupElement,
      'toneGroupIdElement': toneGroupIdElement,
      'showGloss': showGloss,
      'glossElement': glossElement,
      if (bundleId != null) 'bundleId': bundleId,
      if (bundleDescription != null) 'bundleDescription': bundleDescription,
    };
  }
}
