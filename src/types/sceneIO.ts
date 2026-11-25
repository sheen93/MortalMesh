import type {
  CameraPreset,
  DampingPreset,
  KeyLightSettings,
  PoseControlMode,
  StudioThemeId,
} from '@/types/anatomy';
import type { ParsePoseResult, PoseSnapshot, Vec3Tuple } from '@/types/poseIO';
import type { StudioProp } from '@/types/props';
import type { MannequinFinish } from '@/types/scene';

export const SCENE_AUTOSAVE_STORAGE_KEY = 'mortal-mesh:autosave:v1';
export const MAX_CAMERA_BOOKMARKS = 8;

export interface CameraViewState {
  position: Vec3Tuple;
  target: Vec3Tuple;
}

export interface CameraBookmark {
  id: string;
  name: string;
  position: Vec3Tuple;
  target: Vec3Tuple;
}

export interface CameraBridge {
  getView: () => CameraViewState | null;
  setView: (view: CameraViewState, animate?: boolean) => void;
  invalidateView: () => void;
}

export interface SerializedMannequin {
  id: string;
  name: string;
  finish: MannequinFinish;
  locked: boolean;
  visible: boolean;
  spawnOffset: Vec3Tuple;
  activePosePresetId: string | null;
  pose: PoseSnapshot;
}

export interface SerializedStudioSettings {
  theme: StudioThemeId;
  groundEnabled: boolean;
  gravityEnabled: boolean;
  gravityDamping: DampingPreset;
  jointLimitsEnabled: boolean;
  controlMode: PoseControlMode;
  keyLight: KeyLightSettings;
  perspectiveMode?: CameraPreset;
  lensCurvature?: number;
  showPerspectiveGuides?: boolean;
}

export interface MortalMeshSceneFile {
  app: 'mortal-mesh-scene';
  version: 1;
  name: string;
  exportedAt: string;
  mannequins: SerializedMannequin[];
  activeMannequinId: string;
  props: StudioProp[];
  studio: SerializedStudioSettings;
  camera: CameraViewState;
  bookmarks: CameraBookmark[];
}

export type ParseSceneResult =
  | { ok: true; file: MortalMeshSceneFile }
  | { ok: false; error: string };

export type ParseSceneOrPoseResult =
  | { ok: true; kind: 'scene'; file: MortalMeshSceneFile }
  | { ok: true; kind: 'pose'; file: Extract<ParsePoseResult, { ok: true }>['file'] }
  | { ok: false; error: string };
