const CACHE_PREFIX = 'mortal-mesh-cache-';
const FALLBACK_CACHE = `${CACHE_PREFIX}fallback`;
const AI_CACHE_NAME = 'mortal-mesh-ai-v1';
const FALLBACK_AI_ASSET_URLS = [
  '/ai/wasm/vision_wasm_internal.js',
  '/ai/wasm/vision_wasm_internal.wasm',
  '/ai/models/pose_landmarker_full.task',
  '/ai/models/hand_landmarker.task',
];

let activeCacheName = FALLBACK_CACHE;
let activeWarmPromise = null;
let activeAiWarmPromise = null;

async function readPrecacheManifest() {
  const response = await fetch('/sw-precache.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch sw-precache.json: ${response.status}`);
  }
  return response.json();
}

async function broadcastClients(payload) {
  const clientList = await self.clients.matchAll({
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    client.postMessage(payload);
  }
}

async function countCachedModels(cache, allModelUrls) {
  const matches = await Promise.all(allModelUrls.map((url) => cache.match(url)));
  return matches.filter(Boolean).length;
}

async function warmOptionalModels(manifestArg, cacheNameArg) {
  if (activeWarmPromise) return activeWarmPromise;

  activeWarmPromise = (async () => {
    try {
      const manifest = manifestArg || (await readPrecacheManifest());
      const targetCacheName =
        cacheNameArg ||
        (manifest && manifest.version
          ? `${CACHE_PREFIX}${manifest.version}`
          : activeCacheName);
      activeCacheName = targetCacheName;

      const optionalUrls = Array.isArray(manifest?.optionalModelUrls)
        ? manifest.optionalModelUrls
        : [];
      const coreModelUrls = Array.isArray(manifest?.urls)
        ? manifest.urls.filter(
            (u) => typeof u === 'string' && u.startsWith('/models/')
          )
        : ['/models/anatomy.glb', '/models/mannequin-female.glb'];
      const allModelUrls = Array.from(new Set([...coreModelUrls, ...optionalUrls]));
      const totalCount = allModelUrls.length;
      const cache = await caches.open(targetCacheName);

      let cachedCount = await countCachedModels(cache, allModelUrls);
      await broadcastClients({
        type: 'SW_MODELS_CACHE_STATUS',
        cachedCount,
        totalCount,
      });

      for (const url of optionalUrls) {
        try {
          const existing = await cache.match(url);
          if (!existing) {
            const req = new Request(url, { cache: 'reload' });
            const res = await fetch(req);
            if (res && res.ok) {
              await cache.put(url, res);
            }
          }
        } catch {
          // Optional model warm failed (e.g. offline); skip cleanly
        }
        cachedCount = await countCachedModels(cache, allModelUrls);
        await broadcastClients({
          type: 'SW_MODELS_CACHE_STATUS',
          cachedCount,
          totalCount,
        });
      }
    } catch {
      // Ignore manifest read failure during background model warm
    } finally {
      activeWarmPromise = null;
    }
  })();

  return activeWarmPromise;
}

async function resolveAiAssetUrls(manifestArg) {
  try {
    const manifest = manifestArg || (await readPrecacheManifest());
    if (Array.isArray(manifest?.aiAssetUrls) && manifest.aiAssetUrls.length > 0) {
      return manifest.aiAssetUrls;
    }
  } catch {
    // Fall back to static required AI URL list when offline or manifest unavailable
  }
  return FALLBACK_AI_ASSET_URLS;
}

async function computeAiCacheStatus(manifestArg) {
  const aiUrls = await resolveAiAssetUrls(manifestArg);
  const aiCache = await caches.open(AI_CACHE_NAME);
  const matches = await Promise.all(
    aiUrls.map((url) => aiCache.match(url, { ignoreSearch: true }))
  );
  const cachedCount = matches.filter(Boolean).length;
  const totalCount = aiUrls.length;
  const cached = totalCount > 0 && cachedCount >= totalCount;
  return {
    type: 'SW_AI_CACHE_STATUS',
    cached,
    cachedCount,
    totalCount,
  };
}

async function checkAiCacheStatus(replyPort) {
  try {
    const status = await computeAiCacheStatus(null);
    if (replyPort && typeof replyPort.postMessage === 'function') {
      replyPort.postMessage(status);
    }
    await broadcastClients(status);
  } catch {
    // Ignore status check failures
  }
}

async function warmAiAssets() {
  if (activeAiWarmPromise) return activeAiWarmPromise;

  activeAiWarmPromise = (async () => {
    try {
      const aiUrls = await resolveAiAssetUrls(null);
      const aiCache = await caches.open(AI_CACHE_NAME);

      for (const url of aiUrls) {
        try {
          const existing = await aiCache.match(url, { ignoreSearch: true });
          if (!existing) {
            const req = new Request(url, { cache: 'reload' });
            const res = await fetch(req);
            if (res && res.ok) {
              await aiCache.put(url, res);
            }
          }
        } catch {
          // Skip individual failure cleanly (e.g. offline)
        }
      }

      const status = await computeAiCacheStatus(null);
      await broadcastClients(status);
    } catch {
      // Ignore AI warm failures
    } finally {
      activeAiWarmPromise = null;
    }
  })();

  return activeAiWarmPromise;
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
      let loadedManifest = null;
      try {
        loadedManifest = await readPrecacheManifest();
        if (loadedManifest && loadedManifest.version) {
          currentName = `${CACHE_PREFIX}${loadedManifest.version}`;
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
      await broadcastClients({
        type: 'SW_OFFLINE_READY',
        cacheName: currentName,
      });
      await checkAiCacheStatus(null);

      // Kick off background warming of additional rigged models without stalling first boot.
      setTimeout(() => {
        void warmOptionalModels(loadedManifest, currentName);
      }, 50);
    })()
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'WARM_ALL_MODELS') {
    event.waitUntil(warmOptionalModels(null, activeCacheName));
  } else if (event.data.type === 'CHECK_AI_CACHE_STATUS') {
    event.waitUntil(checkAiCacheStatus(event.source));
  } else if (event.data.type === 'WARM_AI_ASSETS') {
    event.waitUntil(warmAiAssets());
  }
});

function isCacheFirstPath(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/models/') ||
    pathname.startsWith('/draco/') ||
    pathname.startsWith('/icons/')
  );
}

async function handleAiCacheFirst(request) {
  const aiCache = await caches.open(AI_CACHE_NAME);
  const direct = await aiCache.match(request);
  if (direct) return direct;

  const url = new URL(request.url);
  const byPath = await aiCache.match(url.pathname, { ignoreSearch: true });
  if (byPath) return byPath;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await aiCache.put(url.pathname, response.clone());
      void checkAiCacheStatus(null);
    }
    return response;
  } catch {
    return new Response('AI asset unavailable offline', { status: 503 });
  }
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

  if (url.pathname.startsWith('/ai/')) {
    event.respondWith(handleAiCacheFirst(request));
    return;
  }

  if (isCacheFirstPath(url.pathname)) {
    event.respondWith(handleCacheFirst(request));
    return;
  }

  event.respondWith(handleStaleWhileRevalidate(request));
});
