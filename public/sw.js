const CACHE_NAME = 'ai-persona-assistant-cache-v2';
const URLS_TO_CACHE = [
  // Core application files
  '/',
  '/index.html',
  '/manifest.json',
  '/index.css',
  '/index.tsx',

  // Critical CDN resources from index.html
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400..900&display=swap',
  'https://unpkg.com/mammoth@1.7.1/mammoth.browser.min.js',
  'https://unpkg.com/docx@8.5.0/build/index.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',

  // Importmap resources
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/client',
  'https://aistudiocdn.com/@google/genai@^1.24.0',

  // Background image
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Add all URLs to cache, but don't let one failed request prevent the service worker from installing.
        const promises = URLS_TO_CACHE.map(url => {
            // Create a request object, especially for cross-origin URLs
            const request = new Request(url, { mode: 'no-cors' });
            return cache.add(request).catch(err => {
                console.warn(`Failed to cache ${url}:`, err);
            });
        });
        return Promise.all(promises);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request because it's a stream and can only be consumed once
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          response => {
            // Check if we received a valid response.
            // Only cache valid (status 200) responses.
            // Avoid caching opaque responses unless necessary, as their status cannot be checked.
            if (!response || response.status !== 200) {
              return response;
            }

            // Clone the response because it's also a stream
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
