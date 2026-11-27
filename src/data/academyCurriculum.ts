import type { MannequinModelId } from '@/data/modelCatalog';
import type {
  CameraPreset,
  HandGestureId,
  JointAngles,
  LandmarkGroupId,
  LightingPresetId,
  PoseControlMode,
} from '@/types/anatomy';
import type { ConstructiveMode, DrawingStyleId } from '@/types/drawing';

export const ACADEMY_STORAGE_KEY = 'mortal-mesh:academy:v1';

export type AcademyModuleId =
  | 'gesture-balance'
  | 'three-masses'
  | 'bony-landmarks'
  | 'foreshortening-optics'
  | 'hand-wedges'
  | 'value-shapes';

export interface LandmarkTipSpec {
  groupId: LandmarkGroupId;
  number: number;
  title: string;
  subtitle: string;
  artistTip: string;
}

export const LANDMARK_TIPS: Record<LandmarkGroupId, LandmarkTipSpec> = {
  c7: {
    groupId: 'c7',
    number: 1,
    title: 'C7 Vertebra',
    subtitle: 'Cervical Base Pivot',
    artistTip:
      'Anchors the neck cylinder onto the ribcage shelf; marks the true centerline at the top of the trapezius diamond.',
  },
  sternum: {
    groupId: 'sternum',
    number: 2,
    title: 'Sternum / Suprasternum Pit',
    subtitle: 'Gravity Plumb Origin',
    artistTip:
      'Drop your plumb line straight from this pit to check whether weight settles securely over a supporting foot.',
  },
  acromion: {
    groupId: 'acromion',
    number: 3,
    title: 'Acromion Process',
    subtitle: 'Clavicle Shoulder Lock',
    artistTip:
      'Subcutaneous bony shelf where collarbone meets deltoid — traces the true upper shoulder tilt line.',
  },
  asis: {
    groupId: 'asis',
    number: 4,
    title: 'ASIS (Anterior Iliac Spine)',
    subtitle: 'Pelvis Orientation Compass',
    artistTip:
      'Locks true pelvic tilt and rotation regardless of surface body fat or clothing.',
  },
  trochanter: {
    groupId: 'trochanter',
    number: 5,
    title: 'Greater Trochanter',
    subtitle: 'Hip Swing Axis',
    artistTip:
      'Sits lower and wider than the iliac crest; creates the crisp structural step-in at the outer thigh silhouette.',
  },
  olecranon: {
    groupId: 'olecranon',
    number: 6,
    title: 'Olecranon Process',
    subtitle: 'Forearm Hinge Wedge',
    artistTip:
      'Forms a bony triangular wedge with wrist condyles — keeps bent elbows from ever turning into rubber tubes.',
  },
  patella: {
    groupId: 'patella',
    number: 7,
    title: 'Patella & Condyle Shelf',
    subtitle: 'Knee Lock & Direction',
    artistTip:
      'Points directly along femur rotation and drops slightly laterally relative to the ankle tendon rhythm.',
  },
  malleolus: {
    groupId: 'malleolus',
    number: 8,
    title: 'Medial / Lateral Malleoli',
    subtitle: 'Ankle Asymmetric Lock',
    artistTip:
      'Inner ankle sits distinctly higher than outer ankle — use this asymmetry to plant feet credibly on perspective planes.',
  },
};

export interface AcademyStepStatus {
  id: string;
  label: string;
  completed: boolean;
}

export interface AcademyValidationResult {
  steps: AcademyStepStatus[];
  completed: boolean;
  liveHint: string;
}

export interface AcademyTelemetry {
  modelId: MannequinModelId;
  activePosePresetId: string | null;
  controlMode: PoseControlMode;
  activePreset: CameraPreset;
  lensCurvature: number;
  lightAzimuth: number;
  initialLightAzimuth: number;
  notanEnabled: boolean;
  notanSplit: number;
  constructiveMode: ConstructiveMode;
  plumbBalanceMeters: number | null;
  pelvisMoved: boolean;
  pelvisAngles: JointAngles;
  spineSumZ: number;
  lowerarmRAngles: JointAngles;
  handRAngles: JointAngles;
  inspectedLandmarks: readonly LandmarkGroupId[];
  visitedHandGestures: readonly HandGestureId[];
  cameraOrbitedInModule: boolean;
}

export interface AcademyModuleSetup {
  modelId: MannequinModelId;
  poseId: string;
  controlMode: PoseControlMode;
  ikPinFeet: boolean;
  jointsDisplay: 'core' | 'all' | 'hidden';
  perspectiveMode: CameraPreset;
  lensCurvature: number;
  lightingPreset: LightingPresetId;
  notanEnabled: boolean;
  notanSplit: number;
  constructiveMode: ConstructiveMode;
  drawingStyle: DrawingStyleId;
  showLineOfAction: boolean;
  showPlumbLine: boolean;
  showCrossContours: boolean;
  showLandmarks: boolean;
  showLandmarkPins: boolean;
  cameraLookAt: {
    position: [number, number, number];
    target: [number, number, number];
  };
  focusBoneForCamera?: string;
}

export interface AcademyModuleSpec {
  id: AcademyModuleId;
  index: number;
  title: string;
  subtitle: string;
  durationLabel: string;
  artistTakeaway: string;
  setup: AcademyModuleSetup;
  evaluate: (t: AcademyTelemetry) => AcademyValidationResult;
}

export const ACADEMY_MODULES: readonly AcademyModuleSpec[] = [
  {
    id: 'gesture-balance',
    index: 1,
    title: 'Gesture & Center of Gravity',
    subtitle: 'Anchor dynamic energy with a plumb line over the support foot',
    durationLabel: '2 min',
    artistTakeaway:
      'A figure looks weightless unless its sternal plumb line falls near a weight-bearing base — shift the hips first, not the feet.',
    setup: {
      modelId: 'female',
      poseId: 'action-lunge',
      controlMode: 'ik',
      ikPinFeet: true,
      jointsDisplay: 'core',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      showLineOfAction: true,
      showPlumbLine: true,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: {
        position: [0.55, 1.05, 5.75],
        target: [0, 0.96, 0],
      },
    },
    evaluate: (t) => {
      const balanced =
        (t.plumbBalanceMeters !== null && t.plumbBalanceMeters <= 0.19) ||
        t.activePosePresetId === 'contrapposto';
      const shifted =
        t.pelvisMoved ||
        t.activePosePresetId === 'contrapposto' ||
        (t.plumbBalanceMeters !== null && t.plumbBalanceMeters <= 0.16);

      const distLabel =
        t.plumbBalanceMeters !== null
          ? `${Math.round(t.plumbBalanceMeters * 100)} cm from foot`
          : 'checking stance';

      return {
        steps: [
          {
            id: 'shift-hips',
            label: 'Drag the pelvis IK orb (or click Contrapposto)',
            completed: shifted,
          },
          {
            id: 'plumb-over-foot',
            label: 'Bring the plumb line near a support foot',
            completed: balanced,
          },
        ],
        completed: shifted && balanced,
        liveHint: balanced
          ? `Balanced over support foot (${distLabel})`
          : `Plumb offset: ${distLabel} — shift pelvis over support foot`,
      };
    },
  },
  {
    id: 'three-masses',
    index: 2,
    title: 'The Three Masses (Bridgman)',
    subtitle: 'Counter-tilt ribcage and pelvis into opposing wedges',
    durationLabel: '2 min',
    artistTakeaway:
      'Rigid straight stacks kill life in a drawing. Opposing wedge tilts between pelvis and ribcage create rhythmic compression and stretch.',
    setup: {
      modelId: 'female',
      poseId: 'neutral-standing',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'core',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'overlay',
      drawingStyle: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: {
        position: [0.65, 1.15, 5.1],
        target: [0, 1.05, 0],
      },
    },
    evaluate: (t) => {
      const pelvisRoll = Math.round(t.pelvisAngles.z);
      const spineRoll = Math.round(t.spineSumZ);
      const pelvisTilted = Math.abs(pelvisRoll) >= 6;
      const opposing =
        pelvisTilted &&
        Math.abs(spineRoll) >= 4 &&
        Math.sign(pelvisRoll) !== Math.sign(spineRoll) &&
        Math.abs(pelvisRoll - spineRoll) >= 8;

      return {
        steps: [
          {
            id: 'tilt-pelvis',
            label: 'Tilt Pelvis side roll (Z) at least 6°',
            completed: pelvisTilted,
          },
          {
            id: 'counter-spine',
            label: 'Counter-tilt Spine (Z) in the opposite direction',
            completed: opposing,
          },
        ],
        completed: pelvisTilted && opposing,
        liveHint: `Pelvis Z: ${pelvisRoll}° · Spine Z sum: ${spineRoll}°`,
      };
    },
  },
  {
    id: 'bony-landmarks',
    index: 3,
    title: '8 Master Artist Landmarks & ROM',
    subtitle: 'Tap surface bones on the skeleton & test hinge vs. ball ROM',
    durationLabel: '3 min',
    artistTakeaway:
      'Muscles soften with posture and weight, while subcutaneous bony landmarks stay razor-reliable anchors for measuring proportion.',
    setup: {
      modelId: 'skeleton',
      poseId: 'neutral-standing',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'core',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: true,
      showLandmarkPins: true,
      cameraLookAt: {
        position: [1.05, 1.08, 5.2],
        target: [0, 0.98, 0],
      },
    },
    evaluate: (t) => {
      const pinsDone = t.inspectedLandmarks.length >= 3;
      const elbowBend = Math.round(t.lowerarmRAngles.x);
      const elbowDone = elbowBend >= 45;

      return {
        steps: [
          {
            id: 'inspect-pins',
            label: `Inspect 3 clickable landmark pins (${Math.min(3, t.inspectedLandmarks.length)}/3)`,
            completed: pinsDone,
          },
          {
            id: 'hinge-elbow',
            label: 'Select Right Forearm & flex elbow bend >= 45°',
            completed: elbowDone,
          },
        ],
        completed: pinsDone && elbowDone,
        liveHint: `Pins read: ${t.inspectedLandmarks.length}/3 · Right Forearm Bend: ${elbowBend}°`,
      };
    },
  },
  {
    id: 'foreshortening-optics',
    index: 4,
    title: 'Foreshortening & Lens Optics',
    subtitle: 'See cross-contours overlap cleanly under curvilinear lenses',
    durationLabel: '2 min',
    artistTakeaway:
      'Never draw limb lengths literally in foreshortening — stack overlapping oval cross-contours like telescoping coins toward the eye.',
    setup: {
      modelId: 'female',
      poseId: 'rising-uppercut',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: 'fisheye',
      lensCurvature: 0.35,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'overlay',
      drawingStyle: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: true,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: {
        position: [1.2, 1.4, 2.3],
        target: [0, 1.12, 0.1],
      },
    },
    evaluate: (t) => {
      const domePct = Math.round(t.lensCurvature * 100);
      const swept = t.activePreset === 'fisheye' && t.lensCurvature >= 0.65;
      return {
        steps: [
          {
            id: 'sweep-dome',
            label: 'Push Fisheye Dome slider >= 65% in top-right optics bar',
            completed: swept,
          },
          {
            id: 'orbit-rings',
            label: 'Orbit camera around the punching arm to trace contour overlap',
            completed: t.cameraOrbitedInModule,
          },
        ],
        completed: swept && t.cameraOrbitedInModule,
        liveHint: `Fisheye Dome: ${domePct}% · Camera orbited: ${t.cameraOrbitedInModule ? 'Yes' : 'Drag canvas'}`,
      };
    },
  },
  {
    id: 'hand-wedges',
    index: 5,
    title: 'Hands as Architectural Wedges',
    subtitle: 'Master the palm trapezoid, knuckle fan, and thumb plane',
    durationLabel: '2 min',
    artistTakeaway:
      'Think of the palm as a tapered wedge with curved finger groups — simplify into box + mitten before placing individual phalanges.',
    setup: {
      modelId: 'female',
      poseId: 'adlocutio',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'core',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: {
        position: [-0.25, 1.6, 1.9],
        target: [-0.45, 1.48, 0.35],
      },
      focusBoneForCamera: 'hand_r',
    },
    evaluate: (t) => {
      const required: HandGestureId[] = ['fist', 'grab', 'pinch'];
      const hitCount = required.filter((g) =>
        t.visitedHandGestures.includes(g)
      ).length;
      const cycled = hitCount >= 3;
      const wristRotated =
        Math.abs(t.handRAngles.x) >= 10 ||
        Math.abs(t.handRAngles.z) >= 10 ||
        Math.abs(t.lowerarmRAngles.y) >= 18;

      return {
        steps: [
          {
            id: 'cycle-gestures',
            label: `Tap Right Hand & cycle Fist, Grab, Pinch (${hitCount}/3)`,
            completed: cycled,
          },
          {
            id: 'rotate-wrist',
            label: 'Rotate Wrist tilt or Forearm twist to check palm wedge',
            completed: wristRotated,
          },
        ],
        completed: cycled && wristRotated,
        liveHint: `Gestures tried: ${hitCount}/3 · Wrist X:${Math.round(t.handRAngles.x)}° Z:${Math.round(t.handRAngles.z)}°`,
      };
    },
  },
  {
    id: 'value-shapes',
    index: 6,
    title: 'Notan Value Shapes & Silhouette',
    subtitle: 'Organize shadow into one bold abstract mass before detailing',
    durationLabel: '2 min',
    artistTakeaway:
      'Strong illustrations read clearly as a 2-value thumbnail from across the room — lock light vs. core shadow families early.',
    setup: {
      modelId: 'female',
      poseId: 'contrapposto',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'chiaroscuro',
      notanEnabled: true,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: {
        position: [0.5, 1.05, 5.5],
        target: [0, 0.98, 0],
      },
    },
    evaluate: (t) => {
      const rawDiff = Math.abs(t.lightAzimuth - t.initialLightAzimuth) % 360;
      const azDelta = Math.round(rawDiff > 180 ? 360 - rawDiff : rawDiff);
      const azDone = azDelta >= 40;
      const splitPct = Math.round(t.notanSplit * 100);
      const splitDone =
        t.notanEnabled && Math.abs(t.notanSplit - 0.5) >= 0.08;

      return {
        steps: [
          {
            id: 'sweep-light',
            label: 'Open Lighting on right rail & sweep Key Azimuth >= 40°',
            completed: azDone,
          },
          {
            id: 'adjust-split',
            label: 'Shift Notan Shadow Split slider away from 50%',
            completed: splitDone,
          },
        ],
        completed: azDone && splitDone,
        liveHint: `Azimuth delta: ${azDelta}° · Shadow Split: ${splitPct}%`,
      };
    },
  },
];

export function getAcademyModule(id: AcademyModuleId): AcademyModuleSpec {
  return (
    ACADEMY_MODULES.find((m) => m.id === id) ?? ACADEMY_MODULES[0]
  );
}

const VALID_MODULE_IDS = new Set<AcademyModuleId>(
  ACADEMY_MODULES.map((m) => m.id)
);

export function loadCompletedAcademyModules(): AcademyModuleId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ACADEMY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is AcademyModuleId =>
        typeof id === 'string' && VALID_MODULE_IDS.has(id as AcademyModuleId)
    );
  } catch {
    return [];
  }
}

export function saveCompletedAcademyModules(
  completed: readonly AcademyModuleId[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = Array.from(new Set(completed));
    window.localStorage.setItem(ACADEMY_STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // Ignore storage quota errors cleanly
  }
}
