"use strict";
/**
 * lite-normalizer.js (embedded inside bundler_app)
 *
 * Provides batch audio processing with:
 *  - Two-pass LUFS normalization (targets -16 LUFS, limiter safety)
 *  - Optional auto-trim of leading/trailing silence
 *  - Flexible output formats: flac (default), opus, wav16
 *
 * This is relocated under bundler_app/src/utils to guarantee reliable require()
 * in Electron dev and packaged contexts (avoids brittle relative path resolution
 * to a repo-level modules/ directory).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

let FFMPEG_PATH = null;
let FFPROBE_PATH = null;
try { FFMPEG_PATH = require('ffmpeg-static'); } catch {}
try { FFPROBE_PATH = require('ffprobe-static')?.path; } catch {}

function resolveBinary(p) {
  if (!p || typeof p !== 'string') return null;
  const rewritten = p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
  if (process.platform === 'win32' && !/\.exe$/i.test(rewritten)) return `${rewritten}.exe`;
  return rewritten;
}

function getBinaries({ ffmpegPath, ffprobePath } = {}) {
  const ffmpeg = resolveBinary(ffmpegPath) || resolveBinary(FFMPEG_PATH);
  const ffprobe = resolveBinary(ffprobePath) || resolveBinary(FFPROBE_PATH);
  return { ffmpeg, ffprobe };
}

function walkAudioFiles(dir, arr = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkAudioFiles(full, arr);
    else if (/\.(wav|wave|mp3|m4a|flac|ogg|opus)$/i.test(e.name)) arr.push(full);
  }
  return arr;
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function buildFilters({ autoTrim, autoNormalize, targetLUFS, limiterCeiling, silenceThreshold, minSilenceMs, twoPass }) {
  const filters = [];
  if (autoTrim) {
    const thr = typeof silenceThreshold === 'number' ? `${silenceThreshold}dB` : '-50dB';
    const dur = Math.max(50, Number(minSilenceMs || 200)) / 1000; // seconds
    filters.push(`silenceremove=start_periods=1:start_threshold=${thr}:start_duration=${dur}:stop_periods=1:stop_threshold=${thr}:stop_duration=${dur}`);
  }
  if (autoNormalize && !twoPass) {
    const I = typeof targetLUFS === 'number' ? targetLUFS : -16;
    filters.push(`loudnorm=I=${I}:TP=-1.0:LRA=11:print_format=none`);
  }
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
  const newExt = (outputFormat || 'flac').toLowerCase() === 'wav16' ? '.wav' : `.${(outputFormat || 'flac').toLowerCase()}`;
  if (/\.[^\/\.]+$/.test(rel)) {
    return path.join(outputRoot, rel.replace(/\.[^\/\.]+$/, newExt));
  }
  return path.join(outputRoot, rel + newExt);
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
    silenceThreshold = -50,
    minSilenceMs = 200,
    ffmpegPath,
    ffprobePath,
    twoPass = true,
  } = opts;

  const { ffmpeg } = getBinaries({ ffmpegPath, ffprobePath });
  if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error('ffmpeg binary not found.');

  const filters = buildFilters({ autoTrim, autoNormalize, targetLUFS, limiterCeiling, silenceThreshold, minSilenceMs, twoPass });
  const codecArgs = buildOutputArgs(outputFormat, opts);
  ensureDir(outputFile);

  let loudnormStats = null;
  if (autoNormalize && twoPass) {
    const measureArgs = [
      '-hide_banner', '-nostdin', '-i', inputFile,
      '-vn', '-af', `loudnorm=I=${targetLUFS}:TP=-1.0:LRA=11:print_format=json`,
      '-f', 'null', '-'
    ];
    const { stderr: mStderr } = await runFfmpeg(ffmpeg, measureArgs);
    const jsonMatch = mStderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      try { loudnormStats = JSON.parse(jsonMatch[0]); } catch {}
    }
  }

  let finalFilter = filters;
  if (autoNormalize && twoPass) {
    const limitFilter = `alimiter=limit=${limiterCeiling}`;
    const I = targetLUFS;
    if (loudnormStats && typeof loudnormStats.input_i === 'string') {
      const loudnormFilter = `loudnorm=I=${I}:TP=-1.0:LRA=11:measured_I=${loudnormStats.input_i}:measured_LRA=${loudnormStats.input_lra}:measured_TP=${loudnormStats.input_tp}:measured_thresh=${loudnormStats.input_thresh}:offset=${loudnormStats.target_offset}:linear=true:print_format=none`;
      const pieces = filters.split(',').filter(f => !/^alimiter=/.test(f));
      finalFilter = [...pieces, loudnormFilter, limitFilter].join(',');
    } else {
      const loudnormFallback = `loudnorm=I=${I}:TP=-1.0:LRA=11:print_format=none`;
      const pieces = filters.split(',').filter(f => !/^alimiter=/.test(f));
      finalFilter = [...pieces, loudnormFallback, limitFilter].join(',');
    }
  }

  const args = [
    '-hide_banner', '-nostdin', '-y',
    '-i', inputFile,
    '-vn', '-af', finalFilter,
    ...codecArgs,
    outputFile
  ];

  const { stderr } = await runFfmpeg(ffmpeg, args);
  return { inputFile, outputFile, stderr, loudnormStats };
}

async function normalizeBatch(options) {
  const {
    input,
    output,
    files,
    autoNormalize = true,
    autoTrim = true,
    outputFormat = 'flac',
    concurrency = Math.max(1, (os.cpus()?.length || 2) - 1),
    onProgress
  } = options || {};

  if (!output) throw new Error('Missing required option: output');

  let list = Array.isArray(files) ? files.slice() : [];
  let inputRoot = input;
  if (!list.length) {
    if (!input || !fs.existsSync(input) || !fs.statSync(input).isDirectory()) {
      throw new Error('Provide an input folder or an explicit files[] array.');
    }
    inputRoot = input;
    list = walkAudioFiles(inputRoot);
  } else if (!inputRoot) {
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

module.exports = { normalizeFile, normalizeBatch, getBinaries };
module.exports.default = module.exports;
