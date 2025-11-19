const CACHE_VERSION = 'v3.0.0';
const CACHE_NAME = `desktop-matching-${CACHE_VERSION}`;
const CDN_CACHE = `cdn-libs-${CACHE_VERSION}`;

// Static assets to cache on install (client-side only PWA)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/compatibility.js',
  '/xml-handler.js',
  '/renderer.js',
  '/api-client.js',
  '/storage.js',
  '/bundle-processor.js',
  '/localization.js',
  '/locales/en.json',
  '/locales/es.json',
  '/locales/pt.json',
  '/locales/fr.json',
  '/fonts/NotoSans-Regular.ttf',
  '/fonts/NotoSans-Bold.ttf',
  '/fonts/NotoSansDevanagari-Regular.ttf',
  '/fonts/NotoSansThai-Regular.ttf',
  '/manifest.json'
];

// CDN Libraries - cached separately for offline use (JSZip only now)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// Install event - cache static assets and CDN libraries
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache local static assets
      caches.open(CACHE_NAME).then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache CDN libraries separately
      caches.open(CDN_CACHE).then(cache => {
        console.log('[Service Worker] Caching CDN libraries');
        return cache.addAll(CDN_ASSETS);
      })
    ]).then(() => {
      console.log('[Service Worker] Installation complete');
      // Activate immediately without waiting
      return self.skipWaiting();
    }).catch(error => {
      console.error('[Service Worker] Installation failed:', error);
    })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== CDN_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activation complete');
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - network-first with cache fallback for updates, cache-first for CDN
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // For CDN resources, use cache-first (they're versioned)
  if (url.origin !== location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CDN_CACHE).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // For local resources, use network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Don't cache non-GET requests or non-success responses
        if (event.request.method !== 'GET' || !response || response.status !== 200) {
          return response;
        }

        // Clone and cache the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // If network fails, fall back to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // If no cache and navigation request, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          
          throw new Error('Fetch failed and no cache available');
        });
      })
  );
});

// Message event - handle commands from clients
self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        return self.registration.unregister();
      })
    );
  }
  
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// Background sync for offline changes (if supported)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-changes') {
    event.waitUntil(
      // Notify clients that they can sync changes
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_CHANGES' });
        });
      })
    );
  }
});

console.log('[Service Worker] Loaded (Client-side only), version:', CACHE_VERSION);
