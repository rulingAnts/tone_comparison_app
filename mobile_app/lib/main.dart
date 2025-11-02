import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/app_state.dart';
import 'screens/home_screen.dart';
import 'package:tone_comparison_app/generated/app_localizations.dart';

void main() {
  runApp(const ToneMatchingApp());
}

class ToneMatchingApp extends StatelessWidget {
  const ToneMatchingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()
        ..initLocalization()
        ..initIntents(),
      builder: (context, _) {
        final appState = Provider.of<AppState>(context);
        return MaterialApp(
          title: 'Tone Matching',
          theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.blue),
          home: const HomeScreen(),
          debugShowCheckedModeBanner: false,
          locale: appState.locale,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
        );
      },
    );
  }
}

// Backward-compat alias: some older code/tests may still reference `MyApp`.
// Keep this lightweight shim so `const MyApp()` works the same as `ToneMatchingApp()`.
//class MyApp extends ToneMatchingApp {
//  const MyApp({super.key});
//}
