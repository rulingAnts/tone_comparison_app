import 'dart:io';
import 'package:just_audio/just_audio.dart';
import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as path;
import '../models/word_record.dart';

/// Service for playing audio files
class AudioService {
  final AudioPlayer _player = AudioPlayer();
  String? _bundlePath;
  bool _initialized = false;

  /// Set the bundle path for audio files
  void setBundlePath(String bundlePath) {
    _bundlePath = bundlePath;
  }

  /// Play audio for a word record
  Future<void> playWord(WordRecord word, String? audioSuffix) async {
    if (_bundlePath == null) {
      throw Exception('Bundle path not set');
    }

    await _ensureInitialized();

    final resolvedPath = await _resolveAudioPath(word, audioSuffix);
    if (resolvedPath == null) {
      final attempted = path.join(
        _bundlePath!,
        'audio',
        word.getSoundFilePath(audioSuffix),
      );
      throw Exception('Audio file not found: $attempted');
    }

    try {
      debugPrint('AudioService: setFilePath -> $resolvedPath');
      await _player.stop();
      await _player.setFilePath(resolvedPath);
      await _player.play();
    } catch (e, st) {
      debugPrint('AudioService: play failed: $e\n$st');
      rethrow;
    }
  }

  /// Stop currently playing audio
  Future<void> stop() async {
    await _player.stop();
  }

  /// Dispose of the player
  void dispose() {
    _player.dispose();
  }

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());
    // Pause when headphones unplugged or other focus loss scenarios
    session.becomingNoisyEventStream.listen((_) {
      _player.pause();
    });
    _initialized = true;
  }

  /// Try to resolve the audio file path robustly:
  /// 1) exact match with suffix
  /// 2) exact match without suffix
  /// 3) case-insensitive match within the audio directory for either name
  Future<String?> _resolveAudioPath(
    WordRecord word,
    String? audioSuffix,
  ) async {
    final audioDir = path.join(_bundlePath!, 'audio');
    final withSuffix = word.getSoundFilePath(audioSuffix);
    final withoutSuffix = word.getSoundFilePath(null);

    String replaceExt(String name, String newExt) {
      final i = name.lastIndexOf('.');
      return i == -1 ? '$name$newExt' : name.substring(0, i) + newExt;
    }

    final candidates = <String>{
      withSuffix,
      withoutSuffix,
      replaceExt(withSuffix, '.flac'),
      replaceExt(withoutSuffix, '.flac'),
    };

    // 1) exact path exists
    for (final name in candidates) {
      final p = path.join(audioDir, name);
      if (await File(p).exists()) return p;
    }

    // 2) case-insensitive search over directory
    try {
      final dir = Directory(audioDir);
      if (!await dir.exists()) return null;
      final entries = await dir.list(followLinks: false).toList();
      final lowerTargets = candidates.map((e) => e.toLowerCase()).toSet();
      for (final e in entries) {
        if (e is File) {
          final name = path.basename(e.path).toLowerCase();
          if (lowerTargets.contains(name)) {
            return e.path;
          }
        }
      }
    } catch (e) {
      debugPrint('AudioService: error scanning audio dir: $e');
    }

    return null;
  }
}
