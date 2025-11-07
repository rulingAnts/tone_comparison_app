# Desktop Matching App

Desktop application for tone group assignment and review on macOS, Windows, and Linux.

## Overview

The Desktop Matching App enables tone group assignment and review on desktop computers. It imports `.tncmp` bundles created by the Bundler App, allows users to group words by tone patterns with visual exemplars, and exports results with tone group assignments.

## Features

- **Import .tncmp bundles** created by the Bundler App
- **Audio playback** with multiple variant support
- **Spelling gate** for user-entered orthography (when required)
- **Tone group creation** with exemplar images
- **Word assignment** to tone groups
- **Member management** with priority display (gloss > spelling > written form)
- **Review prompting** when groups accumulate additions
- **Session persistence** across app restarts
- **Export to ZIP** with updated XML, original XML, images, and metadata

## Requirements

- Node.js 18 or higher
- npm (included with Node.js)
- macOS, Windows, or Linux

## Installation

```bash
cd desktop_matching_app
npm install
```

## Usage

### Running in Development Mode

```bash
npm start
```

### Running with Debug Logging

```bash
npm run debug
```

### Building for Distribution

**macOS:**
```bash
npm run build:mac
```

**Windows:**
```bash
npm run build:win
```

**Linux:**
```bash
npm run build:linux
```

**All Platforms:**
```bash
npm run build:all
```

Built packages will be in the `dist/` directory.

## Workflow

1. **Load Bundle**: Click "Load Bundle" and select a `.tncmp` file
2. **Review Current Word**: See written form, gloss, and play audio
3. **Confirm Spelling** (if required): Enter and confirm user spelling
4. **Create Groups**: Click "+ New Group" and optionally add exemplar image
5. **Assign Words**: Select a group and click "Add Word to Current Group"
6. **Manage Members**: Play audio for members or reassign them
7. **Review Groups**: Mark groups as reviewed after checking additions
8. **Export Results**: Click "Export Results" to create a ZIP bundle

## Keyboard Shortcuts

- **Space / Enter**: Play audio (when not typing)
- **Enter**: Confirm spelling (when typing in spelling input)
- **Escape**: Cancel spelling edit

## Bundle Format

The app expects `.tncmp` bundles with:

- `settings.json`: Configuration including:
  - `writtenFormElements`: Array of XML element names for written form
  - `showWrittenForm`: Boolean to show/hide written form
  - `requireUserSpelling`: Boolean to require user spelling input
  - `userSpellingElement`: XML element name for user spelling
  - `toneGroupElement`: XML element name for tone group number
  - `toneGroupIdElement`: XML element name for tone group GUID
  - `audioFileVariants`: Array of `{ description, suffix }` objects
  - `glossElement`: Optional XML element name for gloss
  - `bundleId`: Unique bundle identifier
  - `bundleDescription`: Optional bundle description

- `data.xml` or `data_updated.xml`: XML with `<phon_data>` and `<data_form>` elements
- `audio/`: Folder with audio files
- `images/`: Optional folder with images

## Export Format

The app exports ZIP files with:

- `data.xml`: Original XML from bundle
- `data_updated.xml`: XML with tone group assignments and user spelling
- `images/`: Folder with exemplar images from groups
- `meta.json`: Metadata including:
  - `bundleId`: Bundle identifier
  - `bundleDescription`: Bundle description
  - `generatedAt`: ISO timestamp
  - `platform`: "desktop"
- `settings.json`: Settings with legacy `audioFileSuffix` for compatibility

## Session Persistence

Session data is saved to `desktop_matching_session.json` in the user data directory:

- **macOS**: `~/Library/Application Support/desktop-matching-app/`
- **Windows**: `%APPDATA%/desktop-matching-app/`
- **Linux**: `~/.config/desktop-matching-app/`

Session includes:
- Current queue of unassigned words
- Selected audio variant
- Tone groups with members, images, and review status
- User spelling edits per word

## Troubleshooting

### macOS Gatekeeper

If you get a "cannot be opened because the developer cannot be verified" error:
1. Right-click (or Control-click) the app
2. Select "Open" from the menu
3. Click "Open" in the dialog

Or use Terminal:
```bash
xattr -cr /Applications/Tone\ Matching\ Desktop.app
```

### Windows SmartScreen

If you get a "Windows protected your PC" warning:
1. Click "More info"
2. Click "Run anyway"

### Audio Not Playing

- Ensure audio files exist in the bundle's `audio/` folder
- Check that file names match the `SoundFile` values in the XML
- Try different audio variants from the dropdown

### Bundle Won't Load

- Verify the bundle was created by the Bundler App
- Check that `settings.json` and `data.xml` exist in the bundle
- Review the error message for specific issues

## Development

The app uses:
- **Electron** for desktop framework
- **adm-zip** for bundle extraction
- **archiver** for export ZIP creation
- **fast-xml-parser** for XML parsing

### Project Structure

```
desktop_matching_app/
├── package.json              # Dependencies and build config
├── src/
│   ├── main.js              # Main process (IPC, persistence, export)
│   └── utils/
│       └── refUtils.js      # Reference utilities
├── public/
│   ├── index.html           # UI markup
│   └── renderer.js          # Renderer process (state, DOM, audio)
└── README.md                # This file
```

### Key IPC Handlers

- `select-bundle-file`: Open file dialog for bundle selection
- `load-bundle`: Extract and parse bundle
- `get-current-word`: Get next unassigned word
- `confirm-spelling`: Save user spelling
- `add-word-to-group`: Assign word to group
- `remove-word-from-group`: Unassign word for reassignment
- `create-group`: Create new tone group
- `update-group`: Update group properties
- `export-bundle`: Export results as ZIP

## Localization

The desktop app now supports runtime localization. Strings are defined in JSON locale files under `public/locales/`.

### How It Works

- `public/localization.js` loads `locales/<locale>.json` and applies translations to any element with a `data-i18n` attribute.
- Placeholder text is translated via `data-i18n-placeholder`.
- Dynamic strings (alerts, progress, etc.) use the helper `window.i18n.t(key, vars)`.
- The selected locale is persisted in the session (`session.locale`).
- Missing keys fall back to English. If a key is missing in both the current locale and English, the key name itself is displayed.

### Adding a New Locale

1. Copy `public/locales/en.json` to `public/locales/<lang>.json` (e.g., `fr.json`).
2. Replace the English values with translations. Keep interpolation tokens like `{number}`, `{completed}`, `{total}`, `{error}`, `{groupNumber}`, `{additions}`, `{outputPath}` intact.
3. Add an `<option>` for the locale code to the language selector `<select id="localeSelect">` in `index.html` if not present.
4. Run the app. Selecting the locale will reload translations immediately.

### RTL (Right-to-Left) Support

- The app automatically switches to RTL layout when the locale code is `ar`.
- Logic: `localization.js` sets `<html dir="rtl">` if the locale is in the RTL set.
- Minimal CSS overrides under `[dir="rtl"]` mirror flex row order for headers, member lists, spelling input, and audio controls.
- To add another RTL language (e.g., Hebrew `he`, Persian `fa`):
  1. Create `public/locales/he.json` (or `fa.json`).
  2. Add the locale code to the `rtlLocales` set in `localization.js`.
  3. Add an `<option value="he">Hebrew</option>` to the language selector.
  4. Provide translations; layout will auto-mirror.

If you need deeper RTL styling (e.g., icon direction changes or reorder of progress elements), extend the `[dir='rtl']` rules in `index.html` or move them to a dedicated stylesheet.

### Translation Tips

- Avoid adding trailing spaces; spacing/punctuation should be part of the localized string.
- Preserve placeholders exactly (case-sensitive inside braces).
- If a string shouldn't appear (e.g., feature not used), you may still leave the key with an empty value—English will be used as fallback.

### Keys Overview

See `en.json` for all current keys. Prefix `tm_` groups tone-matching flow strings and keeps parity with mobile app naming conventions.

## License

## License

Copyright (c) 2025. All rights reserved.
