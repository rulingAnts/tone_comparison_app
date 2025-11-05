import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
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
  static const String _stateFileName = 'state.json';
  BundleData? _bundleData;
  final List<ToneGroup> _toneGroups = [];
  final AudioService _audioService = AudioService();
  String?
  _bundleFileBaseName; // Base name (without extension) of the imported bundle file

  // Localization
  Locale? _locale;

  int _currentWordIndex = 0;
  // Queue of word references that are not yet assigned to a tone group.
  // This drives navigation to avoid loops and ensures persistence.
  final List<String> _unsortedQueue = [];
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
  int get remainingUnsortedCount => _unsortedQueue.length;
  int get totalCount => records.length;

  WordRecord? get currentWord {
    if (_bundleData == null) return null;
    // Prefer queue head if present; fallback to index for legacy
    if (_unsortedQueue.isNotEmpty) {
      final ref = _unsortedQueue.first;
      return records.firstWhere(
        (r) => r.reference == ref,
        orElse: () => records[_currentWordIndex],
      );
    }
    if (_currentWordIndex >= records.length) return null;
    return records[_currentWordIndex];
  }

  bool get hasNextWord =>
      _unsortedQueue.isNotEmpty || _currentWordIndex < records.length - 1;
  bool get hasPreviousWord => _currentWordIndex > 0; // legacy back nav
  bool get isComplete => _unsortedQueue.isEmpty;
  bool get canUndo => _undoStack.isNotEmpty;
  bool get hasUserProgress =>
      _toneGroups.isNotEmpty ||
      records.any(
        (r) => (r.userSpelling != null && r.userSpelling!.isNotEmpty),
      );

  // Pending bundle path from Android VIEW intents (or similar). UI should
  // confirm before loading if there is existing progress.
  String? _pendingBundlePath;
  bool get hasPendingBundle => _pendingBundlePath != null;
  void setPendingBundlePath(String path) {
    _pendingBundlePath = path;
    notifyListeners();
  }

  String? takePendingBundlePath() {
    final p = _pendingBundlePath;
    _pendingBundlePath = null;
    return p;
  }

  /// Load a bundle from a zip file
  Future<void> loadBundle(String zipFilePath) async {
    _setLoading(true);
    _error = null;

    try {
      _bundleData = await BundleService.loadBundle(zipFilePath);
      // Remember the original bundle file base name for naming exports
      try {
        _bundleFileBaseName = p.basenameWithoutExtension(zipFilePath);
      } catch (_) {
        _bundleFileBaseName = null;
      }
      _audioService.setBundlePath(_bundleData!.bundlePath);
      _currentWordIndex = 0;
      _toneGroups.clear();
      _unsortedQueue.clear();
      // Try loading any saved state for this extracted bundle; if none, fall back
      final loaded = await _loadSavedState();
      if (!loaded) {
        // Load existing tone groups from records (if any)
        _loadExistingToneGroups();
        // Build initial queue: all records not assigned to any group, in original order
        for (final r in records) {
          if (r.toneGroup == null) {
            _unsortedQueue.add(r.reference);
          }
        }
      }

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

  /// Initialize from any previously extracted bundle on disk and restore saved state.
  /// If intents subsequently load a new bundle, that will override this state.
  Future<void> initPersistentBundle() async {
    if (_bundleData != null) return; // already initialized
    try {
      final existing = await BundleService.loadExistingExtracted();
      if (existing == null) return;
      _bundleData = existing;
      // No known original filename in this path; keep null to fall back later
      _audioService.setBundlePath(_bundleData!.bundlePath);
      _currentWordIndex = 0;
      _toneGroups.clear();
      final loaded = await _loadSavedState();
      if (!loaded) {
        _loadExistingToneGroups();
      }
      notifyListeners();
    } catch (_) {
      // ignore
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
      imagePath: null,
    );

    // Record undo before applying changes
    _pushUndo(
      _UndoEntry.createGroup(
        wordIndex: _currentWordIndex,
        groupNumber: groupNumber,
      ),
    );

    currentWord!.toneGroup = groupNumber;
    // Remove from queue since it's now assigned
    _unsortedQueue.remove(currentWord!.reference);
    _toneGroups.add(group);
    // If an image was provided, copy it into the bundle's images folder and update path
    if (imagePath != null && imagePath.isNotEmpty) {
      _persistGroupImage(group, imagePath);
    }
    _saveState();
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
    // Remove from queue since it's assigned now; the next head becomes current automatically
    _unsortedQueue.remove(currentWord!.reference);
    _saveState();
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
      _saveState();
      notifyListeners();
    }
  }

  /// Update exemplar image for a tone group
  void updateToneGroupImage(ToneGroup group, String imagePath) {
    _persistGroupImage(group, imagePath);
    _saveState();
    notifyListeners();
  }

  /// Mark a group's review as complete, resetting the counter.
  void markGroupReviewed(ToneGroup group) {
    group.markReviewed();
    _saveState();
    notifyListeners();
  }

  /// Returns the list of groups currently flagged for review.
  List<ToneGroup> groupsNeedingReview() =>
      _toneGroups.where((g) => g.requiresReview).toList(growable: false);

  /// Move to next word
  void nextWord() {
    _advanceToNextUnsorted();
    _saveState();
    notifyListeners();
  }

  /// Move to previous word
  void previousWord() {
    if (hasPreviousWord) {
      _currentWordIndex--;
      _saveState();
      notifyListeners();
    }
  }

  /// Go to a specific word index
  void goToWord(int index) {
    if (index >= 0 && index < records.length) {
      _currentWordIndex = index;
      _saveState();
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
      case _UndoType.reassign:
        final word = records[_currentWordIndex];
        final snap = entry.groupSnapshot;
        final prevNum = entry.previousGroupNumber;
        if (snap != null && prevNum != null) {
          // Build reference map
          final byRef = <String, WordRecord>{
            for (final r in records) r.reference: r,
          };
          // Recreate or replace the previous group from snapshot
          final existingIdx = _toneGroups.indexWhere(
            (g) => g.groupNumber == prevNum,
          );
          final exemplarRef = snap['exemplarRef'] as String?;
          final membersRefs = (snap['members'] as List<dynamic>? ?? [])
              .map((e) => e.toString())
              .toList();
          final exemplar = exemplarRef != null ? byRef[exemplarRef] : null;
          if (exemplar != null) {
            final members = <WordRecord>[];
            for (final ref in membersRefs) {
              final rec = byRef[ref];
              if (rec != null) members.add(rec);
            }
            if (members.isEmpty || !members.contains(exemplar)) {
              if (!members.contains(exemplar)) {
                members.insert(0, exemplar);
              }
            }
            final restored =
                ToneGroup(
                    id:
                        (snap['id'] as String?) ??
                        (existingIdx != -1
                            ? _toneGroups[existingIdx].id
                            : const Uuid().v4()),
                    groupNumber: prevNum,
                    exemplar: exemplar,
                    members: members,
                    imagePath: snap['imagePath'] as String?,
                  )
                  ..additionsSinceReview =
                      (snap['additionsSinceReview'] as int?) ?? 0
                  ..requiresReview = (snap['requiresReview'] as bool?) ?? false;

            if (existingIdx != -1) {
              _toneGroups[existingIdx] = restored;
            } else {
              _toneGroups.add(restored);
              _toneGroups.sort(
                (a, b) => a.groupNumber.compareTo(b.groupNumber),
              );
            }
          }
        }
        // Ensure the word is part of the previous group again
        if (entry.previousGroupNumber != null) {
          final prevGroup = _toneGroups.firstWhere(
            (g) => g.groupNumber == entry.previousGroupNumber,
            orElse: () => throw Exception('Previous group not found'),
          );
          prevGroup.addMember(word);
        }
        break;
    }

    notifyListeners();
    _saveState();
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
      // Share bytes directly to improve compatibility with some targets (e.g., Drive)
      final bytes = await File(zipPath).readAsBytes();
      final exportName = '${_bundleFileBaseName ?? 'tone_matching_xml'}.zip';
      await Share.shareXFiles(
        [XFile.fromData(bytes, mimeType: 'application/zip', name: exportName)],
        subject: 'Tone Matching XML',
        text: 'Original and updated XML from tone matching',
      );
    } finally {
      _setLoading(false);
    }
  }

  /// Prepare the share zip and return its file path without invoking the share sheet.
  /// Useful for workflows that want to save the file via a system file picker.
  Future<String> prepareShareZip() async {
    if (_bundleData == null) {
      throw Exception('No bundle loaded');
    }
    return await BundleService.createShareZip(_bundleData!, _toneGroups);
  }

  /// Suggested filename for the exported/share ZIP based on the imported bundle.
  String get suggestedExportFileName =>
      '${_bundleFileBaseName ?? 'tone_matching_xml'}.zip';

  /// Play audio for a word
  Future<void> playWord(WordRecord word) async {
    await _audioService.playWord(word, settings?.audioFileSuffix);
  }

  /// Remove a word from its current tone group (if any) and make it the
  /// current word to be reassigned to another group or a new group.
  void moveWordForReassignment(WordRecord word) {
    // Determine word index first for undo
    final idx = records.indexOf(word);
    // Build snapshot of previous group if any
    // Detach from current group if present
    final prevGroupNumber = word.toneGroup;
    bool wasExemplar = false;
    Map<String, dynamic>? snapshot;
    if (prevGroupNumber != null) {
      final gIndex = _toneGroups.indexWhere(
        (g) => g.groupNumber == prevGroupNumber,
      );
      if (gIndex != -1) {
        final group = _toneGroups[gIndex];
        wasExemplar = identical(group.exemplar, word);
        snapshot = {
          'id': group.id,
          'groupNumber': group.groupNumber,
          'imagePath': group.imagePath,
          'additionsSinceReview': group.additionsSinceReview,
          'requiresReview': group.requiresReview,
          'exemplarRef': group.exemplar.reference,
          'members': group.members.map((m) => m.reference).toList(),
        };
        group.removeMember(word);

        if (group.members.isEmpty) {
          // Remove the empty group entirely
          _toneGroups.removeAt(gIndex);
        } else if (wasExemplar) {
          // Rebuild the group with a new exemplar (first remaining member)
          final newExemplar = group.members.first;
          final remaining = List<WordRecord>.from(group.members);
          final replacement =
              ToneGroup(
                  id: group.id,
                  groupNumber: group.groupNumber,
                  exemplar: newExemplar,
                  members: remaining,
                  imagePath: group.imagePath,
                )
                ..additionsSinceReview = group.additionsSinceReview
                ..requiresReview = group.requiresReview;
          _toneGroups[gIndex] = replacement;
        }
      }
    }

    // Push undo entry capturing the previous group snapshot
    if (prevGroupNumber != null && snapshot != null) {
      _pushUndo(
        _UndoEntry.reassign(
          wordIndex: idx == -1 ? _currentWordIndex : idx,
          previousGroupNumber: prevGroupNumber,
          groupSnapshot: snapshot,
          wasExemplar: wasExemplar,
        ),
      );
    }

    // Clear assignment and focus this word as current for reassignment
    word.toneGroup = null;
    word.toneGroupId = null;
    // Ensure it's added to the unsorted queue exactly once (at front for immediate reassignment)
    _unsortedQueue.remove(word.reference);
    _unsortedQueue.insert(0, word.reference);
    // Make this the current word by index fallback as well
    if (idx != -1) {
      _currentWordIndex = idx;
    }
    _saveState();
    notifyListeners();
  }

  /// Stop audio playback
  Future<void> stopAudio() async {
    await _audioService.stop();
  }

  void _setLoading(bool value) {
    _isLoading = value;
    notifyListeners();
  }

  // --- Persistence helpers ---

  Future<String> _stateFilePath() async {
    if (_bundleData == null) {
      final appDir = await getApplicationDocumentsDirectory();
      return p.join(appDir.path, 'current_bundle', _stateFileName);
    }
    return p.join(_bundleData!.bundlePath, _stateFileName);
  }

  Future<void> _saveState() async {
    if (_bundleData == null) return;

    try {
      // Ensure images directory exists if any image is present
      final imagesDir = Directory(
        p.join(_bundleData!.bundlePath, BundleService.imagesFolderName),
      );
      if (!await imagesDir.exists()) {
        await imagesDir.create(recursive: true);
      }

      final data = <String, dynamic>{
        'currentWordIndex': _currentWordIndex,
        'unsortedQueue': List<String>.from(_unsortedQueue),
        'groups': _toneGroups.map((g) {
          final imageName = (g.imagePath != null && g.imagePath!.isNotEmpty)
              ? p.basename(g.imagePath!)
              : '';
          return {
            'id': g.id,
            'groupNumber': g.groupNumber,
            'image': imageName,
            'additionsSinceReview': g.additionsSinceReview,
            'requiresReview': g.requiresReview,
            'members': g.members.map((m) => m.reference).toList(),
          };
        }).toList(),
        // Persist user edits on records to re-apply even if groups change
        'records': records
            .where(
              (r) => (r.userSpelling != null && r.userSpelling!.isNotEmpty),
            )
            .map(
              (r) => {'reference': r.reference, 'userSpelling': r.userSpelling},
            )
            .toList(),
      };

      final filePath = await _stateFilePath();
      final dir = Directory(p.dirname(filePath));
      if (!await dir.exists()) {
        await dir.create(recursive: true);
      }

      // Write atomically: write to a temp file, then rename over the original.
      // Also keep a backup of the previous good state as state.json.bak.
      final tmpPath = '$filePath.tmp';
      final bakPath = '$filePath.bak';

      final tmpFile = File(tmpPath);
      await tmpFile.writeAsString(jsonEncode(data), flush: true);

      final finalFile = File(filePath);
      if (await finalFile.exists()) {
        try {
          // Copy current to .bak before replacing
          await finalFile.copy(bakPath);
        } catch (_) {}
      }
      // Rename temp into place (atomic on most filesystems)
      await tmpFile.rename(filePath);
    } catch (_) {
      // ignore persistence errors
    }
  }

  Future<bool> _loadSavedState() async {
    try {
      final filePath = await _stateFilePath();
      final file = File(filePath);
      if (!await file.exists()) return false;

      Map<String, dynamic> json;
      try {
        json = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      } catch (_) {
        // Try backup if primary is corrupted
        final bakFile = File('$filePath.bak');
        if (await bakFile.exists()) {
          json =
              jsonDecode(await bakFile.readAsString()) as Map<String, dynamic>;
        } else {
          rethrow;
        }
      }

      // Map references to records
      final byRef = <String, WordRecord>{
        for (final r in records) r.reference: r,
      };

      // Clear any existing assignments
      for (final r in records) {
        r.toneGroup = null;
        r.toneGroupId = null;
      }
      _toneGroups.clear();
      _unsortedQueue.clear();

      final groups = (json['groups'] as List<dynamic>? ?? []);
      for (final g in groups) {
        final mRefs = (g['members'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList();
        final members = <WordRecord>[];
        for (final ref in mRefs) {
          final rec = byRef[ref];
          if (rec != null) members.add(rec);
        }
        if (members.isEmpty) continue;

        final exemplar = members.first;
        final id = g['id'] as String? ?? const Uuid().v4();
        final groupNumber = g['groupNumber'] as int? ?? 0;
        final imageName = g['image'] as String?;
        final imagePath = (imageName != null && imageName.isNotEmpty)
            ? p.join(
                _bundleData!.bundlePath,
                BundleService.imagesFolderName,
                imageName,
              )
            : null;

        final tg = ToneGroup(
          id: id,
          groupNumber: groupNumber,
          exemplar: exemplar,
          imagePath: imagePath,
        );
        for (final m in members) {
          if (!identical(m, exemplar)) {
            tg.addMember(m);
          }
        }
        tg.additionsSinceReview = (g['additionsSinceReview'] as int?) ?? 0;
        tg.requiresReview = (g['requiresReview'] as bool?) ?? false;
        _toneGroups.add(tg);
      }

      // Re-apply any user spelling edits
      final recEdits = (json['records'] as List<dynamic>? ?? []);
      for (final e in recEdits) {
        final ref = (e as Map<String, dynamic>)['reference'] as String?;
        final spelling = e['userSpelling'] as String?;
        if (ref != null && spelling != null && spelling.isNotEmpty) {
          final r = byRef[ref];
          if (r != null) r.userSpelling = spelling;
        }
      }

      // Sort groups by group number for consistent UI
      _toneGroups.sort((a, b) => a.groupNumber.compareTo(b.groupNumber));

      // Restore queue if present, else compute from records (those without a group)
      final q = (json['unsortedQueue'] as List<dynamic>?);
      if (q != null) {
        for (final e in q) {
          final ref = e.toString();
          if (byRef.containsKey(ref)) _unsortedQueue.add(ref);
        }
      } else {
        for (final r in records) {
          if (r.toneGroup == null) _unsortedQueue.add(r.reference);
        }
      }

      // Restore index (legacy fallback only)
      final idx = (json['currentWordIndex'] as int?) ?? 0;
      _currentWordIndex = idx.clamp(
        0,
        records.isEmpty ? 0 : records.length - 1,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  void _advanceToNextUnsorted() {
    if (_unsortedQueue.isNotEmpty) {
      // Pop the head only if the currentWord matches the head (after assignment)
      final cw = currentWord;
      if (cw != null &&
          _unsortedQueue.isNotEmpty &&
          _unsortedQueue.first == cw.reference) {
        _unsortedQueue.removeAt(0);
      }
      // No need to change _currentWordIndex; currentWord derives from queue
    } else {
      // Fallback: advance index if queue empty but legacy index remains
      if (_currentWordIndex < records.length - 1) {
        _currentWordIndex++;
      }
    }
  }

  Future<void> _persistGroupImage(ToneGroup group, String sourcePath) async {
    if (_bundleData == null) return;
    try {
      final imagesDir = Directory(
        p.join(_bundleData!.bundlePath, BundleService.imagesFolderName),
      );
      if (!await imagesDir.exists()) {
        await imagesDir.create(recursive: true);
      }
      final ext = p.extension(sourcePath);
      final fileName = 'tone_group_${group.groupNumber}$ext';
      final destPath = p.join(imagesDir.path, fileName);
      await File(sourcePath).copy(destPath);
      group.imagePath = destPath;
      // Persist and notify so UI updates immediately after async copy completes
      await _saveState();
      notifyListeners();
    } catch (_) {
      // ignore copy errors
    }
  }

  /// Remove the exemplar image for a tone group (keeps any on-disk file).
  void removeToneGroupImage(ToneGroup group) {
    group.imagePath = null;
    _saveState();
    notifyListeners();
  }

  /// Reset sorting decisions for the current bundle without reloading it.
  Future<void> resetSorting() async {
    if (_bundleData == null) return;
    // Clear assignments and user edits
    for (final r in records) {
      r.toneGroup = null;
      r.toneGroupId = null;
      r.userSpelling = null;
    }
    _toneGroups.clear();
    _undoStack.clear();
    _currentWordIndex = 0;

    // Delete images directory
    final imagesDir = Directory(
      p.join(_bundleData!.bundlePath, BundleService.imagesFolderName),
    );
    if (await imagesDir.exists()) {
      try {
        await imagesDir.delete(recursive: true);
      } catch (_) {}
    }

    // Remove state file
    try {
      final path = await _stateFilePath();
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {}

    notifyListeners();
  }

  @override
  void dispose() {
    IntentService.dispose();
    _audioService.dispose();
    super.dispose();
  }
}

enum _UndoType { assign, createGroup, spelling, reassign }

class _UndoEntry {
  final _UndoType type;
  final int wordIndex;
  final int? previousGroupNumber;
  final int? newGroupNumber;
  final String? previousSpelling;
  // Snapshot of a group's state for reassign undo (nullable for other types)
  final Map<String, dynamic>? groupSnapshot;
  final bool? wasExemplar;

  _UndoEntry._({
    required this.type,
    required this.wordIndex,
    this.previousGroupNumber,
    this.newGroupNumber,
    this.previousSpelling,
    this.groupSnapshot,
    this.wasExemplar,
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

  factory _UndoEntry.reassign({
    required int wordIndex,
    required int previousGroupNumber,
    required Map<String, dynamic> groupSnapshot,
    required bool wasExemplar,
  }) => _UndoEntry._(
    type: _UndoType.reassign,
    wordIndex: wordIndex,
    previousGroupNumber: previousGroupNumber,
    groupSnapshot: groupSnapshot,
    wasExemplar: wasExemplar,
  );
}
