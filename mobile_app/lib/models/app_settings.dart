/// Settings configuration for the tone matching app
class AppSettings {
  /// Which daughter elements of `data_form` to show as written forms
  final List<String> writtenFormElements;

  /// Whether to show written forms
  final bool showWrittenForm;

  /// Optional suffix to add to sound file names
  final String? audioFileSuffix;

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

  AppSettings({
    this.writtenFormElements = const ['Phonetic'],
    this.showWrittenForm = true,
    this.audioFileSuffix,
    this.referenceNumbers = const [],
    this.requireUserSpelling = false,
    this.userSpellingElement = 'Orthographic',
    this.toneGroupElement = 'SurfaceMelodyGroup',
    this.toneGroupIdElement = 'SurfaceMelodyGroupId',
    this.showGloss = false,
    this.glossElement,
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
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'writtenFormElements': writtenFormElements,
      'showWrittenForm': showWrittenForm,
      'audioFileSuffix': audioFileSuffix,
      'referenceNumbers': referenceNumbers,
      'requireUserSpelling': requireUserSpelling,
      'userSpellingElement': userSpellingElement,
      'toneGroupElement': toneGroupElement,
      'toneGroupIdElement': toneGroupIdElement,
      'showGloss': showGloss,
      'glossElement': glossElement,
    };
  }
}
