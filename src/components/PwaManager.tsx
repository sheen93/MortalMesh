'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DownloadCloudIcon,
  WifiIcon,
  WifiOffIcon,
} from '@/components/StudioPrimitives';
import type { StudioThemeSpec } from '@/data/studioThemes';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaState {
  isOnline: boolean;
  offlineReady: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  isSwSupported: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

async function verifyCriticalCachesReady(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const [rootMatch, modelMatch, wasmMatch] = await Promise.all([
      caches.match('/'),
      caches.match('/models/anatomy.glb'),
      caches.match('/draco/draco_decoder.wasm'),
    ]);
    return Boolean(rootMatch && modelMatch && wasmMatch);
  } catch {
    return false;
  }
}

export function usePwaState(): PwaState {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isSwSupported, setIsSwSupported] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

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

    const handleOnline = () => setIsOnline(true);
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
          const cached = await verifyCriticalCachesReady();
          if (cached) {
            setOfflineReady(true);
          }
        }
      };

      const handleSwMessage = (event: MessageEvent) => {
        if (
          event.data &&
          typeof event.data === 'object' &&
          (event.data as { type?: string }).type === 'SW_OFFLINE_READY'
        ) {
          void verifyCriticalCachesReady().then((ready) => {
            setOfflineReady(ready);
          });
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
      void verifyCriticalCachesReady().then((cached) => {
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
  }, []);

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
    canInstall,
    isStandalone,
    isSwSupported,
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
  const statusLabel = !pwa.isOnline
    ? 'Offline Mode'
    : pwa.offlineReady
      ? 'Offline Ready'
      : process.env.NODE_ENV === 'production' && pwa.isSwSupported
        ? 'Caching Offline...'
        : 'Studio Live';

  return (
    <div
      className={`shrink-0 flex items-center justify-between gap-2 border-t px-3.5 py-2 ${ui.hairline}`}
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
  );
}
