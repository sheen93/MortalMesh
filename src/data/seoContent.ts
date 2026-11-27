import {
  HAND_GESTURES,
  type HandGesturePreset,
} from '@/data/handGestures';
import {
  POSE_CATEGORIES,
  POSE_PRESETS,
  type PoseCategory,
  type PosePreset,
} from '@/data/poses';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mortal-mesh.vercel.app'
).replace(/\/$/, '');

export interface PoseSeoGuide {
  weightAndBalance: string;
  lineOfAction: string;
  foreshorteningTip: string;
  constructionSteps: string[];
  categoryLabel: string;
  related: PosePreset[];
}

const CATEGORY_NOTES: Record<
  PoseCategory,
  {
    balance: string;
    rhythm: string;
    camera: string;
  }
> = {
  foundation: {
    balance:
      'Weight drops straight down the skeletal column; establish the level horizontal cross-lines through shoulders and iliac crests before adding contours.',
    rhythm:
      'Focus on clean symmetrical or slightly eased bilateral alignment along the vertical centerline.',
    camera:
      'Best studied from clean 1-point elevation or slight 15° turns to verify head-to-body proportions.',
  },
  classical: {
    balance:
      'Classical weight shift places the sternal pit directly over the supporting foot while the passive leg trails behind on the ball or toe.',
    rhythm:
      'Built on classic contrapposto opposition: as the pelvis tilts toward the relaxed leg, the ribcage counters toward the engaged side.',
    camera:
      'Orbit between eye-level front and back-three-quarter views to inspect the S-curve flowing from sternum through navel to medial ankle.',
  },
  action: {
    balance:
      'Center of mass leads the base of support to convey momentum — diagonals carry the illusion of forward impulse and recoil.',
    rhythm:
      'Connect the highest extended limb down through the sweeping ribcage arc to the driving rear heel in one continuous C- or S-curve.',
    camera:
      'Test a low 3-point worm’s-eye view or moderate Fisheye lens in Mortal Mesh to amplify foreshortened limbs rushing toward the viewer.',
  },
  combat: {
    balance:
      'Wide staggered triangle base lowers the pelvis and widens the footprint so punches, blocks, and kicks stay mechanically grounded.',
    rhythm:
      'Look for sharp coiled torsion between the pelvis box and the shoulder girder along the obliques.',
    camera:
      'Inspect in 3/4 rim lighting and 2-Value Notan mode to sharpen readable martial silhouettes.',
  },
  dance: {
    balance:
      'Extreme extension demands razor balance directly over a small plantar contact footprint or stacked arms.',
    rhythm:
      'Emphasize continuous radial arcs across stretched extremities and clean negative space silhouettes beneath the torso.',
    camera:
      'Rotate horizontally around the horizon axis to catch overlapping cross-contours on lifted limbs.',
  },
  gesture: {
    balance:
      'Upper-body tilt and seated weight rest through the ischial tuberosities or asymmetrical arm props rather than symmetric heels.',
    rhythm:
      'Secondary curves in the neck and forearms echo the primary emotion and carry viewer gaze into the hands and silhouette.',
    camera:
      'Use Blue-Pencil / Constructive Overlay to block the head sphere, ribcage egg, and hand wedges first.',
  },
};

export function getCategoryLabel(category: PoseCategory): string {
  return (
    POSE_CATEGORIES.find((c) => c.id === category)?.fullLabel ?? category
  );
}

export function getPoseSeoGuide(preset: PosePreset): PoseSeoGuide {
  const catNote = CATEGORY_NOTES[preset.category];
  const isAerial = !preset.groundSnap && preset.elevationY > 0;

  const weightAndBalance = isAerial
    ? `Airborne dynamic suspension (${preset.elevationY.toFixed(2)}m elevation): anchor your visual rhythm around the ribcage torsion and trailing limbs rather than a floor plumb point.`
    : catNote.balance;

  const related = POSE_PRESETS.filter(
    (p) => p.category === preset.category && p.id !== preset.id
  ).slice(0, 4);

  return {
    weightAndBalance,
    lineOfAction: `${catNote.rhythm} Primary cue: ${preset.description}.`,
    foreshorteningTip: catNote.camera,
    constructionSteps: [
      'Block the Cranium oval + Loomis jawline tilt and establish eye-line perspective before placing neck cylinders.',
      'Lock the ribcage prism against the pelvic keystone in opposing tilts (Three Masses) and drop the gravity plumb line.',
      'Sight cross-contour ellipses along the humerus and femur segments to measure overlapping depth shifts.',
      'Toggle 2-Value Notan or Skeleton Mode inside the 3D Studio to double-check anatomical joints before final line work.',
    ],
    categoryLabel: getCategoryLabel(preset.category),
    related,
  };
}

export interface HandSeoGuide {
  palmWedgeTip: string;
  knuckleArcTip: string;
  thumbOppositionTip: string;
  related: HandGesturePreset[];
}

const HAND_NOTES: Record<
  string,
  { palm: string; knuckle: string; thumb: string }
> = {
  fist: {
    palm: 'Treat the fist as one cohesive bevel-edged rectangular block before separating the four finger steps.',
    knuckle: 'Index MCP stands highest and steps down cleanly toward the pinky along a curved saddle arc.',
    thumb: 'The thumb locks obliquely across the flexed index and middle proximal phalanges like a latch.',
  },
  open: {
    palm: 'Start with a flat pentagonal keystone widening slightly at the MCP knuckle bridge.',
    knuckle: 'Arrange fingertips along an elliptical bell curve peaking at the middle finger.',
    thumb: 'First metacarpal projects laterally at ~40° forward of the palm plane rather than flat sideways.',
  },
  spread: {
    palm: 'Stretch between web spaces exposes the radial tendon rays converging back toward the wrist.',
    knuckle: 'Fingers fan outward along radial spokes centered near the capitate bone of the wrist.',
    thumb: 'Full abduction pulls the thenar eminence taut into a clean triangular silhouette.',
  },
  pinch: {
    palm: 'Compress the index and thumb into a crisp opposing O-ring caliper shape against relaxed trailing fingers.',
    knuckle: 'Trailing middle, ring, and pinky fingers step progressively lower to keep rhythm uncluttered.',
    thumb: 'Carpometacarpal rotation swings the thumb pad forward perpendicular to the palm plane.',
  },
};

export function getHandSeoGuide(gesture: HandGesturePreset): HandSeoGuide {
  const specific = HAND_NOTES[gesture.id];
  const related = HAND_GESTURES.filter((g) => g.id !== gesture.id).slice(0, 4);

  return {
    palmWedgeTip:
      specific?.palm ??
      `Simplify the palm into a tapered trapezoid wedge (${gesture.description.toLowerCase()}) before placing cylindrical finger links.`,
    knuckleArcTip:
      specific?.knuckle ??
      'Track the curved MCP-to-PIP knuckle arches across the fingers — adjacent knuckles never line up on a rigid straight ruler.',
    thumbOppositionTip:
      specific?.thumb ??
      'Seat the thumb on the angled thenar cone forward of the palm box so opposition reads convincingly in 3/4 views.',
    related,
  };
}
