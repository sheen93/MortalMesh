'use client';

import { useRef, useState } from 'react';
import {
  ChevronDownIcon,
  LockIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type { ReferenceOverlayState, StudioThemeId } from '@/types/anatomy';

interface ReferenceOverlayProps {
  reference: ReferenceOverlayState | null;
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  isHudMinimized: boolean;
  onUpdateOffset: (x: number, y: number) => void;
  onToggleLock: () => void;
  onRemove: () => void;
}

/**
 * Client-side local reference image overlay supporting both pass-through
 * Backdrop tracing and docked/draggable Corner PiP viewing.
 */
export function ReferenceOverlay({
  reference,
  studioTheme,
  viewport,
  isHudMinimized,
  onUpdateOffset,
  onToggleLock,
  onRemove,
}: ReferenceOverlayProps) {
  const [pipCollapsed, setPipCollapsed] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
  } | null>(null);

  if (!reference) return null;

  const { ui } = STUDIO_THEMES[studioTheme];

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (reference.mode === 'backdrop' && reference.locked) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseOffsetX: reference.offsetX,
      baseOffsetY: reference.offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    onUpdateOffset(
      Math.round(drag.baseOffsetX + dx),
      Math.round(drag.baseOffsetY + dy)
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released
    }
    dragStateRef.current = null;
  };

  if (reference.mode === 'backdrop') {
    const interactive = !reference.locked;
    return (
      <>
        <div
          data-testid="reference-backdrop-overlay"
          onPointerDown={interactive ? handlePointerDown : undefined}
          onPointerMove={interactive ? handlePointerMove : undefined}
          onPointerUp={interactive ? handlePointerUp : undefined}
          onPointerCancel={interactive ? handlePointerUp : undefined}
          className={`fixed inset-0 z-[4] flex items-center justify-center overflow-hidden select-none ${
            interactive
              ? 'pointer-events-auto cursor-grab active:cursor-grabbing touch-none'
              : 'pointer-events-none'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reference.objectUrl}
            alt="Local reference overlay"
            draggable={false}
            className="max-h-[82vh] max-w-[82vw] object-contain select-none"
            style={{
              opacity: reference.opacity,
              transform: `translate3d(${reference.offsetX}px, ${reference.offsetY}px, 0) scale(${
                reference.flipH ? -reference.scale : reference.scale
              }, ${reference.scale})`,
            }}
          />
        </div>

        {interactive && !isHudMinimized && (
          <div
            data-testid="reference-dragging-pill"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
            className={`fixed left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap shadow-lg backdrop-blur-xl ${ui.panel}`}
          >
            <span>Dragging Reference — tap Lock to resume posing</span>
            <button
              type="button"
              onClick={onToggleLock}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${ui.pillButtonActive}`}
            >
              <LockIcon className="h-3 w-3 shrink-0" />
              <span>Lock</span>
            </button>
          </div>
        )}
      </>
    );
  }

  if (isHudMinimized) return null;

  const isMobileCompact = viewport.isMobile || viewport.isCompactLandscape;
  const basePosStyle = isMobileCompact
    ? {
        top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
        left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
      }
    : {
        right: 'calc(env(safe-area-inset-right, 0px) + 74px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
      };

  return (
    <aside
      data-testid="reference-pip-card"
      aria-label="Reference image viewer"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...basePosStyle,
        opacity: reference.opacity,
        transform: `translate3d(${reference.offsetX}px, ${reference.offsetY}px, 0)`,
      }}
      className={`fixed z-20 overflow-hidden rounded-2xl border select-none backdrop-blur-xl ${
        isMobileCompact ? 'w-[144px]' : 'w-[216px]'
      } ${ui.panel}`}
    >
      <div
        onPointerDown={reference.locked ? undefined : handlePointerDown}
        onPointerMove={reference.locked ? undefined : handlePointerMove}
        onPointerUp={reference.locked ? undefined : handlePointerUp}
        onPointerCancel={reference.locked ? undefined : handlePointerUp}
        className={`flex items-center justify-between gap-1.5 border-b px-2.5 py-1.5 ${ui.header} ${
          reference.locked ? '' : 'cursor-grab active:cursor-grabbing touch-none'
        }`}
      >
        <span
          className={`truncate text-[10px] font-semibold uppercase tracking-[0.1em] ${ui.textSecondary}`}
        >
          Ref
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setPipCollapsed((prev) => !prev)}
            aria-label={pipCollapsed ? 'Expand reference card' : 'Collapse reference card'}
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${ui.iconButton}`}
          >
            <ChevronDownIcon
              className={`h-3 w-3 transition-transform ${
                pipCollapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove reference image"
            className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!pipCollapsed && (
        <div className="p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reference.objectUrl}
            alt={reference.filename}
            draggable={false}
            className={`w-full rounded-xl object-contain bg-black/15 ${
              isMobileCompact ? 'max-h-[148px]' : 'max-h-[220px]'
            }`}
            style={{
              transform: `scale(${
                reference.flipH ? -Math.min(1.8, Math.max(0.5, reference.scale)) : Math.min(1.8, Math.max(0.5, reference.scale))
              }, ${Math.min(1.8, Math.max(0.5, reference.scale))})`,
            }}
          />
        </div>
      )}
    </aside>
  );
}
