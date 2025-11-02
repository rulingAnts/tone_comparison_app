import 'dart:io';
import 'package:just_audio/just_audio.dart';
import 'package:path/path.dart' as path;
import '../models/word_record.dart';

/// Service for playing audio files
class AudioService {
  final AudioPlayer _player = AudioPlayer();
  String? _bundlePath;

  /// Set the bundle path for audio files
  void setBundlePath(String bundlePath) {
    _bundlePath = bundlePath;
  }

  /// Play audio for a word record
  Future<void> playWord(WordRecord word, String? audioSuffix) async {
    if (_bundlePath == null) {
      throw Exception('Bundle path not set');
    }

    final soundFile = word.getSoundFilePath(audioSuffix);
    final audioPath = path.join(_bundlePath!, 'audio', soundFile);

    final file = File(audioPath);
    if (!await file.exists()) {
      throw Exception('Audio file not found: $audioPath');
    }

    await _player.setFilePath(audioPath);
    await _player.play();
  }

  /// Stop currently playing audio
  Future<void> stop() async {
    await _player.stop();
  }

  /// Dispose of the player
  void dispose() {
    _player.dispose();
  }
}
