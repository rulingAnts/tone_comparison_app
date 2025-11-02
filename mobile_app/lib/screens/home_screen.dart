import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_selector/file_selector.dart';
import '../services/app_state.dart';
import 'tone_matching_screen.dart';
import 'package:tone_comparison_app/generated/app_localizations.dart';

/// Home screen for loading bundles
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.appTitle), actions: [_LanguageMenu()]),
      body: Center(
        child: Consumer<AppState>(
          builder: (context, appState, child) {
            if (appState.isLoading) {
              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text(l10n.home_loading),
                ],
              );
            }

            if (appState.error != null) {
              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(
                    appState.error!,
                    style: const TextStyle(color: Colors.red),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => _loadBundle(context, appState),
                    child: Text(l10n.home_tryAgain),
                  ),
                ],
              );
            }

            if (appState.bundleData != null) {
              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.check_circle, size: 64, color: Colors.green),
                  const SizedBox(height: 16),
                  Text(l10n.home_wordsLoaded(appState.records.length)),
                  const SizedBox(height: 32),
                  ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (context) => const ToneMatchingScreen(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.play_arrow),
                    label: Text(l10n.tm_start),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () => _loadBundle(context, appState),
                    icon: const Icon(Icons.folder_open),
                    label: Text(l10n.home_loadBundle),
                  ),
                ],
              );
            }

            return Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.music_note,
                  size: 128,
                  color: Theme.of(context).primaryColor,
                ),
                const SizedBox(height: 32),
                Text(
                  l10n.tm_title,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 16),
                Text(
                  l10n.home_openFromFiles,
                  style: const TextStyle(fontSize: 18),
                ),
                const SizedBox(height: 32),
                ElevatedButton.icon(
                  onPressed: () => _loadBundle(context, appState),
                  icon: const Icon(Icons.folder_open),
                  label: Text(l10n.home_loadBundle),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _loadBundle(BuildContext context, AppState appState) async {
    final XFile? file = await openFile(
      acceptedTypeGroups: const [
        XTypeGroup(extensions: ['tncmp']),
      ],
    );

    if (file != null && file.path.isNotEmpty) {
      await appState.loadBundle(file.path);
    }
  }
}

class _LanguageMenu extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    final l10n = AppLocalizations.of(context);
    final current = appState.locale?.languageCode;

    final labels = <String, String>{
      'en': 'English',
      'de': 'Deutsch',
      'nl': 'Nederlands',
      'es': 'Español',
      'pt': 'Português',
      'fr': 'Français',
      'it': 'Italiano',
      'af': 'Afrikaans',
      'ar': 'العربية',
      'zh': '中文',
      'id': 'Indonesia',
      'tpi': 'Tok Pisin',
    };

    return PopupMenuButton<String?>(
      icon: const Icon(Icons.language),
      tooltip: l10n.settings_language,
      initialValue: current,
      onSelected: (code) async {
        if (code == null) {
          await appState.setLocale(null);
        } else {
          await appState.setLocale(Locale(code));
        }
      },
      itemBuilder: (context) {
        return <PopupMenuEntry<String?>>[
          PopupMenuItem<String?>(
            value: null,
            child: Text(l10n.settings_systemDefault),
          ),
          const PopupMenuDivider(),
          ...AppLocalizations.supportedLocales.map((loc) {
            final code = loc.languageCode;
            return CheckedPopupMenuItem<String?>(
              value: code,
              checked: code == current,
              child: Text(labels[code] ?? code.toUpperCase()),
            );
          }),
        ];
      },
    );
  }
}
