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

### 6. Create Bundle

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
    ├── 001_word.wav
    ├── 002_word.wav
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
