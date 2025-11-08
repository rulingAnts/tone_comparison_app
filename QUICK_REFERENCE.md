# Quick Reference

## Installation

### Mobile App
```bash
cd mobile_app
flutter pub get
flutter run
```

### Bundler App
```bash
cd bundler_app
npm install
npm start
```

### Comparison App
```bash
cd comparison_app
npm install
npm start
```

## Icon Assets

Desktop application icons are generated centrally with the script `icons/generate.js`.

Variants derived from the Android launcher artwork:
- `desktop_matching_app`: Base icon (three tone contour strokes + check mark).
- `bundler_app`: Base icon + open box overlay (represents packaging bundles).
- `comparison_app`: Base icon + balance scale overlay (represents weighing/comparing speakers).

Regenerate all desktop icons:
```bash
cd icons
npm install   # only needed after dependency changes
npm run generate
```

Outputs are written to each app's `build/` directory as `icon.png`, `icon.icns`, and `icon.ico` consumed by `electron-builder` during packaging.

## Workflow

### 1. Create Bundle (Bundler App)
1. Select XML file → Parse
2. Select audio folder
3. Configure settings:
   - Written form elements
   - Audio suffix (optional)
   - Reference numbers (optional)
   - User spelling settings
4. Select output file
5. Create Bundle

### 2. Analyze Tone (Mobile App)
1. Load Bundle
2. For each word:
   - Play audio
   - Compare with tone groups
   - Add to group OR create new group
   - Take picture for new groups
   - (Optional) Type spelling
3. Export Results

### 3. Compare Results (Comparison App)
1. Load result files from multiple speakers
2. Review statistics
3. Check disagreements
4. Identify merged groups

## File Formats

### Bundle.zip
```
├── data.xml          # Dekereke XML (UTF-16)
├── settings.json     # Configuration
└── audio/           # WAV files
```

### Result.zip
```
├── data.xml              # Updated XML
├── tone_groups.csv       # Summary
└── images/              # Exemplar photos
```

## Settings

### Default Values
- Written form: `Phonetic`
- User spelling element: `Orthographic`
- Tone group element: `SurfaceMelodyGroup`
- Audio suffix: (none)
- Show written form: Yes
- Require user spelling: No

## Key Concepts

### Tone Group
- Collection of words with similar tone melody
- Has one exemplar word
- Identified by a picture drawing
- Numbered 1, 2, 3, etc.

### Exemplar
- First word in a tone group
- Representative of the tone pattern
- Has an associated picture

### Bundle
- Package of data for analysis
- One grammatical category + syllable pattern
- Contains XML, audio, settings

## Common Tasks

### Filter by Reference Numbers
In Bundler App settings, enter one per line:
```
001
002
003
```

### Add Audio Suffix
If files are named `word-phon.wav` but XML has `word.wav`:
- Audio suffix: `-phon`

### Multiple Written Forms
Select multiple checkboxes in Bundler App:
- [x] Phonetic
- [x] Orthographic

App will use first available value.

## Troubleshooting

### "Audio file not found"
- Check audio folder path
- Verify file names match XML
- Check audio suffix setting

### "Failed to load bundle"
- Verify zip is not corrupted
- Check all required files present
- Recreate bundle

### "XML parsing error"
- Ensure UTF-16 encoding
- Validate XML structure
- Check for `<phon_data>` root

## Keyboard Shortcuts

### Mobile App (Desktop)
- Space: Play/pause audio
- Left/Right: Navigate words
- Enter: Confirm selection

### Desktop Apps
- Ctrl/Cmd+O: Open file
- Ctrl/Cmd+S: Save
- Ctrl/Cmd+W: Close window

## Data Flow

```
Dekereke DB
    ↓ Export XML + Audio
Bundler App
    ↓ Create bundle.zip
Mobile App (Speaker 1)
    ↓ Export result1.zip
Mobile App (Speaker 2)
    ↓ Export result2.zip
Comparison App
    ↓ Analysis
Final Classification
```

## Best Practices

### For Researchers
- Test bundles before distribution
- One category/pattern per bundle
- Use 2-3 speakers for validation
- Keep audio files organized

### For Speakers
- Listen multiple times
- Compare thoroughly
- Take breaks every hour
- Draw clear, distinctive pictures

## File Locations

### Mobile App
- Android: `/storage/emulated/0/Android/data/.../files/`
- Windows: `C:\Users\[user]\Documents\tone_matching_app\`

### Desktop Apps
- Settings: In app directory
- Exports: User-selected location

## Support

- Documentation: `docs/` folder
- Issues: GitHub Issues
- Email: (contact info)

## Quick Checks

Before distributing bundle:
- [ ] XML parses successfully
- [ ] All audio files found
- [ ] Reference numbers correct
- [ ] Settings configured
- [ ] Test load in mobile app

Before analyzing:
- [ ] Bundle loads correctly
- [ ] Audio plays
- [ ] Camera works
- [ ] Can create tone groups

Before comparing:
- [ ] Multiple result files available
- [ ] All from same word set
- [ ] Results exported successfully
