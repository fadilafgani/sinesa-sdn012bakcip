const CACHE_NAME = 'sinesa-cache-v1';
const SHELL_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png'
];

// Install Event - Pre-cache Shell Resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll(SHELL_RESOURCES);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing stale cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle Caching Strategies
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests and WebSockets
  if (event.request.method !== 'GET' || event.request.url.startsWith('ws') || event.request.url.startsWith('wss')) {
    return;
  }

  // Strategy 1: Network Only for Supabase Realtime REST endpoints & Hot Module Replacement
  if (requestUrl.pathname.includes('/realtime/') || requestUrl.pathname.includes('/stream') || event.request.url.includes('hot-update')) {
    return;
  }

  // Strategy 2: Network First for Supabase API requests (Rest/Auth)
  if (event.request.url.includes('supabase.co') || requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          console.log('[Service Worker] API Fetch failed, returning cached version');
          return caches.match(event.request);
        })
    );
    return;
  }

  // Strategy 3: Cache First for local static assets (JS, CSS, fonts, local images)
  const isStaticAsset = 
    requestUrl.pathname.includes('/assets/') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.css') ||
    requestUrl.pathname.endsWith('.woff2') ||
    requestUrl.pathname.endsWith('.png') ||
    requestUrl.pathname.endsWith('.svg') ||
    requestUrl.pathname.endsWith('.webp');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Strategy 4: Network First with Cache Fallback for SPA Routing (handling index.html fallback)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Return pre-cached index.html for SPA routes when offline
        return caches.match('/index.html') || caches.match('/');
      })
  );
});
