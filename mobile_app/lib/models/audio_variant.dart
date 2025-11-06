class AudioVariant {
  final String description;
  final String suffix; // may be empty string for base file

  const AudioVariant({required this.description, required this.suffix});

  factory AudioVariant.fromJson(Map<String, dynamic> json) {
    return AudioVariant(
      description: (json['description'] as String?)?.trim() ?? '',
      suffix: (json['suffix'] as String?)?.trim() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'description': description,
        'suffix': suffix,
      };
}
