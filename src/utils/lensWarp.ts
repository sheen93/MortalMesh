import * as THREE from 'three';
import { isCurvilinearPreset, type CameraPreset } from '@/types/anatomy';

export const MIN_LENS_CURVATURE = 0.2;
export const MAX_LENS_CURVATURE = 1.0;
export const DEFAULT_LENS_CURVATURE = 0.65;

export interface NdcPoint {
  x: number;
  y: number;
}

export interface ScreenProjection {
  screenX: number;
  screenY: number;
  ndcX: number;
  ndcY: number;
  visible: boolean;
}

export function clampLensCurvature(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LENS_CURVATURE;
  return Math.min(MAX_LENS_CURVATURE, Math.max(MIN_LENS_CURVATURE, value));
}

function normalizeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0.05 ? aspect : 1;
}

/**
 * Forward screen-to-source warp matching the curvilinear GLSL post-pass.
 * Maps a distorted screen NDC coordinate [-1, 1]^2 to the source rectilinear
 * camera NDC coordinate used for texture sampling and inverse pointer raycasting.
 */
export function screenNdcToSourceNdc(
  x: number,
  y: number,
  preset: CameraPreset,
  curvature: number,
  aspect: number
): NdcPoint {
  if (!isCurvilinearPreset(preset)) {
    return { x, y };
  }
  const k = clampLensCurvature(curvature);

  if (preset === '4-point') {
    const c = 0.42 * k;
    const theta = 0.72 * k;
    const tanTheta = Math.tan(theta);
    const sx = x * (1 - c + c * y * y);
    const sy = tanTheta > 1e-6 ? Math.tan(y * theta) / tanTheta : y;
    return { x: sx, y: sy };
  }

  const safeAspect = normalizeAspect(aspect);
  const rxScale = safeAspect >= 1 ? safeAspect : 1;
  const ryScale = safeAspect >= 1 ? 1 : 1 / safeAspect;
  const rMax = Math.hypot(rxScale, ryScale);
  const phi = 1.05 * k;
  const tanPhi = Math.tan(phi);
  const r = Math.hypot(x * rxScale, y * ryScale);
  const u = r / rMax;
  const factor = u > 1e-6 ? Math.tan(u * phi) / (tanPhi * u) : phi / tanPhi;
  return { x: x * factor, y: y * factor };
}

/**
 * Analytic inverse of screenNdcToSourceNdc.
 * Maps a rectilinear source camera NDC coordinate to curved screen NDC [-1, 1]^2
 * for SVG perspective guides and 2D screen anchoring of 3D joints.
 */
export function sourceNdcToScreenNdc(
  sx: number,
  sy: number,
  preset: CameraPreset,
  curvature: number,
  aspect: number
): NdcPoint {
  if (!isCurvilinearPreset(preset)) {
    return { x: sx, y: sy };
  }
  const k = clampLensCurvature(curvature);

  if (preset === '4-point') {
    const c = 0.42 * k;
    const theta = 0.72 * k;
    const tanTheta = Math.tan(theta);
    const y = theta > 1e-6 ? Math.atan(sy * tanTheta) / theta : sy;
    const denom = 1 - c + c * y * y;
    const x = Math.abs(denom) > 1e-6 ? sx / denom : sx;
    return { x, y };
  }

  const safeAspect = normalizeAspect(aspect);
  const rxScale = safeAspect >= 1 ? safeAspect : 1;
  const ryScale = safeAspect >= 1 ? 1 : 1 / safeAspect;
  const rMax = Math.hypot(rxScale, ryScale);
  const phi = 1.05 * k;
  const tanPhi = Math.tan(phi);
  const rSrc = Math.hypot(sx * rxScale, sy * ryScale);
  const uSrc = rSrc / rMax;
  const u = uSrc > 1e-6 ? Math.atan(uSrc * tanPhi) / phi : 0;
  const invFactor = uSrc > 1e-6 ? u / uSrc : tanPhi / phi;
  return { x: sx * invFactor, y: sy * invFactor };
}

const _projVec = new THREE.Vector3();

/**
 * Projects a 3D world-space point to 2D CSS pixel coordinates within the canvas,
 * accounting for active 4-PT/5-PT curvilinear lens distortion.
 */
export function projectWorldPointToScreen(
  worldPos: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  preset: CameraPreset,
  curvature: number
): ScreenProjection {
  _projVec.copy(worldPos).project(camera);
  const visible = _projVec.z >= -1 && _projVec.z <= 1;
  const aspect = viewportWidth / Math.max(1, viewportHeight);
  const warped = sourceNdcToScreenNdc(
    _projVec.x,
    _projVec.y,
    preset,
    curvature,
    aspect
  );
  const screenX = (warped.x * 0.5 + 0.5) * viewportWidth;
  const screenY = (-warped.y * 0.5 + 0.5) * viewportHeight;
  return {
    screenX,
    screenY,
    ndcX: warped.x,
    ndcY: warped.y,
    visible,
  };
}

interface TransformControlsPointerTarget {
  _getPointer?: (event: PointerEvent) => {
    x: number;
    y: number;
    button: number;
  };
  domElement?: HTMLElement | null;
}

/**
 * Wraps Three.js TransformControls._getPointer so gizmo axis hover and drag
 * raycasting track the distorted curvilinear viewport instead of flat screen NDC.
 */
export function attachCurvilinearPointerWarp(
  controlsUnknown: unknown,
  getConfig: () => { preset: CameraPreset; curvature: number }
): () => void {
  if (!controlsUnknown || typeof controlsUnknown !== 'object') {
    return () => {};
  }
  const controls = controlsUnknown as TransformControlsPointerTarget;
  const origGetPointer = controls._getPointer;
  if (typeof origGetPointer !== 'function') {
    return () => {};
  }

  controls._getPointer = function wrappedGetPointer(event: PointerEvent) {
    const raw = origGetPointer.call(this, event);
    const { preset, curvature } = getConfig();
    if (!isCurvilinearPreset(preset)) {
      return raw;
    }
    const rect = this.domElement?.getBoundingClientRect();
    const aspect =
      rect && rect.height > 0 ? rect.width / rect.height : 1;
    const mapped = screenNdcToSourceNdc(
      raw.x,
      raw.y,
      preset,
      curvature,
      aspect
    );
    return { ...raw, x: mapped.x, y: mapped.y };
  };

  return () => {
    if (controls._getPointer !== origGetPointer) {
      controls._getPointer = origGetPointer;
    }
  };
}
