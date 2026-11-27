'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SaveIcon,
  ScanEyeIcon,
  SkipForwardIcon,
  TimerIcon,
  ToggleSwitch,
  VideoIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import type { MannequinModelId } from '@/data/modelCatalog';
import {
  POSE_CATEGORIES,
  POSE_PRESETS,
  type PoseCategory,
  type PosePreset,
} from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';
import type { PadBridge } from '@/types/padBridge';
import { playStudioChime } from '@/utils/studioChime';

export const GYM_STATS_STORAGE_KEY = 'mortal-mesh:gym:v1';

export type GymSketchMode = 'pad' | 'paper';
export type GymDurationOption = 30 | 60 | 120 | 300 | 'class';
export type GymStudyStyle = 'atelier' | 'notan' | 'loomis' | 'comic-ink';
export type GymModelChoice = MannequinModelId | 'mix';

export interface GymStats {
  streakDays: number;
  lastDateIso: string | null;
  totalPosesDrawn: number;
  totalMinutesDrawn: number;
}

export interface GymSlideSpec {
  pose: PosePreset;
  modelId: MannequinModelId;
  durationSeconds: number;
  azimuthDeg: number;
  elevationDeg: number;
}

export interface GymSessionConfig {
  sketchMode: GymSketchMode;
  durationOpt: GymDurationOption;
  poseCount: 5 | 10 | 15;
  categoryFilter: PoseCategory | 'all';
  modelChoice: GymModelChoice;
  studyStyle: GymStudyStyle;
  randomizeCamera: boolean;
  pauseToOrbit: boolean;
  audioEnabled: boolean;
  slides: GymSlideSpec[];
}

export interface GymStepTransitionPayload {
  poseId: string;
  modelId: MannequinModelId;
  studyStyle: GymStudyStyle;
  randomizeCamera: boolean;
  azimuthDeg: number;
  elevationDeg: number;
}

const DEFAULT_GYM_STATS: GymStats = {
  streakDays: 0,
  lastDateIso: null,
  totalPosesDrawn: 0,
  totalMinutesDrawn: 0,
};

const CLASS_CURVE_SECONDS = [30, 30, 30, 30, 60, 60, 60, 120, 120, 300];
const MIX_MODELS: readonly MannequinModelId[] = [
  'female',
  'classic',
  'mannequin-2',
  'mannequin-3',
  'skeleton',
];

function localDateIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayDateIso(): string {
  const d = new Date(Date.now() - 86_400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function loadGymStats(): GymStats {
  if (typeof window === 'undefined') return DEFAULT_GYM_STATS;
  try {
    const raw = window.localStorage.getItem(GYM_STATS_STORAGE_KEY);
    if (!raw) return DEFAULT_GYM_STATS;
    const parsed = JSON.parse(raw) as Partial<GymStats>;
    return {
      streakDays:
        typeof parsed.streakDays === 'number'
          ? Math.max(0, Math.round(parsed.streakDays))
          : 0,
      lastDateIso: typeof parsed.lastDateIso === 'string' ? parsed.lastDateIso : null,
      totalPosesDrawn:
        typeof parsed.totalPosesDrawn === 'number'
          ? Math.max(0, Math.round(parsed.totalPosesDrawn))
          : 0,
      totalMinutesDrawn:
        typeof parsed.totalMinutesDrawn === 'number'
          ? Math.max(0, Math.round(parsed.totalMinutesDrawn))
          : 0,
    };
  } catch {
    return DEFAULT_GYM_STATS;
  }
}

function recordGymPoseCompletion(secondsDrawn: number): GymStats {
  const prev = loadGymStats();
  const today = localDateIso();
  const yesterday = yesterdayDateIso();
  const nextStreak =
    prev.lastDateIso === today
      ? Math.max(1, prev.streakDays)
      : prev.lastDateIso === yesterday
        ? prev.streakDays + 1
        : 1;

  const next: GymStats = {
    streakDays: nextStreak,
    lastDateIso: today,
    totalPosesDrawn: prev.totalPosesDrawn + 1,
    totalMinutesDrawn: prev.totalMinutesDrawn + Math.max(1, Math.round(secondsDrawn / 60)),
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GYM_STATS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }
  return next;
}

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function shufflePoses(list: readonly PosePreset[]): PosePreset[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface GestureGymSetupViewProps {
  studioTheme: StudioThemeId;
  initialInterval?: GymDurationOption | null;
  onStartSession: (config: GymSessionConfig) => void;
}

export function GestureGymSetupView({
  studioTheme,
  initialInterval = null,
  onStartSession,
}: GestureGymSetupViewProps) {
  const [sketchMode, setSketchMode] = useState<GymSketchMode>('pad');
  const [durationOpt, setDurationOpt] = useState<GymDurationOption>(60);
  const [poseCount, setPoseCount] = useState<5 | 10 | 15>(10);
  const [categoryFilter, setCategoryFilter] = useState<PoseCategory | 'all'>('all');
  const [modelChoice, setModelChoice] = useState<GymModelChoice>('female');
  const [studyStyle, setStudyStyle] = useState<GymStudyStyle>('atelier');
  const [randomizeCamera, setRandomizeCamera] = useState(true);
  const [pauseToOrbit, setPauseToOrbit] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stats, setStats] = useState<GymStats>(DEFAULT_GYM_STATS);

  useEffect(() => {
    setStats(loadGymStats());
  }, []);

  useEffect(() => {
    if (initialInterval) {
      setDurationOpt(initialInterval);
      if (initialInterval === 'class') {
        setPoseCount(10);
      }
    }
  }, [initialInterval]);

  const effectivePoseCount = durationOpt === 'class' ? 10 : poseCount;

  const estimatedTotalMinutes = useMemo(() => {
    if (durationOpt === 'class') return 14;
    return Math.max(1, Math.round((durationOpt * effectivePoseCount) / 60));
  }, [durationOpt, effectivePoseCount]);

  const handleLaunch = () => {
    const poolBase =
      categoryFilter === 'all'
        ? POSE_PRESETS.filter((p) => p.id !== 't-pose')
        : POSE_PRESETS.filter((p) => p.category === categoryFilter);
    const pool = poolBase.length > 0 ? poolBase : POSE_PRESETS;
    const shuffled = shufflePoses(pool);

    const count = durationOpt === 'class' ? CLASS_CURVE_SECONDS.length : poseCount;
    const slides: GymSlideSpec[] = [];
    for (let i = 0; i < count; i += 1) {
      const pose = shuffled[i % shuffled.length];
      const dur = durationOpt === 'class' ? CLASS_CURVE_SECONDS[i] : durationOpt;
      const modelId =
        modelChoice === 'mix' ? MIX_MODELS[i % MIX_MODELS.length] : modelChoice;
      const az = randomizeCamera ? Math.round((Math.random() * 130 - 65) / 5) * 5 : 12;
      const el = randomizeCamera ? Math.round(Math.random() * 22 - 4) : 8;
      slides.push({ pose, modelId, durationSeconds: dur, azimuthDeg: az, elevationDeg: el });
    }

    onStartSession({
      sketchMode,
      durationOpt,
      poseCount: effectivePoseCount,
      categoryFilter,
      modelChoice,
      studyStyle,
      randomizeCamera,
      pauseToOrbit,
      audioEnabled,
      slides,
    });
  };

  const { ui } = STUDIO_THEMES[studioTheme];

  return (
    <div data-testid="gesture-gym-setup-view" className="space-y-3.5">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] ${ui.card}`}>
        <span className={`font-medium ${ui.textSecondary}`}>
          Streak: <strong className={ui.textPrimary}>{stats.streakDays}d</strong> · Drawn:{' '}
          <strong className={ui.textPrimary}>{stats.totalPosesDrawn} poses</strong>
        </span>
        <span className={`font-mono text-[10px] ${ui.monoPill} px-1.5 py-0.5 rounded`}>
          ~{estimatedTotalMinutes} min total
        </span>
      </div>

      {/* Sketch Mode */}
      <div className="space-y-1.5">
        <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
          Sketch Workspace
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="gym-sketch-mode-pad"
            aria-pressed={sketchMode === 'pad'}
            onClick={() => setSketchMode('pad')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
              sketchMode === 'pad' ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            <span>Draw on Pad</span>
          </button>
          <button
            type="button"
            data-testid="gym-sketch-mode-paper"
            aria-pressed={sketchMode === 'paper'}
            onClick={() => setSketchMode('paper')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
              sketchMode === 'paper' ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            <TimerIcon className="h-3.5 w-3.5" />
            <span>Paper / External App</span>
          </button>
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-1.5">
        <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
          Interval Duration
        </span>
        <div className="grid grid-cols-5 gap-1.5">
          {(
            [
              { id: 30, label: '30s' },
              { id: 60, label: '1m' },
              { id: 120, label: '2m' },
              { id: 300, label: '5m' },
              { id: 'class', label: 'Class' },
            ] as const
          ).map((opt) => (
            <button
              key={String(opt.id)}
              type="button"
              data-gym-duration={String(opt.id)}
              aria-pressed={durationOpt === opt.id}
              onClick={() => {
                setDurationOpt(opt.id);
                if (opt.id === 'class') setPoseCount(10);
              }}
              className={`rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
                durationOpt === opt.id ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {durationOpt === 'class' && (
          <p className={`text-[10px] ${ui.textMuted}`}>
            Classic curve: 4×30s → 3×1m → 2×2m → 1×5m (10 poses)
          </p>
        )}
      </div>

      {/* Count & Study Mode */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
            Pose Count
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {([5, 10, 15] as const).map((cnt) => {
              const active = effectivePoseCount === cnt;
              const disabled = durationOpt === 'class' && cnt !== 10;
              return (
                <button
                  key={cnt}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPoseCount(cnt)}
                  className={`rounded-lg py-1.5 text-[11px] font-medium ${
                    disabled
                      ? ui.pillButtonDisabled
                      : active
                        ? ui.pillButtonActive
                        : ui.pillButton
                  }`}
                >
                  {cnt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
            Study Look
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { id: 'atelier', label: 'Atelier' },
                { id: 'notan', label: '2-Val Notan' },
                { id: 'loomis', label: 'Blue-Pencil' },
                { id: 'comic-ink', label: 'Comic Ink' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStudyStyle(st.id)}
                className={`rounded-lg px-2 py-1 text-[10.5px] font-medium ${
                  studyStyle === st.id ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
          Pose Category
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`rounded-lg px-2.5 py-1 text-[10.5px] font-medium ${
              categoryFilter === 'all' ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            All 50
          </button>
          {POSE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`rounded-lg px-2.5 py-1 text-[10.5px] font-medium ${
                categoryFilter === cat.id ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Figure Model */}
      <div className="space-y-1.5">
        <span className={`block text-[10.5px] font-medium ${ui.textSecondary}`}>
          Figure Model
        </span>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {(
            [
              { id: 'female', label: 'Female' },
              { id: 'classic', label: 'Classic' },
              { id: 'mannequin-2', label: 'M2' },
              { id: 'mannequin-3', label: 'M3' },
              { id: 'skeleton', label: 'Skeleton' },
              { id: 'mix', label: 'Mix' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModelChoice(m.id)}
              className={`rounded-lg px-2 py-1.5 text-[10.5px] font-medium ${
                modelChoice === m.id ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className={`rounded-xl p-3 space-y-2 ${ui.card}`}>
        <ToggleSwitch
          id="gym-random-camera"
          label="Randomize Camera Angle"
          checked={randomizeCamera}
          onChange={() => setRandomizeCamera((p) => !p)}
          theme={STUDIO_THEMES[studioTheme]}
        />
        <ToggleSwitch
          id="gym-pause-orbit"
          label="Pause for 3D Orbit & X-Ray Check after timer"
          checked={pauseToOrbit}
          onChange={() => setPauseToOrbit((p) => !p)}
          theme={STUDIO_THEMES[studioTheme]}
        />
        <ToggleSwitch
          id="gym-audio-bell"
          label="Audio Chime Bell"
          checked={audioEnabled}
          onChange={() => setAudioEnabled((p) => !p)}
          theme={STUDIO_THEMES[studioTheme]}
        />
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          data-testid="gym-start-session-btn"
          onClick={handleLaunch}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11.5px] font-semibold ${ui.pillButtonActive}`}
        >
          <PlayIcon className="h-3.5 w-3.5" />
          <span>
            Start {sketchMode === 'pad' ? 'Pad + 3D' : '3D'} Session ({effectivePoseCount} Poses)
          </span>
        </button>
      </div>
    </div>
  );
}

interface GestureGymActiveHudProps {
  session: GymSessionConfig;
  studioTheme: StudioThemeId;
  padBridge: PadBridge | null;
  isPadMode: boolean;
  isCompact?: boolean;
  onApplySlide: (slide: GymStepTransitionPayload) => void;
  onEnterInspectPhase: () => void;
  onTriggerXRayCheck: () => void;
  onSaveStudy: (poseName: string, poseId: string) => Promise<void>;
  onOpenStudiesModal: () => void;
  onRestartSession: () => void;
  onExitGym: () => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
}

export function GestureGymActiveHud({
  session,
  studioTheme,
  padBridge,
  isPadMode,
  isCompact = false,
  onApplySlide,
  onEnterInspectPhase,
  onTriggerXRayCheck,
  onSaveStudy,
  onOpenStudiesModal,
  onRestartSession,
  onExitGym,
  onToast,
}: GestureGymActiveHudProps) {
  const [slides, setSlides] = useState<GymSlideSpec[]>(session.slides);
  const [slideIdx, setSlideIdx] = useState(0);
  const [phase, setPhase] = useState<'drawing' | 'inspect' | 'summary'>('drawing');
  const [remainingSec, setRemainingSec] = useState(
    session.slides[0]?.durationSeconds ?? 60
  );
  const [isPaused, setIsPaused] = useState(false);
  const [studyStyle, setStudyStyle] = useState<GymStudyStyle>(session.studyStyle);
  const [audioEnabled, setAudioEnabled] = useState(session.audioEnabled);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalSessionSeconds, setTotalSessionSeconds] = useState(0);
  const [stats, setStats] = useState<GymStats>(() => loadGymStats());
  const [timelapseBusy, setTimelapseBusy] = useState(false);

  const studyStyleRef = useRef(studyStyle);
  studyStyleRef.current = studyStyle;

  useEffect(() => {
    setSlides(session.slides);
    setSlideIdx(0);
    setPhase('drawing');
    setRemainingSec(session.slides[0]?.durationSeconds ?? 60);
    setIsPaused(false);
    setStudyStyle(session.studyStyle);
    setCompletedCount(0);
    setTotalSessionSeconds(0);
  }, [session]);

  const currentSlide = slides[slideIdx] ?? null;

  const advanceToNextSlide = useCallback(() => {
    if (isPadMode) {
      padBridge?.clearPad(true);
    }
    const nextIdx = slideIdx + 1;
    if (nextIdx >= slides.length) {
      if (audioEnabled) playStudioChime('session-complete');
      setPhase('summary');
      return;
    }
    const nextSlide = slides[nextIdx];
    setSlideIdx(nextIdx);
    setPhase('drawing');
    setRemainingSec(nextSlide.durationSeconds);
    setIsPaused(false);
    onApplySlide({
      poseId: nextSlide.pose.id,
      modelId: nextSlide.modelId,
      studyStyle: studyStyleRef.current,
      randomizeCamera: session.randomizeCamera,
      azimuthDeg: nextSlide.azimuthDeg,
      elevationDeg: nextSlide.elevationDeg,
    });
  }, [
    isPadMode,
    padBridge,
    slideIdx,
    slides,
    audioEnabled,
    onApplySlide,
    session.randomizeCamera,
  ]);

  const enterInspectState = useCallback(() => {
    const dur = currentSlide?.durationSeconds ?? 60;
    const updated = recordGymPoseCompletion(dur);
    setStats(updated);
    setCompletedCount((prev) => prev + 1);
    setTotalSessionSeconds((prev) => prev + dur);
    if (audioEnabled) {
      playStudioChime(slideIdx + 1 >= slides.length ? 'session-complete' : 'pose-done');
    }
    setPhase('inspect');
    onEnterInspectPhase();
  }, [currentSlide, audioEnabled, slideIdx, slides.length, onEnterInspectPhase]);

  // Strict 1 Hz DOM-only countdown (ZERO WebGL draw calls!)
  useEffect(() => {
    if (phase !== 'drawing' || isPaused) return;
    const id = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev === 11 && audioEnabled && (currentSlide?.durationSeconds ?? 0) >= 30) {
          playStudioChime('warn-10s');
        }
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, isPaused, audioEnabled, currentSlide]);

  useEffect(() => {
    if (phase === 'drawing' && remainingSec === 0) {
      enterInspectState();
    }
  }, [phase, remainingSec, enterInspectState]);

  useEffect(() => {
    if (phase !== 'inspect' || session.pauseToOrbit) return;
    const t = setTimeout(() => advanceToNextSlide(), 1800);
    return () => clearTimeout(t);
  }, [phase, session.pauseToOrbit, advanceToNextSlide]);

  const handleSwitchStudyStyle = (nextStyle: GymStudyStyle) => {
    setStudyStyle(nextStyle);
    if (!currentSlide) return;
    onApplySlide({
      poseId: currentSlide.pose.id,
      modelId: currentSlide.modelId,
      studyStyle: nextStyle,
      randomizeCamera: false,
      azimuthDeg: currentSlide.azimuthDeg,
      elevationDeg: currentSlide.elevationDeg,
    });
  };

  const handleSwapSkeleton = () => {
    if (!currentSlide) return;
    const nextModel: MannequinModelId =
      currentSlide.modelId === 'skeleton' ? 'female' : 'skeleton';
    setSlides((prev) =>
      prev.map((s, idx) => (idx === slideIdx ? { ...s, modelId: nextModel } : s))
    );
    onApplySlide({
      poseId: currentSlide.pose.id,
      modelId: nextModel,
      studyStyle: studyStyleRef.current,
      randomizeCamera: false,
      azimuthDeg: currentSlide.azimuthDeg,
      elevationDeg: currentSlide.elevationDeg,
    });
  };

  const handleExportTimelapse = async () => {
    if (!padBridge || timelapseBusy) return;
    setTimelapseBusy(true);
    try {
      const blob = await padBridge.exportTimelapseBlob({ durationMs: 5000 });
      if (!blob) {
        onToast('Draw at least 1 stroke to build a timelapse', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gesture-${currentSlide?.pose.id ?? 'timelapse'}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast('Exported 5s timelapse (.webm)', 'success');
    } catch {
      onToast('Timelapse export unavailable', 'error');
    } finally {
      setTimelapseBusy(false);
    }
  };

  const { ui } = STUDIO_THEMES[studioTheme];
  const progressPct =
    currentSlide && currentSlide.durationSeconds > 0
      ? Math.max(0, Math.min(100, (remainingSec / currentSlide.durationSeconds) * 100))
      : 0;

  const styleAndAudioControls = (
    <>
      {phase === 'drawing' && (
        <>
          <button
            type="button"
            data-testid="gym-skip-btn"
            onClick={advanceToNextSlide}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-medium whitespace-nowrap ${ui.pillButton}`}
          >
            <SkipForwardIcon className="h-3 w-3" />
            <span className={isCompact ? 'inline' : 'hidden lg:inline'}>Skip</span>
          </button>

          {(
            [
              { id: 'atelier', label: 'Atelier' },
              { id: 'notan', label: 'Notan' },
              { id: 'loomis', label: 'Loomis' },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              data-testid={`gym-style-${st.id}`}
              aria-pressed={studyStyle === st.id}
              onClick={() => handleSwitchStudyStyle(st.id)}
              className={`h-7 shrink-0 rounded-lg px-2 text-[10px] font-medium whitespace-nowrap ${
                studyStyle === st.id ? ui.pillButtonActive : ui.pillButton
              }`}
            >
              {st.label}
            </button>
          ))}
        </>
      )}

      <button
        type="button"
        data-testid="gym-toggle-skeleton-btn"
        aria-pressed={currentSlide?.modelId === 'skeleton'}
        onClick={handleSwapSkeleton}
        className={`h-7 shrink-0 rounded-lg px-2 text-[10px] font-medium whitespace-nowrap ${
          currentSlide?.modelId === 'skeleton' ? ui.pillButtonActive : ui.pillButton
        }`}
      >
        Skel
      </button>

      <button
        type="button"
        aria-label={audioEnabled ? 'Mute chime' : 'Unmute chime'}
        onClick={() => setAudioEnabled((p) => !p)}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${ui.iconButton}`}
      >
        {audioEnabled ? <Volume2Icon className="h-3.5 w-3.5" /> : <VolumeXIcon className="h-3.5 w-3.5" />}
      </button>
    </>
  );

  const phasePrimaryControls =
    phase === 'drawing' ? (
      <>
        {!isCompact && (
          <button
            type="button"
            data-testid="gym-pause-btn"
            aria-label={isPaused ? 'Resume timer' : 'Pause timer'}
            onClick={() => setIsPaused((p) => !p)}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${ui.pillButton}`}
          >
            {isPaused ? <PlayIcon className="h-3 w-3" /> : <PauseIcon className="h-3 w-3" />}
          </button>
        )}
        <button
          type="button"
          data-testid="gym-finish-pose-btn"
          onClick={enterInspectState}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold whitespace-nowrap ${ui.pillButtonActive}`}
        >
          <ScanEyeIcon className="h-3 w-3" />
          <span>Check</span>
        </button>
      </>
    ) : (
      <>
        {isPadMode && (
          <button
            type="button"
            data-testid="gym-inspect-xray-btn"
            onClick={onTriggerXRayCheck}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold whitespace-nowrap ${ui.pillButton}`}
          >
            <ScanEyeIcon className="h-3 w-3" />
            <span>
              X-Ray<span className="hidden lg:inline"> Check</span>
            </span>
          </button>
        )}
        {isPadMode && currentSlide && (
          <button
            type="button"
            data-testid="gym-save-study-btn"
            onClick={() => void onSaveStudy(currentSlide.pose.name, currentSlide.pose.id)}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold whitespace-nowrap ${ui.pillButton}`}
          >
            <SaveIcon className="h-3 w-3" />
            <span>
              Save<span className="hidden lg:inline"> Study</span>
            </span>
          </button>
        )}
        {isPadMode && (
          <button
            type="button"
            data-testid="gym-timelapse-btn"
            disabled={timelapseBusy}
            onClick={() => void handleExportTimelapse()}
            title="Download 5s WebM Timelapse"
            className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-medium whitespace-nowrap ${ui.pillButton}`}
          >
            <VideoIcon className="h-3 w-3" />
            <span className={isCompact ? 'inline' : 'hidden lg:inline'}>Timelapse</span>
          </button>
        )}
        <button
          type="button"
          data-testid="gym-next-pose-btn"
          onClick={advanceToNextSlide}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10.5px] font-semibold whitespace-nowrap ${ui.pillButtonActive}`}
        >
          <span>
            Next<span className="hidden lg:inline"> Pose</span> →
          </span>
        </button>
      </>
    );

  return (
    <>
      {phase !== 'summary' && currentSlide && (
        <div
          data-testid="gesture-gym-hud"
          onPointerDown={(e) => e.stopPropagation()}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
          className={`fixed left-1/2 z-30 -translate-x-1/2 ${
            isCompact ? 'w-[min(97vw,980px)] px-2.5' : 'w-[min(96vw,980px)] px-3'
          } rounded-2xl py-1.5 backdrop-blur-xl select-none ${ui.panel}`}
        >
          {isCompact ? (
            <>
              <div className="flex h-[30px] items-center justify-between gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${ui.monoPill}`}>
                    {slideIdx + 1}/{slides.length}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${ui.textPrimary}`}>
                    {phase === 'inspect' ? 'Orbit & Check' : currentSlide.pose.name}
                  </span>
                  <span
                    data-testid="gym-countdown-clock"
                    className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                      phase === 'inspect' ? 'bg-emerald-500 text-zinc-950' : ui.pillButtonActive
                    }`}
                  >
                    {phase === 'inspect' ? 'ORBIT' : formatClock(remainingSec)}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {phase === 'drawing' && (
                    <button
                      type="button"
                      data-testid="gym-pause-btn"
                      aria-label={isPaused ? 'Resume timer' : 'Pause timer'}
                      onClick={() => setIsPaused((p) => !p)}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg ${ui.pillButton}`}
                    >
                      {isPaused ? <PlayIcon className="h-3 w-3" /> : <PauseIcon className="h-3 w-3" />}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="gym-exit-btn"
                    aria-label="Exit Gesture Gym"
                    onClick={onExitGym}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${ui.pillButton}`}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="studio-scroll mt-1 flex h-[30px] items-center gap-1 overflow-x-auto">
                {phasePrimaryControls}
                {styleAndAudioControls}
              </div>
            </>
          ) : (
            <div className="flex flex-nowrap items-center justify-between gap-2">
              <div className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${ui.monoPill}`}>
                  {slideIdx + 1}/{slides.length}
                </span>
                <span className={`truncate max-w-[100px] lg:max-w-[180px] text-[11px] font-semibold ${ui.textPrimary}`}>
                  {phase === 'inspect' ? 'Orbit & Check' : currentSlide.pose.name}
                </span>
                <span
                  data-testid="gym-countdown-clock"
                  className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11.5px] font-bold tabular-nums ${
                    phase === 'inspect' ? 'bg-emerald-500 text-zinc-950' : ui.pillButtonActive
                  }`}
                >
                  {phase === 'inspect' ? 'ORBIT' : formatClock(remainingSec)}
                </span>
              </div>

              <div className="studio-scroll flex shrink-0 items-center gap-1 overflow-x-auto">
                {phasePrimaryControls}
                {styleAndAudioControls}
                <button
                  type="button"
                  data-testid="gym-exit-btn"
                  aria-label="Exit Gesture Gym"
                  onClick={onExitGym}
                  className={`flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold whitespace-nowrap ${ui.pillButton}`}
                >
                  <XIcon className="h-3 w-3" />
                  <span className="hidden lg:inline">Exit</span>
                </button>
              </div>
            </div>
          )}

          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-zinc-500/25">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Session Complete Summary */}
      {phase === 'summary' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gesture Gym Summary"
          data-testid="gesture-gym-summary-modal"
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div className={`w-full max-w-md rounded-2xl p-5 space-y-4 select-none ${ui.panel}`}>
            <div className="flex items-center gap-2.5">
              <CheckCircleIcon className="h-6 w-6 text-emerald-400 shrink-0" />
              <div>
                <h2 className={`text-sm font-bold ${ui.textPrimary}`}>
                  Gesture Set Complete!
                </h2>
                <p className={`text-[11px] ${ui.textSecondary}`}>
                  Daily life-drawing streak updated cleanly.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className={`rounded-xl p-2.5 ${ui.card}`}>
                <div className={`font-mono text-base font-bold ${ui.textPrimary}`}>
                  {completedCount}
                </div>
                <div className={`text-[10px] ${ui.textMuted}`}>Poses Done</div>
              </div>
              <div className={`rounded-xl p-2.5 ${ui.card}`}>
                <div className={`font-mono text-base font-bold ${ui.textPrimary}`}>
                  {Math.max(1, Math.round(totalSessionSeconds / 60))}m
                </div>
                <div className={`text-[10px] ${ui.textMuted}`}>Minutes</div>
              </div>
              <div className={`rounded-xl p-2.5 ${ui.card}`}>
                <div className="font-mono text-base font-bold text-emerald-400">
                  {stats.streakDays}d
                </div>
                <div className={`text-[10px] ${ui.textMuted}`}>Streak</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onOpenStudiesModal}
                className={`rounded-xl px-3 py-2 text-[11px] font-medium ${ui.pillButton}`}
              >
                View Saved Studies
              </button>
              <button
                type="button"
                onClick={onRestartSession}
                className={`rounded-xl px-3 py-2 text-[11px] font-medium ${ui.pillButton}`}
              >
                Start Another Set
              </button>
              <button
                type="button"
                data-testid="gym-summary-exit-btn"
                onClick={onExitGym}
                className={`rounded-xl px-4 py-2 text-[11.5px] font-semibold ${ui.pillButtonActive}`}
              >
                Return to Studio
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
