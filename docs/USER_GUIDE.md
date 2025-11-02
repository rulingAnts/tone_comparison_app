# User Guide: Tone Matching Workflow

This guide walks through the complete workflow for conducting participatory phonology analysis with native speakers.

## Overview

The tone matching process involves three applications:

1. **Bundler App** (Desktop) - Researcher prepares data bundles
2. **Mobile App** (Android/Windows) - Native speaker groups words by tone
3. **Comparison App** (Desktop) - Researcher compares results from multiple speakers

## Step 1: Prepare Your Data (Researcher)

### Requirements

- Dekereke XML file with phonological data
- WAV audio files (16-bit or 24-bit) for each word
- Words sorted by grammatical category and syllable pattern

### Using the Bundler App

1. **Launch the Bundler App**
   ```bash
   cd bundler_app
   npm install
   npm start
   ```

2. **Select XML File**
   - Click "Browse" next to "XML File"
   - Select your Dekereke XML file
   - The app will show available fields and record count

3. **Configure Display Settings**
   - Select which fields to show as written forms (e.g., Phonetic, Orthographic)
   - Check "Show written forms" if you want text displayed to users
   - Uncheck for audio-only mode

4. **Configure Audio Settings**
   - Click "Browse" next to "Audio Folder"
   - Select the folder containing your WAV files
   - Optional: Enter audio file suffix if your files have variations
     - Example: If XML has "word.wav" but files are "word-phon.wav", enter "-phon"

5. **Filter Records (Optional)**
   - Enter reference numbers (one per line) to include only specific words
   - Leave empty to include all records
   - This is useful for working with specific grammatical categories or syllable patterns

6. **Configure User Input**
   - Check "Require user to type spelling" if you want native speakers to enter their own orthography
   - Specify which XML element will store user spelling
   - Specify which XML element will store tone group assignments

7. **Create Bundle**
   - Click "Browse" next to "Output Bundle File"
   - Choose where to save the bundle (e.g., "cvcv_nouns_bundle.zip")
   - Click "Create Bundle"
   - The app will report any missing audio files

## Step 2: Native Speaker Analysis (Mobile App)

### Setup

1. **Install the Mobile App**
   - Android: Install APK on device
   - Windows: Run the desktop version

2. **Transfer Bundle**
   - Copy the bundle zip file to the device
   - For Android: Use USB, cloud storage, or file sharing

### Tone Matching Process

1. **Load Bundle**
   - Open the app
   - Click "Load Bundle"
   - Select the bundle zip file
   - Wait for loading to complete

2. **Start Tone Matching**
   - Click "Start Tone Matching"
   - The first word will be displayed

3. **First Word - Create First Tone Group**
   - Play the audio by tapping the play button
   - Draw a picture on paper representing the tone melody
   - Take a photo of your drawing with the camera button
   - If required, type your spelling of the word
   - The first tone group is created!

4. **Subsequent Words**
   
   For each word:
   
   a. **Listen to the word**
      - Tap the play button to hear the word
      - Play it as many times as needed
   
   b. **Compare with existing tone groups**
      - Scroll through the tone group cards
      - Each card shows:
        - Group number
        - Picture you drew for that tone melody
        - List of words already in that group
      - Tap play buttons to hear words in each group
   
   c. **Make a decision**
      - If the word sounds like an existing group, tap that card
      - If it doesn't match any group, scroll to bottom and tap "Create New Group"
        - Draw a new picture
        - Take a photo
   
   d. **Move to next word**
      - The app automatically advances after you select a group

5. **Complete the Analysis**
   - Continue until all words are grouped
   - You'll see a completion message

6. **Export Results**
   - Tap the download icon
   - The app creates a results zip file
   - Share this file with the researcher

## Step 3: Periodic Review (Recommended)

Every 20 words or so in a group:

1. Review all words in that tone group
2. Play each word and compare
3. Identify any outliers
4. If some words sound different from the group:
   - Remove them from the current group
   - Move to an existing group OR create a new group

Note: The current mobile app doesn't have built-in review/reorganization yet. This can be done by the researcher in post-processing or in a future app version.

## Step 4: Compare Results (Researcher)

If multiple native speakers analyzed the same words:

### Using the Comparison App

1. **Launch the Comparison App**
   ```bash
   cd comparison_app
   npm install
   npm start
   ```

2. **Load Results**
   - Click "Load Result Files"
   - Select all result zip files from different speakers
   - The app will analyze the results

3. **Review Statistics**
   - Total words analyzed
   - Number of words with full agreement
   - Number of words with disagreements
   - Overall agreement percentage

4. **Examine Disagreements**
   - Table shows words where speakers disagreed
   - Each column shows which group each speaker assigned
   - These words may need:
     - Further discussion with speakers
     - Additional analysis
     - Subdivision of tone groups

5. **Review Merged Groups**
   - Groups with >80% overlap across speakers
   - Shows different exemplars for the same tone melody
   - Example:
     - Speaker 1: Group 3, exemplar "lizard"
     - Speaker 2: Group 5, exemplar "snake"
     - 95% of words match
   - Choose which exemplar to use moving forward

6. **Next Steps**
   - Discuss disagreements with speakers
   - Choose consensus exemplars
   - Create final tone group classification
   - Update your phonology database

## Tips for Success

### For Researchers

- **Start with a small, homogeneous set**: First bundle should be one grammatical category and one syllable pattern
- **Test the bundle**: Load it yourself before giving to speakers
- **Prepare instructions**: Create visual guides for speakers who may not be literate
- **Multiple speakers**: Having 2-3 speakers do the same set helps validate results

### For Native Speakers

- **Trust your ears**: Don't overthink it - does it sound the same?
- **Replay often**: Listen to words multiple times
- **Compare thoroughly**: Play words in existing groups before creating new ones
- **Take breaks**: Ear fatigue is real - take breaks every 30-60 minutes
- **Clear drawings**: Make pictures distinctive so you can remember tone melodies

### Drawing Tips

Good exemplar drawings:
- Simple and clear
- Distinctive from other tone group pictures
- Memory aids (doesn't have to be artistic!)
- Examples: 
  - Rising tone → arrow pointing up
  - Falling tone → arrow pointing down
  - High level → straight line at top
  - Low level → straight line at bottom
  - Complex contours → wavy lines

## Troubleshooting

### Bundler App

**"No data_form elements found"**
- Check XML structure - must have `<phon_data>` root and `<data_form>` elements

**"Missing audio files"**
- Verify audio folder path
- Check file names match `<SoundFile>` elements
- Verify suffix setting if using modified filenames

### Mobile App

**"Failed to load bundle"**
- Ensure zip file is not corrupted
- Check that all required files are in bundle (data.xml, settings.json, audio/)

**"Audio file not found"**
- Bundle may be incomplete
- Recreate bundle with correct audio files

### Comparison App

**"No CSV file found"**
- Result zip must contain CSV summary
- Check that export completed successfully

## File Organization Example

```
project/
├── source_data/
│   ├── full_database.xml          # Complete Dekereke export
│   └── audio/
│       ├── 001_word.wav
│       ├── 002_word.wav
│       └── ...
├── bundles/
│   ├── cvcv_nouns.zip             # Bundle for CVCV nouns
│   ├── vcv_nouns.zip              # Bundle for VCV nouns
│   └── cvcv_verbs.zip             # Bundle for CVCV verbs
└── results/
    ├── speaker1_cvcv_nouns.zip    # Results from speaker 1
    ├── speaker2_cvcv_nouns.zip    # Results from speaker 2
    └── comparison_report.txt       # Notes from comparison
```

## Next Steps

After completing the tone matching analysis:

1. Update your phonology database with tone group assignments
2. Use the tone group information for:
   - Phonological analysis
   - Orthography development
   - Teaching materials
   - Dictionary entries

3. Repeat the process for other:
   - Grammatical categories
   - Syllable patterns
   - Dialectal variations
