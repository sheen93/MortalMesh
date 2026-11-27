'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  KINETIC_MODULES,
  type KineticModuleSpec,
  type KineticTelemetry,
} from '@/data/kineticCurriculum';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  FlipHorizontalIcon,
  RotateCcwIcon,
  SaveIcon,
  ScanEyeIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import type { HandGestureId, StudioThemeId } from '@/types/anatomy';
import type { ConstructiveMode } from '@/types/drawing';
import type { PadStrokeTelemetry, PadXRaySource } from '@/types/pad';
import type { PadBridge } from '@/types/padBridge';

const EMPTY_PAD_TELEMETRY: PadStrokeTelemetry = {
  totalStrokes: 0,
  countsByLayer: { construction: 0, ink: 0, value: 0 },
  straightLineCount: 0,
  curvedStrokeCount: 0,
  activeLayersDrawn: [],
  boundingBox: null,
  recentPoints: [],
  hasDrawn: false,
};

interface LessonOverlayBarProps {
  module: KineticModuleSpec;
  studioTheme: StudioThemeId;
  topOffsetPx: number;
  barHeightPx: number;
  padBridge: PadBridge | null;
  modelId: KineticTelemetry['modelId'];
  showLineOfAction: boolean;
  showPlumbLine: boolean;
  showCrossContours: boolean;
  constructiveMode: ConstructiveMode;
  notanEnabled: boolean;
  padFlipHorizontal: boolean;
  xRayUsed: boolean;
  skeletonToggled: boolean;
  skeletonRevealed: boolean;
  placedPinCount: number;
  avgPinOffsetPx: number | null;
  handRDeltaY: number;
  visitedHandGestures: readonly HandGestureId[];
  activeHandGestureId: HandGestureId;
  savedStudyCount: number;
  exportedInModule: boolean;
  onRevealForceGuides: () => void;
  onTriggerXRay: (source: PadXRaySource) => void;
  onRevealSkeleton: () => void;
  onRevealCrossContours: () => void;
  onToggleSkeleton: () => void;
  onCycleHandGesture: (gesture: HandGestureId) => void;
  onToggleNotan: () => void;
  onToggleFlipH: () => void;
  onSaveStudy: () => void;
  onResetDrill: () => void;
  onNextModule: () => void;
  onExitLesson: () => void;
  onModuleCompleted: () => void;
}

export function LessonOverlayBar({
  module,
  studioTheme,
  topOffsetPx,
  barHeightPx,
  padBridge,
  modelId,
  showLineOfAction,
  showPlumbLine,
  showCrossContours,
  constructiveMode,
  notanEnabled,
  padFlipHorizontal,
  xRayUsed,
  skeletonToggled,
  skeletonRevealed,
  placedPinCount,
  avgPinOffsetPx,
  handRDeltaY,
  visitedHandGestures,
  activeHandGestureId,
  savedStudyCount,
  exportedInModule,
  onRevealForceGuides,
  onTriggerXRay,
  onRevealSkeleton,
  onRevealCrossContours,
  onToggleSkeleton,
  onCycleHandGesture,
  onToggleNotan,
  onToggleFlipH,
  onSaveStudy,
  onResetDrill,
  onNextModule,
  onExitLesson,
  onModuleCompleted,
}: LessonOverlayBarProps) {
  const [padTelemetry, setPadTelemetry] = useState<PadStrokeTelemetry>(
    EMPTY_PAD_TELEMETRY
  );
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    if (!padBridge) {
      setPadTelemetry(EMPTY_PAD_TELEMETRY);
      return;
    }
    return padBridge.subscribeTelemetry(setPadTelemetry);
  }, [padBridge, module.id]);

  // Collapse details Drawer automatically on narrow phone screens after module switch so canvas stays spacious
  useEffect(() => {
    setDrawerOpen(typeof window === 'undefined' ? true : window.innerWidth >= 768);
  }, [module.id]);

  const validation = useMemo(() => {
    const telemetry: KineticTelemetry = {
      pad: padTelemetry,
      modelId,
      showLineOfAction,
      showPlumbLine,
      showCrossContours,
      constructiveMode,
      notanEnabled,
      padFlipHorizontal,
      xRayUsed,
      skeletonToggled,
      skeletonRevealed,
      placedPinCount,
      avgPinOffsetPx,
      handRDeltaY,
      visitedHandGestures,
      savedStudyCount,
      exportedInModule,
    };
    return module.evaluate(telemetry);
  }, [
    module,
    padTelemetry,
    modelId,
    showLineOfAction,
    showPlumbLine,
    showCrossContours,
    constructiveMode,
    notanEnabled,
    padFlipHorizontal,
    xRayUsed,
    skeletonToggled,
    skeletonRevealed,
    placedPinCount,
    avgPinOffsetPx,
    handRDeltaY,
    visitedHandGestures,
    savedStudyCount,
    exportedInModule,
  ]);

  useEffect(() => {
    if (validation.completed) {
      onModuleCompleted();
    }
  }, [validation.completed, onModuleCompleted]);

  const { ui } = STUDIO_THEMES[studioTheme];
  const isLast = module.index >= KINETIC_MODULES.length;
  const doneObjectives = validation.objectives.filter((o) => o.completed).length;

  return (
    <div
      data-testid="kinetic-lesson-bar-wrapper"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ top: topOffsetPx }}
      className="fixed left-0 right-0 z-30 pointer-events-none select-none"
    >
      {/* Slim Frosted Control Bar (strictly outside canvas rect via topOffsetPx) */}
      <div
        data-testid="kinetic-lesson-bar"
        style={{ height: barHeightPx }}
        className={`pointer-events-auto flex items-center justify-between gap-2 border-b px-2.5 sm:px-3.5 backdrop-blur-xl ${ui.panel}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            data-testid="lesson-toggle-drawer-btn"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((p) => !p)}
            className="flex items-center gap-1.5 min-w-0 text-left"
          >
            <span className="rounded bg-emerald-500 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-zinc-950 shrink-0">
              M{module.index} · {module.phaseTag}
            </span>
            <span className={`text-[11.5px] font-semibold truncate ${ui.textPrimary}`}>
              {module.title}
            </span>
            <span
              data-testid="lesson-progress-badge"
              className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tabular-nums shrink-0 ${
                validation.completed
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : ui.monoPill
              }`}
            >
              {doneObjectives}/{validation.objectives.length}
            </span>
            <ChevronDownIcon
              className={`h-3.5 w-3.5 shrink-0 opacity-75 transition-transform ${
                drawerOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <span className={`hidden lg:inline truncate font-mono text-[10px] ${ui.textMuted}`}>
            · {validation.liveHint}
          </span>
        </div>

        {/* Context Action Helper(s) + Progression */}
        <div className="flex items-center gap-1 shrink-0 overflow-x-auto studio-scroll">
          {module.id === 'pulse-gravity' && (
            <button
              type="button"
              data-testid="lesson-helper-reveal-guides"
              onClick={onRevealForceGuides}
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
                showLineOfAction && showPlumbLine
                  ? ui.pillButtonActive
                  : ui.pillButton
              }`}
            >
              Reveal Force &amp; Plumb
            </button>
          )}

          {module.id === 'warring-boxes' && (
            <button
              type="button"
              data-testid="lesson-helper-xray-loomis"
              onClick={() => onTriggerXRay('loomis')}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${ui.pillButtonActive}`}
            >
              <ScanEyeIcon className="h-3 w-3" />
              <span>X-Ray Loomis</span>
            </button>
          )}

          {module.id === 'eight-anchor-bones' && (
            <button
              type="button"
              data-testid="lesson-helper-reveal-skeleton"
              onClick={onRevealSkeleton}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
                skeletonRevealed ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              <ScanEyeIcon className="h-3 w-3" />
              <span>Reveal Skeleton</span>
            </button>
          )}

          {module.id === 'perspective-coils' && (
            <button
              type="button"
              data-testid="lesson-helper-cross-contours"
              onClick={onRevealCrossContours}
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
                showCrossContours ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              Cross-Contour Check
            </button>
          )}

          {module.id === 'muscle-envelopes' && (
            <button
              type="button"
              data-testid="lesson-helper-toggle-skeleton"
              onClick={onToggleSkeleton}
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
                modelId === 'skeleton' ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {modelId === 'skeleton' ? 'Surface Model' : 'Toggle Skeleton'}
            </button>
          )}

          {module.id === 'hands-as-wedges' && (
            <div className="flex items-center gap-1">
              {(['fist', 'grab', 'pinch'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  data-testid={`lesson-gesture-${g}`}
                  onClick={() => onCycleHandGesture(g)}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                    activeHandGestureId === g ? ui.pillButtonActive : ui.pillButton
                  }`}
                >
                  {g}
                </button>
              ))}
              <button
                type="button"
                data-testid="lesson-helper-xray-hand"
                onClick={() => onTriggerXRay('skeleton')}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${ui.pillButton}`}
              >
                X-Ray
              </button>
            </div>
          )}

          {module.id === 'shadow-thief' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="lesson-helper-notan"
                onClick={onToggleNotan}
                className={`rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
                  notanEnabled ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                2-Value Notan
              </button>
              <button
                type="button"
                data-testid="lesson-helper-flip-h"
                onClick={onToggleFlipH}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
                  padFlipHorizontal ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                <FlipHorizontalIcon className="h-3 w-3" />
                <span className="hidden sm:inline">Flip H</span>
              </button>
            </div>
          )}

          <button
            type="button"
            data-testid="lesson-save-study-btn"
            onClick={onSaveStudy}
            title="Save study to My Studies"
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
              savedStudyCount > 0 ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            <SaveIcon className="h-3 w-3" />
            <span className="hidden sm:inline">Save Study</span>
          </button>

          <button
            type="button"
            aria-label="Reset drill"
            title="Reset Module"
            onClick={onResetDrill}
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${ui.iconButton}`}
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            data-testid="lesson-next-btn"
            onClick={onNextModule}
            className={`rounded-lg px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${
              validation.completed ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            {isLast ? 'Finish' : 'Next →'}
          </button>

          <button
            type="button"
            data-testid="lesson-exit-btn"
            aria-label="Exit Lesson"
            title="Exit and restore Studio + Pad"
            onClick={onExitLesson}
            className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold ${ui.pillButton}`}
          >
            <XIcon className="h-3 w-3" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* Collapsible Objective Checklist Drawer */}
      {drawerOpen && (
        <div
          data-testid="kinetic-objectives-drawer"
          className={`pointer-events-auto mx-2.5 mt-1.5 w-[min(calc(100vw-20px),440px)] rounded-xl p-2.5 shadow-lg backdrop-blur-xl space-y-1.5 ${ui.panel}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[10.5px] leading-snug ${ui.textSecondary}`}>
              <strong className={ui.textPrimary}>{module.missionName}:</strong>{' '}
              {module.corePrinciple}
            </p>
            <button
              type="button"
              aria-label="Collapse lesson checklist"
              onClick={() => setDrawerOpen(false)}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${ui.iconButton}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1">
            {validation.objectives.map((obj) => (
              <div
                key={obj.id}
                data-testid={`lesson-objective-${obj.id}`}
                data-completed={obj.completed ? 'true' : 'false'}
                className={`flex items-start gap-1.5 rounded-lg px-2 py-1 text-[10.5px] ${ui.card}`}
              >
                <CheckCircleIcon
                  className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                    obj.completed ? 'text-emerald-400' : 'opacity-30'
                  }`}
                />
                <span className={obj.completed ? `${ui.textPrimary} font-medium` : ui.textSecondary}>
                  {obj.label}
                </span>
              </div>
            ))}
          </div>

          <div
            data-testid="lesson-live-hint"
            className={`rounded-md px-2 py-0.5 font-mono text-[9.5px] ${ui.monoPill}`}
          >
            {validation.liveHint}
          </div>
        </div>
      )}
    </div>
  );
}
