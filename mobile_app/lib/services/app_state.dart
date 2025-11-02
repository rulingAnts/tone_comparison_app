import 'package:flutter/foundation.dart';
import '../models/app_settings.dart';
import '../models/word_record.dart';
import '../models/tone_group.dart';
import '../services/bundle_service.dart';
import '../services/audio_service.dart';

/// Main application state provider
class AppState extends ChangeNotifier {
  BundleData? _bundleData;
  final List<ToneGroup> _toneGroups = [];
  final AudioService _audioService = AudioService();

  int _currentWordIndex = 0;
  bool _isLoading = false;
  String? _error;

  // Getters
  BundleData? get bundleData => _bundleData;
  List<ToneGroup> get toneGroups => List.unmodifiable(_toneGroups);
  AudioService get audioService => _audioService;
  int get currentWordIndex => _currentWordIndex;
  bool get isLoading => _isLoading;
  String? get error => _error;

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
        _toneGroups.add(
          ToneGroup(
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
    final group = ToneGroup(
      groupNumber: groupNumber,
      exemplar: currentWord!,
      imagePath: imagePath,
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

    group.addMember(currentWord!);
    notifyListeners();
  }

  /// Update the user spelling for current word
  void updateUserSpelling(String spelling) {
    if (currentWord != null) {
      currentWord!.userSpelling = spelling;
      notifyListeners();
    }
  }

  /// Update exemplar image for a tone group
  void updateToneGroupImage(ToneGroup group, String imagePath) {
    group.imagePath = imagePath;
    notifyListeners();
  }

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
    _audioService.dispose();
    super.dispose();
  }
}
