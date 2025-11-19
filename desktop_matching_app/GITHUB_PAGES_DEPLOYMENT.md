# Desktop Matching PWA - GitHub Pages Deployment

This PWA is designed to be deployed on GitHub Pages.

## Repository Structure

- **Root Repository**: https://github.com/rulingAnts/tone_comparison_app
- **This App Path**: `/desktop_matching_app/public/`

## GitHub Pages Configuration

### Option 1: Deploy from Root Repository

If hosting from the main repository:

1. The app will be available at: `https://rulingAnts.github.io/tone_comparison_app/desktop_matching_app/public/`

2. Update `manifest.json`:
   ```json
   {
     "start_url": "/tone_comparison_app/desktop_matching_app/public/",
     "scope": "/tone_comparison_app/desktop_matching_app/public/"
   }
   ```

3. Update `service-worker.js` STATIC_ASSETS paths to include base path:
   ```javascript
   const BASE_PATH = '/tone_comparison_app/desktop_matching_app/public';
   const STATIC_ASSETS = [
     `${BASE_PATH}/`,
     `${BASE_PATH}/index.html`,
     // ... etc
   ];
   ```

### Option 2: Deploy from Subdirectory (Recommended)

Set up GitHub Pages to serve from a specific directory:

1. Go to repository Settings → Pages
2. Set Source to: `main` branch, `/desktop_matching_app/public` folder
3. The app will be available at: `https://rulingAnts.github.io/tone_comparison_app/`

4. Manifest and Service Worker can use root paths (`/index.html`, etc.)

### Option 3: Custom Domain or Subdomain

For a custom domain:

1. Set up `CNAME` file in `/desktop_matching_app/public/`:
   ```
   matching.yourdomain.com
   ```

2. Configure DNS:
   - Type: CNAME
   - Name: matching (or @)
   - Value: rulingAnts.github.io

3. Enable HTTPS in GitHub Pages settings

## File Structure for Deployment

```
public/
├── index.html
├── manifest.json
├── service-worker.js
├── compatibility.js
├── storage.js
├── bundle-processor.js
├── api-client.js
├── renderer.js
├── localization.js
├── fonts/
│   ├── NotoSans-Regular.ttf
│   ├── NotoSans-Bold.ttf
│   ├── NotoSansDevanagari-Regular.ttf
│   └── NotoSansThai-Regular.ttf
├── locales/
│   ├── en.json
│   ├── es.json
│   ├── pt.json
│   └── fr.json
└── icons/
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    └── icon-512x512.png
```

## Deployment Steps

### 1. Prepare Icons

Generate PWA icons (see `icons/README.md`) and place in `public/icons/`.

### 2. Configure Base Path (if needed)

If deploying to a subdirectory, update:

**public/index.html**:
```html
<base href="/tone_comparison_app/desktop_matching_app/public/">
<link rel="manifest" href="./manifest.json">
<script src="./service-worker.js"></script>
```

**public/manifest.json**:
```json
{
  "start_url": "/tone_comparison_app/desktop_matching_app/public/",
  "scope": "/tone_comparison_app/desktop_matching_app/public/",
  "icons": [
    {
      "src": "/tone_comparison_app/desktop_matching_app/public/icons/icon-192x192.png",
      ...
    }
  ]
}
```

**public/service-worker.js**:
Add base path to all cached URLs.

### 3. Test Locally

```bash
cd desktop_matching_app
python3 serve-pwa.py
# Visit http://localhost:8080
```

### 4. Commit and Push

```bash
git add public/
git commit -m "Deploy PWA to GitHub Pages"
git push origin main
```

### 5. Enable GitHub Pages

1. Go to: https://github.com/rulingAnts/tone_comparison_app/settings/pages
2. Source: Deploy from a branch
3. Branch: main
4. Folder: `/desktop_matching_app/public` (if available) or root
5. Save

### 6. Wait for Deployment

- GitHub Actions will build and deploy
- Check status at: https://github.com/rulingAnts/tone_comparison_app/actions
- Site will be live at: https://rulingAnts.github.io/tone_comparison_app/

## HTTPS Requirement

- GitHub Pages automatically provides HTTPS
- Service Workers REQUIRE HTTPS in production
- Localhost is exempt from HTTPS requirement (for development)

## Testing Deployment

After deployment, test:

1. ✅ App loads on all supported browsers
2. ✅ Service Worker registers successfully
3. ✅ App works offline (after first load)
4. ✅ CDN libraries are cached
5. ✅ Mobile devices show error page
6. ✅ Can install as PWA
7. ✅ Can load and process .tnset files
8. ✅ Updates check and prompt correctly

## Troubleshooting

### Service Worker Not Registering

- Check browser console for errors
- Verify HTTPS is enabled
- Check service-worker.js paths match deployment structure
- Clear cache and hard reload (Ctrl+Shift+R)

### 404 Errors for Assets

- Update base path in all files
- Check file paths are relative: `./file.js` not `/file.js`
- Verify files are in correct directory

### CDN Libraries Not Loading

- Check network tab in DevTools
- Verify CDN URLs are correct
- Check Content Security Policy (CSP) headers

### App Won't Install

- Verify manifest.json is valid: https://manifest-validator.appspot.com/
- Check all required icons exist
- Verify HTTPS is enabled
- Check browser console for PWA warnings

## Cache Busting

When updating the app:

1. Update `CACHE_VERSION` in `service-worker.js`:
   ```javascript
   const CACHE_VERSION = 'v1.0.1'; // Increment version
   ```

2. Commit and push
3. GitHub Pages will update
4. Users will get update prompt on next visit

## Monitoring

- **GitHub Pages Analytics**: Settings → Pages → Analytics
- **Browser DevTools**: Application tab → Service Workers
- **Console Logs**: Check for `[PWA]`, `[Storage]`, `[Bundle]` messages

## Performance

- First load: ~2-3 MB (includes CDN libraries and fonts)
- Subsequent loads: Instant (from cache)
- Offline: Fully functional
- Bundle loading: Client-side only, no server roundtrip

## Security

- All data stored locally (IndexedDB)
- No server-side storage or processing
- No user data sent to external services
- CDN libraries use SRI (Subresource Integrity) where available

## Updates

Users get automatic update prompts when:
- New version deployed to GitHub Pages
- User opens app after being away
- Hourly check triggers (while app is open)

No app store submission or manual downloads needed!
