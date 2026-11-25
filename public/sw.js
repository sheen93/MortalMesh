const CACHE_PREFIX = 'mortal-mesh-cache-';
const FALLBACK_CACHE = `${CACHE_PREFIX}fallback`;

let activeCacheName = FALLBACK_CACHE;

async function readPrecacheManifest() {
  const response = await fetch('/sw-precache.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch sw-precache.json: ${response.status}`);
  }
  return response.json();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const manifest = await readPrecacheManifest();
        activeCacheName = `${CACHE_PREFIX}${manifest.version}`;
        const cache = await caches.open(activeCacheName);
        const urls = Array.isArray(manifest.urls) ? manifest.urls : ['/'];

        await Promise.all(
          urls.map(async (url) => {
            try {
              const req = new Request(url, { cache: 'reload' });
              const res = await fetch(req);
              if (res && res.ok) {
                await cache.put(url, res);
              }
            } catch {
              // Individual optional fetch failure handled gracefully
            }
          })
        );
      } catch {
        // Fallback if manifest fetch fails during install
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      let currentName = activeCacheName;
      try {
        const manifest = await readPrecacheManifest();
        if (manifest && manifest.version) {
          currentName = `${CACHE_PREFIX}${manifest.version}`;
          activeCacheName = currentName;
        }
      } catch {
        const keys = await caches.keys();
        const matching = keys.filter((k) => k.startsWith(CACHE_PREFIX));
        if (matching.length > 0 && currentName === FALLBACK_CACHE) {
          currentName = matching[matching.length - 1];
        }
      }

      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== currentName)
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
      const clientList = await self.clients.matchAll({
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        client.postMessage({ type: 'SW_OFFLINE_READY', cacheName: currentName });
      }
    })()
  );
});

function isCacheFirstPath(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/models/') ||
    pathname.startsWith('/draco/') ||
    pathname.startsWith('/icons/')
  );
}

async function cacheMatchAny(request) {
  const direct = await caches.match(request);
  if (direct) return direct;
  const url = new URL(request.url);
  return caches.match(url.pathname);
}

async function handleCacheFirst(request) {
  const cached = await cacheMatchAny(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(activeCacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigate(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(activeCacheName);
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    const exactMatch = await caches.match(request);
    if (exactMatch) return exactMatch;
    const rootFallback = await caches.match('/');
    if (rootFallback) return rootFallback;
    return Response.error();
  }
}

async function handleStaleWhileRevalidate(request) {
  const cached = await cacheMatchAny(request);
  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(activeCacheName);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const networkRes = await fetchPromise;
  return networkRes || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/sw.js' || url.pathname === '/sw-precache.json') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (isCacheFirstPath(url.pathname)) {
    event.respondWith(handleCacheFirst(request));
    return;
  }

  event.respondWith(handleStaleWhileRevalidate(request));
});
