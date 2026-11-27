'use client';

import { useEffect, useState } from 'react';
import {
  ACADEMY_MODULES,
  type AcademyModuleId,
  type AcademyModuleSpec,
  type AcademyValidationResult,
} from '@/data/academyCurriculum';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type { StudioThemeId } from '@/types/anatomy';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  RotateCcwIcon,
  XIcon,
} from '@/components/StudioPrimitives';

interface AnatomyAcademyModalProps {
  isOpen: boolean;
  onClose: () => void;
  studioTheme: StudioThemeId;
  completedIds: readonly AcademyModuleId[];
  activeModuleId: AcademyModuleId | null;
  onSelectModule: (id: AcademyModuleId) => void;
}

export function AnatomyAcademyModal({
  isOpen,
  onClose,
  studioTheme,
  completedIds,
  activeModuleId,
  onSelectModule,
}: AnatomyAcademyModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { ui } = STUDIO_THEMES[studioTheme];

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2.5 backdrop-blur-sm sm:p-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kinetic Atelier Anatomy Academy"
        data-testid="academy-catalog-modal"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={`flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl select-none ${ui.panel}`}
      >
        <header
          className={`flex shrink-0 items-center justify-between gap-2 px-4 py-3 ${ui.header}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <GraduationCapIcon className={`h-4 w-4 shrink-0 ${ui.textPrimary}`} />
            <h2
              className={`text-xs font-semibold uppercase tracking-[0.14em] truncate ${ui.textPrimary}`}
            >
              The Kinetic Atelier · Anatomy Academy
            </h2>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums whitespace-nowrap ${ui.monoPill}`}
            >
              {completedIds.length} / {ACADEMY_MODULES.length} Completed
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close anatomy academy"
            data-testid="academy-modal-close-btn"
            className={`flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="studio-scroll flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
          <p className={`text-[11.5px] leading-relaxed ${ui.textSecondary}`}>
            Interactive 3D drills teaching structural weight, three-mass contrapposto, surface landmarks, lens foreshortening, hand wedges, and Notan value shapes. Your current studio scene is safely preserved and restored on exit.
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {ACADEMY_MODULES.map((mod) => {
              const isDone = completedIds.includes(mod.id);
              const isCurrent = activeModuleId === mod.id;
              return (
                <button
                  key={mod.id}
                  type="button"
                  data-testid={`academy-module-card-${mod.id}`}
                  onClick={() => onSelectModule(mod.id)}
                  className={`group flex flex-col justify-between gap-2.5 rounded-xl p-3 text-left transition-all ${
                    isCurrent
                      ? ui.pillButtonActive
                      : `${ui.card} hover:border-zinc-400/50`
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          isCurrent ? 'border border-current opacity-85' : ui.monoPill
                        }`}
                      >
                        Module {mod.index}/6 · {mod.durationLabel}
                      </span>
                      {isDone && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                            isCurrent ? 'text-current' : 'text-emerald-400'
                          }`}
                        >
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          <span>Done</span>
                        </span>
                      )}
                    </div>

                    <h3
                      className={`text-[12.5px] font-semibold leading-snug ${
                        isCurrent ? 'text-current' : ui.textPrimary
                      }`}
                    >
                      {mod.title}
                    </h3>
                    <p
                      className={`text-[11px] leading-snug ${
                        isCurrent ? 'opacity-85' : ui.textSecondary
                      }`}
                    >
                      {mod.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[10.5px] font-medium">
                    <span className={isCurrent ? 'opacity-90' : ui.textMuted}>
                      {isCurrent ? 'Resume Drill' : isDone ? 'Practice Again' : 'Start Drill'}
                    </span>
                    <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 opacity-75 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AcademyLessonHudCardProps {
  module: AcademyModuleSpec;
  validation: AcademyValidationResult;
  completedIds: readonly AcademyModuleId[];
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  isHudMinimized: boolean;
  isSidebarOpen: boolean;
  onResetDrill: () => void;
  onNextModule: () => void;
  onExitAcademy: () => void;
  onOpenCatalog: () => void;
}

export function AcademyLessonHudCard({
  module,
  validation,
  completedIds,
  studioTheme,
  viewport,
  isHudMinimized,
  isSidebarOpen,
  onResetDrill,
  onNextModule,
  onExitAcademy,
  onOpenCatalog,
}: AcademyLessonHudCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isDrawerOverlay = viewport.isMobile || viewport.isCompactLandscape;
  if (isHudMinimized || (isDrawerOverlay && isSidebarOpen)) return null;

  const { ui } = STUDIO_THEMES[studioTheme];
  const isLast = module.index >= ACADEMY_MODULES.length;
  const isCompletedNow =
    validation.completed || completedIds.includes(module.id);

  const hudTop = isSidebarOpen
    ? 'calc(env(safe-area-inset-top, 0px) + 12px)'
    : viewport.isCompactLandscape
      ? 'calc(env(safe-area-inset-top, 0px) + 56px)'
      : 'calc(env(safe-area-inset-top, 0px) + 62px)';
  const hudLeft = isSidebarOpen
    ? viewport.isTablet
      ? 'calc(env(safe-area-inset-left, 0px) + 286px)'
      : 'calc(env(safe-area-inset-left, 0px) + 298px)'
    : 'calc(env(safe-area-inset-left, 0px) + 12px)';
  const maxCardHeight = viewport.isCompactLandscape
    ? 'calc(100dvh - env(safe-area-inset-top, 0px) - 120px)'
    : 'calc(100dvh - env(safe-area-inset-top, 0px) - 136px)';

  return (
    <aside
      aria-label={`Academy Module ${module.index}: ${module.title}`}
      data-testid="academy-lesson-card"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        top: hudTop,
        left: hudLeft,
        maxHeight: maxCardHeight,
      }}
      className={`fixed z-30 flex flex-col overflow-hidden rounded-2xl backdrop-blur-xl select-none transition-all duration-200 ${ui.panel} ${
        isDrawerOverlay
          ? 'w-[min(calc(100vw-8.5rem),288px)]'
          : 'w-[308px]'
      }`}
    >
      {/* Top Bar */}
      <div
        className={`flex shrink-0 items-center justify-between gap-2 px-3 py-2 ${ui.header}`}
      >
        <button
          type="button"
          onClick={onOpenCatalog}
          title="Switch Academy Module"
          className="flex items-center gap-1.5 min-w-0 text-left"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500 font-mono text-[10px] font-bold text-zinc-950">
            {module.index}/6
          </span>
          <span
            className={`text-[11.5px] font-semibold truncate ${ui.textPrimary}`}
          >
            {module.title}
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label={collapsed ? 'Expand lesson card' : 'Minimize lesson card'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
            className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
          >
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform duration-150 ${
                collapsed ? '-rotate-90' : ''
              }`}
            />
          </button>
          <button
            type="button"
            data-testid="academy-exit-btn"
            aria-label="Exit Academy and restore scene"
            title="Exit Academy"
            onClick={onExitAcademy}
            className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div
            className={`studio-scroll flex-1 min-h-0 overflow-y-auto ${
              viewport.isCompactLandscape ? 'p-2.5 space-y-1.5' : 'p-3 space-y-2.5'
            }`}
          >
            {!viewport.isCompactLandscape && (
              <p className={`text-[11px] leading-relaxed ${ui.textSecondary}`}>
                {module.artistTakeaway}
              </p>
            )}

            <div className="space-y-1.5">
              {validation.steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${ui.card}`}
                >
                  <CheckCircleIcon
                    className={`h-3.5 w-3.5 shrink-0 mt-0.5 transition-colors ${
                      step.completed ? 'text-emerald-400' : 'opacity-30'
                    }`}
                  />
                  <span
                    className={
                      step.completed ? `${ui.textPrimary} font-medium` : ui.textSecondary
                    }
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            <div
              data-testid="academy-live-hint"
              className={`rounded-lg px-2.5 py-1 font-mono text-[10px] ${ui.monoPill}`}
            >
              {validation.liveHint}
            </div>
          </div>

          <div
            className={`flex shrink-0 items-center justify-between gap-1.5 border-t px-3 py-2 ${ui.divider}`}
          >
            <button
              type="button"
              data-testid="academy-reset-drill-btn"
              onClick={onResetDrill}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
            >
              <RotateCcwIcon className="h-3 w-3 shrink-0" />
              <span>Reset Drill</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="academy-exit-text-btn"
                onClick={onExitAcademy}
                className={`rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
              >
                Exit
              </button>

              <button
                type="button"
                data-testid="academy-next-btn"
                onClick={onNextModule}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10.5px] font-semibold transition-colors ${
                  isCompletedNow ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                <span>{isLast ? 'Finish Academy' : 'Next Module →'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
