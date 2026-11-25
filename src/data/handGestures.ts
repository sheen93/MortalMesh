import type { HandGestureId, HandSide, JointAngles } from '@/types/anatomy';

export interface HandGesturePreset {
  id: HandGestureId;
  label: string;
  shortLabel: string;
  description: string;
  /** Canonical left-side angles; buildHandGestureBones adapts signs for 'l' vs 'r'. */
  template: (side: HandSide) => Record<string, JointAngles>;
}

const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'] as const;

export function getHandFingerBoneNames(side: HandSide): string[] {
  const names: string[] = [];
  for (const finger of FINGER_NAMES) {
    names.push(`${finger}_01_${side}`, `${finger}_02_${side}`, `${finger}_03_${side}`);
  }
  names.push(`thumb_01_${side}`, `thumb_02_${side}`, `thumb_03_${side}`);
  return names;
}

function makeStandardHand(
  side: HandSide,
  cfg: {
    index: [number, number, number, number?]; // [j1x, j2x, j3x, j1z?]
    middle: [number, number, number, number?];
    ring: [number, number, number, number?];
    pinky: [number, number, number, number?];
    thumb: [number, number, number, number]; // [j1x, j1zSignBase, j2zSignBase, j3zSignBase]
  }
): Record<string, JointAngles> {
  const s = side === 'l' ? 1 : -1;
  return {
    [`index_01_${side}`]: { x: cfg.index[0], y: 0, z: s * (cfg.index[3] ?? 0) },
    [`index_02_${side}`]: { x: cfg.index[1], y: 0, z: 0 },
    [`index_03_${side}`]: { x: cfg.index[2], y: 0, z: 0 },

    [`middle_01_${side}`]: { x: cfg.middle[0], y: 0, z: s * (cfg.middle[3] ?? 0) },
    [`middle_02_${side}`]: { x: cfg.middle[1], y: 0, z: 0 },
    [`middle_03_${side}`]: { x: cfg.middle[2], y: 0, z: 0 },

    [`ring_01_${side}`]: { x: cfg.ring[0], y: 0, z: s * (cfg.ring[3] ?? 0) },
    [`ring_02_${side}`]: { x: cfg.ring[1], y: 0, z: 0 },
    [`ring_03_${side}`]: { x: cfg.ring[2], y: 0, z: 0 },

    [`pinky_01_${side}`]: { x: cfg.pinky[0], y: 0, z: s * (cfg.pinky[3] ?? 0) },
    [`pinky_02_${side}`]: { x: cfg.pinky[1], y: 0, z: 0 },
    [`pinky_03_${side}`]: { x: cfg.pinky[2], y: 0, z: 0 },

    [`thumb_01_${side}`]: { x: cfg.thumb[0], y: 0, z: s * cfg.thumb[1] },
    [`thumb_02_${side}`]: { x: 0, y: 0, z: s * cfg.thumb[2] },
    [`thumb_03_${side}`]: { x: 0, y: 0, z: s * cfg.thumb[3] },
  };
}

export const HAND_GESTURES: ReadonlyArray<HandGesturePreset> = [
  {
    id: 'relaxed',
    label: 'Relaxed',
    shortLabel: 'Relaxed',
    description: 'Natural resting finger cascade',
    template: (side) =>
      makeStandardHand(side, {
        index: [18, 26, 18, 0],
        middle: [22, 30, 22, 0],
        ring: [26, 34, 24, 0],
        pinky: [30, 38, 26, 0],
        thumb: [12, 16, 18, 14],
      }),
  },
  {
    id: 'open',
    label: 'Open Palm',
    shortLabel: 'Open',
    description: 'Cleanly extended neutral open hand',
    template: (side) =>
      makeStandardHand(side, {
        index: [-2, 2, 0, 4],
        middle: [-2, 2, 0, 0],
        ring: [0, 4, 2, -3],
        pinky: [2, 5, 3, -6],
        thumb: [-10, -12, 4, 2],
      }),
  },
  {
    id: 'spread',
    label: 'Wide Spread',
    shortLabel: 'Spread',
    description: 'Fingers widely splayed outward',
    template: (side) =>
      makeStandardHand(side, {
        index: [-6, 2, 0, 16],
        middle: [-6, 2, 0, 2],
        ring: [-4, 3, 2, -9],
        pinky: [-2, 4, 2, -18],
        thumb: [-28, -24, -6, -4],
      }),
  },
  {
    id: 'fist',
    label: 'Closed Fist',
    shortLabel: 'Fist',
    description: 'Tightly clenched punching fist',
    template: (side) =>
      makeStandardHand(side, {
        index: [82, 94, 76, 0],
        middle: [85, 96, 78, 0],
        ring: [86, 96, 78, 0],
        pinky: [84, 94, 74, 0],
        thumb: [38, 42, 54, 38],
      }),
  },
  {
    id: 'grab',
    label: 'Power Grab',
    shortLabel: 'Grab',
    description: 'Curved claw / wide object grab',
    template: (side) =>
      makeStandardHand(side, {
        index: [42, 52, 36, 5],
        middle: [45, 56, 38, 0],
        ring: [48, 58, 40, -4],
        pinky: [50, 58, 38, -8],
        thumb: [26, 28, 32, 24],
      }),
  },
  {
    id: 'hold',
    label: 'Staff Hold',
    shortLabel: 'Hold',
    description: 'Cylindrical prop / weapon grip',
    template: (side) =>
      makeStandardHand(side, {
        index: [58, 68, 48, 0],
        middle: [62, 72, 52, 0],
        ring: [65, 75, 55, 0],
        pinky: [66, 74, 52, 0],
        thumb: [30, 34, 42, 28],
      }),
  },
  {
    id: 'point',
    label: 'Index Point',
    shortLabel: 'Point',
    description: 'Index finger extended, others curled',
    template: (side) =>
      makeStandardHand(side, {
        index: [2, 4, 2, 0],
        middle: [84, 94, 74, 0],
        ring: [86, 96, 76, 0],
        pinky: [84, 94, 72, 0],
        thumb: [34, 38, 46, 32],
      }),
  },
  {
    id: 'peace',
    label: 'Peace Sign',
    shortLabel: 'Peace',
    description: 'Index & middle extended in a V',
    template: (side) =>
      makeStandardHand(side, {
        index: [0, 4, 2, 14],
        middle: [2, 5, 2, -11],
        ring: [85, 94, 74, 0],
        pinky: [84, 92, 72, 0],
        thumb: [36, 40, 48, 34],
      }),
  },
  {
    id: 'rock',
    label: 'Rock / Horns',
    shortLabel: 'Rock',
    description: 'Index & pinky extended, middle/ring curled',
    template: (side) =>
      makeStandardHand(side, {
        index: [0, 4, 2, 10],
        middle: [86, 96, 78, 0],
        ring: [86, 96, 78, 0],
        pinky: [2, 6, 3, -12],
        thumb: [36, 42, 48, 34],
      }),
  },
  {
    id: 'middle-finger',
    label: 'Middle Finger',
    shortLabel: 'Middle',
    description: 'Middle finger raised, others curled',
    template: (side) =>
      makeStandardHand(side, {
        index: [84, 94, 74, 0],
        middle: [-2, 3, 0, 0],
        ring: [86, 96, 76, 0],
        pinky: [84, 94, 74, 0],
        thumb: [36, 40, 48, 34],
      }),
  },
  {
    id: 'thumbs-up',
    label: 'Thumbs Up',
    shortLabel: 'Thumb Up',
    description: 'Closed fist with thumb extended upward',
    template: (side) =>
      makeStandardHand(side, {
        index: [82, 94, 76, 0],
        middle: [85, 96, 78, 0],
        ring: [86, 96, 78, 0],
        pinky: [84, 94, 74, 0],
        thumb: [-30, -22, -8, -6],
      }),
  },
  {
    id: 'pinch',
    label: 'Delicate Pinch',
    shortLabel: 'Pinch',
    description: 'Thumb and index tips meet cleanly',
    template: (side) =>
      makeStandardHand(side, {
        index: [45, 45, 30, 8],
        middle: [20, 28, 18, 0],
        ring: [26, 34, 22, -4],
        pinky: [32, 40, 26, -8],
        thumb: [20, -15, 15, 30],
      }),
  },
];

export const HAND_GESTURE_BY_ID: Record<HandGestureId, HandGesturePreset> =
  Object.fromEntries(HAND_GESTURES.map((g) => [g.id, g])) as Record<
    HandGestureId,
    HandGesturePreset
  >;

export function buildHandGestureBones(
  side: HandSide,
  gestureId: HandGestureId
): Record<string, JointAngles> {
  return HAND_GESTURE_BY_ID[gestureId].template(side);
}

/**
 * Checks whether all 15 finger bones on `side` match one of the 12 calibrated
 * gestures within `toleranceDeg` (default 3°).
 */
export function detectMatchingHandGesture(
  side: HandSide,
  readBoneAngles: (boneName: string) => JointAngles | null,
  toleranceDeg = 3.5
): HandGestureId | null {
  const boneNames = getHandFingerBoneNames(side);
  const current: Record<string, JointAngles> = {};
  for (const name of boneNames) {
    const a = readBoneAngles(name);
    if (!a) return null;
    current[name] = a;
  }

  for (const gesture of HAND_GESTURES) {
    const target = gesture.template(side);
    let matches = true;
    for (const name of boneNames) {
      const a = current[name];
      const b = target[name];
      if (
        Math.abs(a.x - b.x) > toleranceDeg ||
        Math.abs(a.y - b.y) > toleranceDeg ||
        Math.abs(a.z - b.z) > toleranceDeg
      ) {
        matches = false;
        break;
      }
    }
    if (matches) return gesture.id;
  }

  return null;
}
