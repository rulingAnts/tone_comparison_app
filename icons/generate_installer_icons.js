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
  // CD coming out of a box - scaled and centered in viewBox
  return `
    <!-- Cardboard box in background -->
    <g transform="translate(8, 15) scale(1.8)">
      <!-- Box shadow -->
      <rect x="2" y="2" width="50" height="45" rx="2" fill="rgba(0,0,0,0.2)"/>
      <!-- Box body -->
      <rect x="0" y="0" width="50" height="45" rx="2" fill="#D2691E" stroke="#8B4513" stroke-width="1.5"/>
      <!-- Box flaps -->
      <path d="M 0,10 L 5,5 L 45,5 L 50,10 Z" fill="#CD853F" stroke="#8B4513" stroke-width="1"/>
      <path d="M 0,10 L 5,15 L 45,15 L 50,10 Z" fill="#DEB887" stroke="#8B4513" stroke-width="1"/>
      <!-- Box tape -->
      <rect x="22" y="0" width="6" height="45" fill="rgba(255,255,255,0.3)"/>
    </g>
    
    <!-- CD/DVD emerging from box -->
    <g transform="translate(23, 10) scale(1.8)">
      <!-- CD shadow -->
      <ellipse cx="22" cy="27" rx="24" ry="24" fill="rgba(0,0,0,0.15)"/>
      <!-- CD outer circle -->
      <circle cx="20" cy="25" r="24" fill="url(#cdGradient)" stroke="#8090A0" stroke-width="1.5"/>
      <!-- CD inner circle (hole) -->
      <circle cx="20" cy="25" r="5" fill="#333" stroke="#666" stroke-width="1"/>
      <!-- CD reflection/shine -->
      <path d="M 20,1 A 24,24 0 0,1 44,25 L 20,25 Z" fill="rgba(255,255,255,0.3)" opacity="0.6"/>
      <ellipse cx="15" cy="15" rx="8" ry="6" fill="rgba(255,255,255,0.4)"/>
    </g>
    
    <!-- Gradient definition for CD -->
    <defs>
      <linearGradient id="cdGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#B0C4DE;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#8099B3;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#607D8B;stop-opacity:1" />
      </linearGradient>
      <radialGradient id="appIconGlow" cx="50%" cy="50%" r="50%">
        <stop offset="70%" style="stop-color:rgba(255,255,255,0);stop-opacity:0" />
        <stop offset="100%" style="stop-color:rgba(255,255,255,0.3);stop-opacity:1" />
      </radialGradient>
    </defs>
  `;
}

async function generateInstallerIcon(app) {
  const appBuildDir = path.join(root, app.id, 'build');
  const appIconPath = path.join(appBuildDir, 'icon.png');
  
  if (!fs.existsSync(appIconPath)) {
    throw new Error(`App icon not found: ${appIconPath}`);
  }

  const canvasSize = 1024;
  const iconSize = Math.floor(canvasSize * 0.8); // 819

  // Generate full-size app icon (1024x1024) for manual compositing
  const appIconFullPath = path.join(appBuildDir, 'installer-icon-app.png');
  await sharp(appIconPath)
    .resize(canvasSize, canvasSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(appIconFullPath);

  // Generate full-size CD/box overlay (1024x1024) for manual compositing
  const overlaySVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
  ${installerOverlaySVG()}
</svg>`;

  const overlayBuffer = Buffer.from(overlaySVG, 'utf-8');
  const overlayFullPath = path.join(appBuildDir, 'installer-icon-overlay.png');
  await sharp(overlayBuffer)
    .resize(canvasSize, canvasSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(overlayFullPath);

  // Now composite them: app icon at 80% in top-left, overlay at 65% in bottom-right
  const appIconSize = Math.floor(canvasSize * 0.80); // 819
  const overlaySize = Math.floor(canvasSize * 0.65); // 666

  const appIconResized = await sharp(appIconFullPath)
    .resize(appIconSize, appIconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const overlayResized = await sharp(overlayFullPath)
    .resize(overlaySize, overlaySize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const installerPngPath = path.join(appBuildDir, 'installer-icon.png');
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([
    { input: appIconResized, top: 0, left: 0, blend: 'over' },
    { input: overlayResized, top: canvasSize - overlaySize, left: canvasSize - overlaySize, blend: 'over' }
  ])
  .png()
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
    appIcon: fs.existsSync(appIconFullPath),
    overlay: fs.existsSync(overlayFullPath),
    combined: fs.existsSync(installerPngPath),
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
