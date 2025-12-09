# Tone Matching Suite - Unified Desktop App

**Version**: 3.0.0 (in development)  
**Status**: Phase 1 Complete ✅

## Overview

This is the unified desktop application that combines the functionality of:
- **Bundler App**: Create tone matching bundles from Dekereke XML + audio
- **Desktop Matching App**: Assign words to tone groups

## Architecture

### Structure
```
unified_desktop_app/
├── src/
│   ├── main.js          # Main Electron process
│   ├── preload.js       # Context bridge for IPC
│   └── utils/           # Shared utilities (will port from existing apps)
├── public/
│   ├── index.html       # Main window with tab navigation
│   ├── main-window.js   # Tab switching logic
│   └── views/
│       ├── bundler.html  # Bundler view (iframe)
│       └── matching.html # Matching view (iframe)
├── build/               # App icons and installer resources
└── package.json         # Dependencies merged from both apps
```

### Navigation

- **Tab-based interface** with two main views:
  - 📦 **Bundler**: Create bundles or linked bundles
  - 🎯 **Matching**: Assign words to tone groups

- **Keyboard shortcuts**:
  - `Cmd/Ctrl + 1`: Switch to Bundler view
  - `Cmd/Ctrl + 2`: Switch to Matching view

### IPC Architecture

All views communicate with the main process via IPC:

```javascript
window.electronAPI.bundler.selectXml()
window.electronAPI.bundler.createAndOpen(options)
window.electronAPI.matching.loadBundle()
window.electronAPI.switchView('bundler')
```

## Phase 1: Complete ✅

**What's working:**
- ✅ Project structure created
- ✅ Package.json with merged dependencies
- ✅ Main window with tab navigation
- ✅ Bundler view skeleton
- ✅ Matching view skeleton
- ✅ IPC handlers (stubs)
- ✅ Build configuration
- ✅ App icons copied

**What's stubbed:**
- Bundler functionality (will port in Phase 2)
- Matching functionality (will port in Phase 3)
- Direct bundle-to-matching flow (will implement in Phase 4)

## Development

### Run in development mode:
```bash
npm start
```

### Run with debugging:
```bash
npm run debug
```

### Build installers:
```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux

# All platforms
npm run build:all
```

## Next Steps

### Phase 2: Port Bundler Functionality
- Copy bundler UI components to `views/bundler.html`
- Port bundler IPC handlers from `bundler_app/src/main.js`
- Port bundler utilities (XML processing, archive creation)
- Test bundle creation workflow

### Phase 3: Port Matching Functionality
- Copy matching UI components to `views/matching.html`
- Port matching IPC handlers from `desktop_matching_app/src/main.js`
- Port matching utilities (session management, conservative XML writer)
- Copy localization system
- Test matching workflow

### Phase 4: Direct Bundle-to-Matching Flow
**NEW FEATURE**: Skip `.tnset` file for linked bundles
- Add "Create & Open in Matching" button to bundler view
- Pass bundle data in-memory between views
- Auto-switch to matching view when bundle created
- Initialize matching session without writing `.tnset` file
- Still support traditional "Export as .tnset" workflow

### Phase 5: Testing & Polish
- Integration testing
- Update documentation
- Create installers
- Version bump to 3.0.0

## Dependencies

Merged from both apps:
- `electron`: ^39.0.0
- `archiver`: ^6.0.1 (from both)
- `fast-xml-parser`: ^4.3.2 (from both)
- `adm-zip`: ^0.5.10 (from both)
- `ffmpeg-static`: ^5.2.0 (from bundler)
- `ffprobe-static`: ^3.1.0 (from bundler)
- `node-machine-id`: ^1.1.12 (from matching)

## Build Configuration

- **App ID**: `com.tonematching.suite`
- **Product Name**: Tone Matching Suite
- **Output**: `../dist/unified/`
- **Windows**: x64 NSIS installer
- **macOS**: Universal DMG (Intel + Apple Silicon)
- **Linux**: AppImage
