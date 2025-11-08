# Technical Architecture

This document describes the technical architecture of the Tone Matching App system.

## System Overview

The system consists of three independent applications that work together in a workflow:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Bundler App    │────>│   Mobile App     │────>│  Comparison App     │
│  (Electron)     │     │  (Flutter)       │     │  (Electron)         │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
   Researcher              Native Speaker           Researcher
   Creates bundles         Groups words             Compares results
```

## 1. Mobile App (Flutter)

### Platform Support
- Android (primary target)
- Windows Desktop (secondary target)
- Uses Flutter's cross-platform capabilities

### Architecture Pattern
- **State Management**: Provider pattern
- **Service Layer**: Separate services for business logic
- **Model Layer**: Immutable data models

### Key Components

#### Models
- `AppSettings`: Bundle configuration
- `WordRecord`: Individual phonological record
- `ToneGroup`: Tone melody group with exemplar

#### Services
- `XmlService`: Parse/write Dekereke XML (UTF-16)
- `BundleService`: Load/export zip bundles
- `AudioService`: Play WAV files using just_audio
- `AppState`: Central state management

#### Screens
- `HomeScreen`: Bundle loading
- `ToneMatchingScreen`: Main workflow

#### Widgets
- `ToneGroupCard`: Display tone group with exemplar image

### Data Flow

```
Bundle ZIP
    ├─> BundleService.loadBundle()
    ├─> XmlService.parseXml()
    ├─> Extract to app directory
    └─> AppState updates

User Actions
    ├─> Play audio: AudioService.playWord()
    ├─> Create group: AppState.createNewToneGroup()
    ├─> Add to group: AppState.addToToneGroup()
    └─> Export: BundleService.exportResults()

Export
    ├─> Update XML: XmlService.writeXml()
    ├─> Generate CSV
    ├─> Copy images
    └─> Create ZIP
```

### Key Technologies
- **archive**: ZIP handling
- **xml**: XML parsing/writing
- **just_audio**: Audio playback
- **image_picker**: Camera integration
- **provider**: State management
- **path_provider**: File system access

### Critical Requirements

1. **XML Preservation**: Must preserve original XML declaration and encoding
2. **UTF-16 Support**: Handle UTF-16 encoded XML files
3. **Audio Formats**: Support 16-bit and 24-bit WAV files
4. **File Paths**: Handle cross-platform path separators

## 2. Bundler App (Electron)

### Architecture
- **Main Process**: Node.js backend (main.js)
- **Renderer Process**: HTML/CSS/JS frontend
- **IPC**: Communication between processes

### Key Components

#### Main Process (main.js)
```javascript
- Window management
- File dialogs (XML, audio folder, output)
- XML parsing (fast-xml-parser)
- Bundle creation (archiver)
- Audio file filtering
```

#### Renderer Process (renderer.js)
```javascript
- UI event handling
- Form validation
- Settings collection
- Status display
```

### Data Flow

```
User Input
    ├─> Select XML: ipcRenderer.invoke('select-xml-file')
    ├─> Parse XML: ipcRenderer.invoke('parse-xml')
    ├─> Select audio folder
    ├─> Configure settings
    └─> Create bundle: ipcRenderer.invoke('create-bundle')

Bundle Creation
    ├─> Parse XML to find records
    ├─> Filter by reference numbers
    ├─> Collect matching audio files
    ├─> Create ZIP archive
    │   ├─> Add data.xml
    │   ├─> Add settings.json
    │   └─> Add audio/ folder
    └─> Report results (including missing files)
```

### Key Technologies
- **Electron**: Desktop application framework
- **archiver**: ZIP file creation
- **fast-xml-parser**: XML parsing
- **Node.js fs**: File system operations

### Bundle Format

```
bundle.zip
├── data.xml                 # Dekereke XML (UTF-16)
├── settings.json            # App configuration
└── audio/                   # WAV files
    ├── 001_word.wav
    ├── 002_word.wav
    └── ...
```

### Settings Schema

```json
{
  "writtenFormElements": ["Phonetic"],
  "showWrittenForm": true,
  "audioFileSuffix": null,
  "referenceNumbers": ["001", "002"],
  "requireUserSpelling": false,
  "userSpellingElement": "Orthographic",
  "toneGroupElement": "SurfaceMelodyGroup"
}
```

## 3. Comparison App (Electron)

### Architecture
Similar to Bundler App: Main + Renderer processes

### Key Components

#### Main Process
```javascript
- Result loading (adm-zip)
- XML parsing (fast-xml-parser)
- CSV parsing (fast-csv)
- Analysis algorithms
```

#### Renderer Process
```javascript
- Results display
- Statistics visualization
- Disagreement tables
- Merged group detection
```

### Analysis Algorithm

```
Load Results
    ├─> Extract each ZIP
    ├─> Parse XML for tone assignments
    ├─> Parse CSV for exemplar info
    └─> Build speaker-to-assignments map

Analyze
    ├─> Find all unique words
    ├─> For each word:
    │   ├─> Collect assignments from all speakers
    │   ├─> Check agreement
    │   └─> Flag disagreements
    └─> Find merged groups:
        ├─> Compare groups pairwise
        ├─> Calculate overlap percentage
        └─> Flag groups with >80% overlap

Display
    ├─> Statistics summary
    ├─> Speaker summaries
    ├─> Disagreement table
    └─> Merged groups list
```

### Key Technologies
- **Electron**: Desktop application framework
- **adm-zip**: ZIP extraction
- **fast-xml-parser**: XML parsing
- **fast-csv**: CSV parsing

### Result Format

```
result.zip
├── data.xml                      # Updated with tone groups
├── tone_groups.csv               # Summary
│   Columns: Tone Group, Reference Number, Written Form, Image File
└── images/
    ├── tone_group_1.jpg
    ├── tone_group_2.jpg
    └── ...
```

## Data Models

### XML Structure (Dekereke Format)

```xml
<?xml version="1.0" encoding="UTF-16"?>
<phon_data>
  <data_form>
    <Reference>001</Reference>
    <SoundFile>word.wav</SoundFile>
    <Phonetic>...</Phonetic>
    <!-- Other fields -->
    <SurfaceMelodyGroup>1</SurfaceMelodyGroup>  <!-- Added by app -->
  </data_form>
</phon_data>
```

### CSV Structure

```csv
Tone Group,Reference Number,Written Form,Image File
1,001,"párrót",tone_group_1.jpg
2,003,"háúsé",tone_group_2.jpg
```

## Security Considerations

### Mobile App
- File system access limited to app directories
- No network access required (offline operation)
- User-generated content (images) stored locally

### Desktop Apps
- File dialogs prevent arbitrary file access
- No external API calls
- Local file processing only

## Performance Considerations

### Mobile App
- Lazy loading of audio files
- Image compression for exemplar photos
- Incremental XML updates
- Bundle extraction caching

### Bundler App
- Streaming ZIP creation for large bundles
- Parallel audio file validation
- Progress reporting for long operations

### Comparison App
- Efficient data structures (Maps) for analysis
- Lazy rendering of large result sets
- Client-side processing (no server required)

## Error Handling

### XML Processing
- Validate structure before processing
- Preserve original encoding
- Handle malformed XML gracefully
- Report parsing errors with context

### File Operations
- Check file existence before operations
- Handle permission errors
- Validate ZIP contents
- Report missing audio files

### User Input
- Validate settings before bundle creation
- Prevent empty required fields
- Sanitize file paths
- Check disk space for exports

## Testing Strategy

### Unit Tests
- XML parsing/writing with encoding preservation
- Bundle creation and extraction
- Analysis algorithm correctness
- Data model validation

### Integration Tests
- End-to-end bundle creation
- Complete tone matching workflow
- Result export and import
- Multi-speaker comparison

### Platform Tests
- Android device testing
- Windows desktop testing
- File path compatibility
- Audio format support

## Future Enhancements

### Mobile App
- Offline sync across devices
- Group reorganization interface
- Periodic review workflow
- Audio comparison tools
- Progress persistence across sessions

### Bundler App
- Batch bundle creation
- Template settings
- Audio file preview
- Validation before creation

### Comparison App
- Manual conflict resolution
- Consensus export
- Visual image comparison
- Audio playback for disputed words
- Statistical analysis export

## Dependencies

### Mobile App (pubspec.yaml)
```yaml
flutter
archive: ^3.4.0
path_provider: ^2.1.1
file_picker: ^6.1.1
xml: ^6.4.2
just_audio: ^0.9.36
image_picker: ^1.0.5
provider: ^6.1.1
```

### Bundler App (package.json)
```json
electron: ^27.0.0
archiver: ^6.0.1
fast-xml-parser: ^4.3.2
```

### Comparison App (package.json)
```json
electron: ^27.0.0
adm-zip: ^0.5.10
fast-csv: ^5.0.1
fast-xml-parser: ^4.3.2
```

## Build and Deployment

### Mobile App

**Android:**
```bash
flutter build apk --release
```

**Windows:**
```bash
flutter build windows --release
```

### Desktop Apps

**All platforms:**
```bash
npm run build
```

Creates installers in `dist/` folder for the current platform.

## File Encoding Details

### XML Encoding
- **Input**: UTF-16 (Dekereke standard)
- **Processing**: Preserve original declaration
- **Output**: UTF-16 with original declaration

### CSV Encoding
- **Output**: UTF-8 (standard for CSV)

### JSON Encoding
- **Settings**: UTF-8 (JavaScript standard)

## Audio File Handling

### Supported Formats
- WAV (16-bit and 24-bit)
- Sample rates: Any (typically 44.1kHz or 48kHz)

### File Naming
- Base name from XML `<SoundFile>` element
- Optional suffix insertion: `name.wav` → `name-suffix.wav`

## State Management

### Mobile App State Flow

```
AppState (ChangeNotifier)
    ├─> bundleData (BundleData?)
    ├─> toneGroups (List<ToneGroup>)
    ├─> currentWordIndex (int)
    ├─> isLoading (bool)
    └─> error (String?)

UI subscribes via Consumer<AppState>
    └─> Rebuilds when notifyListeners() called

Actions update state and notify listeners:
    - loadBundle()
    - createNewToneGroup()
    - addToToneGroup()
    - nextWord()
    - exportResults()
```

## Conclusion

This architecture provides:
- **Separation of Concerns**: Three specialized apps for different roles
- **Offline Operation**: No server or internet required
- **Data Preservation**: Maintains original XML structure and encoding
- **Cross-Platform**: Works on Android and Windows
- **Extensibility**: Easy to add features or support new platforms
