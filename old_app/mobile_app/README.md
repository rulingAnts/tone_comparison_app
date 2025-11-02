# Tone Matching Mobile App

Flutter application for participatory phonology analysis - native speakers compare and group words by tone melody.

## Features

- Load phonological data bundles (zip files)
- Graphical UI with minimal text
- Audio playback for word comparison
- Camera integration for exemplar images
- Tone group management
- Export results (XML, CSV, images)
- Support for Android and Windows Desktop

## Requirements

- Flutter SDK 3.0 or higher
- Dart 3.0 or higher

## Getting Started

### Install Dependencies

```bash
flutter pub get
```

### Run on Android

```bash
flutter run
```

### Run on Windows Desktop

```bash
flutter run -d windows
```

### Build for Android

```bash
flutter build apk
```

### Build for Windows Desktop

```bash
flutter build windows
```

## Bundle Format

The app expects a zip bundle containing:

1. **settings.json** - Configuration file with:
   - `writtenFormElements`: Array of XML element names to display
   - `showWrittenForm`: Boolean to show/hide text
   - `audioFileSuffix`: Optional suffix for audio files
   - `referenceNumbers`: Array of reference numbers to include
   - `requireUserSpelling`: Boolean for user spelling input
   - `userSpellingElement`: XML element name for user spelling
   - `toneGroupElement`: XML element name for tone group assignment

2. **data.xml** - Dekereke XML file with:
   - Root element: `<phon_data>`
   - Record elements: `<data_form>`
   - Must contain `<Reference>` and `<SoundFile>` elements

3. **audio/** - Folder with WAV audio files

## Export Format

Results are exported as a zip file containing:

1. **data.xml** - Updated XML with tone group assignments
2. **tone_groups.csv** - Summary with columns:
   - Tone Group
   - Reference Number
   - Written Form
   - Image File
3. **images/** - Exemplar photos for each tone group

## Architecture

### Models
- `AppSettings` - Bundle configuration
- `WordRecord` - Individual word/data record
- `ToneGroup` - Tone melody group with exemplar

### Services
- `XmlService` - Parse and write Dekereke XML files
- `BundleService` - Load and export bundles
- `AudioService` - Play audio files
- `AppState` - Main application state management

### Screens
- `HomeScreen` - Load bundles
- `ToneMatchingScreen` - Main workflow for tone matching

### Widgets
- `ToneGroupCard` - Display tone group with exemplar and members
