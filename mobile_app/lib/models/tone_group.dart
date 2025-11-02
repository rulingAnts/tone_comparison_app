import 'word_record.dart';

/// Represents a tone melody group with an exemplar and members
class ToneGroup {
  /// Stable unique identifier for this tone group
  final String id;

  /// The group number (1-based)
  final int groupNumber;

  /// The exemplar word for this group
  final WordRecord exemplar;

  /// List of all words in this group (including exemplar)
  final List<WordRecord> members;

  /// Path to the exemplar image file
  String? imagePath;

  ToneGroup({
    required this.id,
    required this.groupNumber,
    required this.exemplar,
    List<WordRecord>? members,
    this.imagePath,
  }) : members = members ?? [exemplar] {
    // Ensure exemplar has this group's linkage
    exemplar.toneGroup = groupNumber;
    exemplar.toneGroupId = id;
  }

  /// Add a word to this tone group
  void addMember(WordRecord word) {
    if (!members.contains(word)) {
      members.add(word);
      word.toneGroup = groupNumber;
      word.toneGroupId = id;
    }
  }

  /// Remove a word from this tone group
  void removeMember(WordRecord word) {
    members.remove(word);
    if (word.toneGroup == groupNumber) {
      word.toneGroup = null;
      if (word.toneGroupId == id) {
        word.toneGroupId = null;
      }
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'groupNumber': groupNumber,
      'exemplar': exemplar.toJson(),
      'members': members.map((m) => m.toJson()).toList(),
      'imagePath': imagePath,
    };
  }

  factory ToneGroup.fromJson(Map<String, dynamic> json) {
    final exemplar = WordRecord.fromJson(
      json['exemplar'] as Map<String, dynamic>,
    );
    final members = (json['members'] as List<dynamic>)
        .map((m) => WordRecord.fromJson(m as Map<String, dynamic>))
        .toList();

    return ToneGroup(
      id: json['id'] as String,
      groupNumber: json['groupNumber'] as int,
      exemplar: exemplar,
      members: members,
      imagePath: json['imagePath'] as String?,
    );
  }
}
