import 'package:tone_comparison_app/generated/app_localizations.dart';

// Temporary fallbacks for newly added localization keys so the app compiles
// before codegen regenerates app_localizations.dart. Once l10n is regenerated,
// the real getters will shadow these extension members automatically.
extension AppLocalizationsFallbacks on AppLocalizations {
  String get tm_addWord_disabled_hint =>
      'Enter the spelling and tap the check to enable Add word.';
}
