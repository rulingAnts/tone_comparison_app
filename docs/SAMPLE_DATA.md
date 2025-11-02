# Sample Dekereke XML Data

Below is a minimal example of a Dekereke XML file that can be used with this app.

## Example XML Structure

```xml
<?xml version="1.0" encoding="UTF-16"?>
<phon_data>
  <data_form>
    <Reference>001</Reference>
    <SoundFile>001_parrot.wav</SoundFile>
    <Phonetic>párrót</Phonetic>
    <Phonemic>/paro/</Phonemic>
    <Orthographic>parrot</Orthographic>
    <English>parrot</English>
    <GrammaticalCategory>noun</GrammaticalCategory>
    <CVPattern>CVCVC</CVPattern>
  </data_form>
  <data_form>
    <Reference>002</Reference>
    <SoundFile>002_house.wav</SoundFile>
    <Phonetic>háúsé</Phonetic>
    <Phonemic>/hause/</Phonemic>
    <Orthographic>house</Orthographic>
    <English>house</English>
    <GrammaticalCategory>noun</GrammaticalCategory>
    <CVPattern>CVV</CVPattern>
  </data_form>
  <data_form>
    <Reference>003</Reference>
    <SoundFile>003_water.wav</SoundFile>
    <Phonetic>wátér</Phonetic>
    <Phonemic>/water/</Phonemic>
    <Orthographic>water</Orthographic>
    <English>water</English>
    <GrammaticalCategory>noun</GrammaticalCategory>
    <CVPattern>CVCV</CVPattern>
  </data_form>
</phon_data>
```

## Required Elements

Each `<data_form>` element must contain:
- `<Reference>`: Unique identifier for the record
- `<SoundFile>`: Name of the associated audio file

## Common Optional Elements

- `<Phonetic>`: Phonetic transcription
- `<Phonemic>`: Phonemic transcription
- `<Orthographic>`: Written form in standard orthography
- `<English>`: English translation
- `<GrammaticalCategory>`: Part of speech (noun, verb, etc.)
- `<CVPattern>`: Consonant-vowel syllable pattern

## Elements Added by App

After processing, the app will add:
- `<SurfaceMelodyGroup>`: Tone group number (default element name)
- `<Orthographic>`: User-entered spelling (if enabled)

## Creating Test Data

To create a test XML file:

1. Save the example above as `test_data.xml`
2. Make sure it's encoded in UTF-16
3. Create corresponding WAV audio files (001_parrot.wav, 002_house.wav, etc.)
4. Use the Bundler app to create a bundle

## Encoding Note

The XML declaration must be UTF-16. To convert UTF-8 to UTF-16, you can use:

**On Windows (PowerShell):**
```powershell
Get-Content input.xml | Set-Content -Encoding Unicode output.xml
```

**On Linux/Mac:**
```bash
iconv -f UTF-8 -t UTF-16LE input.xml > output.xml
```

**Or use a text editor** that supports encoding conversion (e.g., Notepad++, VS Code with extensions)
