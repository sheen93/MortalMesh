export interface LayerVisibility {
  skeleton: boolean;
  muscle: boolean;
}

export const ANATOMY_LAYERS_AVAILABLE = false;

export const MANNEQUIN_MESH_NAMES = [
  'Mannequin',
  'Mannequin_1',
  'Mannequin_2',
] as const;

export const NON_POSEABLE_BONE_NAMES: readonly string[] = [
  'root',
  'index_04_leaf_l',
  'middle_04_leaf_l',
  'pinky_04_leaf_l',
  'ring_04_leaf_l',
  'thumb_04_leaf_l',
  'index_04_leaf_r',
  'middle_04_leaf_r',
  'pinky_04_leaf_r',
  'ring_04_leaf_r',
  'thumb_04_leaf_r',
  'ball_leaf_l',
  'ball_leaf_r',
];

export const NON_POSEABLE_BONE_PATTERN = /^(root|ik_|WGT-|MCH-|ORG-)|_leaf_/i;

export function isPoseableBoneName(name: string): boolean {
  return (
    name.length > 0 &&
    !NON_POSEABLE_BONE_NAMES.includes(name) &&
    !NON_POSEABLE_BONE_PATTERN.test(name)
  );
}

const FINGER_BONE_PATTERN = /^(index|middle|pinky|ring|thumb)_/i;

export function getJointHitboxRadius(boneName: string): number {
  return FINGER_BONE_PATTERN.test(boneName) ? 0.011 : 0.032;
}

export type JointsDisplayMode = 'core' | 'all' | 'hidden';

export type PoseControlMode = 'fk' | 'ik';

export type IKHandleId = 'hand_l' | 'hand_r' | 'foot_l' | 'foot_r' | 'pelvis';

export const IK_HANDLE_ORDER: readonly IKHandleId[] = [
  'hand_l',
  'hand_r',
  'foot_l',
  'foot_r',
  'pelvis',
];

export type AxisKey = 'x' | 'y' | 'z';

export interface JointAngles {
  x: number;
  y: number;
  z: number;
}

export const ZERO_JOINT_ANGLES: JointAngles = { x: 0, y: 0, z: 0 };

export interface JointAngleCommand {
  boneName: string;
  angles: JointAngles;
  seq: number;
  commitHistory?: boolean;
}

export interface ElevationCommand {
  y: number;
  seq: number;
}

export interface PosePresetCommand {
  presetId: string;
  seq: number;
}

export type DampingPreset = 'soft' | 'natural' | 'heavy';

export type StudioThemeId = 'light' | 'gray' | 'dark';

export const CORE_BONE_NAMES: readonly string[] = [
  'pelvis',
  'spine_01',
  'spine_02',
  'spine_03',
  'neck_01',
  'Head',
  'clavicle_l',
  'upperarm_l',
  'lowerarm_l',
  'hand_l',
  'clavicle_r',
  'upperarm_r',
  'lowerarm_r',
  'hand_r',
  'thigh_l',
  'calf_l',
  'foot_l',
  'ball_l',
  'thigh_r',
  'calf_r',
  'foot_r',
  'ball_r',
];

export function isCoreBoneName(name: string): boolean {
  return CORE_BONE_NAMES.includes(name);
}

export const POSEABLE_BONE_NAMES: readonly string[] = [
  'pelvis',
  'spine_01',
  'spine_02',
  'spine_03',
  'neck_01',
  'Head',
  'clavicle_l',
  'upperarm_l',
  'lowerarm_l',
  'hand_l',
  'index_01_l',
  'index_02_l',
  'index_03_l',
  'middle_01_l',
  'middle_02_l',
  'middle_03_l',
  'pinky_01_l',
  'pinky_02_l',
  'pinky_03_l',
  'ring_01_l',
  'ring_02_l',
  'ring_03_l',
  'thumb_01_l',
  'thumb_02_l',
  'thumb_03_l',
  'clavicle_r',
  'upperarm_r',
  'lowerarm_r',
  'hand_r',
  'index_01_r',
  'index_02_r',
  'index_03_r',
  'middle_01_r',
  'middle_02_r',
  'middle_03_r',
  'pinky_01_r',
  'pinky_02_r',
  'pinky_03_r',
  'ring_01_r',
  'ring_02_r',
  'ring_03_r',
  'thumb_01_r',
  'thumb_02_r',
  'thumb_03_r',
  'thigh_l',
  'calf_l',
  'foot_l',
  'ball_l',
  'thigh_r',
  'calf_r',
  'foot_r',
  'ball_r',
];

export type CameraPreset = '1-point' | '2-point' | '3-point';

export interface CameraPresetConfig {
  id: CameraPreset;
  label: string;
  description: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: Record<CameraPreset, CameraPresetConfig> = {
  '1-point': {
    id: '1-point',
    label: '1-Point',
    description: 'Front elevation (1 vanishing point)',
    position: [0, 1, 6],
    target: [0, 1, 0],
  },
  '2-point': {
    id: '2-point',
    label: '2-Point',
    description: '45° eye-level turn (2 vanishing points)',
    position: [4.24, 1, 4.24],
    target: [0, 1, 0],
  },
  '3-point': {
    id: '3-point',
    label: '3-Point',
    description: 'High-angle 3/4 view (3 vanishing points)',
    position: [3.8, 3.6, 3.8],
    target: [0, 0.9, 0],
  },
};

export const CAMERA_PRESET_ORDER: CameraPreset[] = ['1-point', '2-point', '3-point'];

export interface KeyLightSettings {
  azimuth: number; // 0..360 deg
  elevation: number; // 15..85 deg
  intensity: number; // 0.4..2.8
}

export const DEFAULT_KEY_LIGHT: KeyLightSettings = {
  azimuth: 45,
  elevation: 45,
  intensity: 1.4,
};

export interface SnapshotOptions {
  transparent: boolean;
  scale: 1 | 2;
}

export interface SnapshotResult {
  filename: string;
  width: number;
  height: number;
}

export interface SnapshotBridge {
  captureSnapshot: (options: SnapshotOptions) => SnapshotResult | null;
}
