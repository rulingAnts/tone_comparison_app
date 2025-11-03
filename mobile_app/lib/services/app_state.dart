import 'package:flutter/widgets.dart';
import '../models/app_settings.dart';
import '../models/word_record.dart';
import '../models/tone_group.dart';
import '../services/bundle_service_impl.dart';
import '../services/audio_service.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'intent_service.dart';
import 'package:uuid/uuid.dart';

/// Main application state provider
class AppState extends ChangeNotifier {
  static const int reviewThreshold = 5;
  BundleData? _bundleData;
  final List<ToneGroup> _toneGroups = [];
  final AudioService _audioService = AudioService();

  // Localization
  Locale? _locale;

  int _currentWordIndex = 0;
  bool _isLoading = false;
  String? _error;

  // Undo stack to support reverting the last few actions (capacity: 3)
  final List<_UndoEntry> _undoStack = [];

  // Getters
  BundleData? get bundleData => _bundleData;
  List<ToneGroup> get toneGroups => List.unmodifiable(_toneGroups);
  AudioService get audioService => _audioService;
  int get currentWordIndex => _currentWordIndex;
  bool get isLoading => _isLoading;
  String? get error => _error;
  Locale? get locale => _locale;

  AppSettings? get settings => _bundleData?.settings;
  List<WordRecord> get records => _bundleData?.records ?? [];

  WordRecord? get currentWord {
    if (_bundleData == null || _currentWordIndex >= records.length) {
      return null;
    }
    return records[_currentWordIndex];
  }

  bool get hasNextWord => _currentWordIndex < records.length - 1;
  bool get hasPreviousWord => _currentWordIndex > 0;
  bool get isComplete => _currentWordIndex >= records.length;
  bool get canUndo => _undoStack.isNotEmpty;

  /// Load a bundle from a zip file
  Future<void> loadBundle(String zipFilePath) async {
    _setLoading(true);
    _error = null;

    try {
      _bundleData = await BundleService.loadBundle(zipFilePath);
      _audioService.setBundlePath(_bundleData!.bundlePath);
      _currentWordIndex = 0;
      _toneGroups.clear();

      // Load existing tone groups from records
      _loadExistingToneGroups();

      notifyListeners();
    } catch (e) {
      _error = 'Failed to load bundle: $e';
      notifyListeners();
    } finally {
      _setLoading(false);
    }
  }

  // --- Localization & Intents ---
  static const _prefsLocaleKey = 'preferred_locale';

  Future<void> initLocalization() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_prefsLocaleKey);
    if (code != null && code.isNotEmpty) {
      _locale = Locale(code);
      notifyListeners();
    }
  }

  Future<void> setLocale(Locale? locale) async {
    _locale = locale;
    final prefs = await SharedPreferences.getInstance();
    if (locale == null) {
      await prefs.remove(_prefsLocaleKey);
    } else {
      await prefs.setString(_prefsLocaleKey, locale.languageCode);
    }
    notifyListeners();
  }

  Future<void> initIntents() async {
    await IntentService.init(this);
  }

  /// Load existing tone groups from records
  void _loadExistingToneGroups() {
    final groupedRecords = <int, List<WordRecord>>{};

    for (final record in records) {
      if (record.toneGroup != null) {
        groupedRecords.putIfAbsent(record.toneGroup!, () => []).add(record);
      }
    }

    for (final entry in groupedRecords.entries) {
      final groupNumber = entry.key;
      final members = entry.value;

      if (members.isNotEmpty) {
        // Prefer any existing GUID on the first member; otherwise generate one
        final existingId = members.first.toneGroupId;
        final id = existingId != null && existingId.isNotEmpty
            ? existingId
            : const Uuid().v4();
        _toneGroups.add(
          ToneGroup(
            id: id,
            groupNumber: groupNumber,
            exemplar: members.first,
            members: members,
          ),
        );
      }
    }

    // Sort by group number
    _toneGroups.sort((a, b) => a.groupNumber.compareTo(b.groupNumber));
  }

  /// Create a new tone group with the current word as exemplar
  ToneGroup createNewToneGroup(String? imagePath) {
    if (currentWord == null) {
      throw Exception('No current word');
    }

    final groupNumber = _toneGroups.isEmpty
        ? 1
        : _toneGroups.last.groupNumber + 1;
    // Generate a stable GUID for this group
    final groupId = const Uuid().v4();
    final group = ToneGroup(
      id: groupId,
      groupNumber: groupNumber,
      exemplar: currentWord!,
      imagePath: imagePath,
    );

    // Record undo before applying changes
    _pushUndo(
      _UndoEntry.createGroup(
        wordIndex: _currentWordIndex,
        groupNumber: groupNumber,
      ),
    );

    currentWord!.toneGroup = groupNumber;
    _toneGroups.add(group);
    notifyListeners();

    return group;
  }

  /// Add current word to an existing tone group
  void addToToneGroup(ToneGroup group) {
    if (currentWord == null) {
      throw Exception('No current word');
    }

    // Remove from previous group if assigned
    if (currentWord!.toneGroup != null) {
      final previousGroup = _toneGroups.firstWhere(
        (g) => g.groupNumber == currentWord!.toneGroup,
        orElse: () => throw Exception('Previous group not found'),
      );
      previousGroup.removeMember(currentWord!);
    }

    // Record undo: previous group may be null
    _pushUndo(
      _UndoEntry.assign(
        wordIndex: _currentWordIndex,
        previousGroupNumber: currentWord!.toneGroup,
        newGroupNumber: group.groupNumber,
      ),
    );

    group.addMember(currentWord!);
    // Track additions for review prompting
    group.incrementSinceReview();
    if (group.additionsSinceReview >= reviewThreshold &&
        !group.requiresReview) {
      group.requiresReview = true;
    }
    notifyListeners();
  }

  /// Update the user spelling for current word
  void updateUserSpelling(String spelling) {
    if (currentWord != null) {
      final prev = currentWord!.userSpelling;
      _pushUndo(
        _UndoEntry.spelling(
          wordIndex: _currentWordIndex,
          previousSpelling: prev,
        ),
      );
      currentWord!.userSpelling = spelling;
      notifyListeners();
    }
  }

  /// Update exemplar image for a tone group
  void updateToneGroupImage(ToneGroup group, String imagePath) {
    group.imagePath = imagePath;
    notifyListeners();
  }

  /// Mark a group's review as complete, resetting the counter.
  void markGroupReviewed(ToneGroup group) {
    group.markReviewed();
    notifyListeners();
  }

  /// Returns the list of groups currently flagged for review.
  List<ToneGroup> groupsNeedingReview() =>
      _toneGroups.where((g) => g.requiresReview).toList(growable: false);

  /// Move to next word
  void nextWord() {
    if (hasNextWord) {
      _currentWordIndex++;
      notifyListeners();
    }
  }

  /// Move to previous word
  void previousWord() {
    if (hasPreviousWord) {
      _currentWordIndex--;
      notifyListeners();
    }
  }

  /// Go to a specific word index
  void goToWord(int index) {
    if (index >= 0 && index < records.length) {
      _currentWordIndex = index;
      notifyListeners();
    }
  }

  /// Undo the last action (assignment, new group creation, or spelling change).
  /// Returns true if an action was undone.
  bool undoLastAction() {
    if (_undoStack.isEmpty) return false;
    final entry = _undoStack.removeLast();

    // Navigate back to the word this action affected
    _currentWordIndex = entry.wordIndex;

    switch (entry.type) {
      case _UndoType.assign:
        final word = records[_currentWordIndex];
        // Remove from new group
        final newGroup = _toneGroups.firstWhere(
          (g) => g.groupNumber == entry.newGroupNumber,
          orElse: () => throw Exception('New group not found'),
        );
        newGroup.removeMember(word);
        // Re-add to previous group if any
        if (entry.previousGroupNumber != null) {
          final prevGroup = _toneGroups.firstWhere(
            (g) => g.groupNumber == entry.previousGroupNumber,
            orElse: () => throw Exception('Previous group not found'),
          );
          prevGroup.addMember(word);
        } else {
          word.toneGroup = null;
        }
        break;
      case _UndoType.createGroup:
        // Remove the newly created group and clear word's assignment
        final idx = _toneGroups.indexWhere(
          (g) => g.groupNumber == entry.newGroupNumber,
        );
        if (idx != -1) {
          final group = _toneGroups[idx];
          // Ensure we clear the exemplar's assignment
          for (final w in group.members) {
            if (w.toneGroup == group.groupNumber) {
              w.toneGroup = null;
            }
          }
          _toneGroups.removeAt(idx);
        }
        break;
      case _UndoType.spelling:
        final word = records[_currentWordIndex];
        word.userSpelling = entry.previousSpelling;
        break;
    }

    notifyListeners();
    return true;
  }

  void _pushUndo(_UndoEntry entry) {
    _undoStack.add(entry);
    // Keep only last 3 actions
    if (_undoStack.length > 3) {
      _undoStack.removeAt(0);
    }
  }

  /// Export results
  Future<String> exportResults() async {
    if (_bundleData == null) {
      throw Exception('No bundle loaded');
    }

    _setLoading(true);
    try {
      final zipPath = await BundleService.exportResults(
        _bundleData!,
        _toneGroups,
      );
      return zipPath;
    } finally {
      _setLoading(false);
    }
  }

  /// Share results (Android share sheet) as a zip containing original and updated XML
  Future<void> shareResults() async {
    if (_bundleData == null) {
      throw Exception('No bundle loaded');
    }

    _setLoading(true);
    try {
      final zipPath = await BundleService.createShareZip(
        _bundleData!,
        _toneGroups,
      );
      await Share.shareXFiles(
        [
          XFile(
            zipPath,
            mimeType: 'application/zip',
            name: 'tone_matching_xml.zip',
          ),
        ],
        subject: 'Tone Matching XML',
        text: 'Original and updated XML from tone matching',
      );
    } finally {
      _setLoading(false);
    }
  }

  /// Play audio for a word
  Future<void> playWord(WordRecord word) async {
    await _audioService.playWord(word, settings?.audioFileSuffix);
  }

  /// Stop audio playback
  Future<void> stopAudio() async {
    await _audioService.stop();
  }

  void _setLoading(bool value) {
    _isLoading = value;
    notifyListeners();
  }

  @override
  void dispose() {
    IntentService.dispose();
    _audioService.dispose();
    super.dispose();
  }
}

enum _UndoType { assign, createGroup, spelling }

class _UndoEntry {
  final _UndoType type;
  final int wordIndex;
  final int? previousGroupNumber;
  final int? newGroupNumber;
  final String? previousSpelling;

  _UndoEntry._({
    required this.type,
    required this.wordIndex,
    this.previousGroupNumber,
    this.newGroupNumber,
    this.previousSpelling,
  });

  factory _UndoEntry.assign({
    required int wordIndex,
    required int? previousGroupNumber,
    required int newGroupNumber,
  }) => _UndoEntry._(
    type: _UndoType.assign,
    wordIndex: wordIndex,
    previousGroupNumber: previousGroupNumber,
    newGroupNumber: newGroupNumber,
  );

  factory _UndoEntry.createGroup({
    required int wordIndex,
    required int groupNumber,
  }) => _UndoEntry._(
    type: _UndoType.createGroup,
    wordIndex: wordIndex,
    newGroupNumber: groupNumber,
  );

  factory _UndoEntry.spelling({
    required int wordIndex,
    required String? previousSpelling,
  }) => _UndoEntry._(
    type: _UndoType.spelling,
    wordIndex: wordIndex,
    previousSpelling: previousSpelling,
  );
}
