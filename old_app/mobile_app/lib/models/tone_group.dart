import 'word_record.dart';

/// Represents a tone melody group with an exemplar and members
class ToneGroup {
  /// The group number (1-based)
  final int groupNumber;
  
  /// The exemplar word for this group
  final WordRecord exemplar;
  
  /// List of all words in this group (including exemplar)
  final List<WordRecord> members;
  
  /// Path to the exemplar image file
  String? imagePath;

  ToneGroup({
    required this.groupNumber,
    required this.exemplar,
    List<WordRecord>? members,
    this.imagePath,
  }) : members = members ?? [exemplar];

  /// Add a word to this tone group
  void addMember(WordRecord word) {
    if (!members.contains(word)) {
      members.add(word);
      word.toneGroup = groupNumber;
    }
  }

  /// Remove a word from this tone group
  void removeMember(WordRecord word) {
    members.remove(word);
    if (word.toneGroup == groupNumber) {
      word.toneGroup = null;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'groupNumber': groupNumber,
      'exemplar': exemplar.toJson(),
      'members': members.map((m) => m.toJson()).toList(),
      'imagePath': imagePath,
    };
  }

  factory ToneGroup.fromJson(Map<String, dynamic> json) {
    final exemplar = WordRecord.fromJson(json['exemplar'] as Map<String, dynamic>);
    final members = (json['members'] as List<dynamic>)
        .map((m) => WordRecord.fromJson(m as Map<String, dynamic>))
        .toList();
    
    return ToneGroup(
      groupNumber: json['groupNumber'] as int,
      exemplar: exemplar,
      members: members,
      imagePath: json['imagePath'] as String?,
    );
  }
}
