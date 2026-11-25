'use client';

import {
  FlipHorizontalIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { HAND_GESTURES } from '@/data/handGestures';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type {
  HandGestureId,
  HandScreenAnchor,
  HandSide,
  StudioThemeId,
} from '@/types/anatomy';

interface HandGesturePopoverProps {
  anchor: HandScreenAnchor | null;
  activeGestureId: HandGestureId | null;
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  onApplyGesture: (side: HandSide, gestureId: HandGestureId) => void;
  onMirrorHand: (fromSide: HandSide) => void;
  onClose: () => void;
}

const POPOVER_WIDTH_DESKTOP = 248;
const POPOVER_HEIGHT_ESTIMATE = 228;

/**
 * Floating hand gesture selector anchored beside the clicked Core-mode hand joint.
 * Rendered in DOM overlays so it never obstructs or appears in PNG exports.
 */
export function HandGesturePopover({
  anchor,
  activeGestureId,
  studioTheme,
  viewport,
  onApplyGesture,
  onMirrorHand,
  onClose,
}: HandGesturePopoverProps) {
  if (!anchor) return null;

  const { ui } = STUDIO_THEMES[studioTheme];
  const sideLabel = anchor.side === 'l' ? 'Left Hand' : 'Right Hand';
  const mirrorLabel = anchor.side === 'l' ? 'L → R' : 'R → L';
  const mirrorTitle =
    anchor.side === 'l'
      ? 'Mirror Left Hand Gesture to Right Hand'
      : 'Mirror Right Hand Gesture to Left Hand';

  const isMobile = viewport.isMobile;

  let desktopStyle: React.CSSProperties | undefined;
  if (!isMobile) {
    const fitsRight =
      anchor.screenX + 88 + POPOVER_WIDTH_DESKTOP <= viewport.width - 24;
    const rawLeft = fitsRight
      ? anchor.screenX + 88
      : anchor.screenX - POPOVER_WIDTH_DESKTOP - 88;
    const clampedLeft = Math.round(
      Math.max(16, Math.min(viewport.width - POPOVER_WIDTH_DESKTOP - 16, rawLeft))
    );
    const rawTop = anchor.screenY - POPOVER_HEIGHT_ESTIMATE * 0.45;
    const clampedTop = Math.round(
      Math.max(
        72,
        Math.min(viewport.height - POPOVER_HEIGHT_ESTIMATE - 96, rawTop)
      )
    );
    desktopStyle = {
      left: clampedLeft,
      top: clampedTop,
      width: POPOVER_WIDTH_DESKTOP,
    };
  }

  return (
    <div
      role="dialog"
      aria-label={`${sideLabel} Gesture Library`}
      data-testid="hand-gesture-popover"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={
        isMobile
          ? {
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
              left: '50%',
              transform: 'translateX(-50%)',
            }
          : desktopStyle
      }
      className={`fixed z-30 rounded-2xl p-2.5 select-none ${
        isMobile ? 'w-[min(320px,calc(100vw-24px))]' : ''
      } ${ui.panel}`}
    >
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <span
          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${ui.monoPill}`}
        >
          {sideLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={mirrorTitle}
            aria-label={mirrorTitle}
            data-testid="hand-gesture-mirror"
            onClick={() => onMirrorHand(anchor.side)}
            className={`inline-flex h-6 items-center gap-1 rounded-lg px-2 font-mono text-[10px] font-semibold transition-colors ${ui.pillButton}`}
          >
            <FlipHorizontalIcon className="h-3 w-3" />
            <span>{mirrorLabel}</span>
          </button>
          <button
            type="button"
            aria-label="Close hand gestures"
            onClick={onClose}
            className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {HAND_GESTURES.map((gesture) => {
          const isSelected = activeGestureId === gesture.id;
          return (
            <button
              key={gesture.id}
              type="button"
              data-hand-gesture={gesture.id}
              aria-pressed={isSelected}
              title={gesture.description}
              onClick={() => onApplyGesture(anchor.side, gesture.id)}
              className={`truncate rounded-lg px-1.5 py-1.5 text-[10.5px] font-medium transition-colors ${
                isSelected ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {gesture.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
