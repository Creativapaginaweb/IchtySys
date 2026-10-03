const CACHE_NAME = 'ichtysys-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/IchtySys.png',
  '/insopesca.png',
  '/minpesca.png',
  '/sardina2.png',
  '/manifest.webmanifest'
];

// CDN resources that should be cached for offline use
const CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2'
];

// Install: Cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

// Activate: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First for static, Network-First for dynamic
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Strategy 1: Cache-First for static assets (your files)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Strategy 2: Stale-While-Revalidate for CDN libraries
  if (isCDNResource(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Strategy 3: Network-First for API calls (if you add any later)
  if (request.method !== 'GET') {
    event.respondWith(networkOnly(request));
    return;
  }

  // Default: Cache-First for everything else
  event.respondWith(cacheFirst(request));
});

// === STRATEGIES ===

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) {
      return cached;
    }
    return fetch(request).then(response => {
      return cacheResponse(request, response);
    }).catch(err => {
      console.error('[SW] Fetch failed:', err);
      // Return offline fallback if available
      return new Response('Sin conexión', { status: 503 });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(cached => {
    const fetchPromise = fetch(request).then(response => {
      cacheResponse(request, response.clone());
      return response;
    }).catch(() => cached);

    return cached || fetchPromise;
  });
}

function networkOnly(request) {
  return fetch(request).catch(() => {
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  });
}

// === HELPERS ===

function isStaticAsset(url) {
  return STATIC_ASSETS.some(path => url.pathname === path);
}

function isCDNResource(url) {
  return CDN_RESOURCES.some(resource => url.href.includes(resource));
}

function cacheResponse(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') {
    return response;
  }
  const responseClone = response.clone();
  caches.open(CACHE_NAME).then(cache => {
    cache.put(request, responseClone);
  });
  return response;
}
