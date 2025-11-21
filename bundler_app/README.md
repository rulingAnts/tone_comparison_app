# Tone Matching Bundler

Electron desktop application for creating data bundles for the Tone Matching mobile app.

## Features

- Select and parse Dekereke XML files
- Configure display and audio settings
- Filter records by reference numbers
- Bundle XML, settings, and audio files into a zip package
- Validate audio file availability

## Requirements

- Node.js 18 or higher
- npm
- **Windows builds only**: FFmpeg static binaries (see below)

### FFmpeg for Windows Builds

If you're building the Windows installer, you'll need to provide FFmpeg binaries:

1. Download the ffmpeg-static zip from: https://github.com/eugeneware/ffmpeg-static/releases
   - Get the Windows x64 build (e.g., `ffmpeg-4.4.1-win32-x64.zip`)
2. Create a `win32-resources` folder in the project root if it doesn't exist
3. Rename the downloaded file to `ffmpeg-static.zip` and place it in `win32-resources/`

This file is excluded from git due to its size (28MB). The Mac and Linux builds use the `ffmpeg-static` npm package automatically.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run the Application

```bash
npm start
```

### Build for Distribution

```bash
npm run build
```

This will create installers in the `dist/` folder for your platform.

## Usage

### 1. Select XML File

Click "Browse" next to "XML File" and select your Dekereke XML file (UTF-16 format).

The app will parse the file and display:
- Number of records found
- Available field names for configuration

### 2. Configure Display Settings

**Written Form Elements**: Select which XML elements to display as text (e.g., Phonetic, Phonemic, Orthographic)
- You can select multiple elements
- The app will use the first non-empty value when displaying words

**Show written forms**: Check to display text to users, uncheck for audio-only mode

### 3. Configure Audio Settings

**Audio Folder**: Select the folder containing WAV audio files

**Audio File Suffix** (optional): Specify a suffix to add before the file extension
- Example: `-phon` will change `sound.wav` to `sound-phon.wav`
- Leave empty to use the base filename from the XML

### 4. Filter Records

**Reference Numbers**: Enter specific reference numbers to include
- One per line, or separated by commas/spaces
- Leave empty to include all records
- Only records matching these numbers will be bundled

### 5. Configure User Input

**Require user to type spelling**: Check to force users to enter their own spelling for each word

**Element to store user spelling**: XML element name where user-entered spelling will be saved (default: `Orthographic`)

**Element to store tone group assignment**: XML element name where tone group numbers will be saved (default: `SurfaceMelodyGroup`)

### 6. Audio Processing (optional)

Use the "Audio Processing" panel to enable bulk cleanup and format conversion:

- Auto-trim silence: Removes leading/trailing near-silence (~ -50 dB, ≥200 ms) with light padding
- Loudness normalize: Targets -16 LUFS with a safety limiter for more even playback loudness
- Convert to FLAC: Outputs processed audio as lossless FLAC (smaller than WAV). If off, processed audio stays 16‑bit WAV

If any option is enabled, the bundler uses ffmpeg via `modules/lite-normalizer.js` to batch process files. If processing encounters an error, the bundler falls back to original audio files so bundle creation can still complete.

The resulting bundles play in both the Desktop Matching App and the Android Mobile App; both support FLAC playback.

### 7. Create Bundle

1. Click "Browse" next to "Output Bundle File" to choose where to save the zip file
2. Click "Create Bundle"
3. The app will:
   - Copy the XML file
   - Create a settings.json file with your configuration
   - Copy matching audio files to an `audio/` folder
   - Zip everything together
   - Report any missing audio files

## Bundle Contents

The created zip file contains:

```
bundle.zip
├── data.xml                # Dekereke XML file
├── settings.json           # Configuration settings
└── audio/                  # Audio files folder
  ├── 001_word.wav (or .flac if converted)
  ├── 002_word.wav (or .flac if converted)
    └── ...
```

## Settings File Format

The `settings.json` file contains:

```json
{
  "writtenFormElements": ["Phonetic", "Orthographic"],
  "showWrittenForm": true,
  "audioFileSuffix": "-phon",
  "referenceNumbers": ["001", "002", "003"],
  "requireUserSpelling": false,
  "userSpellingElement": "Orthographic",
  "toneGroupElement": "SurfaceMelodyGroup"
}
```

## Troubleshooting

**XML parsing errors**: Ensure your XML file is:
- Valid XML format
- UTF-16 encoded
- Has `<phon_data>` as root element
- Contains `<data_form>` elements

**Missing audio files**: The app will list any audio files that couldn't be found. Check that:
- Audio folder path is correct
- File names match the `<SoundFile>` elements in XML
- Suffix setting matches your file naming convention

## Development

The bundler app uses:
- **Electron**: Desktop application framework
- **archiver**: Zip file creation
- **fast-xml-parser**: XML parsing
