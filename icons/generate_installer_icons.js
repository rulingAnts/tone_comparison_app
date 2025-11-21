/*
 Generates installer-specific icons with a visual overlay to distinguish from app icons.
 Adds a small gear/settings icon overlay to indicate "installer"
*/

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const png2icons = require('png2icons');

const root = path.resolve(__dirname, '..');

const apps = [
  { id: 'desktop_matching_app', name: 'Tone Matching Desktop' },
  { id: 'bundler_app', name: 'Tone Matching Bundler' },
  { id: 'comparison_app', name: 'Tone Matching Comparison' }
];

function installerOverlaySVG() {
  // Small gear/settings icon in bottom-right corner with shadow
  return `
    <g transform="translate(70, 70)">
      <!-- Shadow -->
      <circle cx="19" cy="19" r="18" fill="rgba(0,0,0,0.3)"/>
      <!-- Background circle -->
      <circle cx="18" cy="18" r="18" fill="#4CAF50"/>
      <!-- Gear icon -->
      <g transform="translate(18, 18)">
        <!-- Outer gear teeth -->
        <path d="M0,-12 L2,-10 L2,-6 L0,-4 L-2,-6 L-2,-10 Z" fill="white"/>
        <path d="M12,0 L10,2 L6,2 L4,0 L6,-2 L10,-2 Z" fill="white"/>
        <path d="M0,12 L2,10 L2,6 L0,4 L-2,6 L-2,10 Z" fill="white"/>
        <path d="M-12,0 L-10,2 L-6,2 L-4,0 L-6,-2 L-10,-2 Z" fill="white"/>
        <path d="M8.5,-8.5 L10,-7 L7,-4 L4,-7 L7,-10 Z" fill="white"/>
        <path d="M8.5,8.5 L10,7 L7,4 L4,7 L7,10 Z" fill="white"/>
        <path d="M-8.5,8.5 L-7,10 L-4,7 L-7,4 L-10,7 Z" fill="white"/>
        <path d="M-8.5,-8.5 L-7,-10 L-4,-7 L-7,-4 L-10,-7 Z" fill="white"/>
        <!-- Center circle -->
        <circle cx="0" cy="0" r="5" fill="white"/>
        <circle cx="0" cy="0" r="3" fill="#4CAF50"/>
      </g>
    </g>
  `;
}

async function generateInstallerIcon(app) {
  const appBuildDir = path.join(root, app.id, 'build');
  const appIconPath = path.join(appBuildDir, 'icon.png');
  
  if (!fs.existsSync(appIconPath)) {
    throw new Error(`App icon not found: ${appIconPath}`);
  }

  // Read the base app icon
  const baseIcon = await sharp(appIconPath)
    .resize(1024, 1024, { fit: 'contain', withoutEnlargement: false })
    .png()
    .toBuffer();

  // Create SVG overlay
  const overlaySVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  ${installerOverlaySVG()}
</svg>`;

  const overlayBuffer = Buffer.from(overlaySVG, 'utf-8');
  const overlayPng = await sharp(overlayBuffer)
    .resize(1024, 1024, { fit: 'contain', withoutEnlargement: false })
    .png()
    .toBuffer();

  // Composite overlay onto base icon
  const installerPngPath = path.join(appBuildDir, 'installer-icon.png');
  await sharp(baseIcon)
    .composite([{ input: overlayPng, blend: 'over' }])
    .png({ compressionLevel: 9 })
    .toFile(installerPngPath);

  // Generate ICO for Windows installer
  const installerPngBuffer = await fs.promises.readFile(installerPngPath);
  const installerIcoPath = path.join(appBuildDir, 'installer-icon.ico');
  const ico = png2icons.createICO(installerPngBuffer, png2icons.BICUBIC, 0, false, true);
  if (ico) {
    await fs.promises.writeFile(installerIcoPath, ico);
  } else {
    throw new Error('ICO generation failed');
  }

  return {
    app: app.id,
    png: fs.existsSync(installerPngPath),
    ico: fs.existsSync(installerIcoPath)
  };
}

(async () => {
  const summary = [];
  for (const app of apps) {
    try {
      const result = await generateInstallerIcon(app);
      summary.push(result);
    } catch (err) {
      console.error(`Failed to generate installer icon for ${app.id}:`, err);
      process.exitCode = 1;
    }
  }
  console.log('Installer icon generation summary:', summary);
})();
