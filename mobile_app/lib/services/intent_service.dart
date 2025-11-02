import 'dart:async';
import 'package:flutter/services.dart';
import 'app_state.dart';

class IntentService {
  static const _method = MethodChannel('app.intent/channel');
  static const _events = EventChannel('app.intent/events');
  static StreamSubscription? _sub;

  static Future<void> init(AppState appState) async {
    // Initial shared path if app launched via file intent
    try {
      final initialPath = await _method.invokeMethod<String>(
        'getInitialSharedPath',
      );
      if (initialPath != null && initialPath.isNotEmpty) {
        await appState.loadBundle(initialPath);
      }
    } catch (_) {}

    // Listen for new intents while app is running
    _sub ??= _events.receiveBroadcastStream().listen((event) async {
      if (event is String && event.isNotEmpty) {
        await appState.loadBundle(event);
      }
    }, onError: (_) {});
  }

  static Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
  }
}
