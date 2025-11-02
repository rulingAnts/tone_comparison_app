# Development Setup

This guide helps developers set up their environment to build and modify the Tone Matching App.

## Prerequisites

### For Mobile App (Flutter)
- Flutter SDK 3.0+ ([Install Flutter](https://flutter.dev/docs/get-started/install))
- Dart 3.0+
- Android Studio (for Android development)
- Visual Studio 2022 (for Windows desktop development)

### For Desktop Apps (Electron)
- Node.js 18+ ([Install Node.js](https://nodejs.org/))
- npm (comes with Node.js)

### Recommended Tools
- VS Code with extensions:
  - Flutter
  - Dart
  - ESLint
  - Prettier
- Git

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/rulingAnts/tone_matching_app.git
cd tone_matching_app
```

### 2. Mobile App Setup

```bash
cd mobile_app

# Install Flutter dependencies
flutter pub get

# Verify setup
flutter doctor

# Run on Android emulator or connected device
flutter run

# Or run on Windows
flutter run -d windows
```

### 3. Bundler App Setup

```bash
cd bundler_app

# Install npm dependencies
npm install

# Run in development mode
npm start

# Build for distribution
npm run build
```

### 4. Comparison App Setup

```bash
cd comparison_app

# Install npm dependencies
npm install

# Run in development mode
npm start

# Build for distribution
npm run build
```

## Development Workflow

### Mobile App Development

#### Running Tests
```bash
cd mobile_app
flutter test
```

#### Linting
```bash
flutter analyze
```

#### Format Code
```bash
flutter format lib/
```

#### Hot Reload
When running `flutter run`, press:
- `r` - Hot reload
- `R` - Hot restart
- `q` - Quit

#### Building

**Android APK:**
```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

**Android App Bundle:**
```bash
flutter build appbundle --release
# Output: build/app/outputs/bundle/release/app-release.aab
```

**Windows:**
```bash
flutter build windows --release
# Output: build/windows/runner/Release/
```

### Desktop Apps Development

#### Running in Dev Mode
```bash
# Bundler or comparison app
npm start
```

The app will reload when you make changes to the code.

#### Building

**Windows:**
```bash
npm run build
# Output: dist/Tone Matching Bundler Setup 1.0.0.exe
```

**macOS:**
```bash
npm run build
# Output: dist/Tone Matching Bundler-1.0.0.dmg
```

**Linux:**
```bash
npm run build
# Output: dist/Tone Matching Bundler-1.0.0.AppImage
```

## Project Structure

```
tone_matching_app/
├── mobile_app/                # Flutter mobile app
│   ├── lib/
│   │   ├── main.dart         # App entry point
│   │   ├── models/           # Data models
│   │   ├── services/         # Business logic
│   │   ├── screens/          # UI screens
│   │   └── widgets/          # Reusable widgets
│   ├── pubspec.yaml          # Flutter dependencies
│   └── README.md
│
├── bundler_app/              # Electron bundler app
│   ├── src/
│   │   └── main.js           # Electron main process
│   ├── public/
│   │   ├── index.html        # UI
│   │   └── renderer.js       # Renderer process
│   ├── package.json          # npm dependencies
│   └── README.md
│
├── comparison_app/           # Electron comparison app
│   ├── src/
│   │   └── main.js           # Electron main process
│   ├── public/
│   │   ├── index.html        # UI
│   │   └── renderer.js       # Renderer process
│   ├── package.json          # npm dependencies
│   └── README.md
│
├── docs/                     # Documentation
│   ├── USER_GUIDE.md
│   ├── ARCHITECTURE.md
│   ├── SAMPLE_DATA.md
│   └── DEVELOPMENT.md
│
├── .gitignore
└── README.md
```

## Code Style

### Dart/Flutter

Follow [Effective Dart](https://dart.dev/guides/language/effective-dart) guidelines:

```dart
// Good
class ToneGroup {
  final int groupNumber;
  
  ToneGroup({required this.groupNumber});
}

// Use const constructors where possible
const SizedBox(height: 16)

// Use single quotes for strings
const Text('Hello World')
```

### JavaScript

Follow standard JavaScript best practices:

```javascript
// Use const/let, not var
const settings = getSettings();
let index = 0;

// Use async/await for async operations
async function loadBundle() {
  const data = await readFile('bundle.zip');
  return data;
}

// Use descriptive names
function parseReferenceNumbers(text) {
  // ...
}
```

## Common Tasks

### Adding a New Dependency

**Flutter:**
```bash
cd mobile_app
flutter pub add package_name
flutter pub get
```

**Node.js:**
```bash
cd bundler_app  # or comparison_app
npm install --save package_name
```

### Updating Dependencies

**Flutter:**
```bash
flutter pub upgrade
```

**Node.js:**
```bash
npm update
```

### Debugging

**Flutter:**
```bash
flutter run --debug
```
Use VS Code debugger or Android Studio debugger.

**Electron:**
```bash
npm start
```
Open DevTools in the Electron window: View → Toggle Developer Tools

### Adding New Features

1. **Create a branch:**
   ```bash
   git checkout -b feature/new-feature-name
   ```

2. **Make changes and test:**
   - Write code
   - Add tests
   - Run tests and linting
   - Test manually

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "Add new feature: description"
   git push origin feature/new-feature-name
   ```

4. **Create pull request**

## Troubleshooting

### Flutter Issues

**"Flutter not found"**
```bash
# Verify Flutter is in PATH
flutter --version

# If not, add to PATH or reinstall Flutter
```

**"Android license not accepted"**
```bash
flutter doctor --android-licenses
```

**"CocoaPods not installed" (macOS)**
```bash
sudo gem install cocoapods
```

### Electron Issues

**"Cannot find module"**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

**Build fails**
```bash
# Clear electron-builder cache
rm -rf ~/Library/Caches/electron-builder  # macOS
rm -rf ~/.cache/electron-builder          # Linux
```

### General Issues

**Permission errors**
```bash
# On Unix systems
sudo chown -R $USER:$USER .
```

**Port already in use**
```bash
# Kill process on port (example: 3000)
kill $(lsof -t -i:3000)
```

## Testing

### Creating Test Data

See [SAMPLE_DATA.md](SAMPLE_DATA.md) for XML structure.

To create test audio files:
```bash
# Generate silent WAV files for testing
ffmpeg -f lavfi -i anullsrc -t 1 -ar 44100 -ac 1 -sample_fmt s16 test.wav
```

### Manual Testing Workflow

1. **Create test bundle:**
   - Prepare test XML and audio files
   - Use bundler app to create bundle
   - Verify bundle contents

2. **Test mobile app:**
   - Load bundle
   - Go through tone matching workflow
   - Export results
   - Verify exported files

3. **Test comparison app:**
   - Create multiple test results
   - Load into comparison app
   - Verify analysis results

## Continuous Integration

### GitHub Actions (Future)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test-mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: subosito/flutter-action@v2
      - run: cd mobile_app && flutter test

  test-bundler:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v3
      - run: cd bundler_app && npm install && npm test
```

## Release Process

### Mobile App

1. Update version in `pubspec.yaml`
2. Build release APK/AAB
3. Test on real devices
4. Upload to distribution channel

### Desktop Apps

1. Update version in `package.json`
2. Run `npm run build`
3. Test installers
4. Distribute to users

## Resources

### Flutter
- [Flutter Docs](https://flutter.dev/docs)
- [Dart Docs](https://dart.dev/guides)
- [Flutter Packages](https://pub.dev/)

### Electron
- [Electron Docs](https://www.electronjs.org/docs)
- [Electron Builder](https://www.electron.build/)

### Linguistics
- [SIL Phonology Tools](https://software.sil.org/)
- [Dekereke Documentation](https://software.sil.org/dekereke/)

## Getting Help

- Open an issue on GitHub
- Check existing documentation
- Review code comments
- Contact project maintainers

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## License

See [LICENSE](../LICENSE) for license information.
