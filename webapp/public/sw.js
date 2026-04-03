// Canal4 Service Worker (v2)
const CACHE_NAME = 'canal4-v2';

self.addEventListener('install', (event) => {
  // Skip waiting to activate the new SW immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // We only cache the root and basic assets to make it "installable"
      return cache.addAll(['/']);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all clients immediately
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // For navigation requests (loading index.html), use Network-First strategy.
  // This ensures that we always get the latest index.html which points to the correct hashes.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => {
        return caches.match('/');
      })
    );
    return;
  }

  // For other assets, use Cache-First with Network fallback
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request).then((networkResponse) => {
        // Optionally cache new assets here too if desired, 
        // but for now we keep it simple to avoid poisoning the cache.
        return networkResponse;
      });
    })
  );
});
