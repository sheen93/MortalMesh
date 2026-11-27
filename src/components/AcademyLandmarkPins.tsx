'use client';

import { LANDMARK_TIPS } from '@/data/academyCurriculum';
import { STUDIO_THEMES } from '@/data/studioThemes';
import { XIcon } from '@/components/StudioPrimitives';
import type {
  LandmarkGroupId,
  ProjectedLandmarkPin,
  StudioThemeId,
} from '@/types/anatomy';

interface AcademyLandmarkPinsProps {
  pins: readonly ProjectedLandmarkPin[];
  selectedGroupId: LandmarkGroupId | null;
  inspectedGroupIds: readonly LandmarkGroupId[];
  studioTheme: StudioThemeId;
  viewportWidth: number;
  viewportHeight: number;
  onSelectPin: (groupId: LandmarkGroupId | null) => void;
}

/**
 * Lightweight screen-projected anatomical landmark pins anchored cleanly to live
 * 3D bone positions (outside WebGL canvas so PNG snapshots stay spotless).
 */
export function AcademyLandmarkPins({
  pins,
  selectedGroupId,
  inspectedGroupIds,
  studioTheme,
  viewportWidth,
  viewportHeight,
  onSelectPin,
}: AcademyLandmarkPinsProps) {
  if (!pins || pins.length === 0) return null;

  const { ui } = STUDIO_THEMES[studioTheme];
  const selectedPin =
    selectedGroupId !== null
      ? pins.find((p) => p.groupId === selectedGroupId && p.visible) ?? null
      : null;
  const selectedTip = selectedGroupId ? LANDMARK_TIPS[selectedGroupId] : null;

  const cardW = 246;
  const tooltipLeft = selectedPin
    ? Math.max(
        12,
        Math.min(viewportWidth - cardW - 14, selectedPin.screenX + 16)
      )
    : 12;
  const tooltipTop = selectedPin
    ? Math.max(64, Math.min(viewportHeight - 170, selectedPin.screenY - 26))
    : 72;

  return (
    <div
      data-testid="academy-landmark-pins-layer"
      className="pointer-events-none fixed inset-0 z-[15] select-none"
    >
      {pins.map((pin) => {
        if (!pin.visible) return null;
        const isSelected = selectedGroupId === pin.groupId;
        const isInspected = inspectedGroupIds.includes(pin.groupId);
        return (
          <button
            key={pin.id}
            type="button"
            data-testid={`landmark-pin-${pin.groupId}`}
            aria-label={`${pin.number}. ${pin.label}`}
            aria-pressed={isSelected}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelectPin(isSelected ? null : pin.groupId);
            }}
            style={{
              left: pin.screenX,
              top: pin.screenY,
              transform: 'translate(-50%, -50%)',
            }}
            className={`pointer-events-auto fixed flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px] font-bold shadow-md transition-transform duration-150 ${
              isSelected
                ? 'scale-125 bg-emerald-400 text-zinc-950 border-white ring-2 ring-emerald-300/60'
                : isInspected
                  ? 'bg-emerald-500/90 text-zinc-950 border-white/80 hover:scale-110'
                  : 'bg-zinc-900/90 text-white border-white/85 hover:scale-110'
            }`}
          >
            {pin.number}
          </button>
        );
      })}

      {selectedTip && selectedPin && (
        <div
          role="dialog"
          aria-label={selectedTip.title}
          data-testid="landmark-tooltip-card"
          onPointerDown={(event) => event.stopPropagation()}
          style={{ left: tooltipLeft, top: tooltipTop, width: cardW }}
          className={`pointer-events-auto fixed z-[16] rounded-xl p-3 shadow-xl backdrop-blur-xl ${ui.panel}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 font-mono text-[9.5px] font-bold text-zinc-950">
                  {selectedTip.number}
                </span>
                <span className={`text-[11.5px] font-semibold truncate ${ui.textPrimary}`}>
                  {selectedTip.title}
                </span>
              </div>
              <p className={`mt-0.5 font-mono text-[9.5px] ${ui.textMuted}`}>
                {selectedTip.subtitle}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close landmark tip"
              onClick={() => onSelectPin(null)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${ui.iconButton}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
          <p className={`mt-2 text-[11px] leading-relaxed ${ui.textSecondary}`}>
            {selectedTip.artistTip}
          </p>
        </div>
      )}
    </div>
  );
}
