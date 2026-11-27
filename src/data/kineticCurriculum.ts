import type { MannequinModelId } from '@/data/modelCatalog';
import type {
  CameraPreset,
  CompositionCropRatio,
  HandGestureId,
  LandmarkGroupId,
  LightingPresetId,
  PoseControlMode,
} from '@/types/anatomy';
import type { ConstructiveMode, DrawingStyleId } from '@/types/drawing';
import type {
  PadLayerId,
  PadLayoutMode,
  PadStrokeTelemetry,
  PadToolId,
} from '@/types/pad';

export const KINETIC_SCHOOL_STORAGE_KEY = 'mortal-mesh:school:v1';

export type KineticPhaseTag =
  | 'PULSE'
  | 'ANCHOR'
  | 'BOX'
  | 'WRAP'
  | 'CARVE'
  | 'MASTER';

export type KineticModuleId =
  | 'pulse-gravity'
  | 'warring-boxes'
  | 'eight-anchor-bones'
  | 'perspective-coils'
  | 'muscle-envelopes'
  | 'hands-as-wedges'
  | 'shadow-thief'
  | 'final-boss-panel';

export interface LandmarkTipSpec {
  groupId: LandmarkGroupId;
  number: number;
  title: string;
  subtitle: string;
  artistTip: string;
}

export const LANDMARK_ORDER: readonly LandmarkGroupId[] = [
  'c7',
  'sternum',
  'acromion',
  'asis',
  'trochanter',
  'olecranon',
  'patella',
  'malleolus',
];

export const LANDMARK_TIPS: Record<LandmarkGroupId, LandmarkTipSpec> = {
  c7: {
    groupId: 'c7',
    number: 1,
    title: 'C7 Vertebra',
    subtitle: 'Cervical Base Pivot',
    artistTip:
      'Anchors the neck cylinder onto the ribcage shelf; marks the true back centerline at the base of the neck.',
  },
  sternum: {
    groupId: 'sternum',
    number: 2,
    title: 'Sternum / Suprasternum Pit',
    subtitle: 'Gravity Plumb Origin',
    artistTip:
      'Drop your gravity plumb straight from this pit to test whether weight settles securely over a supporting foot.',
  },
  acromion: {
    groupId: 'acromion',
    number: 3,
    title: 'Acromion Process',
    subtitle: 'Clavicle Shoulder Lock',
    artistTip:
      'Subcutaneous bony shelf where collarbone meets deltoid — traces true upper shoulder tilt cleanly.',
  },
  asis: {
    groupId: 'asis',
    number: 4,
    title: 'ASIS (Anterior Iliac Spine)',
    subtitle: 'Pelvis Orientation Compass',
    artistTip:
      'Locks true pelvic tilt and rotation regardless of surface muscle or drapery volume.',
  },
  trochanter: {
    groupId: 'trochanter',
    number: 5,
    title: 'Greater Trochanter',
    subtitle: 'Hip Swing Axis',
    artistTip:
      'Sits lower and wider than the iliac crest, creating the unmistakable step-in on the outer hip silhouette.',
  },
  olecranon: {
    groupId: 'olecranon',
    number: 6,
    title: 'Olecranon Process',
    subtitle: 'Forearm Hinge Wedge',
    artistTip:
      'Builds a crisp triangular elbow wedge with wrist condyles so flexed arms never look like rubber tubes.',
  },
  patella: {
    groupId: 'patella',
    number: 7,
    title: 'Patella & Condyle Shelf',
    subtitle: 'Knee Lock & Direction',
    artistTip:
      'Points along femur torsion and sits directly above the patellar tendon rhythm toward the shin.',
  },
  malleolus: {
    groupId: 'malleolus',
    number: 8,
    title: 'Medial / Lateral Malleoli',
    subtitle: 'Ankle Asymmetric Lock',
    artistTip:
      'Inner ankle sits noticeably higher than outer ankle — use this asymmetry to plant feet onto ground planes.',
  },
};

export interface KineticObjectiveStatus {
  id: string;
  label: string;
  completed: boolean;
}

export interface KineticValidationResult {
  objectives: KineticObjectiveStatus[];
  completed: boolean;
  liveHint: string;
}

export interface KineticTelemetry {
  pad: PadStrokeTelemetry;
  modelId: MannequinModelId;
  showLineOfAction: boolean;
  showPlumbLine: boolean;
  showCrossContours: boolean;
  constructiveMode: ConstructiveMode;
  notanEnabled: boolean;
  padFlipHorizontal: boolean;
  xRayUsed: boolean;
  skeletonToggled: boolean;
  skeletonRevealed: boolean;
  placedPinCount: number;
  avgPinOffsetPx: number | null;
  handRDeltaY: number;
  visitedHandGestures: readonly HandGestureId[];
  savedStudyCount: number;
  exportedInModule: boolean;
}

export interface KineticStudioSetup {
  modelId: MannequinModelId;
  poseId: string;
  secondaryFigure?: {
    modelId: MannequinModelId;
    poseId: string;
    spawnOffset: [number, number, number];
  };
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
  compositionCrop: CompositionCropRatio;
  showLineOfAction: boolean;
  showPlumbLine: boolean;
  showCrossContours: boolean;
  showLandmarks: boolean;
  showLandmarkPins: boolean;
  initialHandGesture?: HandGestureId;
  cameraLookAt: {
    position: [number, number, number];
    target: [number, number, number];
  };
  focusBoneForCamera?: string;
}

export interface KineticPadSetup {
  /** 'adaptive' picks 50/50 Split on Tab S8/Desktop or Stacked on Phone; 'vellum' boots directly in Vellum Overlay. */
  layoutPreference: 'adaptive-split' | 'vellum';
  phoneFallback: PadLayoutMode;
  vellumOpacity: number;
  tool: PadToolId;
  color: string;
  layer: PadLayerId;
  landmarkPinMode: boolean;
}

export interface KineticModuleSpec {
  id: KineticModuleId;
  index: number;
  phaseTag: KineticPhaseTag;
  title: string;
  missionName: string;
  durationLabel: string;
  corePrinciple: string;
  studioSetup: KineticStudioSetup;
  padSetup: KineticPadSetup;
  evaluate: (t: KineticTelemetry) => KineticValidationResult;
}

export const KINETIC_MODULES: readonly KineticModuleSpec[] = [
  {
    id: 'pulse-gravity',
    index: 1,
    phaseTag: 'PULSE',
    title: 'Pulse & Gravity',
    missionName: 'The Balance Detective',
    durationLabel: '2 min',
    corePrinciple:
      'Capture the primary Force sweep before locking anatomy, then drop a strict vertical plumb line from the pit of the neck.',
    studioSetup: {
      modelId: 'female',
      poseId: 'action-lunge',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: { position: [0.5, 1.05, 5.5], target: [0, 0.96, 0] },
    },
    padSetup: {
      layoutPreference: 'vellum',
      phoneFallback: 'vellum',
      vellumOpacity: 0.3,
      tool: 'pencil',
      color: '#2E73B8',
      layer: 'construction',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const drewCurveAndLine =
        t.pad.countsByLayer.construction >= 2 &&
        t.pad.curvedStrokeCount >= 1 &&
        t.pad.straightLineCount >= 1;
      const revealedGuides = t.showLineOfAction && t.showPlumbLine;
      return {
        objectives: [
          {
            id: 'force-plumb-draw',
            label:
              'Draw 1 Force curve + hold-to-snap 1 straight Plumb Line on Construction',
            completed: drewCurveAndLine,
          },
          {
            id: 'reveal-guides',
            label: 'Reveal 3D Line of Action & Plumb Line to check support foot',
            completed: revealedGuides,
          },
        ],
        completed: drewCurveAndLine && revealedGuides,
        liveHint: `Curve ${t.pad.curvedStrokeCount} · Snap Line ${t.pad.straightLineCount} · Guides ${revealedGuides ? 'ON' : 'OFF'}`,
      };
    },
  },
  {
    id: 'warring-boxes',
    index: 2,
    phaseTag: 'BOX',
    title: 'The Warring Boxes',
    missionName: 'Twist the Torso',
    durationLabel: '3 min',
    corePrinciple:
      'Opposite lateral tilts and twists between the ribcage prism and pelvic keystone drive sculptural contrapposto torsion.',
    studioSetup: {
      modelId: 'female',
      poseId: 'discobolus',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: { position: [0.85, 1.12, 5.1], target: [0, 0.96, 0] },
    },
    padSetup: {
      layoutPreference: 'adaptive-split',
      phoneFallback: 'stacked',
      vellumOpacity: 0.35,
      tool: 'pencil',
      color: '#2E73B8',
      layer: 'construction',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const boxed = t.pad.countsByLayer.construction >= 4;
      const checked = t.xRayUsed;
      return {
        objectives: [
          {
            id: 'box-strokes',
            label: `Sketch ribcage, pelvis & tilt axes on Construction (${Math.min(4, t.pad.countsByLayer.construction)}/4)`,
            completed: boxed,
          },
          {
            id: 'xray-loomis',
            label: 'Trigger X-Ray Check (Loomis) to verify 3D box torsion',
            completed: checked,
          },
        ],
        completed: boxed && checked,
        liveHint: `Construction strokes: ${t.pad.countsByLayer.construction}/4 · X-Ray: ${checked ? 'Verified' : 'Pending'}`,
      };
    },
  },
  {
    id: 'eight-anchor-bones',
    index: 3,
    phaseTag: 'ANCHOR',
    title: 'The 8 Anchor Bones',
    missionName: 'X-Ray Sight',
    durationLabel: '3 min',
    corePrinciple:
      'Spot the 8 subcutaneous skeletal compass points directly from soft surface topography before X-raying the skeleton beneath.',
    studioSetup: {
      modelId: 'female',
      poseId: 'neutral-standing',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: true,
      cameraLookAt: { position: [0.75, 1.05, 5.05], target: [0, 0.98, 0] },
    },
    padSetup: {
      layoutPreference: 'vellum',
      phoneFallback: 'vellum',
      vellumOpacity: 0.65,
      tool: 'pencil',
      color: '#2E73B8',
      layer: 'construction',
      landmarkPinMode: true,
    },
    evaluate: (t) => {
      const pinsDone = t.placedPinCount >= 5;
      const revealed = t.skeletonRevealed;
      const scoreText =
        t.avgPinOffsetPx !== null
          ? `Avg Offset ${Math.round(t.avgPinOffsetPx)}px`
          : 'Tap surface landmarks';
      return {
        objectives: [
          {
            id: 'place-pins',
            label: `Tap surface to place 5+ of the 8 Anchor Pins (${Math.min(5, t.placedPinCount)}/5)`,
            completed: pinsDone,
          },
          {
            id: 'reveal-skeleton',
            label: 'Hit Reveal Skeleton to compare your pins to true 3D bones',
            completed: revealed && pinsDone,
          },
        ],
        completed: pinsDone && revealed,
        liveHint: `${t.placedPinCount}/5 Landmarks · ${revealed ? scoreText : 'Surface Sight Active'}`,
      };
    },
  },
  {
    id: 'perspective-coils',
    index: 4,
    phaseTag: 'WRAP',
    title: 'Perspective Coils',
    missionName: 'The Fisheye Punch',
    durationLabel: '3 min',
    corePrinciple:
      'Replace flattened contour outlines with overlapping cylindrical ellipses wrapping toward or away from extreme lens perspective.',
    studioSetup: {
      modelId: 'female',
      poseId: 'rising-uppercut',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: 'fisheye',
      lensCurvature: 0.8,
      lightingPreset: 'rembrandt',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: { position: [1.15, 1.38, 2.35], target: [0, 1.12, 0.1] },
    },
    padSetup: {
      layoutPreference: 'adaptive-split',
      phoneFallback: 'vellum',
      vellumOpacity: 0.35,
      tool: 'pencil',
      color: '#C94A38',
      layer: 'construction',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const drawn = t.pad.totalStrokes >= 5;
      const checked = t.showCrossContours || t.xRayUsed;
      return {
        objectives: [
          {
            id: 'coil-strokes',
            label: `Draw overlapping tapered cylinders & cross-contours (${Math.min(5, t.pad.totalStrokes)}/5)`,
            completed: drawn,
          },
          {
            id: 'contour-check',
            label: 'Toggle Cross-Contour Check to verify ellipse wrap direction',
            completed: checked,
          },
        ],
        completed: drawn && checked,
        liveHint: `Strokes: ${t.pad.totalStrokes}/5 · Cross-Contours: ${checked ? 'Visible' : 'Off'}`,
      };
    },
  },
  {
    id: 'muscle-envelopes',
    index: 5,
    phaseTag: 'WRAP',
    title: 'Muscle Envelopes',
    missionName: 'Origins in Motion',
    durationLabel: '3 min',
    corePrinciple:
      'Read deltoids and limb flexors as interlocking functional wraps spanning bony origin to insertion — pull an IK limb to watch form shift.',
    studioSetup: {
      modelId: 'female',
      poseId: 'neutral-standing',
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
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: { position: [0.45, 1.18, 4.9], target: [0, 1.1, 0] },
    },
    padSetup: {
      layoutPreference: 'adaptive-split',
      phoneFallback: 'stacked',
      vellumOpacity: 0.35,
      tool: 'ink',
      color: '#111317',
      layer: 'ink',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const raisedArm = t.handRDeltaY >= 0.35;
      const sketchedAndVerified =
        t.pad.countsByLayer.ink >= 3 && (t.skeletonToggled || t.modelId === 'skeleton');
      return {
        objectives: [
          {
            id: 'raise-ik-arm',
            label: 'Drag Right Hand IK orb overhead (deltaY >= 0.35m)',
            completed: raisedArm,
          },
          {
            id: 'ink-and-skeleton',
            label: 'Ink 3 deltoid capsule strokes on Layer 2 & toggle Skeleton',
            completed: sketchedAndVerified,
          },
        ],
        completed: raisedArm && sketchedAndVerified,
        liveHint: `Arm Lift +${t.handRDeltaY.toFixed(2)}m · Ink ${t.pad.countsByLayer.ink}/3 · Skeleton ${t.skeletonToggled || t.modelId === 'skeleton' ? 'Checked' : 'Pending'}`,
      };
    },
  },
  {
    id: 'hands-as-wedges',
    index: 6,
    phaseTag: 'BOX',
    title: 'Hands as Wedges',
    missionName: 'The 60-Second Hand Boss',
    durationLabel: '3 min',
    corePrinciple:
      'Reduce the hand to an asymmetrical palm keystone + opposing thumb bevel before grouping stepped finger knuckles.',
    studioSetup: {
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
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      initialHandGesture: 'fist',
      cameraLookAt: { position: [-0.25, 1.6, 1.9], target: [-0.45, 1.48, 0.35] },
      focusBoneForCamera: 'hand_r',
    },
    padSetup: {
      layoutPreference: 'adaptive-split',
      phoneFallback: 'stacked',
      vellumOpacity: 0.35,
      tool: 'pencil',
      color: '#2E73B8',
      layer: 'construction',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const boxed = t.pad.countsByLayer.construction >= 3;
      const swappedAndInked =
        (t.visitedHandGestures.includes('grab') ||
          t.visitedHandGestures.includes('pinch')) &&
        t.pad.countsByLayer.ink >= 1 &&
        t.xRayUsed;
      return {
        objectives: [
          {
            id: 'box-palm',
            label: `Box palm wedge & thumb triangle on Construction (${Math.min(3, t.pad.countsByLayer.construction)}/3)`,
            completed: boxed,
          },
          {
            id: 'gesture-ink-xray',
            label: 'Switch to Grab or Pinch, sketch on Ink & trigger X-Ray Check',
            completed: swappedAndInked,
          },
        ],
        completed: boxed && swappedAndInked,
        liveHint: `Construct ${t.pad.countsByLayer.construction}/3 · Ink ${t.pad.countsByLayer.ink}/1 · X-Ray ${t.xRayUsed ? 'Yes' : 'No'}`,
      };
    },
  },
  {
    id: 'shadow-thief',
    index: 7,
    phaseTag: 'CARVE',
    title: 'Shadow Thief',
    missionName: 'Two Values, Total Form',
    durationLabel: '3 min',
    corePrinciple:
      'Design light versus unified shadow as two interlocking abstract graphic shapes — flip horizontally often to catch value drift.',
    studioSetup: {
      modelId: 'female',
      poseId: 'contrapposto',
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: '1-point',
      lensCurvature: 0,
      lightingPreset: 'chiaroscuro',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      compositionCrop: 'off',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: { position: [0.55, 1.05, 5.45], target: [0, 0.98, 0] },
    },
    padSetup: {
      layoutPreference: 'adaptive-split',
      phoneFallback: 'stacked',
      vellumOpacity: 0.35,
      tool: 'charcoal',
      color: '#1B1D22',
      layer: 'value',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const valueMassed = t.pad.countsByLayer.value >= 3;
      const diagnosticChecked = t.notanEnabled && t.padFlipHorizontal;
      return {
        objectives: [
          {
            id: 'charcoal-value',
            label: `Block bold Charcoal shadow masses on Layer 3 Value (${Math.min(3, t.pad.countsByLayer.value)}/3)`,
            completed: valueMassed,
          },
          {
            id: 'notan-flip',
            label: 'Toggle both 2-Value Notan and Flip Horizontal (H)',
            completed: diagnosticChecked,
          },
        ],
        completed: valueMassed && diagnosticChecked,
        liveHint: `Value Strokes: ${t.pad.countsByLayer.value}/3 · Notan ${t.notanEnabled ? 'ON' : 'OFF'} · Flip H ${t.padFlipHorizontal ? 'ON' : 'OFF'}`,
      };
    },
  },
  {
    id: 'final-boss-panel',
    index: 8,
    phaseTag: 'MASTER',
    title: 'Final Boss: Comic Panel',
    missionName: 'Stage, Sketch, Ship',
    durationLabel: '5 min',
    corePrinciple:
      'Stage multiple figures inside a dramatic 4:5 Fisheye frame, layer construction + ink + value cleanly, and ship your finished study.',
    studioSetup: {
      modelId: 'female',
      poseId: 'superhero-landing',
      secondaryFigure: {
        modelId: 'mannequin-2',
        poseId: 'heroic-power-stance',
        spawnOffset: [0.95, 0, -0.35],
      },
      controlMode: 'fk',
      ikPinFeet: true,
      jointsDisplay: 'hidden',
      perspectiveMode: 'fisheye',
      lensCurvature: 0.6,
      lightingPreset: 'rim',
      notanEnabled: false,
      notanSplit: 0.5,
      constructiveMode: 'off',
      drawingStyle: 'off',
      compositionCrop: '4:5',
      showLineOfAction: false,
      showPlumbLine: false,
      showCrossContours: false,
      showLandmarks: false,
      showLandmarkPins: false,
      cameraLookAt: { position: [1.15, 0.95, 4.9], target: [0.35, 0.9, -0.1] },
    },
    padSetup: {
      layoutPreference: 'adaptive-split',
      phoneFallback: 'vellum',
      vellumOpacity: 0.35,
      tool: 'pencil',
      color: '#2E73B8',
      layer: 'construction',
      landmarkPinMode: false,
    },
    evaluate: (t) => {
      const multiLayer = t.pad.activeLayersDrawn.length >= 2;
      const shipped = t.savedStudyCount >= 1 || t.exportedInModule;
      return {
        objectives: [
          {
            id: 'multi-layer-panel',
            label: `Draw across 2+ Pad layers (${Math.min(2, t.pad.activeLayersDrawn.length)}/2 active)`,
            completed: multiLayer,
          },
          {
            id: 'save-or-export',
            label: 'Save to Study Gallery or Export (.PSD / .PNG / .SVG / Timelapse)',
            completed: shipped,
          },
        ],
        completed: multiLayer && shipped,
        liveHint: `Layers drawn: ${t.pad.activeLayersDrawn.length}/2 · Shipped: ${shipped ? 'Yes' : 'Pending'}`,
      };
    },
  },
];

const VALID_KINETIC_IDS = new Set<string>(KINETIC_MODULES.map((m) => m.id));

export function isKineticModuleId(val: unknown): val is KineticModuleId {
  return typeof val === 'string' && VALID_KINETIC_IDS.has(val);
}

export function getKineticModule(id: KineticModuleId): KineticModuleSpec {
  return (
    KINETIC_MODULES.find((m) => m.id === id) ?? KINETIC_MODULES[0]
  );
}

export function loadCompletedKineticModules(): KineticModuleId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KINETIC_SCHOOL_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isKineticModuleId);
  } catch {
    return [];
  }
}

export function saveCompletedKineticModules(
  completed: readonly KineticModuleId[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = Array.from(new Set(completed));
    window.localStorage.setItem(
      KINETIC_SCHOOL_STORAGE_KEY,
      JSON.stringify(unique)
    );
  } catch {
    // Ignore quota errors cleanly
  }
}
