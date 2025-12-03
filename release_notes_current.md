## ⚠️ Alpha Pre-Release

This is an **alpha** release and is expected to have bugs. Use with caution and maintain backups of your data.

## ✨ What Works Reliably

The **linked bundle workflow** is the most reliable feature:

1. **Setup in Bundler App**: Create your project and configure hierarchy settings
2. **Import to Matching App**: Import the resulting .tnset file
3. **Live XML Editing**: The matching app directly modifies your Dekereke XML database file as you make tone group assignments
4. **Direct Audio Access**: Audio files are accessed directly from the database audio folder (as specified in bundler settings)

## 🆕 New Features in v2.1.0

### Blank Value Handling
- Empty/blank/null values now display as **(blank)** in hierarchy trees and filter dropdowns
- Consistent handling across bundler and desktop matching apps
- Self-closing XML tags for blank values

### Multi-Word Move (Desktop Matching App)
- Select multiple words in the Manage Queue modal
- Move selected words together to different sub-bundles
- Queue modal auto-refreshes after moves

### Linked Bundle Persistence
- Linked .tnset bundles now maintain persistent state correctly

## 📦 Downloads

- **Desktop Matching App**: For tone group assignment and review
  - macOS (Universal): Tone Matching Desktop-2.1.0-mac-universal.dmg
  - Windows (ARM64): Tone Matching Desktop-2.1.0-win-arm64.exe

- **Bundler App**: For creating tone matching bundles
  - macOS (Universal): Tone Matching Bundler-2.1.0-mac-universal.dmg
  - Windows (ARM64): Tone Matching Bundler-2.1.0-win-arm64.exe

## ⚠️ Known Limitations

- This release is in alpha testing phase
- Some features may be unstable
- The linked bundle workflow is the most tested and reliable feature
- Always maintain backups of your XML database files
- **Localization not updated**: The new features in v2.1.0-alpha are only available in English. While the Desktop Matching App has localization built in for 12 languages, the UI strings for blank value handling and multi-word move features have not yet been translated. The alpha release is most reliable when used in English. Localization updates are planned for future releases, and contributions are welcome!

## 🐛 Report Issues

If you encounter bugs, please report them on the [Issues](https://github.com/rulingAnts/tone_comparison_app/issues) page.

