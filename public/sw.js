// SINESA Service Worker - Self-destruct & pass-through
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});

// Explicit pass-through: DO NOT call event.respondWith
self.addEventListener('fetch', () => {
  // Let browser natively handle all network requests
});

