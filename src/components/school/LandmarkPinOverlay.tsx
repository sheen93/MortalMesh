'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LANDMARK_ORDER,
  LANDMARK_TIPS,
} from '@/data/kineticCurriculum';
import { STUDIO_THEMES } from '@/data/studioThemes';
import { CheckCircleIcon, ScanEyeIcon, XIcon } from '@/components/StudioPrimitives';
import type {
  LandmarkGroupId,
  ProjectedLandmarkPin,
  StudioThemeId,
} from '@/types/anatomy';
import type { PadBridge } from '@/types/padBridge';

export interface PlacedLandmarkPinMap {
  c7?: { normX: number; normY: number };
  sternum?: { normX: number; normY: number };
  acromion?: { normX: number; normY: number };
  asis?: { normX: number; normY: number };
  trochanter?: { normX: number; normY: number };
  olecranon?: { normX: number; normY: number };
  patella?: { normX: number; normY: number };
  malleolus?: { normX: number; normY: number };
}

interface LandmarkPinOverlayProps {
  studioTheme: StudioThemeId;
  placedPins: PlacedLandmarkPinMap;
  activeTargetGroupId: LandmarkGroupId;
  onSelectTargetGroup: (groupId: LandmarkGroupId) => void;
  revealed: boolean;
  projectedLandmarkPins: readonly ProjectedLandmarkPin[];
  padBridge: PadBridge | null;
  onMetricsChange: (placedCount: number, avgOffsetPx: number | null) => void;
}

export function LandmarkPinOverlay({
  studioTheme,
  placedPins,
  activeTargetGroupId,
  onSelectTargetGroup,
  revealed,
  projectedLandmarkPins,
  padBridge,
  onMetricsChange,
}: LandmarkPinOverlayProps) {
  const [selectedTipGroup, setSelectedTipGroup] =
    useState<LandmarkGroupId | null>(null);
  const [canvasBox, setCanvasBox] = useState<{
    padLeft: number;
    padTop: number;
    padW: number;
    padH: number;
    studioLeft: number;
    studioTop: number;
    studioW: number;
    studioH: number;
  } | null>(null);

  useEffect(() => {
    const syncRects = () => {
      const pRect = padBridge?.getCanvasRect();
      const sEl = document.querySelector('[data-testid="studio-3d-pane"]');
      const sRect = sEl?.getBoundingClientRect();
      if (!pRect || pRect.width < 16 || pRect.height < 16) return;
      setCanvasBox({
        padLeft: pRect.left,
        padTop: pRect.top,
        padW: pRect.width,
        padH: pRect.height,
        studioLeft: sRect?.left ?? pRect.left,
        studioTop: sRect?.top ?? pRect.top,
        studioW: sRect?.width ?? pRect.width,
        studioH: sRect?.height ?? pRect.height,
      });
    };
    syncRects();
    const id = requestAnimationFrame(syncRects);
    window.addEventListener('resize', syncRects);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', syncRects);
    };
  }, [padBridge, revealed, projectedLandmarkPins]);

  const placedEntries = useMemo(
    () =>
      LANDMARK_ORDER.filter((id) => Boolean(placedPins[id])).map((id) => ({
        groupId: id,
        coord: placedPins[id]!,
        tip: LANDMARK_TIPS[id],
      })),
    [placedPins]
  );

  const comparisons = useMemo(() => {
    if (!revealed || !canvasBox) return [];
    const sameOverlayPlane =
      Math.abs(canvasBox.studioLeft - canvasBox.padLeft) < 36 &&
      Math.abs(canvasBox.studioW - canvasBox.padW) < 36;

    const rows: Array<{
      groupId: LandmarkGroupId;
      number: number;
      userNormX: number;
      userNormY: number;
      trueNormX: number;
      trueNormY: number;
      offsetPx: number;
    }> = [];

    for (const entry of placedEntries) {
      const truePin = projectedLandmarkPins.find(
        (p) => p.groupId === entry.groupId && p.visible
      );
      if (!truePin) continue;

      const trueNormX = sameOverlayPlane
        ? (canvasBox.studioLeft + truePin.screenX - canvasBox.padLeft) /
          canvasBox.padW
        : truePin.screenX / Math.max(1, canvasBox.studioW);
      const trueNormY = sameOverlayPlane
        ? (canvasBox.studioTop + truePin.screenY - canvasBox.padTop) /
          canvasBox.padH
        : truePin.screenY / Math.max(1, canvasBox.studioH);

      const dxPx = (entry.coord.normX - trueNormX) * canvasBox.padW;
      const dyPx = (entry.coord.normY - trueNormY) * canvasBox.padH;
      const offsetPx = Math.round(Math.hypot(dxPx, dyPx));

      rows.push({
        groupId: entry.groupId,
        number: entry.tip.number,
        userNormX: entry.coord.normX,
        userNormY: entry.coord.normY,
        trueNormX,
        trueNormY,
        offsetPx,
      });
    }
    return rows;
  }, [revealed, canvasBox, placedEntries, projectedLandmarkPins]);

  const avgOffsetPx = useMemo(() => {
    if (!revealed || comparisons.length === 0) return null;
    const sum = comparisons.reduce((acc, row) => acc + row.offsetPx, 0);
    return Math.round(sum / comparisons.length);
  }, [revealed, comparisons]);

  useEffect(() => {
    onMetricsChange(placedEntries.length, avgOffsetPx);
  }, [placedEntries.length, avgOffsetPx, onMetricsChange]);

  const { ui } = STUDIO_THEMES[studioTheme];
  const activeTip = LANDMARK_TIPS[activeTargetGroupId];
  const selectedTip = selectedTipGroup ? LANDMARK_TIPS[selectedTipGroup] : null;
  const selectedComp = selectedTipGroup
    ? comparisons.find((c) => c.groupId === selectedTipGroup) ?? null
    : null;

  return (
    <div
      data-testid="kinetic-landmark-pin-overlay"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none"
    >
      {/* Revealed True 3D Bone Rings & Connector Vectors */}
      {revealed && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {comparisons.map((row) => (
            <g key={`cmp-${row.groupId}`}>
              <line
                x1={`${(row.userNormX * 100).toFixed(2)}%`}
                y1={`${(row.userNormY * 100).toFixed(2)}%`}
                x2={`${(row.trueNormX * 100).toFixed(2)}%`}
                y2={`${(row.trueNormY * 100).toFixed(2)}%`}
                stroke="#10B981"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
              <circle
                cx={`${(row.trueNormX * 100).toFixed(2)}%`}
                cy={`${(row.trueNormY * 100).toFixed(2)}%`}
                r={10}
                fill="rgba(16, 185, 129, 0.2)"
                stroke="#10B981"
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
      )}

      {/* Compact Top Target Chip Strip inside Pad (only above surface canvas edge) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className={`pointer-events-auto absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-xl px-2.5 py-1.5 backdrop-blur-md ${ui.panel}`}
      >
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {!revealed ? (
            <>
              <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-300">
                TAP TO PIN #{activeTip.number}
              </span>
              <span className={`text-[11px] font-semibold truncate ${ui.textPrimary}`}>
                {activeTip.title}
              </span>
            </>
          ) : (
            <span
              data-testid="landmark-accuracy-badge"
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300"
            >
              <ScanEyeIcon className="h-3.5 w-3.5" />
              <span>
                {placedEntries.length}/8 Landmarks
                {avgOffsetPx !== null ? ` · Avg Offset ${avgOffsetPx}px` : ''}
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {LANDMARK_ORDER.map((groupId) => {
            const spec = LANDMARK_TIPS[groupId];
            const isPlaced = Boolean(placedPins[groupId]);
            const isTarget = !revealed && activeTargetGroupId === groupId;
            return (
              <button
                key={groupId}
                type="button"
                data-testid={`landmark-target-chip-${groupId}`}
                onClick={() => {
                  if (revealed) {
                    setSelectedTipGroup((prev) =>
                      prev === groupId ? null : groupId
                    );
                  } else {
                    onSelectTargetGroup(groupId);
                  }
                }}
                title={`${spec.number}. ${spec.title}`}
                className={`flex h-6 min-w-[24px] items-center justify-center gap-0.5 rounded-md px-1 font-mono text-[9.5px] font-bold transition-colors ${
                  isTarget
                    ? ui.pillButtonActive
                    : isPlaced
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                      : ui.pillButton
                }`}
              >
                {isPlaced && <CheckCircleIcon className="h-2.5 w-2.5" />}
                <span>{spec.number}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* User-Placed Landmark Pins */}
      {placedEntries.map(({ groupId, coord, tip }) => {
        const isSelected = selectedTipGroup === groupId;
        return (
          <button
            key={`placed-${groupId}`}
            type="button"
            data-testid={`placed-landmark-${groupId}`}
            aria-label={`${tip.number}. ${tip.title}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() =>
              setSelectedTipGroup((prev) => (prev === groupId ? null : groupId))
            }
            style={{
              left: `${(coord.normX * 100).toFixed(2)}%`,
              top: `${(coord.normY * 100).toFixed(2)}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`pointer-events-auto absolute flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[10px] font-bold shadow-md transition-transform ${
              isSelected
                ? 'scale-125 bg-emerald-400 text-zinc-950 border-white'
                : 'bg-sky-500/90 text-zinc-950 border-white/90 hover:scale-110'
            }`}
          >
            {tip.number}
          </button>
        );
      })}

      {/* 1-Line Artist Tip Card on Pin Selection */}
      {selectedTip && (
        <div
          role="dialog"
          aria-label={selectedTip.title}
          data-testid="landmark-tooltip-card"
          onPointerDown={(e) => e.stopPropagation()}
          className={`pointer-events-auto absolute bottom-3 left-3 z-30 w-[min(90%,280px)] rounded-xl p-3 shadow-xl backdrop-blur-xl ${ui.panel}`}
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
                {selectedComp && (
                  <span className="rounded bg-emerald-500/20 px-1 py-0.5 font-mono text-[9px] font-semibold text-emerald-300">
                    {selectedComp.offsetPx}px
                  </span>
                )}
              </div>
              <p className={`mt-0.5 font-mono text-[9.5px] ${ui.textMuted}`}>
                {selectedTip.subtitle}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close landmark tip"
              onClick={() => setSelectedTipGroup(null)}
              className={`flex h-5 w-5 items-center justify-center rounded-md ${ui.iconButton}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
          <p className={`mt-1.5 text-[11px] leading-relaxed ${ui.textSecondary}`}>
            {selectedTip.artistTip}
          </p>
        </div>
      )}
    </div>
  );
}
