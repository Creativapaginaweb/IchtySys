const CACHE_NAME = 'ichtysys-cache-v5'; // Incrementa versión
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/IchtySys.png',
  '/insopesca.png',
  '/minpesca.png',
  '/sardina2.png',
  '/manifest.webmanifest'
];

const CDN_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2'
];

// === INSTALL ===
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets v5');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Fuerza al nuevo SW a activarse inmediatamente
        return self.skipWaiting();
      })
      .catch(err => console.error('[SW] Install failed:', err))
  );
});

// === ACTIVATE ===
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
    }).then(() => {
      // Toma control de todas las pestañas/clientes inmediatamente
      return self.clients.claim();
    }).then(() => {
      // Notifica a todos los clientes que hay una actualización
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// === FETCH ===
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar chrome-extension ni otros esquemas no-http
  if (!url.protocol.startsWith('http')) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isCDNResource(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.method !== 'GET') {
    event.respondWith(networkOnly(request));
    return;
  }

  // Para navegación (HTML): network-first para detectar actualizaciones
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

// === MESSAGE: Escuchar mensajes del cliente ===
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
      return new Response('Sin conexión', { status: 503 });
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(response => {
    // Si la respuesta es válida, actualiza el cache
    if (response && response.status === 200) {
      const responseClone = response.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(request, responseClone);
      });
    }
    return response;
  }).catch(() => {
    // Si falla la red, usa cache
    return caches.match(request).then(cached => {
      if (cached) return cached;
      return new Response('Sin conexión', { status: 503 });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(cached => {
    const fetchPromise = fetch(request).then(response => {
      if (response && response.status === 200) {
        cacheResponse(request, response.clone());
      }
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
