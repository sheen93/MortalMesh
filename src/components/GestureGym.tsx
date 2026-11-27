'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  TimerIcon,
  ToggleSwitch,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { MODEL_CATALOG, type MannequinModelId } from '@/data/modelCatalog';
import {
  POSE_CATEGORIES,
  POSE_PRESETS,
  type PoseCategory,
  type PosePreset,
} from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';
import { playSoftBell } from '@/utils/studioChime';

export const GYM_STATS_STORAGE_KEY = 'mortal-mesh:gym:v1';

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
      streakDays: typeof parsed.streakDays === 'number' ? Math.max(0, Math.round(parsed.streakDays)) : 0,
      lastDateIso: typeof parsed.lastDateIso === 'string' ? parsed.lastDateIso : null,
      totalPosesDrawn: typeof parsed.totalPosesDrawn === 'number' ? Math.max(0, Math.round(parsed.totalPosesDrawn)) : 0,
      totalMinutesDrawn: typeof parsed.totalMinutesDrawn === 'number' ? Math.max(0, Math.round(parsed.totalMinutesDrawn)) : 0,
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
      // Ignore storage errors cleanly
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

interface GestureGymProps {
  isSetupOpen: boolean;
  isActive: boolean;
  initialInterval?: GymDurationOption | null;
  studioTheme: StudioThemeId;
  onCloseSetup: () => void;
  onStartSession: (firstSlide: GymStepTransitionPayload) => void;
  onApplySlide: (slide: GymStepTransitionPayload) => void;
  onExitGym: () => void;
}

export function GestureGym({
  isSetupOpen,
  isActive,
  initialInterval = null,
  studioTheme,
  onCloseSetup,
  onStartSession,
  onApplySlide,
  onExitGym,
}: GestureGymProps) {
  const [durationOpt, setDurationOpt] = useState<GymDurationOption>(60);
  const [poseCount, setPoseCount] = useState<5 | 10 | 15>(10);
  const [categoryFilter, setCategoryFilter] = useState<PoseCategory | 'all'>('all');
  const [modelChoice, setModelChoice] = useState<GymModelChoice>('female');
  const [studyStyle, setStudyStyle] = useState<GymStudyStyle>('atelier');
  const [randomizeCamera, setRandomizeCamera] = useState(true);
  const [pauseToOrbit, setPauseToOrbit] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stats, setStats] = useState<GymStats>(DEFAULT_GYM_STATS);

  // Active workout state kept strictly inside GestureGym so 1 Hz countdown ticks
  // NEVER re-render StudioCanvas / R3F WebGL scene (0 idle WebGL draws!).
  const [slides, setSlides] = useState<GymSlideSpec[]>([]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [phase, setPhase] = useState<'drawing' | 'inspect' | 'summary'>('drawing');
  const [remainingSec, setRemainingSec] = useState(60);
  const [isPaused, setIsPaused] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalSessionSeconds, setTotalSessionSeconds] = useState(0);

  const studyStyleRef = useRef<GymStudyStyle>(studyStyle);
  studyStyleRef.current = studyStyle;

  useEffect(() => {
    setStats(loadGymStats());
  }, [isSetupOpen, isActive]);

  useEffect(() => {
    if (initialInterval) {
      setDurationOpt(initialInterval);
      if (initialInterval === 'class') {
        setPoseCount(10);
      }
    }
  }, [initialInterval]);

  useEffect(() => {
    if (!isSetupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseSetup();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isSetupOpen, onCloseSetup]);

  const buildQueue = useCallback((): GymSlideSpec[] => {
    const poolBase =
      categoryFilter === 'all'
        ? POSE_PRESETS.filter((p) => p.id !== 't-pose')
        : POSE_PRESETS.filter((p) => p.category === categoryFilter);
    const pool = poolBase.length > 0 ? poolBase : POSE_PRESETS;
    const shuffled = shufflePoses(pool);

    const count = durationOpt === 'class' ? CLASS_CURVE_SECONDS.length : poseCount;
    const queue: GymSlideSpec[] = [];
    for (let i = 0; i < count; i += 1) {
      const pose = shuffled[i % shuffled.length];
      const dur =
        durationOpt === 'class' ? CLASS_CURVE_SECONDS[i] : durationOpt;
      const modelId =
        modelChoice === 'mix'
          ? MIX_MODELS[i % MIX_MODELS.length]
          : modelChoice;
      const az = randomizeCamera
        ? Math.round((Math.random() * 130 - 65) / 5) * 5
        : 12;
      const el = randomizeCamera
        ? Math.round(Math.random() * 22 - 4)
        : 8;
      queue.push({
        pose,
        modelId,
        durationSeconds: dur,
        azimuthDeg: az,
        elevationDeg: el,
      });
    }
    return queue;
  }, [categoryFilter, durationOpt, poseCount, modelChoice, randomizeCamera]);

  const launchSession = useCallback(() => {
    const queue = buildQueue();
    if (queue.length === 0) return;
    const first = queue[0];
    setSlides(queue);
    setSlideIdx(0);
    setPhase('drawing');
    setRemainingSec(first.durationSeconds);
    setIsPaused(false);
    setCompletedCount(0);
    setTotalSessionSeconds(0);
    onStartSession({
      poseId: first.pose.id,
      modelId: first.modelId,
      studyStyle,
      randomizeCamera,
      azimuthDeg: first.azimuthDeg,
      elevationDeg: first.elevationDeg,
    });
  }, [buildQueue, onStartSession, randomizeCamera, studyStyle]);

  const advanceToNextSlide = useCallback(() => {
    const nextIdx = slideIdx + 1;
    if (nextIdx >= slides.length) {
      if (audioEnabled) playSoftBell('session-end');
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
      randomizeCamera,
      azimuthDeg: nextSlide.azimuthDeg,
      elevationDeg: nextSlide.elevationDeg,
    });
  }, [slideIdx, slides, audioEnabled, onApplySlide, randomizeCamera]);

  const handleTimerExpired = useCallback(() => {
    const cur = slides[slideIdx];
    const dur = cur?.durationSeconds ?? 60;
    const updatedStats = recordGymPoseCompletion(dur);
    setStats(updatedStats);
    setCompletedCount((prev) => prev + 1);
    setTotalSessionSeconds((prev) => prev + dur);

    if (audioEnabled) {
      playSoftBell(slideIdx + 1 >= slides.length ? 'session-end' : 'complete');
    }

    if (slideIdx + 1 >= slides.length) {
      setPhase('summary');
      return;
    }
    setPhase('inspect');
  }, [slides, slideIdx, audioEnabled]);

  // 1 Hz DOM-only countdown interval (zero canvas invalidate or R3F updates)
  useEffect(() => {
    if (!isActive || phase !== 'drawing' || isPaused) return;
    const id = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, phase, isPaused]);

  useEffect(() => {
    if (isActive && phase === 'drawing' && remainingSec === 0) {
      handleTimerExpired();
    }
  }, [isActive, phase, remainingSec, handleTimerExpired]);

  // Auto-advance cleanly when Pause to Orbit 3D is OFF
  useEffect(() => {
    if (!isActive || phase !== 'inspect' || pauseToOrbit) return;
    const t = setTimeout(() => {
      advanceToNextSlide();
    }, 2000);
    return () => clearTimeout(t);
  }, [isActive, phase, pauseToOrbit, advanceToNextSlide]);

  const handleSwitchStudyStyle = (nextStyle: GymStudyStyle) => {
    setStudyStyle(nextStyle);
    const cur = slides[slideIdx];
    if (!cur) return;
    onApplySlide({
      poseId: cur.pose.id,
      modelId: cur.modelId,
      studyStyle: nextStyle,
      randomizeCamera: false,
      azimuthDeg: cur.azimuthDeg,
      elevationDeg: cur.elevationDeg,
    });
  };

  const handleSwapSkeletonToggle = () => {
    const cur = slides[slideIdx];
    if (!cur) return;
    const nextModel: MannequinModelId =
      cur.modelId === 'skeleton' ? 'female' : 'skeleton';
    setSlides((prev) =>
      prev.map((s, idx) => (idx === slideIdx ? { ...s, modelId: nextModel } : s))
    );
    onApplySlide({
      poseId: cur.pose.id,
      modelId: nextModel,
      studyStyle: studyStyleRef.current,
      randomizeCamera: false,
      azimuthDeg: cur.azimuthDeg,
      elevationDeg: cur.elevationDeg,
    });
  };

  const { ui } = STUDIO_THEMES[studioTheme];
  const currentSlide = slides[slideIdx] ?? null;

  const effectivePoseCount = durationOpt === 'class' ? 10 : poseCount;

  const estimatedTotalMinutes = useMemo(() => {
    if (durationOpt === 'class') return 14;
    return Math.max(1, Math.round((durationOpt * effectivePoseCount) / 60));
  }, [durationOpt, effectivePoseCount]);

  if (isSetupOpen && !isActive) {
    return (
      <div
        role="presentation"
        onClick={onCloseSetup}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2.5 backdrop-blur-sm sm:p-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="3D Timed Gesture Drawing Gym"
          data-testid="gesture-gym-setup-modal"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={`flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl select-none ${ui.panel}`}
        >
          <header
            className={`flex shrink-0 items-center justify-between gap-2 px-4 py-3 ${ui.header}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <TimerIcon className={`h-4 w-4 shrink-0 ${ui.textPrimary}`} />
              <h2
                className={`text-xs font-semibold uppercase tracking-[0.14em] truncate ${ui.textPrimary}`}
              >
                3D Timed Gesture Gym
              </h2>
            </div>
            <button
              type="button"
              onClick={onCloseSetup}
              aria-label="Close gesture gym setup"
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${ui.iconButton}`}
            >
              <XIcon className="h-4 w-4" />
            </button>
          </header>

          <div className="studio-scroll flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
            {/* Local Streak & Total Stats */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] ${ui.card}`}
            >
              <span className={`font-medium ${ui.textSecondary}`}>
                Streak: <strong className={ui.textPrimary}>{stats.streakDays}d</strong> · Drawn:{' '}
                <strong className={ui.textPrimary}>{stats.totalPosesDrawn} poses</strong>
              </span>
              <span className={`font-mono text-[10px] ${ui.monoPill} px-1.5 py-0.5 rounded`}>
                ~{estimatedTotalMinutes} min total
              </span>
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
                  Life-drawing progression: 4×30s → 3×1m → 2×2m → 1×5m (10 poses)
                </p>
              )}
            </div>

            {/* Pose Count & Model */}
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
                        className={`rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
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
                  Study Mode
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
                      className={`rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${
                        studyStyle === st.id ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Category Filter */}
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
                Figure Reference Model
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

            {/* Toggles */}
            <div className={`rounded-xl p-3 space-y-2 ${ui.card}`}>
              <ToggleSwitch
                id="gym-random-camera"
                label="Randomize Camera Angle per pose"
                checked={randomizeCamera}
                onChange={() => setRandomizeCamera((prev) => !prev)}
                theme={STUDIO_THEMES[studioTheme]}
              />
              <ToggleSwitch
                id="gym-pause-orbit"
                label="Pause to Orbit 3D after each timer"
                checked={pauseToOrbit}
                onChange={() => setPauseToOrbit((prev) => !prev)}
                theme={STUDIO_THEMES[studioTheme]}
              />
              <ToggleSwitch
                id="gym-audio-bell"
                label="Audio Bell Chime"
                checked={audioEnabled}
                onChange={() => setAudioEnabled((prev) => !prev)}
                theme={STUDIO_THEMES[studioTheme]}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={onCloseSetup}
                className={`rounded-xl px-3.5 py-2 text-[11px] font-medium ${ui.pillButton}`}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="gym-start-session-btn"
                onClick={launchSession}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11.5px] font-semibold ${ui.pillButtonActive}`}
              >
                <PlayIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Start Session ({effectivePoseCount} Poses)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isActive) return null;

  const progressPct =
    currentSlide && currentSlide.durationSeconds > 0
      ? Math.max(
          0,
          Math.min(100, (remainingSec / currentSlide.durationSeconds) * 100)
        )
      : 0;

  return (
    <>
      {/* Distraction-Free Top Floating Gym Bar */}
      {phase !== 'summary' && currentSlide && (
        <div
          data-testid="gesture-gym-hud"
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          }}
          className={`fixed left-1/2 z-30 -translate-x-1/2 max-w-[94vw] rounded-2xl px-3 py-2 backdrop-blur-xl select-none ${ui.panel}`}
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${ui.monoPill}`}
              >
                {slideIdx + 1}/{slides.length}
              </span>
              <span
                className={`text-[11.5px] font-semibold truncate max-w-[140px] sm:max-w-[200px] ${ui.textPrimary}`}
              >
                {phase === 'inspect'
                  ? "Time's Up — Orbit 3D to Check"
                  : currentSlide.pose.name}
              </span>
              <span
                data-testid="gym-countdown-clock"
                className={`rounded-md px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums ${
                  phase === 'inspect'
                    ? 'bg-emerald-500 text-zinc-950'
                    : ui.pillButtonActive
                }`}
              >
                {phase === 'inspect' ? 'ORBIT' : formatClock(remainingSec)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {phase === 'drawing' ? (
                <button
                  type="button"
                  data-testid="gym-pause-btn"
                  aria-label={isPaused ? 'Resume timer' : 'Pause timer'}
                  onClick={() => setIsPaused((prev) => !prev)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${ui.pillButton}`}
                >
                  {isPaused ? (
                    <PlayIcon className="h-3 w-3" />
                  ) : (
                    <PauseIcon className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="gym-next-pose-btn"
                  onClick={advanceToNextSlide}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${ui.pillButtonActive}`}
                >
                  <span>Next Pose →</span>
                </button>
              )}

              <button
                type="button"
                data-testid="gym-skip-btn"
                aria-label="Skip to next pose"
                title="Skip Pose"
                onClick={advanceToNextSlide}
                className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium ${ui.pillButton}`}
              >
                <SkipForwardIcon className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">Skip</span>
              </button>

              {/* Quick Study Style Toggle */}
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
                  className={`rounded-lg px-2 py-1 text-[10px] font-medium ${
                    studyStyle === st.id ? ui.pillButtonActive : ui.pillButton
                  }`}
                >
                  {st.label}
                </button>
              ))}

              <button
                type="button"
                data-testid="gym-toggle-skeleton-btn"
                aria-pressed={currentSlide.modelId === 'skeleton'}
                onClick={handleSwapSkeletonToggle}
                className={`rounded-lg px-2 py-1 text-[10px] font-medium ${
                  currentSlide.modelId === 'skeleton'
                    ? ui.pillButtonActive
                    : ui.pillButton
                }`}
              >
                Skel
              </button>

              <button
                type="button"
                aria-label={audioEnabled ? 'Mute bell' : 'Unmute bell'}
                onClick={() => setAudioEnabled((prev) => !prev)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${ui.iconButton}`}
              >
                {audioEnabled ? (
                  <Volume2Icon className="h-3.5 w-3.5" />
                ) : (
                  <VolumeXIcon className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                data-testid="gym-exit-btn"
                aria-label="Exit Gesture Gym"
                onClick={onExitGym}
                className={`flex h-7 items-center gap-1 rounded-lg px-2 text-[10.5px] font-medium ${ui.pillButton}`}
              >
                <XIcon className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          </div>

          {/* Smooth 1px Progress Bar */}
          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-zinc-500/25">
            <div
              className={`h-full transition-all duration-300 ${
                phase === 'inspect' ? 'bg-emerald-400' : 'bg-current'
              }`}
              style={{ width: `${phase === 'inspect' ? 100 : progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* End-of-Session Summary Card */}
      {phase === 'summary' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gesture Session Complete"
          data-testid="gesture-gym-summary"
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        >
          <div
            className={`w-full max-w-md rounded-2xl p-5 space-y-4 select-none ${ui.panel}`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircleIcon className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <h3 className={`text-sm font-semibold ${ui.textPrimary}`}>
                  Session Complete
                </h3>
                <p className={`text-[11px] ${ui.textSecondary}`}>
                  Daily Streak: {stats.streakDays} {stats.streakDays === 1 ? 'day' : 'days'} · Total: {stats.totalPosesDrawn} poses
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className={`rounded-xl p-3 text-center ${ui.card}`}>
                <div className={`font-mono text-lg font-bold ${ui.textPrimary}`}>
                  {completedCount}
                </div>
                <div className={`text-[10.5px] ${ui.textMuted}`}>
                  Poses Completed
                </div>
              </div>
              <div className={`rounded-xl p-3 text-center ${ui.card}`}>
                <div className={`font-mono text-lg font-bold ${ui.textPrimary}`}>
                  {Math.max(1, Math.round(totalSessionSeconds / 60))}m
                </div>
                <div className={`text-[10.5px] ${ui.textMuted}`}>
                  Drawing Time ({MODEL_CATALOG[currentSlide?.modelId ?? 'female'].shortLabel})
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                data-testid="gym-another-set-btn"
                onClick={launchSession}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-medium ${ui.pillButton}`}
              >
                <RotateCcwIcon className="h-3.5 w-3.5" />
                <span>Start Another Set</span>
              </button>
              <button
                type="button"
                data-testid="gym-return-studio-btn"
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
