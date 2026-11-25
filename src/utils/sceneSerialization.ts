import { isStudioThemeId } from '@/data/studioThemes';
import type { DampingPreset, KeyLightSettings, PoseControlMode } from '@/types/anatomy';
import type { PoseSnapshot, Vec3Tuple } from '@/types/poseIO';
import { MAX_STUDIO_PROPS, type StudioProp, type StudioPropType } from '@/types/props';
import {
  MANNEQUIN_FINISH_ORDER,
  MAX_MANNEQUINS,
  type MannequinFinish,
  type MannequinRecord,
} from '@/types/scene';
import {
  MAX_CAMERA_BOOKMARKS,
  SCENE_AUTOSAVE_STORAGE_KEY,
  type CameraBookmark,
  type CameraViewState,
  type MortalMeshSceneFile,
  type ParseSceneOrPoseResult,
  type ParseSceneResult,
  type SerializedMannequin,
  type SerializedStudioSettings,
} from '@/types/sceneIO';
import {
  clonePoseSnapshot,
  formatPoseTimestamp,
  isFiniteNumber,
  isPlainObject,
  parsePoseFile,
  parsePoseSnapshotObject,
  parseVec3Tuple,
} from '@/utils/poseSerialization';

const VALID_PROP_TYPES = new Set<StudioPropType>([
  'box',
  'stool',
  'cylinder',
  'sphere',
  'staff',
]);

const VALID_FINISHES = new Set<MannequinFinish>(MANNEQUIN_FINISH_ORDER);
const VALID_DAMPING = new Set<DampingPreset>(['soft', 'natural', 'heavy']);
const VALID_CONTROL_MODES = new Set<PoseControlMode>(['fk', 'ik']);

export interface SerializeSceneParams {
  name?: string;
  mannequins: readonly MannequinRecord[];
  activeMannequinId: string;
  poseById: Map<string, PoseSnapshot>;
  propsList: readonly StudioProp[];
  studio: SerializedStudioSettings;
  camera: CameraViewState;
  bookmarks: readonly CameraBookmark[];
}

export function serializeSceneFile({
  name = 'Mortal Mesh Studio Scene',
  mannequins,
  activeMannequinId,
  poseById,
  propsList,
  studio,
  camera,
  bookmarks,
}: SerializeSceneParams): MortalMeshSceneFile {
  const cleanName = name.trim() || 'Mortal Mesh Studio Scene';

  const serializedMannequins: SerializedMannequin[] = mannequins
    .slice(0, MAX_MANNEQUINS)
    .map((m) => {
      const snap = poseById.get(m.id);
      const fallbackPose: PoseSnapshot = snap
        ? clonePoseSnapshot(snap)
        : m.initialSnapshot
          ? clonePoseSnapshot(m.initialSnapshot)
          : {
              bones: {},
              rootPosition: [...m.spawnOffset] as Vec3Tuple,
              elevationY: m.elevationY,
              groundEnabled: studio.groundEnabled,
              groundSnapEnabled: m.groundSnapEnabled,
              pinnedBones: [...m.pinnedBones],
            };
      return {
        id: m.id,
        name: m.name,
        finish: m.finish,
        locked: m.locked,
        visible: m.visible,
        spawnOffset: [m.spawnOffset[0], m.spawnOffset[1], m.spawnOffset[2]],
        activePosePresetId: m.activePosePresetId,
        pose: fallbackPose,
      };
    });

  const serializedProps: StudioProp[] = propsList
    .slice(0, MAX_STUDIO_PROPS)
    .map((p) => ({
      id: p.id,
      type: p.type,
      name: p.name,
      position: [p.position[0], p.position[1], p.position[2]],
      rotation: [p.rotation[0], p.rotation[1], p.rotation[2]],
      scale: [p.scale[0], p.scale[1], p.scale[2]],
      locked: p.locked,
      visible: p.visible,
    }));

  const serializedBookmarks: CameraBookmark[] = bookmarks
    .slice(0, MAX_CAMERA_BOOKMARKS)
    .map((b) => ({
      id: b.id,
      name: b.name,
      position: [b.position[0], b.position[1], b.position[2]],
      target: [b.target[0], b.target[1], b.target[2]],
    }));

  return {
    app: 'mortal-mesh-scene',
    version: 1,
    name: cleanName,
    exportedAt: new Date().toISOString(),
    mannequins: serializedMannequins,
    activeMannequinId,
    props: serializedProps,
    studio: {
      theme: studio.theme,
      groundEnabled: studio.groundEnabled,
      gravityEnabled: studio.gravityEnabled,
      gravityDamping: studio.gravityDamping,
      jointLimitsEnabled: studio.jointLimitsEnabled,
      controlMode: studio.controlMode,
      keyLight: {
        azimuth: studio.keyLight.azimuth,
        elevation: studio.keyLight.elevation,
        intensity: studio.keyLight.intensity,
      },
    },
    camera: {
      position: [camera.position[0], camera.position[1], camera.position[2]],
      target: [camera.target[0], camera.target[1], camera.target[2]],
    },
    bookmarks: serializedBookmarks,
  };
}

export function downloadSceneFile(sceneFile: MortalMeshSceneFile): string {
  const filename = `mortal-mesh-scene-${formatPoseTimestamp()}.json`;
  const blob = new Blob([JSON.stringify(sceneFile, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return filename;
}

function parseCameraView(
  rawView: unknown,
  label: string
): { ok: true; view: CameraViewState } | { ok: false; error: string } {
  if (!isPlainObject(rawView)) {
    return { ok: false, error: `Invalid scene JSON: missing ${label}` };
  }
  const position = parseVec3Tuple(rawView.position);
  const target = parseVec3Tuple(rawView.target);
  if (!position || !target) {
    return { ok: false, error: `Invalid scene JSON: invalid ${label} vectors` };
  }
  return { ok: true, view: { position, target } };
}

function parseKeyLight(rawLight: unknown): KeyLightSettings | null {
  if (!isPlainObject(rawLight)) return null;
  if (
    !isFiniteNumber(rawLight.azimuth) ||
    !isFiniteNumber(rawLight.elevation) ||
    !isFiniteNumber(rawLight.intensity)
  ) {
    return null;
  }
  return {
    azimuth: Math.min(360, Math.max(0, rawLight.azimuth)),
    elevation: Math.min(89, Math.max(10, rawLight.elevation)),
    intensity: Math.min(5, Math.max(0.1, rawLight.intensity)),
  };
}

export function parseSceneFile(raw: unknown): ParseSceneResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Invalid scene JSON: expected an object' };
  }
  if (raw.app !== 'mortal-mesh-scene') {
    return { ok: false, error: 'Invalid scene JSON: unrecognized app header' };
  }
  if (raw.version !== 1) {
    return { ok: false, error: 'Invalid scene JSON: unsupported version' };
  }
  if (typeof raw.name !== 'string') {
    return { ok: false, error: 'Invalid scene JSON: missing scene name' };
  }
  if (typeof raw.exportedAt !== 'string') {
    return { ok: false, error: 'Invalid scene JSON: missing timestamp' };
  }

  if (
    !Array.isArray(raw.mannequins) ||
    raw.mannequins.length === 0 ||
    raw.mannequins.length > MAX_MANNEQUINS
  ) {
    return {
      ok: false,
      error: `Invalid scene JSON: mannequins must have 1..${MAX_MANNEQUINS} items`,
    };
  }

  const parsedMannequins: SerializedMannequin[] = [];
  const mannequinIds = new Set<string>();

  for (let i = 0; i < raw.mannequins.length; i += 1) {
    const item = raw.mannequins[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `Invalid scene JSON: invalid figure #${i + 1}` };
    }
    if (typeof item.id !== 'string' || item.id.trim().length === 0) {
      return { ok: false, error: `Invalid scene JSON: missing figure id` };
    }
    if (typeof item.name !== 'string' || item.name.trim().length === 0) {
      return { ok: false, error: `Invalid scene JSON: missing figure name` };
    }
    if (
      typeof item.finish !== 'string' ||
      !VALID_FINISHES.has(item.finish as MannequinFinish)
    ) {
      return { ok: false, error: `Invalid scene JSON: invalid figure finish` };
    }
    if (typeof item.locked !== 'boolean' || typeof item.visible !== 'boolean') {
      return { ok: false, error: `Invalid scene JSON: invalid lock/visibility flag` };
    }
    const spawnOffset = parseVec3Tuple(item.spawnOffset);
    if (!spawnOffset) {
      return { ok: false, error: `Invalid scene JSON: invalid spawnOffset` };
    }
    if (
      item.activePosePresetId !== null &&
      typeof item.activePosePresetId !== 'string'
    ) {
      return {
        ok: false,
        error: `Invalid scene JSON: invalid activePosePresetId`,
      };
    }

    const parsedPose = parsePoseSnapshotObject(item.pose, `figure "${item.name}"`);
    if (!parsedPose.ok) {
      return { ok: false, error: parsedPose.error };
    }

    mannequinIds.add(item.id);
    parsedMannequins.push({
      id: item.id,
      name: item.name.trim(),
      finish: item.finish as MannequinFinish,
      locked: item.locked,
      visible: item.visible,
      spawnOffset,
      activePosePresetId: item.activePosePresetId,
      pose: parsedPose.pose,
    });
  }

  if (
    typeof raw.activeMannequinId !== 'string' ||
    !mannequinIds.has(raw.activeMannequinId)
  ) {
    return {
      ok: false,
      error: 'Invalid scene JSON: invalid activeMannequinId',
    };
  }

  if (!Array.isArray(raw.props) || raw.props.length > MAX_STUDIO_PROPS) {
    return {
      ok: false,
      error: `Invalid scene JSON: props must have 0..${MAX_STUDIO_PROPS} items`,
    };
  }

  const parsedProps: StudioProp[] = [];
  for (let i = 0; i < raw.props.length; i += 1) {
    const p = raw.props[i];
    if (!isPlainObject(p)) {
      return { ok: false, error: `Invalid scene JSON: invalid prop #${i + 1}` };
    }
    if (
      typeof p.id !== 'string' ||
      p.id.trim().length === 0 ||
      typeof p.name !== 'string' ||
      p.name.trim().length === 0
    ) {
      return { ok: false, error: 'Invalid scene JSON: invalid prop id or name' };
    }
    if (
      typeof p.type !== 'string' ||
      !VALID_PROP_TYPES.has(p.type as StudioPropType)
    ) {
      return { ok: false, error: 'Invalid scene JSON: invalid prop type' };
    }
    const position = parseVec3Tuple(p.position);
    const rotation = parseVec3Tuple(p.rotation);
    const scale = parseVec3Tuple(p.scale);
    if (!position || !rotation || !scale) {
      return { ok: false, error: 'Invalid scene JSON: invalid prop transforms' };
    }
    if (
      scale.some((s) => s < 0.05 || s > 8) ||
      typeof p.locked !== 'boolean' ||
      typeof p.visible !== 'boolean'
    ) {
      return { ok: false, error: 'Invalid scene JSON: invalid prop scale or state' };
    }
    parsedProps.push({
      id: p.id,
      type: p.type as StudioPropType,
      name: p.name.trim(),
      position,
      rotation,
      scale,
      locked: p.locked,
      visible: p.visible,
    });
  }

  if (!isPlainObject(raw.studio)) {
    return { ok: false, error: 'Invalid scene JSON: missing studio settings' };
  }
  const s = raw.studio;
  if (typeof s.theme !== 'string' || !isStudioThemeId(s.theme)) {
    return { ok: false, error: 'Invalid scene JSON: invalid studio theme' };
  }
  if (
    typeof s.groundEnabled !== 'boolean' ||
    typeof s.gravityEnabled !== 'boolean' ||
    typeof s.jointLimitsEnabled !== 'boolean'
  ) {
    return { ok: false, error: 'Invalid scene JSON: invalid studio boolean flags' };
  }
  if (
    typeof s.gravityDamping !== 'string' ||
    !VALID_DAMPING.has(s.gravityDamping as DampingPreset)
  ) {
    return { ok: false, error: 'Invalid scene JSON: invalid gravityDamping' };
  }
  if (
    typeof s.controlMode !== 'string' ||
    !VALID_CONTROL_MODES.has(s.controlMode as PoseControlMode)
  ) {
    return { ok: false, error: 'Invalid scene JSON: invalid controlMode' };
  }
  const keyLight = parseKeyLight(s.keyLight);
  if (!keyLight) {
    return { ok: false, error: 'Invalid scene JSON: invalid keyLight settings' };
  }

  const parsedCamera = parseCameraView(raw.camera, 'camera');
  if (!parsedCamera.ok) {
    return { ok: false, error: parsedCamera.error };
  }

  if (
    !Array.isArray(raw.bookmarks) ||
    raw.bookmarks.length > MAX_CAMERA_BOOKMARKS
  ) {
    return {
      ok: false,
      error: `Invalid scene JSON: bookmarks must have 0..${MAX_CAMERA_BOOKMARKS} items`,
    };
  }

  const parsedBookmarks: CameraBookmark[] = [];
  for (let i = 0; i < raw.bookmarks.length; i += 1) {
    const b = raw.bookmarks[i];
    if (!isPlainObject(b) || typeof b.id !== 'string' || typeof b.name !== 'string') {
      return { ok: false, error: 'Invalid scene JSON: invalid camera bookmark' };
    }
    const bv = parseCameraView(b, `bookmark "${b.name}"`);
    if (!bv.ok) return { ok: false, error: bv.error };
    parsedBookmarks.push({
      id: b.id,
      name: b.name.trim() || `View ${i + 1}`,
      position: bv.view.position,
      target: bv.view.target,
    });
  }

  return {
    ok: true,
    file: {
      app: 'mortal-mesh-scene',
      version: 1,
      name: raw.name.trim() || 'Imported Scene',
      exportedAt: raw.exportedAt,
      mannequins: parsedMannequins,
      activeMannequinId: raw.activeMannequinId,
      props: parsedProps,
      studio: {
        theme: s.theme,
        groundEnabled: s.groundEnabled,
        gravityEnabled: s.gravityEnabled,
        gravityDamping: s.gravityDamping as DampingPreset,
        jointLimitsEnabled: s.jointLimitsEnabled,
        controlMode: s.controlMode as PoseControlMode,
        keyLight,
      },
      camera: parsedCamera.view,
      bookmarks: parsedBookmarks,
    },
  };
}

export function parseSceneOrPoseFile(raw: unknown): ParseSceneOrPoseResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Invalid JSON: expected an object' };
  }

  if (raw.app === 'mortal-mesh-scene') {
    const res = parseSceneFile(raw);
    return res.ok ? { ok: true, kind: 'scene', file: res.file } : res;
  }

  if (raw.app === 'mortal-mesh') {
    const res = parsePoseFile(raw);
    return res.ok ? { ok: true, kind: 'pose', file: res.file } : res;
  }

  return { ok: false, error: 'Unrecognized Mortal Mesh JSON file header' };
}

export function saveSceneToLocalStorage(sceneFile: MortalMeshSceneFile): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(
      SCENE_AUTOSAVE_STORAGE_KEY,
      JSON.stringify(sceneFile)
    );
    return true;
  } catch {
    return false;
  }
}

export function loadSceneFromLocalStorage(): MortalMeshSceneFile | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const rawText = window.localStorage.getItem(SCENE_AUTOSAVE_STORAGE_KEY);
    if (!rawText) return null;
    const raw: unknown = JSON.parse(rawText);
    const parsed = parseSceneFile(raw);
    return parsed.ok ? parsed.file : null;
  } catch {
    return null;
  }
}

export function clearSavedSceneFromLocalStorage(): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(SCENE_AUTOSAVE_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}
