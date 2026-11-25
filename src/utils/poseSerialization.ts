import { isCoreBoneName, POSEABLE_BONE_NAMES } from '@/types/anatomy';
import type {
  MortalMeshPoseFile,
  ParsePoseResult,
  PoseSnapshot,
  QuaternionTuple,
  Vec3Tuple,
} from '@/types/poseIO';

const POSEABLE_BONE_SET = new Set<string>(POSEABLE_BONE_NAMES);

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseQuaternionTuple(value: unknown): QuaternionTuple | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [x, y, z, w] = value;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(z) ||
    !isFiniteNumber(w)
  ) {
    return null;
  }
  const len = Math.hypot(x, y, z, w);
  if (len <= 1e-6 || !Number.isFinite(len)) return null;
  return [x / len, y / len, z / len, w / len];
}

export function parseVec3Tuple(value: unknown): Vec3Tuple | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null;
  }
  return [x, y, z];
}

export type ParsePoseSnapshotResult =
  | { ok: true; pose: PoseSnapshot }
  | { ok: false; error: string };

export function parsePoseSnapshotObject(
  rawPose: unknown,
  label = 'pose'
): ParsePoseSnapshotResult {
  if (!isPlainObject(rawPose)) {
    return { ok: false, error: `Invalid ${label}: missing pose payload` };
  }

  if (!isPlainObject(rawPose.bones)) {
    return { ok: false, error: `Invalid ${label}: invalid bones map` };
  }

  const bones: Record<string, QuaternionTuple> = {};
  for (const [boneName, rawQuat] of Object.entries(rawPose.bones)) {
    if (!POSEABLE_BONE_SET.has(boneName)) {
      continue;
    }
    const parsedQuat = parseQuaternionTuple(rawQuat);
    if (!parsedQuat) {
      return {
        ok: false,
        error: `Invalid quaternion on bone "${boneName}"`,
      };
    }
    bones[boneName] = parsedQuat;
  }

  if (Object.keys(bones).length === 0) {
    return {
      ok: false,
      error: `Invalid ${label}: no recognized poseable bones found`,
    };
  }

  const rootPosition = parseVec3Tuple(rawPose.rootPosition);
  if (!rootPosition) {
    return { ok: false, error: `Invalid ${label}: invalid rootPosition` };
  }

  if (!isFiniteNumber(rawPose.elevationY)) {
    return { ok: false, error: `Invalid ${label}: invalid elevationY` };
  }

  if (typeof rawPose.groundEnabled !== 'boolean') {
    return { ok: false, error: `Invalid ${label}: invalid groundEnabled` };
  }

  if (typeof rawPose.groundSnapEnabled !== 'boolean') {
    return {
      ok: false,
      error: `Invalid ${label}: invalid groundSnapEnabled`,
    };
  }

  if (!Array.isArray(rawPose.pinnedBones)) {
    return { ok: false, error: `Invalid ${label}: invalid pinnedBones list` };
  }

  const pinnedSet = new Set<string>();
  for (const item of rawPose.pinnedBones) {
    if (typeof item !== 'string') {
      return {
        ok: false,
        error: `Invalid ${label}: non-string entry in pinnedBones`,
      };
    }
    if (isCoreBoneName(item)) {
      pinnedSet.add(item);
    }
  }

  return {
    ok: true,
    pose: {
      bones,
      rootPosition,
      elevationY: rawPose.elevationY,
      groundEnabled: rawPose.groundEnabled,
      groundSnapEnabled: rawPose.groundSnapEnabled,
      pinnedBones: Array.from(pinnedSet),
    },
  };
}

export function clonePoseSnapshot(snapshot: PoseSnapshot): PoseSnapshot {
  const clonedBones: Record<string, QuaternionTuple> = {};
  for (const [boneName, tuple] of Object.entries(snapshot.bones)) {
    clonedBones[boneName] = [tuple[0], tuple[1], tuple[2], tuple[3]];
  }
  return {
    bones: clonedBones,
    rootPosition: [
      snapshot.rootPosition[0],
      snapshot.rootPosition[1],
      snapshot.rootPosition[2],
    ],
    elevationY: snapshot.elevationY,
    groundEnabled: snapshot.groundEnabled,
    groundSnapEnabled: snapshot.groundSnapEnabled,
    pinnedBones: [...snapshot.pinnedBones],
  };
}

export function snapshotsEqual(
  a: PoseSnapshot,
  b: PoseSnapshot,
  eps = 1e-4
): boolean {
  if (a.groundEnabled !== b.groundEnabled) return false;
  if (a.groundSnapEnabled !== b.groundSnapEnabled) return false;
  if (Math.abs(a.elevationY - b.elevationY) > 1e-3) return false;

  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(a.rootPosition[i] - b.rootPosition[i]) > 1e-3) {
      return false;
    }
  }

  const pinsA = Array.from(new Set(a.pinnedBones)).sort();
  const pinsB = Array.from(new Set(b.pinnedBones)).sort();
  if (pinsA.length !== pinsB.length) return false;
  for (let i = 0; i < pinsA.length; i += 1) {
    if (pinsA[i] !== pinsB[i]) return false;
  }

  const keysA = Object.keys(a.bones);
  const keysB = Object.keys(b.bones);
  if (keysA.length !== keysB.length) return false;

  for (const boneName of keysA) {
    const qa = a.bones[boneName];
    const qb = b.bones[boneName];
    if (!qa || !qb) return false;
    // Compare absolute dot product to account for quaternion double-cover (q === -q).
    const dot =
      qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
    if (Math.abs(dot) < 1 - eps) {
      return false;
    }
  }

  return true;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatPoseTimestamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function serializePoseFile(
  pose: PoseSnapshot,
  name = 'Custom Pose'
): MortalMeshPoseFile {
  const cleanName = name.trim() || 'Custom Pose';
  return {
    app: 'mortal-mesh',
    version: 1,
    name: cleanName,
    exportedAt: new Date().toISOString(),
    pose: clonePoseSnapshot(pose),
  };
}

export function downloadPoseFile(
  pose: PoseSnapshot,
  name = 'Custom Pose'
): string {
  const payload = serializePoseFile(pose, name);
  const filename = `mortal-mesh-pose-${formatPoseTimestamp()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
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

export function parsePoseFile(raw: unknown): ParsePoseResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Invalid pose JSON: expected an object' };
  }

  if (raw.app !== 'mortal-mesh') {
    return { ok: false, error: 'Invalid pose JSON: unrecognized app header' };
  }

  if (raw.version !== 1) {
    return {
      ok: false,
      error: 'Invalid pose JSON: unsupported format version',
    };
  }

  if (typeof raw.name !== 'string') {
    return { ok: false, error: 'Invalid pose JSON: missing pose name' };
  }
  const cleanName = raw.name.trim() || 'Imported Pose';

  if (typeof raw.exportedAt !== 'string') {
    return { ok: false, error: 'Invalid pose JSON: missing timestamp' };
  }

  const parsedPose = parsePoseSnapshotObject(raw.pose, 'pose JSON');
  if (!parsedPose.ok) {
    return parsedPose;
  }

  return {
    ok: true,
    file: {
      app: 'mortal-mesh',
      version: 1,
      name: cleanName,
      exportedAt: raw.exportedAt,
      pose: parsedPose.pose,
    },
  };
}
