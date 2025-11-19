# PWA Icons Placeholder

The manifest.json references icons at various sizes. You should create the following icon files:

- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png
- badge-72x72.png (for notifications)
- shortcut-load.png (for shortcuts)

## Generating Icons

You can use the existing icon from the main project or create new ones:

### Using ImageMagick:
```bash
# From a single large PNG (e.g., 1024x1024)
convert icon-1024.png -resize 72x72 icon-72x72.png
convert icon-1024.png -resize 96x96 icon-96x96.png
convert icon-1024.png -resize 128x128 icon-128x128.png
convert icon-1024.png -resize 144x144 icon-144x144.png
convert icon-1024.png -resize 152x152 icon-152x152.png
convert icon-1024.png -resize 192x192 icon-192x192.png
convert icon-1024.png -resize 384x384 icon-384x384.png
convert icon-1024.png -resize 512x512 icon-512x512.png
```

### Using Online Tools:
- https://realfavicongenerator.net/
- https://www.pwa-icon-generator.com/

### Temporary Solution:
For testing, you can use simple colored squares or copy the same image at all sizes.

## Icon Requirements

- **Format**: PNG
- **Background**: Solid color or transparent
- **Safe Area**: Keep important content in center 80% for maskable icons
- **Design**: Simple, recognizable, high contrast
