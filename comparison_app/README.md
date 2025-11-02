# Tone Matching Comparison Tool

Electron desktop application for comparing and analyzing tone matching results from multiple native speakers.

## Features

- Import results from multiple speakers
- Compare tone group assignments across speakers
- Identify words with disagreements
- Find merged groups (same tone melody, different exemplars)
- Calculate agreement statistics
- Visual presentation of analysis results

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

### 1. Load Result Files

Click "Load Result Files" and select multiple result zip files exported from the mobile app.

Each zip file should contain:
- Updated XML file with tone group assignments
- CSV summary of tone groups
- Exemplar images

### 2. View Statistics

The app displays:
- **Total Words**: Total unique words across all speakers
- **Full Agreement**: Words where all speakers assigned the same group
- **Disagreements**: Words with different group assignments
- **Agreement Rate**: Percentage of words with full agreement

### 3. Review Speaker Summaries

See how many tone groups and words each speaker analyzed.

### 4. Analyze Disagreements

Review the table of words where speakers disagreed on tone group assignment.

This helps identify:
- Ambiguous words that need further discussion
- Potential errors in grouping
- Words that may belong to multiple groups

### 5. Identify Merged Groups

The app finds groups with >80% overlap across speakers.

**Example**:
- Speaker 1: Group 3 with "lizard" as exemplar
- Speaker 2: Group 5 with "snake" as exemplar
- 95% overlap in words assigned to these groups

This suggests they represent the same tone melody but with different exemplars. The researcher can then decide which exemplar to use moving forward.

## Analysis Algorithm

### Agreement Detection

For each word:
1. Collect tone group assignments from all speakers
2. Compare assignments across speakers
3. Flag as "full agreement" if all speakers agree
4. Flag as "disagreement" if speakers differ

### Merged Group Detection

For each pair of speakers:
1. Compare word assignments between tone groups
2. Calculate overlap percentage
3. Groups with >80% overlap are flagged as potential merges
4. Report both exemplars and images for researcher review

## Use Cases

### Multi-Speaker Validation

When multiple native speakers analyze the same word set:
- Validate tone group classifications
- Build consensus on ambiguous words
- Choose best exemplar images

### Quality Assurance

Identify potential issues:
- Words that consistently cause disagreement
- Speakers who may need additional training
- Tone groups that may need subdivision

### Data Consolidation

Merge results from multiple speakers:
- Choose consensus tone group numbers
- Select best exemplar words and images
- Create final classification for linguistic analysis

## Technical Details

The comparison tool uses:
- **Electron**: Desktop application framework
- **adm-zip**: Zip file extraction
- **fast-xml-parser**: XML parsing
- **fast-csv**: CSV parsing

### Analysis Process

1. **Load**: Extract and parse XML and CSV from each result file
2. **Index**: Build word-to-group mappings for each speaker
3. **Compare**: Cross-reference assignments across speakers
4. **Detect**: Find disagreements and overlaps
5. **Report**: Generate visual summary and statistics

## Future Enhancements

- Export merged/consensus results
- Manual resolution of disagreements
- Support for partial agreement thresholds
- Exemplar image comparison view
- Audio playback for disputed words
