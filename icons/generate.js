/*
 Generates app icons for Electron apps derived from the Android launcher artwork.
 Variants:
  - desktop_matching_app: base Android icon (tone contours + check)
  - bundler_app: base + open cardboard box
  - comparison_app: base + balance scale
 Outputs into each app's build/ directory:
  - icon.png (1024x1024)
  - icon.icns (macOS)
  - icon.ico (Windows)
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const png2icons = require('png2icons');

const root = path.resolve(__dirname, '..');

const apps = [
  { id: 'desktop_matching_app', variant: 'base', name: 'Tone Matching Desktop' },
  { id: 'bundler_app', variant: 'box', name: 'Tone Matching Bundler' },
  { id: 'comparison_app', variant: 'scale', name: 'Tone Matching Comparison' }
];

function svgTemplate(variant) {
  // Recreate Android adaptive icon look in 108x108 viewBox; render to 1024x1024.
  // Background color from ic_launcher_background: #1976D2
  // Foreground paths from ic_launcher_foreground.xml
  const overlay = variant === 'box'
    ? { data: boxOverlay(), position: 'top-left', percent: 0.48 } // ~20% smaller than 60%
    : variant === 'scale'
    ? { data: scaleOverlay(), position: 'top-left', percent: 0.6 }
    : null;
  const overlayMarkup = overlay ? overlayToMarkup(overlay.data, overlay.position, overlay.percent) : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gloss" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="6" y="6" width="96" height="96" rx="18" ry="18" fill="#1976D2"/>
  <rect x="6" y="6" width="96" height="96" rx="18" ry="18" fill="url(#gloss)"/>
  <g transform="translate(8.1,8.1) scale(0.85)" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Tone contours: rising, level, falling -->
    <path d="M16,72 L92,40" stroke-width="8"/>
    <path d="M16,88 L92,88" stroke-width="8"/>
    <path d="M16,56 L92,76" stroke-width="8"/>
    <!-- Selection/check mark -->
    <path d="M68,20 L78,30 L96,12" stroke-width="7"/>
  </g>
  ${overlayMarkup}
</svg>`;
}

function boxOverlay() {
  // Clip-art style cardboard box with clearer, slightly isometric geometry and more open flaps.
  const defs = `
    <defs>
      <linearGradient id="boxFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#D1995F"/>
        <stop offset="100%" stop-color="#A86A2E"/>
      </linearGradient>
      <linearGradient id="boxSide" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#BF7E38"/>
        <stop offset="100%" stop-color="#8C531F"/>
      </linearGradient>
      <linearGradient id="boxFlap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E2B07B"/>
        <stop offset="100%" stop-color="#BC834C"/>
      </linearGradient>
    </defs>`;
  const content = `
    <!-- Ground shadow (slightly offset to accentuate isometric depth) -->
    <ellipse cx="30" cy="56" rx="30" ry="4" fill="rgba(0,0,0,0.18)"/>
    <!-- Left side face (angled) -->
    <polygon points="12,32 5,26 5,52 12,58" fill="url(#boxSide)" stroke="#6B4F1D" stroke-width="1.8"/>
    <!-- Right side face (wider for isometric feel) -->
    <polygon points="44,32 53,26 53,52 44,58" fill="url(#boxSide)" stroke="#6B4F1D" stroke-width="1.8"/>
    <!-- Front face -->
    <rect x="12" y="32" width="32" height="26" fill="url(#boxFront)" stroke="#6B4F1D" stroke-width="1.8"/>
    <!-- Inner rim (opening), deeper to suggest looking down into box) -->
    <polygon points="12,32 28,20 44,32 28,36" fill="#7A5330" opacity="0.40"/>
    <!-- Left flap (more open) -->
    <polygon points="5,26 12,32 27,15 16,6" fill="url(#boxFlap)" stroke="#6B4F1D" stroke-width="1.8"/>
    <!-- Right flap (more open) -->
    <polygon points="44,32 53,26 40,6 29,15" fill="url(#boxFlap)" stroke="#6B4F1D" stroke-width="1.8"/>
    <!-- Front flap (folded outward to reveal opening) -->
    <polygon points="12,32 28,36 44,32 28,24" fill="url(#boxFlap)" stroke="#6B4F1D" stroke-width="1.4"/>
    <!-- Packing tape on front face -->
    <rect x="27" y="32" width="2.2" height="26" fill="#E5D1A5" opacity="0.9"/>
  `;
  // Expanded bounds for isometric/open flap geometry
  const bounds = { minX: 4, minY: 4, width: 50, height: 54 };
  return { defs, content, bounds };
}

function scaleOverlay() {
  // Clip-art style golden balance scale, small (~1/8 icon), bottom-right corner.
  // Drawn in a 16x16 local coordinate system and positioned near (88, 88).
  const defs = `
    <defs>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F5D76E"/>
        <stop offset="100%" stop-color="#C9A227"/>
      </linearGradient>
      <linearGradient id="goldDark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E5C55A"/>
        <stop offset="100%" stop-color="#A8881E"/>
      </linearGradient>
    </defs>`;
  const content = `
      <!-- Base -->
      <ellipse cx="24" cy="46" rx="18" ry="3" fill="rgba(0,0,0,0.2)"/>
      <rect x="14" y="40" width="20" height="4" rx="2" fill="url(#goldDark)" stroke="#8C7A1C" stroke-width="1.6"/>
      <!-- Pole -->
      <rect x="22.5" y="24" width="3" height="16" rx="1.5" fill="url(#gold)" stroke="#8C7A1C" stroke-width="1.6"/>
      <!-- Crossbar -->
      <rect x="10" y="22" width="28" height="2.6" rx="1.3" fill="url(#gold)" stroke="#8C7A1C" stroke-width="1.4"/>
      <!-- Caps -->
      <circle cx="24" cy="22" r="2.3" fill="url(#goldDark)" stroke="#8C7A1C" stroke-width="1.2"/>
      <!-- Chains -->
      <path d="M14,22 L14,28" stroke="#6B6B6B" stroke-width="1.3"/>
      <path d="M34,22 L34,28" stroke="#6B6B6B" stroke-width="1.3"/>
      <!-- Pans -->
      <ellipse cx="14" cy="31" rx="6" ry="2.6" fill="#B7B7B7" stroke="#6B6B6B" stroke-width="1.2"/>
      <ellipse cx="34" cy="31" rx="6" ry="2.6" fill="#B7B7B7" stroke="#6B6B6B" stroke-width="1.2"/>
  `;
  // Approx bounds for the scale drawing
  const bounds = { minX: 6, minY: 19, width: 36, height: 30 };
  return { defs, content, bounds };
}

function overlayToMarkup(overlay, position = 'bottom-left', percent = 0.6) {
  // Scale overlay so its max dimension is a percentage of icon size (percent * 108),
  // then place at the requested corner with a small margin.
  const targetMax = 108 * percent;
  const margin = 4;
  const { minX, minY, width, height } = overlay.bounds;
  const scale = targetMax / Math.max(width, height);
  const scaledW = width * scale;
  const scaledH = height * scale;
  let tx = margin - (minX * scale);
  let ty = 108 - margin - scaledH - (minY * scale); // bottom by default
  if (position.includes('right')) {
    tx = 108 - margin - scaledW - (minX * scale);
  }
  if (position.includes('top')) {
    ty = margin - (minY * scale);
  }
  return `
  ${overlay.defs}
  <g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${scale.toFixed(4)})" shape-rendering="geometricPrecision">
    ${overlay.content}
  </g>`;
}

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true });
}

async function generateForApp(app) {
  const outDir = path.join(root, app.id, 'build');
  await ensureDir(outDir);

  const svg = svgTemplate(app.variant);
  const svgBuffer = Buffer.from(svg, 'utf-8');

  const pngPath = path.join(outDir, 'icon.png');
  const icnsPath = path.join(outDir, 'icon.icns');
  const icoPath = path.join(outDir, 'icon.ico');

  // Render PNG @1024
  await sharp(svgBuffer)
    .resize(1024, 1024, { fit: 'contain', withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(pngPath);

  // Read PNG buffer
  const pngBuffer = await fs.promises.readFile(pngPath);

  // Generate ICNS
  const icns = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, 0, false);
  if (icns) await fs.promises.writeFile(icnsPath, icns);
  else throw new Error('ICNS generation failed');

  // Generate ICO
  const ico = png2icons.createICO(pngBuffer, png2icons.BICUBIC, 0, false, true);
  if (ico) await fs.promises.writeFile(icoPath, ico);
  else throw new Error('ICO generation failed');

  // Verify files exist
  const results = {
    png: fs.existsSync(pngPath),
    icns: fs.existsSync(icnsPath),
    ico: fs.existsSync(icoPath)
  };
  return { app: app.id, outDir, results };
}

(async () => {
  const summary = [];
  for (const app of apps) {
    try {
      const s = await generateForApp(app);
      summary.push(s);
    } catch (err) {
      console.error(`Failed to generate for ${app.id}:`, err);
      process.exitCode = 1;
    }
  }
  console.log('Icon generation summary:', summary);
})();
