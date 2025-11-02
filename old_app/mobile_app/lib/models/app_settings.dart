/// Settings configuration for the tone matching app
class AppSettings {
  /// Which daughter elements of <data_form> to show as written forms
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

  AppSettings({
    this.writtenFormElements = const ['Phonetic'],
    this.showWrittenForm = true,
    this.audioFileSuffix,
    this.referenceNumbers = const [],
    this.requireUserSpelling = false,
    this.userSpellingElement = 'Orthographic',
    this.toneGroupElement = 'SurfaceMelodyGroup',
  });

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      writtenFormElements: (json['writtenFormElements'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const ['Phonetic'],
      showWrittenForm: json['showWrittenForm'] as bool? ?? true,
      audioFileSuffix: json['audioFileSuffix'] as String?,
      referenceNumbers: (json['referenceNumbers'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      requireUserSpelling: json['requireUserSpelling'] as bool? ?? false,
      userSpellingElement: json['userSpellingElement'] as String? ?? 'Orthographic',
      toneGroupElement: json['toneGroupElement'] as String? ?? 'SurfaceMelodyGroup',
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
    };
  }
}
