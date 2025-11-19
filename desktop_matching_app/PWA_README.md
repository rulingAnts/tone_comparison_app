# Desktop Tone Matching - PWA Edition

Progressive Web App version of the Desktop Tone Matching application with offline support and automatic updates.

## Features

✅ **Fully Offline Capable** - Works without internet connection after first load  
✅ **Automatic Updates** - Service worker checks for and installs updates automatically  
✅ **Installable** - Can be installed as a standalone app on desktop and mobile  
✅ **Robust Caching** - Aggressive caching of static assets and audio files  
✅ **Session Persistence** - Sessions saved locally with IndexedDB  
✅ **Cross-Platform** - Works on Windows, Mac, Linux, iOS, Android  

## Getting Started

### Development Mode

1. Install dependencies:
   ```bash
   cd desktop_matching_app
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to `http://localhost:3000`

4. The app will automatically register the service worker for offline functionality

### Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy the `public/` directory and `server/` directory to your hosting provider

3. Set environment variables:
   ```bash
   PORT=3000  # Optional, defaults to 3000
   ```

4. Start the production server:
   ```bash
   npm start:pwa
   ```

## PWA Installation

### Desktop (Chrome/Edge)
1. Visit the app in your browser
2. Click the install icon in the address bar
3. Click "Install" when prompted

### Mobile (iOS Safari)
1. Visit the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

### Mobile (Android Chrome)
1. Visit the app in Chrome
2. Tap the menu (three dots)
3. Select "Install app" or "Add to Home Screen"

## Architecture

### Service Worker
- **Static Assets**: Cache-first strategy for HTML, CSS, JS, fonts
- **API Calls**: Network-first with cache fallback for offline support
- **Audio Files**: Cache-first with on-demand caching
- **Updates**: Automatic detection with user notification

### API Server
- Express server replacing Electron IPC
- Session management with in-memory storage (Redis recommended for production)
- File upload handling with multer
- RESTful endpoints for all operations

### Storage
- **LocalStorage**: Session ID, user preferences
- **IndexedDB**: Bundle data, audio cache (future enhancement)
- **Service Worker Cache**: Static assets, API responses

## API Endpoints

```
GET  /api/session              - Get current session
PATCH /api/session             - Update session data
POST /api/session/reset        - Reset session

POST /api/bundle/load          - Load bundle file (multipart/form-data)
GET  /api/word/current         - Get current word
GET  /api/record/:ref          - Get record by reference
POST /api/word/confirm-spelling - Confirm/update spelling

POST /api/groups               - Create new group
PATCH /api/groups/:id          - Update group
POST /api/groups/:id/words     - Add word to group
DELETE /api/groups/:id/words/:ref - Remove word from group

GET  /api/audio/:file          - Stream audio file

POST /api/bundle/export        - Export modified bundle

POST /api/undo                 - Undo last change
POST /api/redo                 - Redo undone change
GET  /api/undo-redo-state      - Get undo/redo availability
```

## Offline Behavior

When offline, the app will:
- ✅ Load from cached static assets
- ✅ Continue using cached API responses
- ✅ Play cached audio files
- ⚠️ Queue changes for sync when back online
- ❌ Cannot load new bundles (requires upload)

## Browser Compatibility

- Chrome/Edge 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Mobile Chrome 90+ ✅
- Mobile Safari 14+ ✅

## Differences from Electron Version

| Feature | Electron | PWA |
|---------|----------|-----|
| Offline Support | ✅ | ✅ |
| File System Access | Full | Limited (upload/download) |
| Auto Updates | Yes | Yes (via service worker) |
| Installation | Desktop only | Desktop + Mobile |
| Distribution | Download executable | URL access |
| Storage | File system | LocalStorage/IndexedDB |

## Production Recommendations

1. **Use Redis for Session Storage**
   - Replace in-memory Map with Redis
   - Enables horizontal scaling
   - Session persistence across restarts

2. **Enable HTTPS**
   - Required for service workers in production
   - Use Let's Encrypt or similar

3. **Configure CDN**
   - Serve static assets from CDN
   - Reduce server load
   - Improve global performance

4. **Set Cache Headers**
   - Configure appropriate cache lifetimes
   - Use ETags for validation

5. **Monitor Service Worker**
   - Track registration success rate
   - Monitor update adoption
   - Log cache hit rates

## Troubleshooting

### Service Worker Not Registering
- Ensure you're using HTTPS (or localhost)
- Check browser console for errors
- Verify `/service-worker.js` is accessible

### App Not Working Offline
- Clear browser cache and reload
- Check service worker is active in DevTools
- Verify cache contents in Application tab

### Files Not Uploading
- Check file size limits in server config
- Verify multer configuration
- Check network tab for errors

## Development

### Testing Service Worker
```bash
# Use Chrome DevTools
1. Open DevTools (F12)
2. Go to Application tab
3. Click "Service Workers"
4. Check "Update on reload"
```

### Clearing Cache
```javascript
// Run in browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister());
});
caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
```

## License

ISC
