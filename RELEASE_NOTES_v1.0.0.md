# Tone Matching Suite v1.0.0

This first release bundles the full workflow for creating, reviewing, and comparing tone-matching data sets. It includes three desktop apps (Bundler, Desktop Matching, Comparison) and an Android mobile app.

## Applications Overview

### 1. Tone Matching Bundler
Creates distributable `.tncmp` bundles from a Dekereke XML export plus audio files.
- Filters records by reference numbers
- Optional audio processing (silence trim, two-pass loudness normalization to -16 LUFS, FLAC conversion)
- Produces minimized `data.xml`, `settings.json`, and includes processed audio

### 2. Tone Matching Desktop
Interactive desktop tool to listen and assign or adjust tone groups within a bundle.
- Loads `.tncmp` bundles
- Plays FLAC or WAV audio variants
- Facilitates tone classification review

### 3. Tone Matching Comparison
Compares tone group assignments across multiple bundles or speakers.
- Imports multiple `.tncmp` bundles
- Highlights differences/mismatches
- NOTE: Does not yet automatically re-import changes back into Dekereke. A future “approve & merge” path is planned.

### 4. Tone Matching (Android)
Mobile-friendly app for on-the-go review.
- Loads `.tncmp` bundles
- Plays FLAC audio produced by the bundler
- Suitable for field review or quick validation

## Download Guide

Pick the file matching your platform and the app you want to use:

### Mac (Universal DMG: Intel + Apple Silicon)
- Bundler: `Tone Matching Bundler-1.0.0-universal.dmg`
- Desktop Matching: `Tone Matching Desktop-1.0.0-universal.dmg`
- Comparison: `Tone Matching Comparison-1.0.0-universal.dmg`

### Windows (64-bit NSIS Installer)
- Bundler: `Tone Matching Bundler Setup 1.0.0.exe`
- Desktop Matching: `Tone Matching Desktop Setup 1.0.0.exe`
- Comparison: `Tone Matching Comparison Setup 1.0.0.exe`

### Android
- Mobile App: `Tone Matching-1.0.0+1.apk`

## How to Use

1. Create a bundle:
   - Open Bundler, select Dekereke XML & audio folder, configure variants, optionally enable processing.
   - Generate `.tncmp`.

2. Review or classify:
   - Open the `.tncmp` file in Desktop Matching or the Android app; perform tone assignments or verification.

3. Compare:
   - Load multiple bundles in the Comparison app to inspect cross-speaker or iteration differences.

## Current Limitations

- Comparison app changes are not written back automatically to Dekereke yet.
- To cancel audio processing in Bundler, quit the application (no mid-process cancel UI).
- Missing audio warnings: verify naming and variant suffix configuration if reported.

## Future Roadmap (Planned)

- Approval + merge workflow for Comparison → Dekereke.
- Rich validation summaries before bundle finalization.
- Optional in-app cancel for audio processing.

## Integrity (SHA256 Checksums)

```
70ef33d6eec50cb983c41cb54ea58e629fb2ec1b75fbbcd15c49e37748c569cb  Tone Matching Bundler Setup 1.0.0.exe
eec1f0f84ed67c356c3feae6ce01e89d8e0b53f2fc59108f4d6a324e4af615e6  Tone Matching Bundler-1.0.0-universal.dmg
cdca3064b99f049386f93bec1b1408abded41f2ab1f2007f5e92ea225556c65b  Tone Matching Comparison Setup 1.0.0.exe
a2d4e654f195a4506387192efbb7f2e08d08c0b989b788506d6b9f2b4c88c57b  Tone Matching Comparison-1.0.0-universal.dmg
d6e632bdcb06794eb18e9786ad0a494d32202c57c42bbb37d68d53bb0dd22e87  Tone Matching Desktop Setup 1.0.0.exe
4aa0528c4ad21ec18d91df0986e3a008d57b75ef1e9dc3eb3c46067bbbfb0d51  Tone Matching Desktop-1.0.0-universal.dmg
fb90a0628783bd5e81e412ca04dac1dc1ee57b8d652bf5b37d889371361b2764  Tone Matching-1.0.0+1.apk
```

## No Auto-Update Artifacts

- Blockmaps and `latest.yml` files are intentionally omitted; updates are manual for this release.
