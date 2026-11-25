import * as THREE from 'three';
import type { JointAngles } from '@/types/anatomy';

export type AnatomicalAxisLabel = 'Bend' | 'Side' | 'Twist';

export interface JointAxisSpec {
  label: AnatomicalAxisLabel;
  min: number;
  max: number;
}

export interface JointSpec {
  label: string;
  order: THREE.EulerOrder;
  showX: boolean;
  showY: boolean;
  showZ: boolean;
  axes: {
    x: JointAxisSpec;
    y: JointAxisSpec;
    z: JointAxisSpec;
  };
}

function makeSpec(
  label: string,
  order: THREE.EulerOrder,
  showX: boolean,
  showY: boolean,
  showZ: boolean,
  x: JointAxisSpec,
  y: JointAxisSpec,
  z: JointAxisSpec
): JointSpec {
  return {
    label,
    order,
    showX,
    showY,
    showZ,
    axes: { x, y, z },
  };
}

const LOCKED_TWIST: JointAxisSpec = { label: 'Twist', min: 0, max: 0 };
const LOCKED_SIDE: JointAxisSpec = { label: 'Side', min: 0, max: 0 };

function createSpineSpec(label: string): JointSpec {
  return makeSpec(
    label,
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -25, max: 30 },
    { label: 'Twist', min: -30, max: 30 },
    { label: 'Side', min: -20, max: 20 }
  );
}

function createFingerClusterSpecs(
  side: 'l' | 'r',
  sideLabel: 'Left' | 'Right'
): Record<string, JointSpec> {
  const specs: Record<string, JointSpec> = {};
  const fingers = [
    { key: 'index', name: 'Index' },
    { key: 'middle', name: 'Middle' },
    { key: 'ring', name: 'Ring' },
    { key: 'pinky', name: 'Pinky' },
  ] as const;

  for (const finger of fingers) {
    specs[`${finger.key}_01_${side}`] = makeSpec(
      `${sideLabel} ${finger.name} Base`,
      'XYZ',
      true,
      false,
      true,
      { label: 'Bend', min: -15, max: 90 },
      LOCKED_TWIST,
      { label: 'Side', min: -20, max: 20 }
    );
    specs[`${finger.key}_02_${side}`] = makeSpec(
      `${sideLabel} ${finger.name} Mid`,
      'XYZ',
      true,
      false,
      false,
      { label: 'Bend', min: 0, max: 100 },
      LOCKED_TWIST,
      LOCKED_SIDE
    );
    specs[`${finger.key}_03_${side}`] = makeSpec(
      `${sideLabel} ${finger.name} Tip`,
      'XYZ',
      true,
      false,
      false,
      { label: 'Bend', min: 0, max: 80 },
      LOCKED_TWIST,
      LOCKED_SIDE
    );
  }

  const thumbTwistBase: JointAxisSpec =
    side === 'l'
      ? { label: 'Twist', min: -35, max: 55 }
      : { label: 'Twist', min: -55, max: 35 };

  specs[`thumb_01_${side}`] = makeSpec(
    `${sideLabel} Thumb Base`,
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -45, max: 75 },
    thumbTwistBase,
    { label: 'Side', min: -45, max: 45 }
  );
  specs[`thumb_02_${side}`] = makeSpec(
    `${sideLabel} Thumb Mid`,
    'XYZ',
    true,
    false,
    false,
    { label: 'Bend', min: -15, max: 80 },
    LOCKED_TWIST,
    LOCKED_SIDE
  );
  specs[`thumb_03_${side}`] = makeSpec(
    `${sideLabel} Thumb Tip`,
    'XYZ',
    true,
    false,
    false,
    { label: 'Bend', min: -20, max: 85 },
    LOCKED_TWIST,
    LOCKED_SIDE
  );

  return specs;
}

export const JOINT_LIMITS: Record<string, JointSpec> = {
  pelvis: makeSpec(
    'Pelvis',
    'YZX',
    true,
    true,
    true,
    { label: 'Bend', min: -180, max: 180 },
    { label: 'Twist', min: -180, max: 180 },
    { label: 'Side', min: -180, max: 180 }
  ),
  spine_01: createSpineSpec('Lower Spine'),
  spine_02: createSpineSpec('Mid Spine'),
  spine_03: createSpineSpec('Upper Spine / Chest'),
  neck_01: makeSpec(
    'Neck',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -35, max: 40 },
    { label: 'Twist', min: -45, max: 45 },
    { label: 'Side', min: -25, max: 25 }
  ),
  Head: makeSpec(
    'Head',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -30, max: 35 },
    { label: 'Twist', min: -45, max: 45 },
    { label: 'Side', min: -25, max: 25 }
  ),
  clavicle_l: makeSpec(
    'Left Clavicle',
    'XYZ',
    true,
    false,
    true,
    { label: 'Bend', min: -15, max: 30 },
    LOCKED_TWIST,
    { label: 'Side', min: -20, max: 20 }
  ),
  clavicle_r: makeSpec(
    'Right Clavicle',
    'XYZ',
    true,
    false,
    true,
    { label: 'Bend', min: -15, max: 30 },
    LOCKED_TWIST,
    { label: 'Side', min: -20, max: 20 }
  ),
  upperarm_l: makeSpec(
    'Left Upper Arm',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -60, max: 140 },
    { label: 'Twist', min: -100, max: 100 },
    { label: 'Side', min: -95, max: 95 }
  ),
  upperarm_r: makeSpec(
    'Right Upper Arm',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -60, max: 140 },
    { label: 'Twist', min: -100, max: 100 },
    { label: 'Side', min: -95, max: 95 }
  ),
  lowerarm_l: makeSpec(
    'Left Forearm',
    'XYZ',
    true,
    true,
    false,
    { label: 'Bend', min: 0, max: 145 },
    { label: 'Twist', min: -80, max: 85 },
    LOCKED_SIDE
  ),
  lowerarm_r: makeSpec(
    'Right Forearm',
    'XYZ',
    true,
    true,
    false,
    { label: 'Bend', min: 0, max: 145 },
    { label: 'Twist', min: -85, max: 80 },
    LOCKED_SIDE
  ),
  hand_l: makeSpec(
    'Left Wrist / Hand',
    'XYZ',
    true,
    false,
    true,
    { label: 'Side', min: -35, max: 25 },
    LOCKED_TWIST,
    { label: 'Bend', min: -85, max: 85 }
  ),
  hand_r: makeSpec(
    'Right Wrist / Hand',
    'XYZ',
    true,
    false,
    true,
    { label: 'Side', min: -35, max: 25 },
    LOCKED_TWIST,
    { label: 'Bend', min: -85, max: 85 }
  ),
  thigh_l: makeSpec(
    'Left Thigh',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -135, max: 45 },
    { label: 'Twist', min: -65, max: 65 },
    { label: 'Side', min: -75, max: 25 }
  ),
  thigh_r: makeSpec(
    'Right Thigh',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -135, max: 45 },
    { label: 'Twist', min: -65, max: 65 },
    { label: 'Side', min: -25, max: 75 }
  ),
  calf_l: makeSpec(
    'Left Knee / Shin',
    'XYZ',
    true,
    false,
    false,
    { label: 'Bend', min: 0, max: 148 },
    LOCKED_TWIST,
    LOCKED_SIDE
  ),
  calf_r: makeSpec(
    'Right Knee / Shin',
    'XYZ',
    true,
    false,
    false,
    { label: 'Bend', min: 0, max: 148 },
    LOCKED_TWIST,
    LOCKED_SIDE
  ),
  foot_l: makeSpec(
    'Left Ankle / Foot',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -45, max: 65 },
    { label: 'Twist', min: -25, max: 25 },
    { label: 'Side', min: -20, max: 20 }
  ),
  foot_r: makeSpec(
    'Right Ankle / Foot',
    'XYZ',
    true,
    true,
    true,
    { label: 'Bend', min: -45, max: 65 },
    { label: 'Twist', min: -25, max: 25 },
    { label: 'Side', min: -20, max: 20 }
  ),
  ball_l: makeSpec(
    'Left Toes',
    'XYZ',
    true,
    false,
    false,
    { label: 'Bend', min: -35, max: 65 },
    LOCKED_TWIST,
    LOCKED_SIDE
  ),
  ball_r: makeSpec(
    'Right Toes',
    'XYZ',
    true,
    false,
    false,
    { label: 'Bend', min: -35, max: 65 },
    LOCKED_TWIST,
    LOCKED_SIDE
  ),
  ...createFingerClusterSpecs('l', 'Left'),
  ...createFingerClusterSpecs('r', 'Right'),
};

export function getJointSpec(boneName: string): JointSpec {
  return (
    JOINT_LIMITS[boneName] ??
    makeSpec(
      boneName,
      'XYZ',
      true,
      true,
      true,
      { label: 'Bend', min: -180, max: 180 },
      { label: 'Twist', min: -180, max: 180 },
      { label: 'Side', min: -180, max: 180 }
    )
  );
}

function clampDeg(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampJointAngles(
  angles: JointAngles,
  spec: JointSpec,
  enabled: boolean
): JointAngles {
  if (!enabled) {
    return {
      x: clampDeg(angles.x, -180, 180),
      y: clampDeg(angles.y, -180, 180),
      z: clampDeg(angles.z, -180, 180),
    };
  }

  return {
    x: spec.showX ? clampDeg(angles.x, spec.axes.x.min, spec.axes.x.max) : 0,
    y: spec.showY ? clampDeg(angles.y, spec.axes.y.min, spec.axes.y.max) : 0,
    z: spec.showZ ? clampDeg(angles.z, spec.axes.z.min, spec.axes.z.max) : 0,
  };
}
