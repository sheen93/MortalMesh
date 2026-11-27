'use client';

import { useEffect } from 'react';
import {
  BookOpenIcon,
  GraduationCapIcon,
  PencilIcon,
  TimerIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { ACADEMY_MODULES, type AcademyModuleId } from '@/data/academyCurriculum';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';

interface SchoolWorkspaceSlotProps {
  studioTheme: StudioThemeId;
  completedAcademyIds: readonly AcademyModuleId[];
  onCloseToStudio: () => void;
  onJumpToPad: () => void;
  onOpenAcademy: () => void;
  onOpenGestureGym: () => void;
}

const PLANNED_KINETIC_MODULES: ReadonlyArray<{
  num: number;
  title: string;
  cue: string;
}> = [
  { num: 1, title: 'Force & Gravity Plumb Tracing', cue: 'Vellum overlay + snap lines' },
  { num: 2, title: 'Bridgman Three Masses & X-Ray Check', cue: '50/50 split + 3D ghost slide' },
  { num: 3, title: 'X-Ray Sight: 8 Bony Landmarks', cue: 'Pin surface joints before Skeleton cross-fade' },
  { num: 4, title: 'Cross-Contours under Fisheye 80%', cue: 'Overlapping elliptical planes' },
  { num: 5, title: 'Hand Architectural Wedges', cue: 'Trapezoid palm & opposing thumb' },
  { num: 6, title: 'Value Layer 2-Value Notan Block-Ins', cue: 'Tilt charcoal massing on Layer 3' },
  { num: 7, title: 'Pelvic Tilt & Contrapposto Rhythm', cue: 'S-curve gesture alignment' },
  { num: 8, title: 'Pad-Integrated Gesture Gym Sprint', cue: '30s–5m sketch + orbit + 5s timelapse' },
];

/**
 * Clean Phase 19 Tier-3 slot combining live Phase 17 Academy & Gesture Gym
 * shortcuts with the upcoming KINETIC-5 + Pad-Integrated interactive preview.
 */
export function SchoolWorkspaceSlot({
  studioTheme,
  completedAcademyIds,
  onCloseToStudio,
  onJumpToPad,
  onOpenAcademy,
  onOpenGestureGym,
}: SchoolWorkspaceSlotProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseToStudio();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCloseToStudio]);

  const { ui } = STUDIO_THEMES[studioTheme];

  return (
    <div
      role="presentation"
      onClick={onCloseToStudio}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-3 backdrop-blur-sm sm:p-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 54px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mortal Mesh Anatomy School"
        data-testid="school-workspace-slot"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex max-h-[84dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl select-none ${ui.panel}`}
      >
        <header
          className={`flex shrink-0 items-center justify-between gap-2 px-4 py-3 ${ui.header}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <BookOpenIcon className={`h-4 w-4 shrink-0 ${ui.textPrimary}`} />
            <h2
              className={`text-xs font-semibold uppercase tracking-[0.14em] truncate ${ui.textPrimary}`}
            >
              Mortal Mesh School · Interactive Curriculum
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close school panel"
            data-testid="school-close-btn"
            onClick={onCloseToStudio}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="studio-scroll flex-1 overflow-y-auto p-4 space-y-4">
          <div className={`rounded-xl p-3.5 space-y-2.5 ${ui.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="inline-block rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                  Launching in Phase 19
                </span>
                <h3 className={`mt-1 text-sm font-semibold ${ui.textPrimary}`}>
                  KINETIC-5 Interactive Anatomy School &amp; Pad-Integrated Gesture Gym
                </h3>
              </div>
              <button
                type="button"
                data-testid="school-jump-to-pad-btn"
                onClick={onJumpToPad}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11.5px] font-semibold transition-colors ${ui.pillButtonActive}`}
              >
                <PencilIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Open Atelier Study Pad →</span>
              </button>
            </div>
            <p className={`text-[11.5px] leading-relaxed ${ui.textSecondary}`}>
              The 2D Pad engine, X-Ray Slide Check, and IndexedDB Sketchbook are live now in the Pad workspace. Practice live figure sketches today or launch the 3D drills below.
            </p>
          </div>

          {/* Available Today: Live Phase 17 Interactive Drills & Timer */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              data-testid="school-launch-academy-btn"
              onClick={onOpenAcademy}
              className={`flex items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors ${ui.pillButton}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <GraduationCapIcon className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                <div className="min-w-0">
                  <div className={`text-[12px] font-semibold ${ui.textPrimary}`}>
                    Interactive Anatomy Academy
                  </div>
                  <div className={`text-[10.5px] ${ui.textSecondary}`}>
                    6 3D live drills · {completedAcademyIds.length}/{ACADEMY_MODULES.length} done
                  </div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-emerald-400 shrink-0">Open →</span>
            </button>

            <button
              type="button"
              data-testid="school-launch-gym-btn"
              onClick={onOpenGestureGym}
              className={`flex items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors ${ui.pillButton}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <TimerIcon className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                <div className="min-w-0">
                  <div className={`text-[12px] font-semibold ${ui.textPrimary}`}>
                    3D Timed Gesture Gym
                  </div>
                  <div className={`text-[10.5px] ${ui.textSecondary}`}>
                    30s / 1m / 2m / 5m / Class curve
                  </div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-emerald-400 shrink-0">Open →</span>
            </button>
          </div>

          {/* 8 Planned KINETIC-5 Modules */}
          <div className="space-y-2">
            <h4 className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${ui.textMuted}`}>
              KINETIC-5 Roadmap (8 Combined 3D + Pad Modules)
            </h4>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PLANNED_KINETIC_MODULES.map((m) => (
                <div
                  key={m.num}
                  className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${ui.card}`}
                >
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold shrink-0 ${ui.monoPill}`}>
                    {m.num}/8
                  </span>
                  <div className="min-w-0">
                    <div className={`text-[11px] font-medium truncate ${ui.textPrimary}`}>
                      {m.title}
                    </div>
                    <div className={`text-[10px] truncate ${ui.textMuted}`}>
                      {m.cue}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
