'use client';

import { useEffect, useState } from 'react';
import {
  GestureGymSetupView,
  type GymDurationOption,
  type GymSessionConfig,
} from '@/components/school/GestureGym';
import { StudyGalleryView } from '@/components/school/StudyGalleryModal';
import {
  BookOpenIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  PencilIcon,
  TimerIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import {
  KINETIC_MODULES,
  type KineticModuleId,
} from '@/data/kineticCurriculum';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { SnapshotBridge, StudioThemeId } from '@/types/anatomy';
import type { PadDocumentV1 } from '@/types/pad';

export type SchoolTabId = 'course' | 'gym' | 'studies';

interface SchoolWorkspaceProps {
  studioTheme: StudioThemeId;
  initialTab?: SchoolTabId;
  highlightedModuleId?: KineticModuleId | null;
  gymInitialInterval?: GymDurationOption | null;
  completedModuleIds: readonly KineticModuleId[];
  snapshotBridge: SnapshotBridge | null;
  studyRefreshToken: number;
  onSelectTab?: (tab: SchoolTabId) => void;
  onStartModule: (moduleId: KineticModuleId) => void;
  onStartGymSession: (config: GymSessionConfig) => void;
  onReopenStudyInPad: (doc: PadDocumentV1) => void;
  onJumpToPad: () => void;
  onCloseToStudio: () => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export function SchoolWorkspace({
  studioTheme,
  initialTab = 'course',
  highlightedModuleId = null,
  gymInitialInterval = null,
  completedModuleIds,
  snapshotBridge,
  studyRefreshToken,
  onSelectTab,
  onStartModule,
  onStartGymSession,
  onReopenStudyInPad,
  onJumpToPad,
  onCloseToStudio,
  onToast,
}: SchoolWorkspaceProps) {
  const [tab, setTab] = useState<SchoolTabId>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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

  const switchTab = (next: SchoolTabId) => {
    setTab(next);
    onSelectTab?.(next);
  };

  const { ui } = STUDIO_THEMES[studioTheme];

  return (
    <div
      role="presentation"
      onClick={onCloseToStudio}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-2.5 backdrop-blur-sm sm:p-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 52px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="KINETIC-5 Interactive Anatomy School"
        data-testid="school-workspace-slot"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex max-h-[calc(100dvh-64px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl select-none ${ui.panel}`}
      >
        {/* Header */}
        <header className={`flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 ${ui.header}`}>
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCapIcon className={`h-4 w-4 shrink-0 ${ui.textPrimary}`} />
            <h2 className={`text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.14em] truncate ${ui.textPrimary}`}>
              <span className="sm:hidden">KINETIC-5 School</span>
              <span className="hidden sm:inline">KINETIC-5 Anatomy School</span>
            </h2>
            <span className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${ui.monoPill}`}>
              {completedModuleIds.length}/{KINETIC_MODULES.length} Mastered
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="school-jump-to-pad-btn"
              onClick={onJumpToPad}
              className={`hidden sm:flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold ${ui.pillButton}`}
            >
              <PencilIcon className="h-3 w-3" />
              <span>Study Pad</span>
            </button>
            <button
              type="button"
              aria-label="Close school panel"
              data-testid="school-close-btn"
              onClick={onCloseToStudio}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${ui.iconButton}`}
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Internal 3-Tab Switcher */}
        <div className={`studio-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-3.5 py-2 sm:px-4 ${ui.divider}`}>
          {(
            [
              { id: 'course', shortLabel: 'Course (8)', label: 'KINETIC-5 Course (8)', icon: <BookOpenIcon className="h-3.5 w-3.5 shrink-0" /> },
              { id: 'gym', shortLabel: 'Gym', label: 'Gesture Gym', icon: <TimerIcon className="h-3.5 w-3.5 shrink-0" /> },
              { id: 'studies', shortLabel: 'Studies', label: 'My Studies', icon: <PencilIcon className="h-3.5 w-3.5 shrink-0" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              data-testid={`school-tab-${t.id}`}
              onClick={() => switchTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors sm:px-3 ${
                tab === t.id ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {t.icon}
              <span className="sm:hidden">{t.shortLabel}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Content Body */}
        <div className="studio-scroll flex-1 overflow-y-auto p-3.5 sm:p-4">
          {tab === 'course' && (
            <div className="space-y-3">
              <div className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed ${ui.card}`}>
                <strong className={ui.textPrimary}>PULSE → ANCHOR → BOX → WRAP → CARVE:</strong>{' '}
                <span className={ui.textSecondary}>
                  8 interactive figure-drawing missions combining live 3D rigs, S-Pen Pad verification, and X-Ray Sight checks. Your WIP Studio scene and Pad sketch are safely sandboxed and restored on exit.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {KINETIC_MODULES.map((mod) => {
                  const isDone = completedModuleIds.includes(mod.id);
                  const isHighlighted = highlightedModuleId === mod.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      data-testid={`kinetic-module-card-${mod.id}`}
                      onClick={() => onStartModule(mod.id)}
                      className={`group flex flex-col justify-between gap-2 rounded-xl p-3 text-left transition-all ${
                        isHighlighted
                          ? 'ring-2 ring-emerald-400 ' + ui.card
                          : `${ui.card} hover:border-zinc-400/50`
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${ui.monoPill}`}>
                              {mod.index}/8 · {mod.phaseTag}
                            </span>
                            <span className={`font-mono text-[9.5px] ${ui.textMuted}`}>
                              {mod.durationLabel}
                            </span>
                          </span>
                          {isDone && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              <span>Done</span>
                            </span>
                          )}
                        </div>

                        <div className={`text-[12.5px] font-semibold leading-snug ${ui.textPrimary}`}>
                          {mod.title}{' '}
                          <span className={`font-normal text-[11px] ${ui.textMuted}`}>
                            — {mod.missionName}
                          </span>
                        </div>
                        <p className={`text-[11px] leading-snug ${ui.textSecondary}`}>
                          {mod.corePrinciple}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[10.5px] font-medium">
                        <span className="text-emerald-400">
                          {isDone ? 'Practice Again' : 'Start Mission'}
                        </span>
                        <ChevronRightIcon className="h-3.5 w-3.5 opacity-75 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'gym' && (
            <GestureGymSetupView
              studioTheme={studioTheme}
              initialInterval={gymInitialInterval}
              onStartSession={onStartGymSession}
            />
          )}

          {tab === 'studies' && (
            <StudyGalleryView
              studioTheme={studioTheme}
              snapshotBridge={snapshotBridge}
              refreshToken={studyRefreshToken}
              onReopenInPad={onReopenStudyInPad}
              onToast={onToast}
            />
          )}
        </div>
      </div>
    </div>
  );
}
