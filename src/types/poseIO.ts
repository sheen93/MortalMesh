export type QuaternionTuple = [number, number, number, number];

export type Vec3Tuple = [number, number, number];

export interface PoseSnapshot {
  bones: Record<string, QuaternionTuple>;
  rootPosition: Vec3Tuple;
  elevationY: number;
  groundEnabled: boolean;
  groundSnapEnabled: boolean;
  pinnedBones: string[];
}

export interface MortalMeshPoseFile {
  app: 'mortal-mesh';
  version: 1;
  name: string;
  exportedAt: string;
  pose: PoseSnapshot;
}

export type ParsePoseResult =
  | { ok: true; file: MortalMeshPoseFile }
  | { ok: false; error: string };

export interface PoseBridge {
  captureSnapshot: () => PoseSnapshot | null;
  applySnapshot: (
    snapshot: PoseSnapshot,
    options?: { recomputeGroundIfSnapped?: boolean }
  ) => PoseSnapshot | null;
  mirrorCurrentPose: () => PoseSnapshot | null;
}
