export interface NormalizedLandmark2D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface WorldLandmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface DetectedHand {
  handedness: 'Left' | 'Right';
  score: number;
  landmarks: NormalizedLandmark2D[];
  worldLandmarks: WorldLandmark3D[];
}

export interface DetectedPersonBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedPerson {
  index: number;
  bbox: DetectedPersonBBox;
  landmarks: NormalizedLandmark2D[];
  worldLandmarks: WorldLandmark3D[];
  confidence: number;
  upperBodyOnly: boolean;
  leftHand: DetectedHand | null;
  rightHand: DetectedHand | null;
}

export interface PhotoAnalysisResult {
  people: DetectedPerson[];
  sourceWidth: number;
  sourceHeight: number;
  processedWidth: number;
  processedHeight: number;
  inferenceMs: number;
}

export interface VisionInitProgress {
  stage: 'loading-runtime' | 'loading-models' | 'detecting' | 'ready';
  message: string;
  percent: number;
}

export type VisionErrorCode =
  | 'OFFLINE_UNCACHED'
  | 'NO_PERSON'
  | 'UNSUPPORTED_IMAGE'
  | 'INIT_FAILED';

export class VisionEngineError extends Error {
  readonly code: VisionErrorCode;

  constructor(code: VisionErrorCode, message: string) {
    super(message);
    this.name = 'VisionEngineError';
    this.code = code;
  }
}

export const AI_CACHE_NAME = 'mortal-mesh-ai-v1';
export const AI_WASM_BASE_PATH = '/ai/wasm';
export const AI_POSE_MODEL_PATH = '/ai/models/pose_landmarker_full.task';
export const AI_HAND_MODEL_PATH = '/ai/models/hand_landmarker.task';

const REQUIRED_CACHE_URLS = [
  `${AI_WASM_BASE_PATH}/vision_wasm_internal.js`,
  `${AI_WASM_BASE_PATH}/vision_wasm_internal.wasm`,
  AI_POSE_MODEL_PATH,
  AI_HAND_MODEL_PATH,
];

const CORE_CONFIDENCE_LANDMARKS = [11, 12, 13, 14, 23, 24, 25, 26];
const LEG_LOWER_LANDMARKS = [25, 26, 27, 28];

export type VisionImageInput =
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement;

export async function isAiVisionCached(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const aiCache = await caches.open(AI_CACHE_NAME);
    const matches = await Promise.all(
      REQUIRED_CACHE_URLS.map((url) => aiCache.match(url, { ignoreSearch: true }))
    );
    return matches.every(Boolean);
  } catch {
    return false;
  }
}

function getSourceDimensions(source: VisionImageInput): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return {
    width: source.width,
    height: source.height,
  };
}

/**
 * Downscales large phone camera images (> 1280px longest edge) to maxDim = 1024px
 * so 200MP photos process quickly on mobile CPU SIMD without memory spikes.
 */
export function prepareInferenceCanvas(
  source: VisionImageInput,
  maxDim = 1024
): {
  canvas: HTMLCanvasElement;
  sourceWidth: number;
  sourceHeight: number;
  processedWidth: number;
  processedHeight: number;
} {
  if (typeof document === 'undefined') {
    throw new VisionEngineError(
      'INIT_FAILED',
      'AI Vision inference requires a browser environment'
    );
  }

  const { width: srcW, height: srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0) {
    throw new VisionEngineError(
      'UNSUPPORTED_IMAGE',
      'Could not read image dimensions — choose another photo'
    );
  }

  const longestEdge = Math.max(srcW, srcH);
  const scale = longestEdge > 1280 ? maxDim / longestEdge : 1;
  const processedWidth = Math.max(1, Math.round(srcW * scale));
  const processedHeight = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = processedWidth;
  canvas.height = processedHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    throw new VisionEngineError(
      'INIT_FAILED',
      'Unable to allocate offscreen 2D canvas for image preprocessing'
    );
  }
  ctx.drawImage(source, 0, 0, processedWidth, processedHeight);

  return {
    canvas,
    sourceWidth: srcW,
    sourceHeight: srcH,
    processedWidth,
    processedHeight,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function computePersonBBox(landmarks: NormalizedLandmark2D[]): DetectedPersonBBox {
  const visible = landmarks.filter((lm) => (lm.visibility ?? 1) > 0.2);
  const pts = visible.length >= 6 ? visible : landmarks;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  for (const lm of pts) {
    const x = clamp01(lm.x);
    const y = clamp01(lm.y);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const padX = Math.max(0.03, (maxX - minX) * 0.06);
  const padY = Math.max(0.03, (maxY - minY) * 0.05);
  const x = clamp01(minX - padX);
  const y = clamp01(minY - padY);
  const right = clamp01(maxX + padX);
  const bottom = clamp01(maxY + padY);

  return {
    x,
    y,
    width: Math.max(0.04, right - x),
    height: Math.max(0.06, bottom - y),
  };
}

function computePersonConfidence(landmarks: NormalizedLandmark2D[]): number {
  let sum = 0;
  let count = 0;
  for (const idx of CORE_CONFIDENCE_LANDMARKS) {
    const lm = landmarks[idx];
    if (lm) {
      sum += lm.visibility ?? 0.8;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function detectUpperBodyOnly(landmarks: NormalizedLandmark2D[]): boolean {
  let legVisSum = 0;
  let legCount = 0;
  for (const idx of LEG_LOWER_LANDMARKS) {
    const lm = landmarks[idx];
    if (lm) {
      legVisSum += lm.visibility ?? 0;
      legCount += 1;
    }
  }
  const avgLegVis = legCount > 0 ? legVisSum / legCount : 0;
  if (avgLegVis < 0.35) return true;

  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const leftAnkleMissing =
    !leftAnkle ||
    (leftAnkle.visibility ?? 0) < 0.35 ||
    leftAnkle.y > 0.995 ||
    leftAnkle.y < 0.005;
  const rightAnkleMissing =
    !rightAnkle ||
    (rightAnkle.visibility ?? 0) < 0.35 ||
    rightAnkle.y > 0.995 ||
    rightAnkle.y < 0.005;

  return leftAnkleMissing && rightAnkleMissing;
}

type PoseLandmarkerInstance = {
  detect: (image: HTMLCanvasElement) => {
    landmarks?: NormalizedLandmark2D[][];
    worldLandmarks?: WorldLandmark3D[][];
  };
  close?: () => void;
};

type HandLandmarkerInstance = {
  detect: (image: HTMLCanvasElement) => {
    landmarks?: NormalizedLandmark2D[][];
    worldLandmarks?: WorldLandmark3D[][];
    handedness?: Array<Array<{ categoryName?: string; score?: number }>>;
  };
  close?: () => void;
};

class PoseVisionEngine {
  private initPromise: Promise<void> | null = null;
  private poseLandmarker: PoseLandmarkerInstance | null = null;
  private handLandmarker: HandLandmarkerInstance | null = null;
  private cacheSyncRequested = false;

  private async ensureCacheWarmed(): Promise<void> {
    if (this.cacheSyncRequested || typeof window === 'undefined') return;
    this.cacheSyncRequested = true;

    try {
      const alreadyCached = await isAiVisionCached();
      if (alreadyCached) {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration('/');
          const target = navigator.serviceWorker.controller || reg?.active;
          target?.postMessage({ type: 'CHECK_AI_CACHE_STATUS' });
        }
        return;
      }

      if ('serviceWorker' in navigator && navigator.onLine) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const target = navigator.serviceWorker.controller || reg?.active;
        if (target) {
          target.postMessage({ type: 'WARM_AI_ASSETS' });
          return;
        }
      }

      if ('caches' in window && navigator.onLine) {
        const aiCache = await caches.open(AI_CACHE_NAME);
        await Promise.all(
          REQUIRED_CACHE_URLS.map(async (url) => {
            const hit = await aiCache.match(url, { ignoreSearch: true });
            if (!hit) {
              const res = await fetch(url);
              if (res.ok) {
                await aiCache.put(url, res);
              }
            }
          })
        );
      }
    } catch {
      // Cache warmup is opportunistic; ignore storage quota/offline failures
    }
  }

  async ensureInitialized(
    onProgress?: (progress: VisionInitProgress) => void
  ): Promise<void> {
    if (this.poseLandmarker && this.handLandmarker) {
      onProgress?.({
        stage: 'ready',
        message: 'AI Vision ready',
        percent: 100,
      });
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const online =
          typeof navigator === 'undefined' ? true : navigator.onLine;
        const cached = await isAiVisionCached();
        if (!online && !cached) {
          throw new VisionEngineError(
            'OFFLINE_UNCACHED',
            'AI Vision pack not cached yet — connect to Wi-Fi once to download (~19 MB)'
          );
        }

        onProgress?.({
          stage: 'loading-runtime',
          message: cached
            ? 'Loading offline AI Vision runtime...'
            : 'Initializing AI Vision (first-time offline cache ~19 MB)...',
          percent: 25,
        });

        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(
          AI_WASM_BASE_PATH
        );

        onProgress?.({
          stage: 'loading-models',
          message: cached
            ? 'Loading pose & hand models from offline cache...'
            : 'Loading pose & hand models (~17 MB)...',
          percent: 60,
        });

        // Strict CPU delegate avoids creating a second WebGL context alongside Three.js.
        const [pose, hand] = await Promise.all([
          vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: AI_POSE_MODEL_PATH,
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            numPoses: 4,
            minPoseDetectionConfidence: 0.25,
            minPosePresenceConfidence: 0.25,
            minTrackingConfidence: 0.25,
          }),
          vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: AI_HAND_MODEL_PATH,
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            numHands: 4,
            minHandDetectionConfidence: 0.3,
            minHandPresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
          }),
        ]);

        this.poseLandmarker = pose as unknown as PoseLandmarkerInstance;
        this.handLandmarker = hand as unknown as HandLandmarkerInstance;
        void this.ensureCacheWarmed();

        onProgress?.({
          stage: 'ready',
          message: 'AI Vision ready',
          percent: 100,
        });
      } catch (err) {
        this.initPromise = null;
        if (err instanceof VisionEngineError) {
          throw err;
        }
        const isOffline =
          typeof navigator !== 'undefined' && !navigator.onLine;
        if (isOffline) {
          throw new VisionEngineError(
            'OFFLINE_UNCACHED',
            'AI Vision pack not cached yet — connect to Wi-Fi once to download (~19 MB)'
          );
        }
        const detail =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to initialize on-device AI Vision runtime';
        throw new VisionEngineError('INIT_FAILED', detail);
      }
    })();

    return this.initPromise;
  }

  async analyzePhotoForPoses(
    source: VisionImageInput,
    onProgress?: (progress: VisionInitProgress) => void
  ): Promise<PhotoAnalysisResult> {
    await this.ensureInitialized(onProgress);

    if (!this.poseLandmarker || !this.handLandmarker) {
      throw new VisionEngineError(
        'INIT_FAILED',
        'AI Vision models did not initialize cleanly'
      );
    }

    onProgress?.({
      stage: 'detecting',
      message: 'Detecting pose & hands...',
      percent: 85,
    });

    const {
      canvas,
      sourceWidth,
      sourceHeight,
      processedWidth,
      processedHeight,
    } = prepareInferenceCanvas(source, 1024);

    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    let poseResult = this.poseLandmarker.detect(canvas);
    let handResult = this.handLandmarker.detect(canvas);

    let cropMap: { rx: number; ry: number; rw: number; rh: number } | null =
      null;

    // Fallback zoomed center pass for wide landscape shots / distant studio figures
    // where Stage-1 SSD input (224x224) undersamples the subject.
    if (!poseResult.landmarks?.length && Math.max(processedWidth, processedHeight) >= 240) {
      const rw = processedWidth >= processedHeight ? 0.52 : 0.72;
      const rh = 0.76;
      const rx = (1 - rw) * 0.5;
      const ry = (1 - rh) * 0.5;

      const sx = Math.floor(rx * processedWidth);
      const sy = Math.floor(ry * processedHeight);
      const sw = Math.max(64, Math.floor(rw * processedWidth));
      const sh = Math.max(64, Math.floor(rh * processedHeight));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cropCtx = cropCanvas.getContext('2d');
      if (cropCtx) {
        cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        const retryPose = this.poseLandmarker.detect(cropCanvas);
        if (retryPose.landmarks?.length) {
          poseResult = retryPose;
          handResult = this.handLandmarker.detect(cropCanvas);
          cropMap = { rx, ry, rw, rh };
        }
      }
    }

    const t1 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const mapNormPt = <T extends { x: number; y: number; z: number; visibility?: number }>(
      p: T
    ): T =>
      cropMap
        ? {
            ...p,
            x: cropMap.rx + p.x * cropMap.rw,
            y: cropMap.ry + p.y * cropMap.rh,
          }
        : p;

    const rawLandmarksList = (poseResult.landmarks ?? []).map((list) =>
      list.map(mapNormPt)
    );
    const rawWorldList = poseResult.worldLandmarks ?? [];

    if (rawLandmarksList.length === 0) {
      throw new VisionEngineError(
        'NO_PERSON',
        'No human figure detected — try a clearer photo'
      );
    }

    const preliminary = rawLandmarksList.map((lm2d, rawIdx) => {
      const world3d = rawWorldList[rawIdx] ?? [];
      const bbox = computePersonBBox(lm2d);
      return {
        bbox,
        centerX: bbox.x + bbox.width * 0.5,
        landmarks: lm2d.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          visibility: p.visibility,
        })),
        worldLandmarks: world3d.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          visibility: p.visibility,
        })),
        confidence: computePersonConfidence(lm2d),
        upperBodyOnly: detectUpperBodyOnly(lm2d),
      };
    });

    // Sort left-to-right across the image so Person 1..4 match visual reading order.
    preliminary.sort((a, b) => a.centerX - b.centerX);

    const people: DetectedPerson[] = preliminary.map((p, idx) => ({
      index: idx,
      bbox: p.bbox,
      landmarks: p.landmarks,
      worldLandmarks: p.worldLandmarks,
      confidence: p.confidence,
      upperBodyOnly: p.upperBodyOnly,
      leftHand: null,
      rightHand: null,
    }));

    // Assign each detected 21-point hand to its closest person's anatomical wrist landmark (15=L, 16=R).
    const handLmList = (handResult.landmarks ?? []).map((list) =>
      list.map(mapNormPt)
    );
    const handWorldList = handResult.worldLandmarks ?? [];
    const handClassList = handResult.handedness ?? [];

    const handCandidates: Array<{
      personIndex: number;
      side: 'l' | 'r';
      dist: number;
      hand: DetectedHand;
    }> = [];

    for (let h = 0; h < handLmList.length; h += 1) {
      const hLm = handLmList[h];
      const hWorld = handWorldList[h] ?? [];
      if (!hLm || hLm.length < 21) continue;
      const wrist2d = hLm[0];
      const handednessMeta = handClassList[h]?.[0];
      const handednessLabel: 'Left' | 'Right' =
        handednessMeta?.categoryName === 'Left' ? 'Left' : 'Right';
      const handObj: DetectedHand = {
        handedness: handednessLabel,
        score: handednessMeta?.score ?? 0.7,
        landmarks: hLm.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          visibility: p.visibility,
        })),
        worldLandmarks: hWorld.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          visibility: p.visibility,
        })),
      };

      for (const person of people) {
        const threshold = 0.22 * Math.max(person.bbox.width, person.bbox.height, 0.35);
        const lWrist = person.landmarks[15];
        const rWrist = person.landmarks[16];
        if (lWrist && (lWrist.visibility ?? 0.5) > 0.15) {
          const d = Math.hypot(wrist2d.x - lWrist.x, wrist2d.y - lWrist.y);
          if (d <= threshold) {
            handCandidates.push({
              personIndex: person.index,
              side: 'l',
              dist: d,
              hand: { ...handObj, handedness: 'Left' },
            });
          }
        }
        if (rWrist && (rWrist.visibility ?? 0.5) > 0.15) {
          const d = Math.hypot(wrist2d.x - rWrist.x, wrist2d.y - rWrist.y);
          if (d <= threshold) {
            handCandidates.push({
              personIndex: person.index,
              side: 'r',
              dist: d,
              hand: { ...handObj, handedness: 'Right' },
            });
          }
        }
      }
    }

    handCandidates.sort((a, b) => a.dist - b.dist);
    const assignedHandIndices = new Set<DetectedHand>();
    for (const cand of handCandidates) {
      if (assignedHandIndices.has(cand.hand)) continue;
      const targetPerson = people[cand.personIndex];
      if (!targetPerson) continue;
      if (cand.side === 'l' && !targetPerson.leftHand) {
        targetPerson.leftHand = cand.hand;
        assignedHandIndices.add(cand.hand);
      } else if (cand.side === 'r' && !targetPerson.rightHand) {
        targetPerson.rightHand = cand.hand;
        assignedHandIndices.add(cand.hand);
      }
    }

    onProgress?.({
      stage: 'ready',
      message: `Detected ${people.length} ${people.length === 1 ? 'person' : 'people'}`,
      percent: 100,
    });

    return {
      people,
      sourceWidth,
      sourceHeight,
      processedWidth,
      processedHeight,
      inferenceMs: Math.max(1, Math.round(t1 - t0)),
    };
  }
}

let sharedEngine: PoseVisionEngine | null = null;

export function getPoseVisionEngine(): PoseVisionEngine {
  if (!sharedEngine) {
    sharedEngine = new PoseVisionEngine();
  }
  return sharedEngine;
}
