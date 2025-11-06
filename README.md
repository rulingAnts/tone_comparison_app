# Tone Matching App

A participatory phonology analysis tool for native speakers to compare and group words by tone melodies.

## Overview

This system helps linguists and native speakers conduct participatory phonology analysis by:
- **Simplifying the process** of grouping words with similar tone melodies
- **Using visual aids** (pictures) instead of technical terminology
- **Supporting multiple speakers** for validation and consensus building
- **Preserving data integrity** of existing phonology databases

Perfect for field linguists working on tone languages, orthography development, and phonological analysis.

## Project Structure

This repository contains four main components:

### 1. Mobile App (`mobile_app/`)
**Flutter application for Android and Windows Desktop**

Native speakers use this app to:
- Load phonological data bundles
- Listen to words and compare tone melodies
- Draw pictures representing each tone pattern
- Group words with similar tones
- Export results with tone group assignments

**Key Features:**
- Graphical, icon-based UI (minimal text)
- Camera integration for exemplar drawings
- Audio playback with replay capability
- Offline operation (no internet required)
- Preserves original XML encoding

### 2. Bundler App (`bundler_app/`)
**Electron desktop application for researchers**

Researchers use this app to:
- Configure phonological data bundles
- Select Dekereke XML files and audio files
- Define display settings and data mappings
- Filter by grammatical category and syllable pattern
- Generate bundle zip files for the mobile app

**Key Features:**
- Parse and validate XML files
- Audio file filtering and validation
- Reference number filtering
- Customizable field mappings
- Missing file reporting

### 3. Desktop Matching App (`desktop_matching_app/`)
**Electron desktop application for tone group assignment**

Users (native speakers or researchers) use this app to:
- Import .tncmp bundles created by the Bundler App
- Listen to words and assign them to tone groups
- Create tone groups with exemplar images
- Enter user spelling when required
- Review and manage tone group memberships
- Export results with tone group assignments

**Key Features:**
- Bundle import with session persistence
- Audio playback with multiple variant support
- Spelling gate for user-entered orthography
- Tone group pager with visual exemplars
- Member list with priority display (gloss > spelling > written form)
- Review prompting for group additions
- Export to ZIP with updated XML and metadata

### 4. Comparison App (`comparison_app/`)
**Electron desktop application for researchers**

Researchers use this app to:
- Import results from multiple native speakers
- Compare tone groupings across speakers
- Identify words with disagreements
- Find merged groups (same tone, different exemplars)
- Calculate agreement statistics

**Key Features:**
- Multi-speaker result comparison
- Disagreement detection
- Overlap analysis (>80% threshold)
- Visual results presentation
- Statistical summaries

## Requirements

### Mobile App
- Flutter SDK 3.0 or higher
- Dart 3.0 or higher
- Android device/emulator or Windows PC

### Desktop Apps
- Node.js 18 or higher
- npm (included with Node.js)
- Windows, macOS, or Linux

## Quick Start

### Installation

**1. Clone the repository:**
```bash
git clone https://github.com/rulingAnts/tone_matching_app.git
cd tone_matching_app
```

**2. Set up Mobile App:**
```bash
cd mobile_app
flutter pub get
flutter run  # For Android/Windows
```

**3. Set up Bundler App:**
```bash
cd bundler_app
npm install
npm start
```

**4. Set up Desktop Matching App:**
```bash
cd desktop_matching_app
npm install
npm start
```

**5. Set up Comparison App:**
```bash
cd comparison_app
npm install
npm start
```

### Basic Workflow

**Workflow A: Desktop Tone Assignment (Researcher or Speaker)**
1. Export data from Dekereke/phonology database as XML
2. Gather corresponding WAV audio files
3. Use Bundler App to create a .tncmp bundle
4. Use Desktop Matching App to assign words to tone groups
5. Export results when complete
6. Review tone group assignments

**Workflow B: Mobile Tone Assignment (Native Speaker)**
1. Export data from Dekereke/phonology database as XML
2. Gather corresponding WAV audio files
3. Use Bundler App to create a bundle
4. Transfer bundle to mobile device
5. Load bundle in Mobile App
6. Listen to first word, draw a picture of the tone pattern
7. For each subsequent word:
   - Listen to the word
   - Compare with existing tone groups
   - Add to matching group or create new group
8. Export results when complete

**Step 3: Review Results (Researcher)**
1. Import exported results
2. Use Comparison App if multiple speakers analyzed the same data
3. Review tone group assignments
4. Update phonology database

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** - Complete workflow and usage instructions
- **[Development Guide](docs/DEVELOPMENT.md)** - Setup and contribution guide
- **[Architecture](docs/ARCHITECTURE.md)** - Technical architecture and design
- **[Sample Data](docs/SAMPLE_DATA.md)** - Example XML structure and test data
- **[Contributing](CONTRIBUTING.md)** - How to contribute to the project

## Key Features

### For Native Speakers
- **Simple interface**: Icons and pictures, not technical terms
- **Natural workflow**: Compare sounds like you would naturally
- **Visual memory aids**: Draw your own pictures for each tone pattern
- **Flexible**: Add to existing groups or create new ones anytime
- **Portable**: Works offline on Android phones or Windows computers

### For Researchers
- **Data preservation**: Original XML structure and encoding maintained
- **Flexible filtering**: Work with specific grammatical categories or syllable patterns
- **Multi-speaker support**: Compare results from different speakers
- **Quality assurance**: Identify disagreements and validate groupings
- **Standards compatible**: Works with Dekereke XML format

## Technology Stack

- **Mobile App**: Flutter/Dart
- **Desktop Apps**: Electron/Node.js
- **Data Format**: XML (UTF-16), CSV
- **Audio Format**: WAV (16-bit or 24-bit)

## Use Cases

1. **Tone language phonology**: Identify surface tone melodies
2. **Orthography development**: Determine which tones need marking
3. **Dictionary work**: Classify words by tonal patterns
4. **Language documentation**: Record native speaker classifications
5. **Multi-dialect comparison**: Compare tone systems across dialects

## Screenshots

*(Screenshots would go here showing the actual UI)*

## Building for Distribution

**Mobile App (Android):**
```bash
cd mobile_app
flutter build apk --release
```

**Desktop Apps:**
```bash
cd bundler_app  # or comparison_app
npm run build
```

## Support

- **Issues**: [GitHub Issues](https://github.com/rulingAnts/tone_matching_app/issues)
- **Documentation**: See `docs/` folder
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)

## Roadmap

- [ ] Add group reorganization interface
- [ ] Implement periodic review workflow
- [ ] Add audio waveform visualization
- [ ] Support for iOS platform
- [ ] Cloud sync for multi-device workflows
- [ ] Automated consensus building from multi-speaker data

## License

Copyright (c) 2025. All rights reserved.

## Acknowledgments

Built for field linguists and native speakers working on tone language documentation and analysis.

Special thanks to the SIL community and Dekereke developers for the phonology database standards that this tool integrates with.
