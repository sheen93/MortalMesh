'use client';

import {
  AlertCircleIcon,
  CheckCircleIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';

export interface StudioToastData {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface StudioToastProps {
  toast: StudioToastData | null;
  studioTheme: StudioThemeId;
  topOffsetPx?: number;
}

export function StudioToast({
  toast,
  studioTheme,
  topOffsetPx,
}: StudioToastProps) {
  if (!toast) return null;

  const { ui } = STUDIO_THEMES[studioTheme];
  const isError = toast.tone === 'error';

  return (
    <div
      key={toast.id}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      style={{
        top:
          topOffsetPx !== undefined
            ? `${topOffsetPx}px`
            : 'calc(env(safe-area-inset-top, 0px) + 56px)',
      }}
      className={`fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none select-none flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full px-3.5 py-1.5 text-[11.5px] font-medium transition-all duration-200 ${ui.dock}`}
    >
      {isError ? (
        <AlertCircleIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textPrimary}`} />
      ) : (
        <CheckCircleIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textPrimary}`} />
      )}
      <span className={ui.textPrimary}>{toast.message}</span>
    </div>
  );
}
