import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/app_state.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const ToneMatchingApp());
}

class ToneMatchingApp extends StatelessWidget {
  const ToneMatchingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState(),
      child: MaterialApp(
        title: 'Tone Matching',
        theme: ThemeData(primarySwatch: Colors.blue, useMaterial3: true),
        home: const HomeScreen(),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

// Backward-compat alias: some older code/tests may still reference `MyApp`.
// Keep this lightweight shim so `const MyApp()` works the same as `ToneMatchingApp()`.
//class MyApp extends ToneMatchingApp {
//  const MyApp({super.key});
//}
