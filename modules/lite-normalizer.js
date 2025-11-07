"use strict";
/**
 * lite-normalizer.js
 *
 * A drop-in Node.js module to batch-process WAV files with:
 *  - Fast LUFS normalization (single-pass loudnorm targeting -16 LUFS with limiter)
 *  - Optional auto-trim of leading/trailing silence
 *  - Android-friendly output formats: FLAC (lossless, smaller than WAV) or Opus (high-quality lossy)
 *
 * Minimal options, safe defaults, and no UI.
 * Works in plain Node scripts or inside Electron apps.
 *
 * USAGE (plain Node):
 *   const { normalizeBatch } = require('./modules/lite-normalizer');
 *   await normalizeBatch({
 *     input: '/path/to/input',
 *     output: '/path/to/output',
 *     autoNormalize: true,
 *     autoTrim: true,
 *     outputFormat: 'flac' // 'flac' (default), 'opus', 'wav16'
 *   });
 *
 * USAGE (single file):
 *   const { normalizeFile } = require('./modules/lite-normalizer');
 *   await normalizeFile('/path/in.wav', '/path/out.flac', { autoNormalize: true, autoTrim: true, outputFormat: 'flac' });
 *
 * NOTE ON SIZES/QUALITY:
 *   - 'flac' is lossless and typically ~40–60% smaller than WAV. Recommended default for listening and sorting.
 *   - 'opus' is very small and sounds great at 64–96 kbps but is lossy.
 *   - 'wav16' is uncompressed PCM; biggest files, broadest compatibility.
 *
 * -------------------------------------------------------------
 * PACKAGING AND FFMPEG SETUP (copy into your project):
 * -------------------------------------------------------------
 * 1) Install dependencies:
 *    npm install ffmpeg-static ffprobe-static
 *
 * 2) If you package with electron-builder:
 *    - In package.json:
 *      {
 *        "build": {
 *          "asarUnpack": [
 *            "**/node_modules/ffmpeg-static/**",
 *            "**/node_modules/ffprobe-static/**"
 *          ],
 *          "afterPack": "scripts/afterPack.cjs"
 *        }
 *      }
 *
 *    - Add scripts/afterPack.cjs to normalize binary layout and ensure Windows gets a real ffmpeg.exe when cross-building on macOS.
 *      The simplest robust approach is to keep a Windows ffmpeg-static zip at build/win32-resources/ffmpeg-static.zip and extract
 *      ffmpeg.exe to app.asar.unpacked/node_modules/ffmpeg-static/bin/win32/x64/ffmpeg.exe during afterPack.
 *
 *    - See this repo's scripts/afterPack.cjs for a reference implementation.
 *      Key points:
 *        * Mac build: keep ffmpeg under bin/darwin/universal/ffmpeg and prune non-darwin ffprobe.
 *        * Windows build: place ffmpeg.exe under bin/win32/x64 and prune non-win32/x64 ffprobe.
 *        * Resolve binary paths at runtime by rewriting app.asar -> app.asar.unpacked.
 *
 * 3) If you are NOT packaging (just running Node):
 *    - ffmpeg-static will expose a platform-native ffmpeg binary path; no extra work is needed.
 *
 * 4) Cross-building Windows on macOS:
 *    - Provide the Windows ffmpeg via the repo-local zip (build/win32-resources/ffmpeg-static.zip) or use a CI Windows runner.
 *
 * This module includes a resolver to find ffmpeg/ffprobe paths in both dev and packaged apps.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// Prefer requiring here so callers don't need to pass paths.
let FFMPEG_PATH = null;
let FFPROBE_PATH = null;
try { FFMPEG_PATH = require('ffmpeg-static'); } catch {}
try { FFPROBE_PATH = require('ffprobe-static')?.path; } catch {}

function resolveBinary(p) {
  if (!p || typeof p !== 'string') return null;
  // electron packaged: rewrite app.asar -> app.asar.unpacked
  const rewritten = p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
  if (process.platform === 'win32' && !/\.exe$/i.test(rewritten)) return `${rewritten}.exe`;
  return rewritten;
}

function getBinaries({ ffmpegPath, ffprobePath } = {}) {
  const ffmpeg = resolveBinary(ffmpegPath) || resolveBinary(FFMPEG_PATH);
  const ffprobe = resolveBinary(ffprobePath) || resolveBinary(FFPROBE_PATH);
  return { ffmpeg, ffprobe };
}

function walkWavFiles(dir, arr = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkWavFiles(full, arr);
    else if (/\.(wav|wave)$/i.test(e.name)) arr.push(full);
  }
  return arr;
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function buildFilters({ autoTrim, autoNormalize, targetLUFS, limiterCeiling, silenceThreshold, minSilenceMs }) {
  const filters = [];
  if (autoTrim) {
    const thr = typeof silenceThreshold === 'number' ? `${silenceThreshold}dB` : '-50dB';
    const dur = Math.max(50, Number(minSilenceMs || 200)) / 1000; // seconds
    // Trim start and end silences. Basic, safe defaults.
    filters.push(`silenceremove=start_periods=1:start_threshold=${thr}:start_duration=${dur}:stop_periods=1:stop_threshold=${thr}:stop_duration=${dur}`);
  }
  if (autoNormalize) {
    const I = typeof targetLUFS === 'number' ? targetLUFS : -16;
    filters.push(`loudnorm=I=${I}:TP=-1.0:LRA=11:print_format=none`);
  }
  // Safety limiter to avoid clipping
  const limit = typeof limiterCeiling === 'number' ? limiterCeiling : 0.97;
  filters.push(`alimiter=limit=${limit}`);
  return filters.join(',');
}

function buildOutputArgs(outputFormat, { opusBitrate, flacCompressionLevel } = {}) {
  switch ((outputFormat || 'flac').toLowerCase()) {
    case 'flac':
      return ['-c:a', 'flac', '-compression_level', String(flacCompressionLevel ?? 5)];
    case 'opus':
      return ['-c:a', 'libopus', '-b:a', String(opusBitrate || '96k'), '-vbr', 'on', '-application', 'audio'];
    case 'wav16':
      return ['-c:a', 'pcm_s16le'];
    default:
      return ['-c:a', 'flac', '-compression_level', String(flacCompressionLevel ?? 5)];
  }
}

function mapOutputPath(inFile, inputRoot, outputRoot, outputFormat) {
  const rel = path.relative(inputRoot, inFile);
  const ext = (outputFormat || 'flac').toLowerCase() === 'wav16' ? '.wav' : `.${(outputFormat || 'flac').toLowerCase()}`;
  return path.join(outputRoot, rel.replace(/\.(wav|wave)$/i, ext));
}

function runFfmpeg(ffmpeg, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += String(d); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve({ code, stderr });
      const err = new Error(`ffmpeg exited with code ${code}`);
      err.stderr = stderr;
      reject(err);
    });
  });
}

async function normalizeFile(inputFile, outputFile, opts = {}) {
  const {
    autoNormalize = true,
    autoTrim = true,
    outputFormat = 'flac',
    targetLUFS = -16,
    limiterCeiling = 0.97,
    silenceThreshold = -50, // dBFS
    minSilenceMs = 200,
    ffmpegPath,
    ffprobePath // reserved for future use
  } = opts;

  const { ffmpeg } = getBinaries({ ffmpegPath, ffprobePath });
  if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error('ffmpeg binary not found. Ensure ffmpeg-static is installed or provide ffmpegPath.');

  const filters = buildFilters({ autoTrim, autoNormalize, targetLUFS, limiterCeiling, silenceThreshold, minSilenceMs });
  const codecArgs = buildOutputArgs(outputFormat, opts);

  ensureDir(outputFile);
  const args = [
    '-hide_banner', '-nostdin', '-y',
    '-i', inputFile,
    '-vn', // no video
    '-af', filters,
    ...codecArgs,
    outputFile
  ];

  const { stderr } = await runFfmpeg(ffmpeg, args);
  return { inputFile, outputFile, stderr };
}

async function normalizeBatch(options) {
  const {
    input, // folder or array of files
    output, // output folder
    files, // optional explicit files array (overrides input folder scan)
    autoNormalize = true,
    autoTrim = true,
    outputFormat = 'flac',
    concurrency = Math.max(1, (os.cpus()?.length || 2) - 1),
    onProgress // (info) => void
  } = options || {};

  if (!output) throw new Error('Missing required option: output');

  let list = Array.isArray(files) ? files.slice() : [];
  let inputRoot = input;
  if (!list.length) {
    if (!input || !fs.existsSync(input) || !fs.statSync(input).isDirectory()) {
      throw new Error('Provide an input folder or an explicit files[] array.');
    }
    inputRoot = input;
    list = walkWavFiles(inputRoot);
  } else if (!inputRoot) {
    // If files[] provided without input root, use common parent as root for output structure
    inputRoot = list.reduce((acc, f) => acc ? acc : path.dirname(f), null) || process.cwd();
  }
  const total = list.length;
  if (!total) return { total: 0, completed: 0, errors: 0, results: [] };

  const results = new Array(total);
  let completed = 0, errors = 0;

  const queue = list.slice();
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (queue.length) {
      const idx = total - queue.length;
      const inFile = queue.shift();
      const outFile = mapOutputPath(inFile, inputRoot, output, outputFormat);
      try {
        const r = await normalizeFile(inFile, outFile, { ...options, autoNormalize, autoTrim, outputFormat });
        results[idx] = r;
        completed++;
        onProgress && onProgress({ type: 'file-done', index: idx, completed, total, inFile, outFile });
      } catch (e) {
        results[idx] = { error: e, inputFile: inFile, outputFile: outFile };
        errors++;
        onProgress && onProgress({ type: 'file-error', index: idx, completed, total, inFile, outFile, error: e.message });
      }
    }
  });
  onProgress && onProgress({ type: 'start', total });
  await Promise.all(workers);
  onProgress && onProgress({ type: 'done', total, completed, errors });
  return { total, completed, errors, results };
}

module.exports = {
  normalizeFile,
  normalizeBatch,
  getBinaries,
};

// ESM default export shim
module.exports.default = module.exports;
