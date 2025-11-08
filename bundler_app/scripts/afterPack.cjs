// afterPack.cjs
// Ensures ffmpeg/ffprobe binaries are correctly present when packaging and
// handles cross-building Windows on macOS by extracting a provided ffmpeg-static.zip.
//
// Expected layout:
//   win32-resources/ffmpeg-static.zip  (contains ffmpeg.exe at some depth)
// Will extract ffmpeg.exe into:
//   app.asar.unpacked/node_modules/ffmpeg-static/bin/win32/x64/ffmpeg.exe
//
// For mac builds we ensure universal/darwin binary exists; ffmpeg-static already
// provides one, but we prune unrelated platform folders to reduce size.
//
// This script is idempotent and safe to run for all targets; it only mutates paths
// relevant to the current platform or target.
//
// Electron Builder config:
//   "build": {
//     "afterPack": "scripts/afterPack.cjs",
//     "asarUnpack": ["**/node_modules/ffmpeg-static/**", "**/node_modules/ffprobe-static/**"]
//   }
//
// If you add new architectures, adjust the target folder names below.

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

module.exports = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context;
  const platform = electronPlatformName || packager.platform || process.platform;

  const unpackedDir = path.join(appOutDir, 'app.asar.unpacked');
  const ffmpegStaticDir = path.join(unpackedDir, 'node_modules', 'ffmpeg-static', 'bin');
  const ffprobeStaticDir = path.join(unpackedDir, 'node_modules', 'ffprobe-static', 'bin');

  try {
    fs.mkdirSync(ffmpegStaticDir, { recursive: true });
  } catch {}
  try {
    fs.mkdirSync(ffprobeStaticDir, { recursive: true });
  } catch {}

  if (platform === 'win32') {
    // Ensure ffmpeg.exe exists under win32/x64
    const winTargetDir = path.join(ffmpegStaticDir, 'win32', 'x64');
    fs.mkdirSync(winTargetDir, { recursive: true });
    const exePath = path.join(winTargetDir, 'ffmpeg.exe');
    if (!fs.existsSync(exePath)) {
      // Look for a zip colocated with bundler_app first, fallback to repo root
      const zipCandidates = [
        path.join(process.cwd(), 'win32-resources', 'ffmpeg-static.zip'),
        path.join(process.cwd(), '..', 'win32-resources', 'ffmpeg-static.zip'),
      ];
      const zipPath = zipCandidates.find(p => fs.existsSync(p));
      if (!zipPath) {
        console.warn('[afterPack] ffmpeg-static.zip not found in candidates:', zipCandidates.join(', '));
      } else {
        try {
          const zip = new AdmZip(zipPath);
          // Find ffmpeg.exe entry
          const entry = zip.getEntries().find(e => /ffmpeg\.exe$/i.test(e.entryName));
          if (!entry) {
            console.warn('[afterPack] ffmpeg.exe not found inside zip');
          } else {
            fs.writeFileSync(exePath, zip.readFile(entry));
            console.log('[afterPack] Extracted ffmpeg.exe to', exePath);
          }
        } catch (e) {
          console.warn('[afterPack] Failed to extract ffmpeg.exe:', e.message);
        }
      }
    }

    // Prune non-win platforms to save space
    pruneOtherPlatforms(ffmpegStaticDir, ['win32']);
    pruneOtherPlatforms(ffprobeStaticDir, ['win32']);
    // Keep only x64 under win32 for both ffmpeg and ffprobe
    pruneOtherArchitectures(path.join(ffmpegStaticDir, 'win32'), ['x64']);
    pruneOtherArchitectures(path.join(ffprobeStaticDir, 'win32'), ['x64']);
  } else if (platform === 'darwin') {
    // Keep darwin binaries; prune others for size
    pruneOtherPlatforms(ffmpegStaticDir, ['darwin']);
    pruneOtherPlatforms(ffprobeStaticDir, ['darwin']);
    // On mac, keep both architectures to support universal builds
    pruneOtherArchitectures(path.join(ffmpegStaticDir, 'darwin'), ['x64', 'arm64', 'universal']);
    pruneOtherArchitectures(path.join(ffprobeStaticDir, 'darwin'), ['x64', 'arm64', 'universal']);
  } else {
    // Linux: keep linux only
    pruneOtherPlatforms(ffmpegStaticDir, ['linux']);
    pruneOtherPlatforms(ffprobeStaticDir, ['linux']);
  }
};

function pruneOtherPlatforms(rootDir, keep) {
  try {
    if (!fs.existsSync(rootDir)) return;
    const entries = fs.readdirSync(rootDir);
    for (const e of entries) {
      const full = path.join(rootDir, e);
      if (fs.statSync(full).isDirectory()) {
        if (!keep.includes(e)) {
          try {
            fs.rmSync(full, { recursive: true, force: true });
            console.log('[afterPack] Pruned', full);
          } catch (err) {
            console.warn('[afterPack] Failed to prune', full, err.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[afterPack] prune error:', e.message);
  }
}

function pruneOtherArchitectures(platformDir, keepArchs) {
  try {
    if (!platformDir || !fs.existsSync(platformDir)) return;
    const entries = fs.readdirSync(platformDir);
    for (const e of entries) {
      const full = path.join(platformDir, e);
      if (fs.statSync(full).isDirectory()) {
        if (!keepArchs.includes(e)) {
          try {
            fs.rmSync(full, { recursive: true, force: true });
            console.log('[afterPack] Pruned arch', full);
          } catch (err) {
            console.warn('[afterPack] Failed to prune arch', full, err.message);
          }
        }
      }
    }
  } catch (e) {
    // It's okay if the layout doesn't have arch subfolders (some packages use universal paths)
  }
}
