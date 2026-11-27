import * as THREE from 'three';
import { HAND_GESTURE_BY_ID, buildHandGestureBones } from '@/data/handGestures';
import { clampJointAngles, getJointSpec } from '@/data/jointLimits';
import { isMannequinModelId, type MannequinModelId } from '@/data/modelCatalog';
import { getPosePreset, POSE_PRESETS } from '@/data/poses';
import { clampFigureProportions, DEFAULT_FIGURE_PROPORTIONS, proportionsEqual } from '@/data/proportions';
import { CANONICAL_REST_LOCAL_QUATS } from '@/rig/canonicalReference';
import {
  isCameraPreset,
  POSEABLE_BONE_NAMES,
  type CameraPreset,
  type FigureProportions,
  type HandGestureId,
  type JointAngles,
  type KeyLightSettings,
  type LightingPresetId,
} from '@/types/anatomy';
import {
  clampStudioDrawing,
  DEFAULT_STUDIO_DRAWING,
  type StudioDrawingConfig,
} from '@/types/drawing';
import type { PoseSnapshot, QuaternionTuple } from '@/types/poseIO';
import {
  MANNEQUIN_FINISH_ORDER,
  type MannequinFinish,
} from '@/types/scene';
import type { CameraViewState } from '@/types/sceneIO';
import { clampLensCurvature } from '@/utils/lensWarp';

export type GymDeepLinkInterval = 30 | 60 | 120 | 300 | 'class';

export interface SharedPoseUrlPayloadV1 {
  v: 1;
  m: MannequinModelId;
  f: MannequinFinish;
  pr?: [number, number, number, number, number];
  pid?: string;
  b?: Record<string, [number, number, number]>;
  cam: [number, number, number, number, number, number];
  persp: [CameraPreset, number];
  lit: {
    p?: LightingPresetId | null;
    az: number;
    el: number;
    in: number;
    ri: number;
    fi: number;
    n: 0 | 1;
    ns: number;
  };
  drw: {
    s: StudioDrawingConfig['drawingStyle'];
    c: StudioDrawingConfig['constructiveMode'];
    loa: 0 | 1;
    pl: 0 | 1;
    cc: 0 | 1;
    lm: 0 | 1;
  };
}

export type DecodedStudioDeepLink =
  | { kind: 'none' }
  | {
      kind: 'shared';
      modelId: MannequinModelId;
      finish: MannequinFinish;
      proportions: FigureProportions;
      posePresetId: string | null;
      poseSnapshot: PoseSnapshot;
      camera: CameraViewState;
      perspective: CameraPreset;
      lensCurvature: number;
      lighting: Partial<KeyLightSettings>;
      drawing: StudioDrawingConfig;
    }
  | {
      kind: 'pose';
      poseId: string;
    }
  | {
      kind: 'hand';
      gestureId: HandGestureId;
      poseSnapshot: PoseSnapshot;
    }
  | {
      kind: 'gym';
      interval: GymDeepLinkInterval;
    }
  | {
      kind: 'invalid';
      error: string;
    };

function toBase64Url(json: string): string {
  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
  if (typeof TextDecoder !== 'undefined' && typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

const VALID_FINISHES = new Set<MannequinFinish>(MANNEQUIN_FINISH_ORDER);
const VALID_LIGHT_PRESETS = new Set<LightingPresetId>([
  'rembrandt',
  'chiaroscuro',
  'top-down',
  'rim',
]);
const VALID_BONES = new Set<string>(POSEABLE_BONE_NAMES);

export function buildPoseSnapshotFromCanonicalAngles(
  bonesDeg: Record<string, JointAngles>,
  proportions: FigureProportions = DEFAULT_FIGURE_PROPORTIONS
): PoseSnapshot {
  const bones: Record<string, QuaternionTuple> = {};
  const euler = new THREE.Euler();
  const restQ = new THREE.Quaternion();
  const deltaQ = new THREE.Quaternion();

  for (const name of POSEABLE_BONE_NAMES) {
    const restTuple = CANONICAL_REST_LOCAL_QUATS[name];
    if (!restTuple) continue;
    restQ.set(restTuple[0], restTuple[1], restTuple[2], restTuple[3]).normalize();

    const raw = bonesDeg[name];
    if (raw) {
      const spec = getJointSpec(name);
      const clamped = clampJointAngles(raw, spec, true);
      euler.set(
        THREE.MathUtils.degToRad(clamped.x),
        THREE.MathUtils.degToRad(clamped.y),
        THREE.MathUtils.degToRad(clamped.z),
        spec.order
      );
      deltaQ.setFromEuler(euler);
      restQ.multiply(deltaQ).normalize();
    }
    bones[name] = [restQ.x, restQ.y, restQ.z, restQ.w];
  }

  return {
    bones,
    rootPosition: [0, 0, 0],
    elevationY: 0,
    groundEnabled: true,
    groundSnapEnabled: true,
    pinnedBones: [],
    proportions: clampFigureProportions(proportions),
  };
}

export function snapshotQuatsToNonZeroCanonicalDeg(
  snapshot: PoseSnapshot
): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  const qCurr = new THREE.Quaternion();
  const qRest = new THREE.Quaternion();
  const euler = new THREE.Euler();

  for (const name of POSEABLE_BONE_NAMES) {
    const tuple = snapshot.bones[name];
    const restTuple = CANONICAL_REST_LOCAL_QUATS[name];
    if (!tuple || !restTuple) continue;

    qCurr.set(tuple[0], tuple[1], tuple[2], tuple[3]).normalize();
    qRest.set(restTuple[0], restTuple[1], restTuple[2], restTuple[3]).normalize();
    if (qCurr.angleTo(qRest) < 0.015) continue;

    const spec = getJointSpec(name);
    const delta = qRest.clone().invert().multiply(qCurr).normalize();
    euler.setFromQuaternion(delta, spec.order);
    const clamped = clampJointAngles(
      {
        x: Math.round(THREE.MathUtils.radToDeg(euler.x)),
        y: Math.round(THREE.MathUtils.radToDeg(euler.y)),
        z: Math.round(THREE.MathUtils.radToDeg(euler.z)),
      },
      spec,
      true
    );
    if (clamped.x !== 0 || clamped.y !== 0 || clamped.z !== 0) {
      out[name] = [clamped.x, clamped.y, clamped.z];
    }
  }
  return out;
}

export interface EncodeSharedPoseInput {
  modelId: MannequinModelId;
  finish: MannequinFinish;
  proportions: FigureProportions;
  posePresetId: string | null;
  poseSnapshot: PoseSnapshot;
  camera: CameraViewState;
  perspective: CameraPreset;
  lensCurvature: number;
  keyLight: KeyLightSettings;
  drawing: StudioDrawingConfig;
}

export function encodeSharedPoseParams(input: EncodeSharedPoseInput): string {
  const payload: SharedPoseUrlPayloadV1 = {
    v: 1,
    m: input.modelId,
    f: input.finish,
    cam: [
      r2(input.camera.position[0]),
      r2(input.camera.position[1]),
      r2(input.camera.position[2]),
      r2(input.camera.target[0]),
      r2(input.camera.target[1]),
      r2(input.camera.target[2]),
    ],
    persp: [input.perspective, r2(clampLensCurvature(input.lensCurvature))],
    lit: {
      p: input.keyLight.presetId ?? null,
      az: Math.round(input.keyLight.azimuth),
      el: Math.round(input.keyLight.elevation),
      in: r2(input.keyLight.intensity),
      ri: r2(input.keyLight.rimIntensity),
      fi: r2(input.keyLight.fillIntensity),
      n: input.keyLight.notanEnabled ? 1 : 0,
      ns: r2(input.keyLight.notanSplit),
    },
    drw: {
      s: input.drawing.drawingStyle,
      c: input.drawing.constructiveMode,
      loa: input.drawing.showLineOfAction ? 1 : 0,
      pl: input.drawing.showPlumbLine ? 1 : 0,
      cc: input.drawing.showCrossContours ? 1 : 0,
      lm: input.drawing.showLandmarks ? 1 : 0,
    },
  };

  if (!proportionsEqual(input.proportions, DEFAULT_FIGURE_PROPORTIONS)) {
    const p = clampFigureProportions(input.proportions);
    payload.pr = [
      r2(p.headScale),
      r2(p.shoulderWidth),
      r2(p.torsoLength),
      r2(p.hipWidth),
      r2(p.limbLength),
    ];
  }

  const matchedPreset =
    input.posePresetId && getPosePreset(input.posePresetId)
      ? input.posePresetId
      : null;
  if (matchedPreset) {
    payload.pid = matchedPreset;
  } else {
    payload.b = snapshotQuatsToNonZeroCanonicalDeg(input.poseSnapshot);
  }

  return toBase64Url(JSON.stringify(payload));
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Builds a clean right-hand presentation pose for /?hand=<slug> deep links. */
export function buildHandShowcaseSnapshot(gestureId: HandGestureId): PoseSnapshot {
  const baseAngles: Record<string, JointAngles> = {
    pelvis: { x: 2, y: 2, z: -2 },
    spine_01: { x: -1, y: 0, z: 1 },
    spine_02: { x: -1, y: 0, z: 1 },
    spine_03: { x: -1, y: 0, z: 1 },
    clavicle_r: { x: 6, y: 0, z: 4 },
    upperarm_r: { x: 26, y: -12, z: 46 },
    lowerarm_r: { x: 96, y: -38, z: 0 },
    hand_r: { x: -12, y: 0, z: 4 },
    upperarm_l: { x: 8, y: 10, z: -80 },
    lowerarm_l: { x: 22, y: -10, z: 0 },
    ...buildHandGestureBones('r', gestureId),
    ...buildHandGestureBones('l', 'relaxed'),
  };
  return buildPoseSnapshotFromCanonicalAngles(baseAngles);
}

export function decodeSharedPoseParams(search: string): DecodedStudioDeepLink {
  if (!search || search === '?') return { kind: 'none' };
  const params = new URLSearchParams(search);

  const pToken = params.get('p');
  if (pToken !== null) {
    if (!pToken || pToken.length > 4096) {
      return { kind: 'invalid', error: 'Invalid shared 3D link token' };
    }
    try {
      const raw = JSON.parse(fromBase64Url(pToken)) as Partial<SharedPoseUrlPayloadV1>;
      if (!raw || typeof raw !== 'object' || raw.v !== 1) {
        return { kind: 'invalid', error: 'Unsupported shared 3D pose format' };
      }
      if (!raw.m || typeof raw.m !== 'string' || !isMannequinModelId(raw.m)) {
        return { kind: 'invalid', error: 'Invalid model in shared link' };
      }
      const finish: MannequinFinish =
        typeof raw.f === 'string' && VALID_FINISHES.has(raw.f as MannequinFinish)
          ? (raw.f as MannequinFinish)
          : 'ivory';

      const proportions =
        Array.isArray(raw.pr) && raw.pr.length === 5 && raw.pr.every(isFiniteNum)
          ? clampFigureProportions({
              headScale: raw.pr[0],
              shoulderWidth: raw.pr[1],
              torsoLength: raw.pr[2],
              hipWidth: raw.pr[3],
              limbLength: raw.pr[4],
            })
          : { ...DEFAULT_FIGURE_PROPORTIONS };

      let posePresetId: string | null = null;
      let bonesDeg: Record<string, JointAngles> = {};
      if (typeof raw.pid === 'string') {
        const found = getPosePreset(raw.pid);
        if (!found) {
          return { kind: 'invalid', error: 'Unknown preset in shared link' };
        }
        posePresetId = found.id;
        bonesDeg = { ...found.bones };
      } else if (raw.b && typeof raw.b === 'object') {
        for (const [bName, arr] of Object.entries(raw.b)) {
          if (!VALID_BONES.has(bName)) continue;
          if (!Array.isArray(arr) || arr.length !== 3 || !arr.every(isFiniteNum)) {
            continue;
          }
          bonesDeg[bName] = clampJointAngles(
            { x: arr[0], y: arr[1], z: arr[2] },
            getJointSpec(bName),
            true
          );
        }
      }

      const poseSnapshot = buildPoseSnapshotFromCanonicalAngles(bonesDeg, proportions);
      const camArr = raw.cam;
      const camera: CameraViewState =
        Array.isArray(camArr) && camArr.length === 6 && camArr.every(isFiniteNum)
          ? {
              position: [
                THREE.MathUtils.clamp(camArr[0], -20, 20),
                THREE.MathUtils.clamp(camArr[1], 0.05, 18),
                THREE.MathUtils.clamp(camArr[2], -20, 20),
              ],
              target: [
                THREE.MathUtils.clamp(camArr[3], -10, 10),
                THREE.MathUtils.clamp(camArr[4], -2, 8),
                THREE.MathUtils.clamp(camArr[5], -10, 10),
              ],
            }
          : { position: [0, 1, 6], target: [0, 1, 0] };

      const perspective: CameraPreset =
        Array.isArray(raw.persp) &&
        typeof raw.persp[0] === 'string' &&
        isCameraPreset(raw.persp[0])
          ? raw.persp[0]
          : '1-point';
      const lensCurvature =
        Array.isArray(raw.persp) && isFiniteNum(raw.persp[1])
          ? clampLensCurvature(raw.persp[1])
          : 0;

      const litRaw = raw.lit;
      const lighting: Partial<KeyLightSettings> = litRaw && typeof litRaw === 'object'
        ? {
            presetId:
              typeof litRaw.p === 'string' &&
              VALID_LIGHT_PRESETS.has(litRaw.p as LightingPresetId)
                ? (litRaw.p as LightingPresetId)
                : null,
            azimuth: isFiniteNum(litRaw.az) ? litRaw.az : 42,
            elevation: isFiniteNum(litRaw.el) ? litRaw.el : 48,
            intensity: isFiniteNum(litRaw.in) ? litRaw.in : 1.85,
            rimIntensity: isFiniteNum(litRaw.ri) ? litRaw.ri : 0.75,
            fillIntensity: isFiniteNum(litRaw.fi) ? litRaw.fi : 0.38,
            notanEnabled: litRaw.n === 1,
            notanSplit: isFiniteNum(litRaw.ns) ? litRaw.ns : 0.5,
          }
        : {};

      const drwRaw = raw.drw;
      const drawing: StudioDrawingConfig = drwRaw && typeof drwRaw === 'object'
        ? clampStudioDrawing({
            ...DEFAULT_STUDIO_DRAWING,
            drawingStyle: drwRaw.s,
            constructiveMode: drwRaw.c,
            showLineOfAction: drwRaw.loa === 1,
            showPlumbLine: drwRaw.pl === 1,
            showCrossContours: drwRaw.cc === 1,
            showLandmarks: drwRaw.lm === 1,
          })
        : { ...DEFAULT_STUDIO_DRAWING };

      return {
        kind: 'shared',
        modelId: raw.m,
        finish,
        proportions,
        posePresetId,
        poseSnapshot,
        camera,
        perspective,
        lensCurvature,
        lighting,
        drawing,
      };
    } catch {
      return { kind: 'invalid', error: 'Could not decode shared 3D link' };
    }
  }

  const poseSlug = params.get('pose');
  if (poseSlug !== null) {
    const preset = POSE_PRESETS.find((p) => p.id === poseSlug);
    if (!preset) {
      return { kind: 'invalid', error: `Unknown pose preset "${poseSlug}"` };
    }
    return { kind: 'pose', poseId: preset.id };
  }

  const handSlug = params.get('hand');
  if (handSlug !== null) {
    const gesture = HAND_GESTURE_BY_ID[handSlug as HandGestureId];
    if (!gesture) {
      return { kind: 'invalid', error: `Unknown hand gesture "${handSlug}"` };
    }
    return {
      kind: 'hand',
      gestureId: gesture.id,
      poseSnapshot: buildHandShowcaseSnapshot(gesture.id),
    };
  }

  const mode = params.get('mode');
  if (mode === 'gym') {
    const rawInt = params.get('interval');
    const interval: GymDeepLinkInterval =
      rawInt === '30'
        ? 30
        : rawInt === '120'
          ? 120
          : rawInt === '300'
            ? 300
            : rawInt === 'class'
              ? 'class'
              : 60;
    return { kind: 'gym', interval };
  }

  return { kind: 'none' };
}
