# Quick Start - Client-Side PWA

## 🚀 What Is This?

A **fully client-side Progressive Web App** that runs entirely in your browser - no server needed!

- ✅ **100% Browser-Based** - All processing happens locally
- ✅ **Offline-First** - Works without internet after first load  
- ✅ **Desktop Only** - Optimized for desktop browsers (mobile blocked)
- ✅ **Cross-Browser** - Chrome, Firefox, Edge, Safari
- ✅ **Auto-Updates** - Updates automatically when online
- ✅ **Installable** - Add to desktop like a native app

## 📋 Requirements

### Supported Browsers (Desktop Only)

| Browser | Version | Platform | Status |
|---------|---------|----------|--------|
| Chrome | 90+ | Windows/Mac | ✅ Fully Supported |
| Edge | 90+ | Windows/Mac | ✅ Fully Supported |
| Firefox | 88+ | Windows/Mac | ✅ Fully Supported |
| Safari | 14+ | Mac | ✅ Fully Supported |

**Mobile browsers are blocked** - app will show error page on mobile devices.

## 🎯 Local Testing

### Start the Server

```bash
cd desktop_matching_app
python3 serve-pwa.py
```

The server will start on `http://localhost:8080`

### Open in Browser

Visit: `http://localhost:8080`

You should see:

1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in left sidebar
4. You should see `service-worker.js` registered and activated

## Test Offline Mode

1. Load the app in browser
2. Open DevTools (F12)
3. Go to **Network** tab
4. Check **Offline** checkbox
5. Reload the page
6. App should still load from cache

## Test Installation

### Chrome/Edge Desktop
1. Look for install icon (⊕) in address bar
2. Click it
3. Click "Install"
4. App opens in standalone window

### Mobile Testing
Use Chrome DevTools device emulation:
1. Open DevTools
2. Click device icon (⊞)
3. Select a mobile device
4. The install prompt should appear

## Test Features

### Load Bundle
1. Click "Load Bundle" button
2. Select a `.tnset` file
3. Should extract and load

### Session Persistence
1. Load a bundle
2. Refresh the page
3. Session should restore (sessionId in localStorage)

### Audio Playback
1. Load bundle with audio
2. Navigate to a word
3. Click play button
4. Audio should stream and cache

### Export Bundle
1. Load and modify a bundle
2. Click "Export"
3. Should download modified `.tnset` file

## Inspect Cache

1. Open DevTools
2. Go to **Application** tab
3. Expand **Cache Storage**
4. Click `desktop-matching-v1.0.0`
5. See cached files

## View Network Requests

1. Open DevTools
2. Go to **Network** tab
3. Interact with app
4. See API calls to `/api/*` endpoints

## Test Updates

1. Edit `service-worker.js`
2. Change `CACHE_VERSION` from `v1.0.0` to `v1.0.1`
3. Reload the page
4. Should see update prompt

## Common Issues

### Service Worker Not Registering
**Problem**: Console shows registration error  
**Solution**: Ensure server is running and `/service-worker.js` is accessible

### App Not Working Offline
**Problem**: Network errors when offline  
**Solution**: Load app online first to populate cache

### Audio Not Playing
**Problem**: Audio files return 404  
**Solution**: Check bundle has audio files and path is correct

### Can't Load Bundle
**Problem**: File upload fails  
**Solution**: Check server logs, verify multer middleware

## DevTools Tips

### Check if PWA
Go to Application > Manifest - should show manifest.json details

### Check Cache Size
Application > Cache Storage - see size of each cache

### Force Update
Application > Service Workers > Check "Update on reload"

### Clear Everything
Application > Clear Storage > "Clear site data"

## Testing Checklist

- [ ] Server starts without errors
- [ ] Page loads at http://localhost:3000
- [ ] Service worker registers successfully
- [ ] App loads offline (after first visit)
- [ ] Can load .tnset bundle
- [ ] Can create groups
- [ ] Can add words to groups
- [ ] Audio plays correctly
- [ ] Can export modified bundle
- [ ] Undo/Redo works
- [ ] Session persists across refreshes
- [ ] Can install as app
- [ ] Update prompt appears when version changes

## Production Testing

When deploying to production server:

1. **HTTPS Required**
   - Service workers require HTTPS
   - Exception: localhost (for development)

2. **Test Installation**
   - Mobile iOS: Safari > Share > Add to Home Screen
   - Mobile Android: Chrome > Menu > Install app
   - Desktop: Address bar install icon

3. **Test Across Browsers**
   - Chrome ✓
   - Edge ✓
   - Firefox ✓
   - Safari ✓

4. **Test Offline Sync**
   - Make changes offline
   - Go back online
   - Changes should sync

## Debugging

### Enable Verbose Logging

In browser console:
```javascript
// Service Worker debugging
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Registered SWs:', regs);
});

// Check cache
caches.keys().then(keys => {
  console.log('Cache keys:', keys);
  keys.forEach(key => {
    caches.open(key).then(cache => {
      cache.keys().then(reqs => {
        console.log(key + ':', reqs.length, 'items');
      });
    });
  });
});

// Check session
console.log('Session ID:', localStorage.getItem('sessionId'));
```

### Server-Side Debugging

In `server/server.js`, add logging:
```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

## Need Help?

Check these files:
- `PWA_README.md` - Full documentation
- `PWA_CONVERSION_SUMMARY.md` - Technical details
- `public/icons/README.md` - Icon generation

## Quick Commands

```bash
# Install dependencies
npm install

# Start PWA server
npm run dev

# Start on different port
PORT=8080 npm run dev

# View installed packages
npm list --depth=0

# Check for updates
npm outdated

# Original Electron version (still works)
npm start
```

## Expected Console Output

### Successful Load
```
[Service Worker] Installing...
[Service Worker] Caching static assets
[Service Worker] Installation complete
[Service Worker] Activating...
[Service Worker] Activation complete
Service Worker registered: http://localhost:3000/
```

### Offline Mode
```
[Service Worker] Serving from cache (offline): /api/session
[Service Worker] Serving audio from cache: /api/audio/word001.wav
```

## Performance Tips

1. **Preload Critical Resources**
   - Service worker caches on install
   - First load caches everything

2. **Cache Audio On-Demand**
   - Audio cached when first played
   - Subsequent plays from cache

3. **Lazy Load Bundles**
   - Only load active bundle into memory
   - Clear old bundle data

Happy testing! 🚀
