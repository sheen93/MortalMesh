'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DownloadCloudIcon,
  WifiIcon,
  WifiOffIcon,
} from '@/components/StudioPrimitives';
import { MODEL_CATALOG, MODEL_ORDER } from '@/data/modelCatalog';
import type { StudioThemeSpec } from '@/data/studioThemes';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const MODEL_URLS = MODEL_ORDER.map((id) => MODEL_CATALOG[id].url);
const AI_CACHE_NAME = 'mortal-mesh-ai-v1';
const REQUIRED_AI_URLS = [
  '/ai/wasm/vision_wasm_internal.js',
  '/ai/wasm/vision_wasm_internal.wasm',
  '/ai/models/pose_landmarker_full.task',
  '/ai/models/hand_landmarker.task',
];

export interface PwaState {
  isOnline: boolean;
  offlineReady: boolean;
  aiCacheReady: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  isSwSupported: boolean;
  cachedModelsCount: number;
  totalModelsCount: number;
  isWarmingModels: boolean;
  warmAllModels: () => void;
  warmAiAssets: () => void;
  refreshAiCacheStatus: () => void;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export async function verifyAiCachesReady(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const aiCache = await caches.open(AI_CACHE_NAME);
    const matches = await Promise.all(
      REQUIRED_AI_URLS.map((url) => aiCache.match(url, { ignoreSearch: true }))
    );
    return matches.every(Boolean);
  } catch {
    return false;
  }
}

async function verifyCriticalCachesReady(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const [rootMatch, classicMatch, femaleMatch, wasmMatch] = await Promise.all([
      caches.match('/'),
      caches.match('/models/anatomy.glb'),
      caches.match('/models/mannequin-female.glb'),
      caches.match('/draco/draco_decoder.wasm'),
    ]);
    return Boolean(rootMatch && classicMatch && femaleMatch && wasmMatch);
  } catch {
    return false;
  }
}

async function countCachedModels(): Promise<number> {
  if (typeof window === 'undefined' || !('caches' in window)) return 0;
  try {
    const matches = await Promise.all(
      MODEL_URLS.map((url) => caches.match(url))
    );
    return matches.filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function usePwaState(): PwaState {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [aiCacheReady, setAiCacheReady] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isSwSupported, setIsSwSupported] = useState(false);
  const [cachedModelsCount, setCachedModelsCount] = useState(0);
  const [isWarmingModels, setIsWarmingModels] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const refreshAiCacheStatus = useCallback(() => {
    if (typeof window === 'undefined') return;
    void verifyAiCachesReady().then((ready) => {
      setAiCacheReady(ready);
    });
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker
        .getRegistration('/')
        .then((reg) => {
          const target = navigator.serviceWorker.controller || reg?.active;
          if (target) {
            target.postMessage({ type: 'CHECK_AI_CACHE_STATUS' });
          }
        })
        .catch(() => {
          // Ignore SW status query errors
        });
    }
  }, []);

  const warmAiAssets = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !navigator.onLine
    ) {
      return;
    }

    void navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => {
        const target = navigator.serviceWorker.controller || reg?.active;
        if (target) {
          target.postMessage({ type: 'WARM_AI_ASSETS' });
        }
      })
      .catch(() => {
        // Ignore AI cache warm errors
      });
  }, []);

  const warmAllModels = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !navigator.onLine
    ) {
      return;
    }

    setIsWarmingModels(true);
    void navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => {
        const target = navigator.serviceWorker.controller || reg?.active;
        if (target) {
          target.postMessage({ type: 'WARM_ALL_MODELS' });
        } else {
          setIsWarmingModels(false);
        }
      })
      .catch(() => {
        setIsWarmingModels(false);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);
    const checkStandalone = () => {
      const displayStandalone =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone = Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone
      );
      setIsStandalone(displayStandalone || iosStandalone);
    };
    checkStandalone();

    const handleOnline = () => {
      setIsOnline(true);
      refreshAiCacheStatus();
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        void countCachedModels().then((count) => {
          setCachedModelsCount(count);
          if (count < MODEL_URLS.length) {
            warmAllModels();
          }
        });
      }
    };
    const handleOffline = () => setIsOnline(false);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setIsStandalone(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const swSupported = 'serviceWorker' in navigator;
    setIsSwSupported(swSupported);

    let cleanupSw = () => {};
    if (swSupported && process.env.NODE_ENV === 'production') {
      const checkReady = async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const hasControllerOrActive = Boolean(
          navigator.serviceWorker.controller || reg?.active
        );
        if (hasControllerOrActive) {
          const [cached, modelCount, aiReady] = await Promise.all([
            verifyCriticalCachesReady(),
            countCachedModels(),
            verifyAiCachesReady(),
          ]);
          setCachedModelsCount(modelCount);
          setAiCacheReady(aiReady);
          if (cached) {
            setOfflineReady(true);
            if (modelCount < MODEL_URLS.length && navigator.onLine) {
              warmAllModels();
            }
          }
        }
      };

      const handleSwMessage = (event: MessageEvent) => {
        if (!event.data || typeof event.data !== 'object') return;
        const msg = event.data as {
          type?: string;
          cachedCount?: number;
          totalCount?: number;
          cached?: boolean;
        };

        if (msg.type === 'SW_OFFLINE_READY') {
          void Promise.all([
            verifyCriticalCachesReady(),
            countCachedModels(),
            verifyAiCachesReady(),
          ]).then(([ready, modelCount, aiReady]) => {
            setOfflineReady(ready);
            setCachedModelsCount(modelCount);
            setAiCacheReady(aiReady);
            if (ready && modelCount < MODEL_URLS.length && navigator.onLine) {
              warmAllModels();
            }
          });
        } else if (msg.type === 'SW_MODELS_CACHE_STATUS') {
          const count =
            typeof msg.cachedCount === 'number' ? msg.cachedCount : 0;
          const total =
            typeof msg.totalCount === 'number'
              ? msg.totalCount
              : MODEL_URLS.length;
          setCachedModelsCount(count);
          setIsWarmingModels(count < total);
        } else if (msg.type === 'SW_AI_CACHE_STATUS') {
          if (typeof msg.cached === 'boolean') {
            setAiCacheReady(msg.cached);
          } else {
            void verifyAiCachesReady().then(setAiCacheReady);
          }
        }
      };

      const handleControllerChange = () => {
        void checkReady();
      };

      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange
      );

      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(async (registration) => {
          await checkReady();
          if (registration.installing) {
            registration.installing.addEventListener('statechange', () => {
              if (registration.active) {
                void checkReady();
              }
            });
          }
        })
        .catch(() => {
          // Ignore registration errors on insecure/restricted origins
        });

      cleanupSw = () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleControllerChange
        );
      };
    } else if (swSupported) {
      void Promise.all([
        verifyCriticalCachesReady(),
        countCachedModels(),
        verifyAiCachesReady(),
      ]).then(([cached, modelCount, aiReady]) => {
        setCachedModelsCount(modelCount);
        setAiCacheReady(aiReady);
        if (cached && navigator.serviceWorker.controller) {
          setOfflineReady(true);
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      cleanupSw();
    };
  }, [warmAllModels, refreshAiCacheStatus]);

  const promptInstall = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return 'unavailable' as const;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredPromptRef.current = null;
      setCanInstall(false);
      return choice.outcome;
    } catch {
      return 'unavailable' as const;
    }
  }, []);

  return {
    isOnline,
    offlineReady,
    aiCacheReady,
    canInstall,
    isStandalone,
    isSwSupported,
    cachedModelsCount,
    totalModelsCount: MODEL_URLS.length,
    isWarmingModels,
    warmAllModels,
    warmAiAssets,
    refreshAiCacheStatus,
    promptInstall,
  };
}

interface PwaStatusFooterProps {
  pwa: PwaState;
  theme: StudioThemeSpec;
  onInstallApp: () => void;
}

export function PwaStatusFooter({
  pwa,
  theme,
  onInstallApp,
}: PwaStatusFooterProps) {
  const { ui } = theme;
  const aiSuffix = pwa.aiCacheReady ? ' · AI Ready' : '';
  const statusLabel = !pwa.isOnline
    ? `Offline Mode${aiSuffix}`
    : pwa.offlineReady
      ? `Offline Ready (${pwa.cachedModelsCount}/${pwa.totalModelsCount} Models${aiSuffix})`
      : process.env.NODE_ENV === 'production' && pwa.isSwSupported
        ? 'Caching Offline...'
        : `Studio Live${aiSuffix}`;

  return (
    <div
      className={`shrink-0 flex flex-wrap items-center justify-between gap-2 border-t px-3.5 py-2 ${ui.hairline}`}
    >
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-medium ${ui.monoPill}`}
      >
        {!pwa.isOnline ? (
          <WifiOffIcon className="h-3 w-3 shrink-0" />
        ) : (
          <WifiIcon className="h-3 w-3 shrink-0" />
        )}
        <span>{statusLabel}</span>
      </span>

      <div className="flex items-center gap-1.5">
        {pwa.isOnline &&
          pwa.offlineReady &&
          pwa.cachedModelsCount < pwa.totalModelsCount && (
            <button
              type="button"
              onClick={pwa.warmAllModels}
              disabled={pwa.isWarmingModels}
              className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                pwa.isWarmingModels ? ui.pillButtonDisabled : ui.pillButton
              }`}
            >
              {pwa.isWarmingModels ? 'Caching...' : 'Cache All'}
            </button>
          )}

        {pwa.canInstall && !pwa.isStandalone && (
          <button
            type="button"
            onClick={onInstallApp}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButtonActive}`}
          >
            <DownloadCloudIcon className="h-3 w-3 shrink-0" />
            <span>Install App</span>
          </button>
        )}
      </div>
    </div>
  );
}
