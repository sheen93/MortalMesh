'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getHandGestureDisplayLabel,
  matchHandLandmarksToGesture,
} from '@/ai/poseRetargeting';
import {
  getPoseVisionEngine,
  isAiVisionCached,
  VisionEngineError,
  type DetectedHand,
  type DetectedPerson,
  type PhotoAnalysisResult,
  type VisionInitProgress,
} from '@/ai/visionEngine';
import {
  AlertCircleIcon,
  CameraIcon,
  CheckCircleIcon,
  LockIcon,
  RotateCcwIcon,
  SparklesIcon,
  ToggleSwitch,
  UploadIcon,
  UsersIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { StudioThemeId } from '@/types/anatomy';

// MediaPipe 33-point BlazePose anatomical skeleton connections for crisp preview rendering
const POSE_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [11, 12], // shoulders
  [11, 23], // left torso
  [12, 24], // right torso
  [23, 24], // hips
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31], // left leg + foot
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32], // right leg + foot
  [0, 2],
  [0, 5],
  [2, 7],
  [5, 8], // face/ears
];

const HAND_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export interface PhotoToPoseApplyPayload {
  person: DetectedPerson;
  file: File;
  pinBackdrop: boolean;
  matchHandGestures: boolean;
  matchCameraAngle: boolean;
}

export interface PhotoToPoseStageAllPayload {
  people: DetectedPerson[];
  file: File;
  pinBackdrop: boolean;
  matchHandGestures: boolean;
  matchCameraAngle: boolean;
}

interface PhotoToPoseModalProps {
  isOpen: boolean;
  initialFile: File | null;
  onClose: () => void;
  studioTheme: StudioThemeId;
  activeFigureName: string;
  activeFigureModelLabel: string;
  activeFigureLocked: boolean;
  maxFigures: number;
  aiCacheReady: boolean;
  onAiCacheReadyChange: (ready: boolean) => void;
  onApplySinglePerson: (payload: PhotoToPoseApplyPayload) => void;
  onStageAllPeople: (payload: PhotoToPoseStageAllPayload) => void;
}

function drawHandWireframe(
  ctx: CanvasRenderingContext2D,
  hand: DetectedHand,
  w: number,
  h: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const [a, b] of HAND_CONNECTIONS) {
    const p1 = hand.landmarks[a];
    const p2 = hand.landmarks[b];
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x * w, p1.y * h);
    ctx.lineTo(p2.x * w, p2.y * h);
    ctx.stroke();
  }
  for (let i = 0; i < hand.landmarks.length; i += 1) {
    const p = hand.landmarks[i];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, i % 4 === 0 ? 2.4 : 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function PhotoToPoseModal({
  isOpen,
  initialFile,
  onClose,
  studioTheme,
  activeFigureName,
  activeFigureModelLabel,
  activeFigureLocked,
  maxFigures,
  aiCacheReady,
  onAiCacheReadyChange,
  onApplySinglePerson,
  onStageAllPeople,
}: PhotoToPoseModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const lastInitialFileRef = useRef<File | null>(null);

  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<VisionInitProgress>({
    stage: 'loading-runtime',
    message: 'Initializing AI Vision...',
    percent: 0,
  });
  const [errorInfo, setErrorInfo] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState(0);

  const [pinBackdrop, setPinBackdrop] = useState(true);
  const [matchHandGestures, setMatchHandGestures] = useState(true);
  const [matchCameraAngle, setMatchCameraAngle] = useState(true);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const resetModalState = useCallback(() => {
    runIdRef.current += 1;
    revokePreviewUrl();
    loadedImageRef.current = null;
    setActiveFile(null);
    setIsAnalyzing(false);
    setErrorInfo(null);
    setAnalysis(null);
    setSelectedPersonIndex(0);
  }, [revokePreviewUrl]);

  const runPhotoAnalysis = useCallback(
    async (file: File) => {
      const currentRunId = runIdRef.current + 1;
      runIdRef.current = currentRunId;

      revokePreviewUrl();
      loadedImageRef.current = null;
      setActiveFile(file);
      setErrorInfo(null);
      setAnalysis(null);
      setSelectedPersonIndex(0);
      setIsAnalyzing(true);
      setProgress({
        stage: 'loading-runtime',
        message: aiCacheReady
          ? 'Loading offline AI Vision runtime...'
          : 'Initializing AI Vision (first-time offline cache ~19 MB)...',
        percent: 15,
      });

      const objectUrl = URL.createObjectURL(file);
      previewUrlRef.current = objectUrl;

      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () =>
            reject(
              new VisionEngineError(
                'UNSUPPORTED_IMAGE',
                'Could not decode that image file — try a JPG, PNG, or WebP photo'
              )
            );
          el.src = objectUrl;
        });

        if (runIdRef.current !== currentRunId) return;
        loadedImageRef.current = img;

        const engine = getPoseVisionEngine();
        const result = await engine.analyzePhotoForPoses(img, (p) => {
          if (runIdRef.current === currentRunId) {
            setProgress(p);
          }
        });

        if (runIdRef.current !== currentRunId) return;
        setAnalysis(result);
        setSelectedPersonIndex(0);
        setIsAnalyzing(false);

        void isAiVisionCached().then((cached) => {
          if (cached) onAiCacheReadyChange(true);
        });
      } catch (err) {
        if (runIdRef.current !== currentRunId) return;
        setIsAnalyzing(false);
        if (err instanceof VisionEngineError) {
          setErrorInfo({ code: err.code, message: err.message });
        } else {
          setErrorInfo({
            code: 'INIT_FAILED',
            message:
              err instanceof Error && err.message
                ? err.message
                : 'Unable to process photo cleanly',
          });
        }
      }
    },
    [aiCacheReady, onAiCacheReadyChange, revokePreviewUrl]
  );

  // Sync open/close lifecycle & optional initialFile (e.g. from Guides & Ref)
  useEffect(() => {
    if (!isOpen) {
      lastInitialFileRef.current = null;
      resetModalState();
      return;
    }

    if (initialFile && initialFile !== lastInitialFileRef.current) {
      lastInitialFileRef.current = initialFile;
      void runPhotoAnalysis(initialFile);
    }
  }, [isOpen, initialFile, resetModalState, runPhotoAnalysis]);

  useEffect(() => {
    return () => {
      revokePreviewUrl();
    };
  }, [revokePreviewUrl]);

  // Escape key closes modal cleanly
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

  // Draw preview photo + detected 2D skeletons + clickable person bounding boxes
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !analysis) return;

    const maxW = 680;
    const maxH = 340;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(maxW / srcW, maxH / srcH, 1);
    const drawW = Math.max(120, Math.round(srcW * scale));
    const drawH = Math.max(100, Math.round(srcH * scale));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(drawW * dpr);
    canvas.height = Math.round(drawH * dpr);
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawW, drawH);
    ctx.drawImage(img, 0, 0, drawW, drawH);

    analysis.people.forEach((person, idx) => {
      const isSelected = idx === selectedPersonIndex;
      const boxColor = isSelected ? '#10B981' : '#94A3B8';
      const lineColor = isSelected ? '#34D399' : 'rgba(203, 213, 225, 0.72)';
      const jointColor = isSelected ? '#F8FAFC' : '#CBD5E1';

      // Bounding box
      const bx = person.bbox.x * drawW;
      const by = person.bbox.y * drawH;
      const bw = person.bbox.width * drawW;
      const bh = person.bbox.height * drawH;

      ctx.save();
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = isSelected ? 2.2 : 1.3;
      if (!isSelected) ctx.setLineDash([4, 4]);
      ctx.strokeRect(bx, by, bw, bh);

      // Person tag pill inside top-left of bbox
      ctx.setLineDash([]);
      const tag = `P${idx + 1}`;
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      const pillW = ctx.measureText(tag).width + 10;
      ctx.fillStyle = isSelected ? '#10B981' : 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(bx, Math.max(0, by - 16), pillW, 16);
      ctx.fillStyle = isSelected ? '#052E16' : '#F8FAFC';
      ctx.fillText(tag, bx + 5, Math.max(12, by - 4));
      ctx.restore();

      // Pose connections
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = isSelected ? 2.4 : 1.5;
      ctx.lineCap = 'round';
      for (const [a, b] of POSE_CONNECTIONS) {
        const p1 = person.landmarks[a];
        const p2 = person.landmarks[b];
        if (!p1 || !p2) continue;
        if ((p1.visibility ?? 0.8) < 0.2 || (p2.visibility ?? 0.8) < 0.2) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p1.x * drawW, p1.y * drawH);
        ctx.lineTo(p2.x * drawW, p2.y * drawH);
        ctx.stroke();
      }

      // Key pose joints
      for (const idxLm of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        const lm = person.landmarks[idxLm];
        if (!lm || (lm.visibility ?? 0.8) < 0.2) continue;
        ctx.beginPath();
        ctx.fillStyle = boxColor;
        ctx.arc(lm.x * drawW, lm.y * drawH, isSelected ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = jointColor;
        ctx.arc(lm.x * drawW, lm.y * drawH, isSelected ? 2 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (person.leftHand) {
        drawHandWireframe(
          ctx,
          person.leftHand,
          drawW,
          drawH,
          isSelected ? '#38BDF8' : 'rgba(56, 189, 248, 0.55)'
        );
      }
      if (person.rightHand) {
        drawHandWireframe(
          ctx,
          person.rightHand,
          drawW,
          drawH,
          isSelected ? '#F59E0B' : 'rgba(245, 158, 11, 0.55)'
        );
      }
    });
  }, [analysis, selectedPersonIndex]);

  const selectedPerson =
    analysis?.people[selectedPersonIndex] ?? analysis?.people[0] ?? null;

  const detectedHandsSummary = useMemo(() => {
    if (!selectedPerson) return null;
    const parts: string[] = [];
    if (selectedPerson.leftHand) {
      parts.push(
        `L: ${getHandGestureDisplayLabel(
          matchHandLandmarksToGesture(selectedPerson.leftHand)
        )}`
      );
    }
    if (selectedPerson.rightHand) {
      parts.push(
        `R: ${getHandGestureDisplayLabel(
          matchHandLandmarksToGesture(selectedPerson.rightHand)
        )}`
      );
    }
    return parts.length > 0 ? parts.join(' · ') : 'Hands: Auto Relaxed';
  }, [selectedPerson]);

  if (!isOpen) return null;

  const { ui } = STUDIO_THEMES[studioTheme];

  const handleFilesSelected = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void runPhotoAnalysis(file);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!analysis || analysis.people.length <= 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (event.clientY - rect.top) / Math.max(1, rect.height);

    let bestIdx = -1;
    let bestArea = Infinity;
    analysis.people.forEach((p, idx) => {
      if (
        nx >= p.bbox.x &&
        nx <= p.bbox.x + p.bbox.width &&
        ny >= p.bbox.y &&
        ny <= p.bbox.y + p.bbox.height
      ) {
        const area = p.bbox.width * p.bbox.height;
        if (area < bestArea) {
          bestArea = area;
          bestIdx = idx;
        }
      }
    });
    if (bestIdx >= 0) {
      setSelectedPersonIndex(bestIdx);
    }
  };

  const stageCount = analysis
    ? Math.min(analysis.people.length, maxFigures)
    : 0;

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
        aria-label="Photo to 3D Pose"
        data-testid="photo-to-pose-modal"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={`flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl select-none ${ui.panel}`}
      >
        {/* Header */}
        <header
          className={`flex shrink-0 items-center justify-between gap-2 px-4 py-3 ${ui.header}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CameraIcon className={`h-4 w-4 shrink-0 ${ui.textPrimary}`} />
            <h2
              className={`text-xs font-semibold uppercase tracking-[0.14em] truncate ${ui.textPrimary}`}
            >
              Photo → 3D Pose
            </h2>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium whitespace-nowrap ${ui.monoPill}`}
            >
              {aiCacheReady ? 'AI Offline Ready' : 'On-Device AI'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo to pose modal"
            data-testid="photo-to-pose-close-btn"
            className={`flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable Body */}
        <div className="studio-scroll flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            data-testid="photo-to-pose-file-input"
            aria-label="Upload photo for pose detection"
            className="hidden"
            onChange={(event) => {
              handleFilesSelected(event.target.files);
              event.target.value = '';
            }}
          />

          {/* Privacy & Offline Status Banner */}
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] ${ui.card}`}
          >
            <span className={`font-medium ${ui.textSecondary}`}>
              100% On-Device · Photos never leave your device
            </span>
            <span className={`font-mono text-[10px] ${ui.textMuted}`}>
              {aiCacheReady
                ? 'Cached for Airplane Mode'
                : 'First run caches ~19 MB offline'}
            </span>
          </div>

          {/* Empty Upload Zone */}
          {!activeFile && !isAnalyzing && !errorInfo && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingOver(false);
                handleFilesSelected(event.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center cursor-pointer transition-colors ${
                isDraggingOver ? ui.pillButtonActive : `${ui.card} ${ui.hairline}`
              }`}
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${ui.pillButtonActive}`}
              >
                <UploadIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className={`text-[13px] font-semibold ${ui.textPrimary}`}>
                  Drop a reference photo or tap to choose
                </p>
                <p className={`text-[11px] ${ui.textMuted}`}>
                  Supports full-body, portraits, action poses &amp; multi-person photos (JPG, PNG, WebP)
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium ${ui.pillButton}`}
              >
                <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Select Photo</span>
              </span>
            </div>
          )}

          {/* Analyzing Progress */}
          {isAnalyzing && (
            <div
              className={`flex flex-col items-center justify-center gap-3 rounded-xl px-4 py-10 text-center ${ui.card}`}
            >
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
              <div className="space-y-1 w-full max-w-sm">
                <p className={`text-[12px] font-medium ${ui.textPrimary}`}>
                  {progress.message}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/15">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${Math.max(10, progress.percent)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {errorInfo && !isAnalyzing && (
            <div className={`rounded-xl p-4 space-y-3 ${ui.card}`}>
              <div className="flex items-start gap-2.5">
                <AlertCircleIcon className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <div className="space-y-1">
                  <p className={`text-[12px] font-semibold ${ui.textPrimary}`}>
                    {errorInfo.code === 'OFFLINE_UNCACHED'
                      ? 'Offline AI Vision Pack Required'
                      : 'Could Not Reconstruct Pose'}
                  </p>
                  <p className={`text-[11px] leading-relaxed ${ui.textSecondary}`}>
                    {errorInfo.message}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeFile && (
                  <button
                    type="button"
                    onClick={() => void runPhotoAnalysis(activeFile)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButton}`}
                  >
                    <RotateCcwIcon className="h-3.5 w-3.5" />
                    <span>Retry</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButtonActive}`}
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  <span>Choose Another Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* Detection Preview + Options */}
          {analysis && selectedPerson && activeFile && !isAnalyzing && (
            <div className="space-y-3">
              {/* Preview Canvas Container */}
              <div
                className={`flex flex-col items-center justify-center rounded-xl p-2 ${ui.card}`}
              >
                <canvas
                  ref={canvasRef}
                  data-testid="photo-pose-preview-canvas"
                  onClick={handleCanvasClick}
                  className="max-w-full rounded-lg cursor-pointer"
                />
              </div>

              {/* Multi-Person Selector */}
              {analysis.people.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-medium ${ui.textMuted} mr-1`}
                  >
                    <UsersIcon className="h-3.5 w-3.5" />
                    <span>{analysis.people.length} people:</span>
                  </span>
                  {analysis.people.map((person, idx) => (
                    <button
                      key={person.index}
                      type="button"
                      data-testid={`photo-pose-person-chip-${idx}`}
                      onClick={() => setSelectedPersonIndex(idx)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        selectedPersonIndex === idx
                          ? ui.pillButtonActive
                          : ui.pillButton
                      }`}
                    >
                      Person {idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Detection Summary & Cropped Leg Notice */}
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-[11px] ${ui.card}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-500">
                    <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Confidence {Math.round(selectedPerson.confidence * 100)}%
                    </span>
                  </span>
                  <span className={`font-mono text-[10px] ${ui.monoPill} px-1.5 py-0.5 rounded`}>
                    {detectedHandsSummary}
                  </span>
                  <span className={`font-mono text-[10px] ${ui.textMuted}`}>
                    {analysis.inferenceMs}ms CPU SIMD
                  </span>
                </div>
                {selectedPerson.upperBodyOnly && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${ui.monoPill}`}
                  >
                    Upper body detected — keeping natural stance
                  </span>
                )}
              </div>

              {/* Artist Apply Toggles */}
              <div className={`rounded-xl p-3 space-y-2 ${ui.card}`}>
                <ToggleSwitch
                  id="photo-pose-pin-backdrop"
                  label="Pin as Ghost Backdrop (35%)"
                  checked={pinBackdrop}
                  onChange={() => setPinBackdrop((prev) => !prev)}
                  theme={STUDIO_THEMES[studioTheme]}
                />
                <ToggleSwitch
                  id="photo-pose-match-hands"
                  label="Match Hand Gestures"
                  checked={matchHandGestures}
                  onChange={() => setMatchHandGestures((prev) => !prev)}
                  theme={STUDIO_THEMES[studioTheme]}
                />
                <ToggleSwitch
                  id="photo-pose-match-camera"
                  label="Match Camera Angle"
                  checked={matchCameraAngle}
                  onChange={() => setMatchCameraAngle((prev) => !prev)}
                  theme={STUDIO_THEMES[studioTheme]}
                />
              </div>

              {/* Locked Figure Notice */}
              {activeFigureLocked && (
                <div
                  role="status"
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium ${ui.card} ${ui.textPrimary}`}
                >
                  <LockIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {activeFigureName} is locked — unlock figure in bottom dock to apply
                  </span>
                </div>
              )}

              {/* Primary Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  data-testid="photo-pose-choose-another-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <UploadIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Choose Another Photo</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {analysis.people.length > 1 && (
                    <button
                      type="button"
                      data-testid="photo-pose-stage-all-btn"
                      onClick={() =>
                        onStageAllPeople({
                          people: analysis.people,
                          file: activeFile,
                          pinBackdrop,
                          matchHandGestures,
                          matchCameraAngle,
                        })
                      }
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-medium transition-colors ${ui.pillButton}`}
                    >
                      <UsersIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>Stage All ({stageCount} Figures)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="photo-pose-apply-btn"
                    disabled={activeFigureLocked}
                    title={
                      activeFigureLocked
                        ? 'Unlock figure to apply'
                        : `Apply pose to ${activeFigureName} (${activeFigureModelLabel})`
                    }
                    onClick={() =>
                      onApplySinglePerson({
                        person: selectedPerson,
                        file: activeFile,
                        pinBackdrop,
                        matchHandGestures,
                        matchCameraAngle,
                      })
                    }
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11.5px] font-semibold transition-colors ${
                      activeFigureLocked
                        ? ui.pillButtonDisabled
                        : ui.pillButtonActive
                    }`}
                  >
                    <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {activeFigureLocked
                        ? 'Unlock figure to apply'
                        : `Apply to ${activeFigureName}`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
