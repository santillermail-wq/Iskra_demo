const CACHE_NAME = 'ai-persona-assistant-cache-v2';
const URLS_TO_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(URLS_TO_PRECACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Use a cache-first strategy for GET requests.
  // Other requests (e.g., POST to Gemini API) are not handled and will pass through to the network.
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          // If a cached response is found, return it.
          if (cachedResponse) {
            return cachedResponse;
          }

          // If not in cache, fetch from the network.
          return fetch(event.request).then(
            networkResponse => {
              // Check if the response is valid and cacheable.
              // We cache successful responses (status 200) and opaque responses from CDNs.
              if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                // Clone the response because it's a one-time use stream.
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, responseToCache);
                  });
              }
              // Return the network response.
              return networkResponse;
            }
          ).catch(error => {
            // This catch handles network errors, e.g., when the user is offline.
            // For now, we just let the fetch fail, and the app's UI should handle it.
            console.log('Service Worker: Fetch failed for', event.request.url, error);
            // We must return a promise that resolves with undefined or rejects to let the browser handle the error.
          });
        })
    );
  }
});
