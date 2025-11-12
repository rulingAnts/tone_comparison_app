# Tone Comparison App Suite - Comprehensive Technical Specification

## Overview

The Tone Comparison App Suite is a multi-platform system designed for linguistic fieldwork, specifically for analyzing and categorizing tonal patterns in under-resourced languages. The suite consists of five interconnected applications that work together to process XML lexical databases, assign words to tone groups through human review, and compare results across multiple reviewers to identify consensus and disagreement.

## Application Architecture

### 1. Bundler App (Desktop - Electron)
**Purpose**: Package XML databases and audio files into distributable bundles for field review.

**Tech Stack**:
- Electron (Node.js + Chromium)
- Fast-XML-Parser for XML manipulation
- AdmZip for archive creation
- UUID for unique bundle identification

**UI Structure**:
- Single-window application with three main sections:
  1. **XML Database Selection**: File picker for Dekereke XML database
  2. **Audio Folder Selection**: Directory picker for audio recordings
  3. **Settings Panel**: Configuration form with:
     - Bundle description (text input)
     - Language selection (dropdown, 12 languages supported)
     - Tone group element name (text input, e.g., "SurfaceMelodyGroup")
     - Tone group ID element name (text input, e.g., "SurfaceMelodyGroupId")
     - Audio variant selection (dropdown, parsed from XML)
     - Output directory selection

**Workflow**:
1. User selects XML database file containing lexical entries with `<Word>`, `<Ref>`, `<Sound>`, and custom tone fields
2. User selects folder containing audio files (MP3 format)
3. User configures settings:
   - Chooses UI language
   - Specifies which XML elements will store tone group assignments
   - Selects audio variant if multiple pronunciation forms exist
   - Sets bundle description
4. App validates that audio files exist for all words
5. App generates unique bundle ID (UUID v4)
6. App creates `.tncmp` archive containing:
   - `data.xml`: Original lexical database
   - `settings.json`: Configuration metadata
   - `audio/`: Folder with renamed audio files (using normalized Ref strings)
7. Bundle saved to output directory, ready for distribution

**Key Features**:
- Audio file validation with detailed error reporting
- Automatic audio filename normalization to handle special characters
- Ref string normalization (strips parentheses, collapses whitespace)
- Bundle ID generation for tracking data provenance
- Multi-language UI (12 languages via i18next)

**Data Structures**:

```json
// settings.json structure
{
  "bundleId": "uuid-v4-string",
  "bundleDescription": "User description",
  "language": "en",
  "toneGroupElement": "SurfaceMelodyGroup",
  "toneGroupIdElement": "SurfaceMelodyGroupId",
  "audioVariant": "selected-variant-name"
}
```

### 2. Mobile Matching App (Android - Flutter)
**Purpose**: Field-ready mobile application for assigning words to tone groups through audio playback and visual grouping.

**Tech Stack**:
- Flutter 3.x (Dart)
- just_audio for audio playback
- shared_preferences for persistent storage
- file_picker for bundle loading
- archive for ZIP extraction
- xml for XML parsing/generation
- csv for tone group export

**UI Structure**:

**Home Screen**:
- App bar with title and language selector
- "Load Bundle" button (prominent, centered)
- Bundle info card (shown after loading):
  - Bundle description
  - Number of words
  - Progress indicator
- "Start Matching" button (enabled after bundle load)

**Matching Screen** (Complex, multi-section layout):

*Top Section*:
- Progress bar showing completion percentage
- Word counter (e.g., "Word 45 of 312")

*Current Word Card* (Center, prominent):
- Large word display (vernacular spelling)
- "Confirm Spelling" button (if spelling differs from audio filename)
- Play button (circular, audio waveform icon)
- Audio loading indicator
- Reference number badge
- "Skip" button (bottom-right)

*Tone Groups Section* (Scrollable horizontal list):
- "Create New Group" button (always first)
- Group cards (each containing):
  - Group number badge (1, 2, 3...)
  - Exemplar word (largest word in vernacular)
  - Exemplar image (if assigned)
  - Exemplar audio play button
  - Word count badge
  - "Add to Group" button
  - Long-press menu:
    - View all words
    - Edit properties (name, image)
    - Delete group

*Recently Reviewed Section* (Below groups):
- Horizontal scrollable list of last 5-10 reviewed words
- Each shows: word text, assigned group number, mini play button
- Tap to reassign to different group

**Group Details Screen**:
- All words in the group (vertical list)
- Each word has play button and remove button
- Edit group properties (name, exemplar, image)
- Back navigation

**Workflow**:
1. User loads `.tncmp` bundle from device storage
2. App extracts bundle to temporary directory
3. App parses XML, loads audio files, reads settings
4. App checks for saved session (auto-restore if bundle ID matches)
5. Matching screen displays first unreviewed word
6. User plays audio for current word
7. User either:
   - Creates new tone group (word becomes exemplar)
   - Adds word to existing group (comparing audio)
   - Skips word (returns to queue later)
8. User can confirm/edit spelling if it differs from expected
9. App auto-saves session after each assignment
10. User can review/edit groups at any time
11. When complete, user exports to ZIP containing:
    - `data_original.xml`: Unchanged original
    - `data_updated.xml`: XML with tone group assignments
    - `tone_groups.csv`: Human-readable summary
    - `images/`: Exemplar images for each group
    - `meta.json`: Export metadata with device ID and timestamp

**Key Features**:
- **Persistent Session Management**: Auto-saves after every action, survives app crashes
- **Audio Playback Controls**: Play/pause, loading states, error handling
- **Spelling Confirmation**: Handle discrepancies between written and audio filenames
- **Visual Grouping**: Drag-and-drop style workflow with visual group cards
- **Exemplar Selection**: Automatic exemplar assignment (first word, or user-selected)
- **Image Assignment**: Users can assign images to groups for visual reference
- **Undo/Reassign**: Recently reviewed words can be quickly reassigned
- **Progress Tracking**: Visual progress bar and word count
- **Export**: Generates ZIP with updated XML and metadata
- **Re-import**: Can load previously exported bundles to continue work
- **Multi-language**: 12 language support via Flutter localization

**State Management**:
- `AppState` (Provider pattern): Manages bundle data, session, current word
- `BundleService`: Handles bundle loading, XML parsing, audio extraction
- `SessionStorage`: Persists assignments, spellings, progress via shared_preferences

**Data Structures**:

```dart
// Session storage structure
{
  "bundleId": "uuid",
  "groups": [
    {
      "groupId": "auto-increment-int",
      "groupNumber": 1,
      "words": ["ref1", "ref2"],
      "exemplarRef": "ref1",
      "groupName": "Optional name",
      "imagePath": "Optional path"
    }
  ],
  "userSpellings": {
    "ref1": "user-corrected-spelling"
  },
  "currentIndex": 45,
  "skippedWords": ["ref99"],
  "selectedAudioVariant": "variant-name",
  "language": "en"
}
```

```json
// meta.json in export
{
  "generatedAt": "2025-11-12T10:30:00Z",
  "bundleId": "uuid",
  "bundleDescription": "Description",
  "deviceId": "android-device-id"
}
```

### 3. Desktop Matching App (Desktop - Electron)
**Purpose**: Desktop version of matching app for office/lab work with larger screen real estate.

**Tech Stack**:
- Electron (Node.js + Chromium)
- Fast-XML-Parser for XML processing
- AdmZip/Archiver for bundle handling
- node-machine-id for unique device identification
- HTML5 Audio API for playback
- Vanilla JavaScript (no framework)

**UI Structure** (Single-page application):

**Welcome Screen**:
- App title and description
- Language selector (dropdown, top-right)
- "Load Bundle" button (large, centered)
- Recent bundles list (if any)

**Main Matching Interface** (After bundle load):

*Header*:
- Bundle description
- Progress: "Word X of Y (Z% complete)"
- Settings dropdown (language, audio variant)
- Export button
- Reset Session button (with confirmation dialog)

*Left Panel* (Current Word):
- Large word display (vernacular)
- Reference number
- Play button (spacebar shortcut)
- Audio waveform visualization (optional)
- Spelling edit field with confirm button
- Skip button

*Center Panel* (Tone Groups - Grid Layout):
- "Create New Group" card (always top-left)
- Group cards (2-3 columns, responsive):
  - Group number badge
  - Exemplar word (large)
  - Play exemplar button
  - Word count
  - Small word list preview (first 3-5 words)
  - "Add Word" button
  - Gear icon (edit menu):
    - Rename group
    - Change exemplar
    - Assign image
    - View all words
    - Delete group

*Right Panel* (Recent & Queue):
- Recently assigned words (last 10)
  - Each shows: word, group, play button, reassign button
- Skip queue (words user skipped)
  - Each shows: word, play button, review button

**Dialogs**:
- **Group Detail Modal**: Shows all words in group with play/remove buttons
- **Spelling Edit Modal**: Confirm spelling changes with before/after comparison
- **Image Selection Modal**: File picker for assigning exemplar images
- **Export Confirmation**: Shows export path and success message
- **Reset Confirmation**: Warning that action cannot be undone

**Workflow**:
- Identical to mobile app workflow (see Mobile Matching App section)
- Additional keyboard shortcuts:
  - Spacebar: Play audio
  - Enter: Add to selected group
  - N: Create new group
  - S: Skip current word
  - Arrows: Navigate groups

**Key Features**:
- **Session Persistence**: Auto-saves to `{userData}/desktop_matching_session.json`
- **Re-import Support**: Detects `data_updated.xml` in bundles and reconstructs tone groups
- **Keyboard Navigation**: Full keyboard support for power users
- **Larger Display**: Shows more groups simultaneously than mobile
- **Image Support**: Drag-and-drop or file picker for exemplar images
- **Export with Machine ID**: Uses node-machine-id for consistent device tracking
- **Reset Session**: Clear all groups and start fresh while keeping bundle loaded

**Session Storage Location**:
- macOS: `~/Library/Application Support/desktop-matching-app/desktop_matching_session.json`
- Windows: `%APPDATA%/desktop-matching-app/desktop_matching_session.json`
- Linux: `~/.config/desktop-matching-app/desktop_matching_session.json`

### 4. Comparison App (Desktop - Electron)
**Purpose**: Analyze multiple tone group assignments from different reviewers to identify agreement, disagreement, and unassigned words.

**Tech Stack**:
- Electron (Node.js + Chromium)
- Fast-XML-Parser for XML comparison
- AdmZip for bundle extraction
- CSV parsing for tone group summaries
- Vanilla JavaScript with modular rendering

**UI Structure**:

**Main Screen**:
- Title: "Tone Comparison Analysis"
- Language selector (top-right)
- "Load Bundles" button (accepts multiple .zip files)

**Analysis Results Screen** (After loading 2+ bundles):

*Header*:
- Number of bundles loaded
- Total words analyzed
- Agreement percentage (large, prominent)

*Statistics Cards* (Top row):
- **Full Agreement**: Words where all reviewers assigned same tone group
  - Count and percentage
  - Color-coded (green)
- **Partial Agreement**: Words where some reviewers agree
  - Count and percentage
  - Color-coded (yellow)
- **Disagreement**: Words with no agreement
  - Count and percentage
  - Color-coded (red)
- **Unassigned**: Words not assigned by at least one reviewer
  - Count and percentage
  - Color-coded (gray)

*Detailed Results Sections* (Tabbed or expandable):

**Agreement Section**:
- Table with columns:
  - Word (vernacular)
  - Reference number
  - Agreed tone group number
  - Number of reviewers in agreement
  - Device IDs of agreeing reviewers
- Sortable by any column
- Search/filter functionality

**Disagreement Section**:
- Table with columns:
  - Word (vernacular)
  - Reference number
  - Reviewer 1 assignment (group number + device ID)
  - Reviewer 2 assignment
  - Reviewer N assignment (dynamically adds columns)
  - Play audio button
- Click row to expand details:
  - Show exemplar words from each conflicting group
  - Show which other words are in each group
  - Play audio for exemplars
- Color-coded cells show which assignments conflict

**Unassigned Section**:
- Table with columns:
  - Word (vernacular)
  - Reference number
  - Reviewer 1 status (assigned group or "Unassigned")
  - Reviewer 2 status
  - Reviewer N status
  - Play audio button
- Filter: Show only words unassigned by all reviewers vs. some reviewers

**Export Options**:
- Export analysis report (CSV)
- Export disagreements only (CSV)
- Export unassigned words (CSV)
- Export full comparison matrix (CSV)

**Workflow**:
1. User loads 2+ exported ZIP bundles from matching apps
2. App extracts each bundle to temporary directory
3. App parses `data_updated.xml` from each bundle
4. App extracts device ID from `meta.json` in each bundle
5. App cross-references words by normalized Ref string
6. App compares tone group assignments across all reviewers:
   - Normalizes group numbers (different reviewers may use different numbers)
   - Identifies groups by their member words, not numbers
   - Calculates agreement: words assigned to equivalent groups
7. App generates statistics:
   - Full agreement: All reviewers assigned word to groups with same members
   - Partial agreement: Some reviewers agree, others differ
   - Disagreement: No consistent grouping pattern
   - Unassigned: Word missing from at least one reviewer's assignments
8. App displays results in organized sections
9. User reviews disagreements, can play audio to adjudicate
10. User exports reports for further analysis or documentation

**Key Features**:
- **Multi-bundle Loading**: Handles arbitrary number of reviewers
- **Smart Group Comparison**: Matches groups by member words, not arbitrary numbers
- **Device Tracking**: Shows which device/reviewer made which assignment
- **Audio Playback**: Integrated audio player for reviewing disagreements
- **Unassigned Detection**: Identifies words that weren't reviewed
- **Export Reports**: Generates CSV reports for external analysis
- **Visual Statistics**: Color-coded cards show agreement levels at a glance
- **Drill-down Details**: Click rows to see full context of disagreements

**Comparison Algorithm**:
```javascript
// Pseudocode for group comparison
function compareGroups(bundle1, bundle2) {
  const wordMap = {};
  
  // Build word map with all assignments
  for (const word of allWords) {
    wordMap[word.ref] = {
      word: word.vernacular,
      ref: word.ref,
      assignments: []
    };
  }
  
  // Add assignments from each bundle
  for (const bundle of [bundle1, bundle2, ...]) {
    for (const word of bundle.words) {
      if (word.toneGroup) {
        wordMap[word.ref].assignments.push({
          deviceId: bundle.deviceId,
          groupNumber: word.toneGroup,
          groupMembers: bundle.getGroupMembers(word.toneGroup)
        });
      } else {
        wordMap[word.ref].assignments.push({
          deviceId: bundle.deviceId,
          unassigned: true
        });
      }
    }
  }
  
  // Analyze each word
  for (const ref in wordMap) {
    const word = wordMap[ref];
    
    // Check for unassigned
    if (word.assignments.some(a => a.unassigned)) {
      word.status = 'unassigned';
      continue;
    }
    
    // Compare group memberships
    const firstGroup = word.assignments[0].groupMembers;
    const allMatch = word.assignments.every(a => 
      setsEqual(a.groupMembers, firstGroup)
    );
    
    if (allMatch) {
      word.status = 'agreement';
    } else {
      // Check for partial agreement
      const agreementCount = countAgreements(word.assignments);
      if (agreementCount > 1) {
        word.status = 'partial';
      } else {
        word.status = 'disagreement';
      }
    }
  }
  
  return wordMap;
}
```

### 5. Web Documentation (GitHub Pages)
**Purpose**: Public-facing documentation website explaining the app suite.

**Tech Stack**:
- Static HTML/CSS/JavaScript
- Hosted on GitHub Pages
- Responsive design (mobile-friendly)

**Structure**:
- **Hero Section**: App suite title, tagline, download buttons
- **Overview**: What the app suite does, who it's for
- **Workflow Diagram**: Visual representation of bundler → matching → comparison flow
- **Feature Highlights**: Key capabilities of each app
- **Screenshots**: Annotated screenshots of each app's UI
- **Download Section**: Links to releases (APK, DMG, EXE, AppImage)
- **Quick Start Guide**: Step-by-step tutorial
- **Technical Specs**: System requirements, supported formats
- **FAQ**: Common questions and troubleshooting
- **Contact/Support**: Links to GitHub issues, documentation

**Key Content**:
- Installation instructions for each platform
- Video tutorials (embedded YouTube/Vimeo)
- Sample data bundles for testing
- Changelog/release notes
- License information (MIT)

## Data Flow Architecture

### Complete Workflow:

```
1. BUNDLER APP (Desktop)
   Input: XML database + audio folder
   Output: bundle.tncmp
   ↓
2. MATCHING APP (Mobile or Desktop)
   Input: bundle.tncmp
   Output: result.zip (with data_updated.xml, tone_groups.csv, images/, meta.json)
   ↓
3. [Optional] MATCHING APP (Re-import for further review)
   Input: result.zip (renamed to result.tncmp)
   Output: result_v2.zip (updated assignments)
   ↓
4. COMPARISON APP (Desktop)
   Input: multiple result.zip files from different reviewers
   Output: analysis report (CSV) + UI display
```

### File Format Specifications:

**XML Structure (Dekereke format)**:
```xml
<Database>
  <Entry>
    <Word>vernacular_word</Word>
    <Ref>123.4.5</Ref>
    <Sound FileName="audio_123_4_5.mp3">
      <Variant Name="careful">audio_123_4_5_careful.mp3</Variant>
      <Variant Name="fast">audio_123_4_5_fast.mp3</Variant>
    </Sound>
    <SurfaceMelodyGroup></SurfaceMelodyGroup> <!-- Populated by matching app -->
    <SurfaceMelodyGroupId></SurfaceMelodyGroupId> <!-- Populated by matching app -->
    <!-- Other fields: Gloss, PartOfSpeech, etc. -->
  </Entry>
</Database>
```

**CSV Format (tone_groups.csv)**:
```csv
Group Number,Exemplar Word,Exemplar Ref,Word Count,Words,Refs
1,mbàra,45.2.1,12,"mbàra, ndòŋa, kpàla, ...","45.2.1, 45.3.7, 46.1.2, ..."
2,kúrú,46.8.3,8,"kúrú, lúmú, túŋú, ...","46.8.3, 47.1.5, 47.2.9, ..."
```

## Internationalization

**Supported Languages** (12 total):
1. English (en)
2. Indonesian (id)
3. Tok Pisin (tpi)
4. German (de)
5. French (fr)
6. Spanish (es)
7. Portuguese (pt)
8. Italian (it)
9. Dutch (nl)
10. Afrikaans (af)
11. Arabic (ar)
12. Chinese (zh)

**Implementation**:
- Desktop apps: i18next with JSON locale files
- Mobile app: Flutter localization (ARB files)
- All UI text externalized, no hardcoded strings
- Dynamic language switching without restart
- Locale files organized by app and feature

## Platform Support

**Mobile Matching App**:
- Android 5.0+ (API 21+)
- ARM and ARM64 architectures
- Minimum 2GB RAM recommended
- ~50MB app size + bundle storage

**Desktop Apps** (Bundler, Matching, Comparison):
- **macOS**: 10.13+ (High Sierra and later)
  - Intel and Apple Silicon (universal binary)
  - DMG installer
- **Windows**: Windows 10/11
  - 64-bit only
  - NSIS installer (EXE)
- **Linux**: Ubuntu 20.04+, Debian 10+, Fedora 32+
  - AppImage (portable)
  - Supports both X11 and Wayland

## Security & Privacy

**Data Handling**:
- All processing done locally (no cloud upload)
- Session data stored in platform-specific secure locations
- No telemetry or analytics
- No network requests (fully offline capable)
- Audio files never leave device unless explicitly exported

**Device IDs**:
- Mobile: Android device ID (persistent, anonymous)
- Desktop: Machine ID from hardware UUID (persistent, anonymous)
- Used only for tracking data provenance in exports
- No personal information collected

## Build & Deployment

**Bundler App**:
```bash
cd bundler_app
npm install
npm run build:mac    # macOS DMG
npm run build:win    # Windows installer
npm run build:linux  # Linux AppImage
```

**Desktop Matching App**:
```bash
cd desktop_matching_app
npm install
npm run build:mac
npm run build:win
npm run build:linux
```

**Comparison App**:
```bash
cd comparison_app
npm install
npm run build:mac
npm run build:win
npm run build:linux
```

**Mobile Matching App**:
```bash
cd mobile_app
flutter pub get
flutter build apk --release  # Android APK
flutter build appbundle      # Google Play bundle
```

**GitHub Pages**:
- Hosted from `docs/` directory
- Auto-deploys on push to main branch
- Static files (HTML/CSS/JS)

## Icons & Branding

**Base Icon** (from Android app):
- Blue rounded square background (#1976D2)
- White tone contour lines (three curves)
- White checkmark symbol
- 1024x1024 source PNG

**App-Specific Variations**:
- **Desktop Matching**: Base icon (no overlay)
- **Bundler**: Base + brown cardboard box overlay (60%, top-left)
  - Open flaps, isometric view, visible interior
  - Represents packaging/bundling
- **Comparison**: Base + golden balance scale overlay (60%, top-left)
  - Two pans, centered pivot, subtle shadow
  - Represents weighing/comparing options

**Icon Formats**:
- PNG: 1024x1024 (source)
- ICNS: macOS multi-resolution icon
- ICO: Windows multi-resolution icon
- Android: Adaptive icon layers (XML vectors)

**Generation**:
```bash
cd icons
npm install
npm run generate  # Generates all formats for all apps
```

## Testing Strategy

**Unit Tests**:
- Ref string normalization
- XML parsing edge cases
- Group comparison algorithm
- Audio file validation

**Integration Tests**:
- Bundle creation → extraction → re-export
- Session save → load → resume
- Multi-reviewer comparison with various agreement patterns

**Manual Testing Checklist**:
- Load bundle with missing audio files (should show errors)
- Assign word to group, close app, reopen (should restore session)
- Export bundle, rename to .tncmp, re-import (should load groups)
- Load 3+ bundles in comparison app (should show all reviewers)
- Change language (should update all UI text)
- Play audio while switching groups (should stop previous audio)

## Error Handling

**Bundler App**:
- Missing audio files: Show detailed list, prevent export
- Malformed XML: Display parse errors with line numbers
- Disk space: Check before creating bundle, warn if insufficient
- Invalid settings: Validate element names exist in XML

**Matching Apps**:
- Corrupted bundle: Show error message, allow loading different bundle
- Missing audio file: Skip word with warning, continue session
- Session load failure: Offer to start fresh or restore from backup
- Export failure: Retry logic, temp file cleanup

**Comparison App**:
- Bundle format mismatch: Detect and report incompatible bundles
- Missing meta.json: Use filename as device ID fallback
- XML structure differences: Handle optional fields gracefully
- Zero agreement: Still display results, flag potential data issues

## Performance Considerations

**Mobile App**:
- Lazy load audio (don't load all files into memory)
- Debounce session saves (max 1 save per 500ms)
- Paginate large word lists (render only visible items)
- Compress session JSON with gzip if >1MB

**Desktop Apps**:
- Stream large XML files (don't load entire tree into memory)
- Use Web Workers for XML parsing in Electron
- Cache audio buffers for recently played files
- Limit recent words list to 50 items max

**Comparison App**:
- Process bundles sequentially to avoid memory spikes
- Use generator functions for large word comparisons
- Virtualize long tables (render only visible rows)
- Export CSV in chunks for large datasets

## Future Enhancements (Not Yet Implemented)

**Potential Features**:
- Cloud sync for collaboration (Firebase/Supabase integration)
- Real-time collaborative matching (WebRTC)
- Machine learning suggestions (TensorFlow Lite)
- Waveform visualization for audio comparison
- Undo/redo stack with history
- Bulk operations (move multiple words between groups)
- Custom keyboard shortcuts configuration
- Dark mode theme
- Accessibility improvements (screen reader support)
- iPad/tablet optimized UI
- Web-based version (PWA)

## Repository Structure

```
tone_comparison_app/
├── bundler_app/          # Desktop bundler (Electron)
│   ├── src/
│   │   ├── main.js       # Main process
│   │   └── utils/
│   ├── public/
│   │   ├── index.html
│   │   ├── renderer.js   # UI logic
│   │   └── locales/      # i18next translations
│   └── package.json
├── desktop_matching_app/ # Desktop matcher (Electron)
│   ├── src/
│   │   └── main.js
│   ├── public/
│   │   ├── index.html
│   │   ├── renderer.js
│   │   └── locales/
│   └── package.json
├── comparison_app/       # Desktop comparison (Electron)
│   ├── src/
│   │   └── main.js
│   ├── public/
│   │   ├── index.html
│   │   ├── renderer.js
│   │   └── locales/
│   └── package.json
├── mobile_app/           # Android matcher (Flutter)
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/      # UI screens
│   │   ├── services/     # Business logic
│   │   ├── models/       # Data models
│   │   └── l10n/         # Localization (ARB)
│   └── android/
├── icons/                # Icon generation
│   ├── generate.js       # Icon rendering script
│   └── package.json
├── docs/                 # GitHub Pages site
│   ├── index.html
│   ├── styles.css
│   └── images/
└── README.md
```

---

This specification provides a complete blueprint for recreating the Tone Comparison App Suite, covering architecture, UI design, workflows, data structures, technical implementation, and deployment strategies across all five applications.
