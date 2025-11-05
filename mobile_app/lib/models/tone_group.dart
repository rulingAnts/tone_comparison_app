import 'word_record.dart';

/// Represents a tone melody group with an exemplar and members
class ToneGroup {
  /// Stable unique identifier for this tone group
  final String id;

  /// The group number (1-based)
  final int groupNumber;

  /// List of all words in this group (including exemplar as the first item)
  final List<WordRecord> members;

  /// Path to the exemplar image file
  String? imagePath;

  /// Number of members added since the last review confirmation
  int additionsSinceReview;

  /// Whether this group currently requires a review
  bool requiresReview;

  ToneGroup({
    required this.id,
    required this.groupNumber,
    required WordRecord exemplar,
    List<WordRecord>? members,
    this.imagePath,
    this.additionsSinceReview = 0,
    this.requiresReview = false,
  }) : members = _initMembers(exemplar, members) {
    // Ensure exemplar has this group's linkage
    exemplar.toneGroup = groupNumber;
    exemplar.toneGroupId = id;
  }

  /// Derived exemplar: the first member is considered the exemplar.
  WordRecord get exemplar => members.first;

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

  /// Increment the counter indicating new words added since last review.
  void incrementSinceReview() {
    additionsSinceReview += 1;
  }

  /// Mark this group as reviewed by the user.
  void markReviewed() {
    additionsSinceReview = 0;
    requiresReview = false;
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'groupNumber': groupNumber,
      'exemplar': exemplar.toJson(),
      'members': members.map((m) => m.toJson()).toList(),
      'imagePath': imagePath,
      'additionsSinceReview': additionsSinceReview,
      'requiresReview': requiresReview,
    };
  }

  factory ToneGroup.fromJson(Map<String, dynamic> json) {
    // Prefer members list; fall back to exemplar if needed
    final members =
        (json['members'] as List<dynamic>?)
            ?.map((m) => WordRecord.fromJson(m as Map<String, dynamic>))
            .toList() ??
        [];

    WordRecord? ex;
    if (json['exemplar'] != null) {
      ex = WordRecord.fromJson(json['exemplar'] as Map<String, dynamic>);
    }
    final exemplar = (members.isNotEmpty)
        ? members.first
        : (ex ?? WordRecord(reference: 'UNKNOWN', soundFile: '', fields: {}));

    return ToneGroup(
        id: json['id'] as String,
        groupNumber: json['groupNumber'] as int,
        exemplar: exemplar,
        members: members.isNotEmpty ? members : null,
        imagePath: json['imagePath'] as String?,
      )
      ..additionsSinceReview = (json['additionsSinceReview'] as int?) ?? 0
      ..requiresReview = (json['requiresReview'] as bool?) ?? false;
  }

  static List<WordRecord> _initMembers(
    WordRecord exemplar,
    List<WordRecord>? members,
  ) {
    if (members == null || members.isEmpty) {
      return [
        // Ensure exemplar linkage
        exemplar,
      ];
    }
    // Ensure exemplar is the first item and not duplicated
    final list = List<WordRecord>.from(members);
    list.remove(exemplar);
    list.insert(0, exemplar);
    return list;
  }
}
