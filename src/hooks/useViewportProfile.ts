'use client';

import { useEffect, useRef, useState } from 'react';

export interface ViewportProfile {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isCoarsePointer: boolean;
  isLandscape: boolean;
  isCompactLandscape: boolean;
}

const DEFAULT_PROFILE: ViewportProfile = {
  width: 1280,
  height: 800,
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isCoarsePointer: false,
  isLandscape: true,
  isCompactLandscape: false,
};

function readViewportProfile(): ViewportProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;

  const width = window.innerWidth || 1280;
  const height = window.innerHeight || 800;
  const isCoarsePointer =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1200;
  const isDesktop = width >= 1200;
  const isLandscape = width >= height;
  const isCompactLandscape = isLandscape && height < 520;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isCoarsePointer,
    isLandscape,
    isCompactLandscape,
  };
}

export function useViewportProfile(
  onViewportResize?: () => void
): ViewportProfile {
  const [profile, setProfile] = useState<ViewportProfile>(DEFAULT_PROFILE);
  const callbackRef = useRef(onViewportResize);
  callbackRef.current = onViewportResize;

  useEffect(() => {
    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const notifyResize = () => {
      callbackRef.current?.();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        callbackRef.current?.();
      });
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => {
        callbackRef.current?.();
        timerId = null;
      }, 120);
    };

    const updateProfile = () => {
      setProfile(readViewportProfile());
    };

    const handleViewportChange = () => {
      updateProfile();
      notifyResize();
    };

    updateProfile();

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);

    const coarseMedia =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;
    coarseMedia?.addEventListener('change', handleViewportChange);

    return () => {
      cancelAnimationFrame(rafId);
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener(
        'resize',
        handleViewportChange
      );
      coarseMedia?.removeEventListener('change', handleViewportChange);
    };
  }, []);

  return profile;
}
