import * as THREE from 'three';
import { getJointSpec, type JointSpec } from '@/data/jointLimits';
import type { MannequinModelId } from '@/data/modelCatalog';
import {
  clampFigureProportions,
  DEFAULT_FIGURE_PROPORTIONS,
  isDefaultProportions,
} from '@/data/proportions';
import { CANONICAL_REST_LOCAL_QUATS, CANONICAL_REST_WORLD_QUATS } from '@/rig/canonicalReference';
import {
  POSEABLE_BONE_NAMES,
  type FigureProportions,
  type JointAngles,
} from '@/types/anatomy';
import type { QuaternionTuple } from '@/types/poseIO';

interface NativeChainMapping {
  primary: string;
  followers?: readonly string[];
}

export interface BoundChainBone {
  bone: THREE.Bone;
  tPoseLocalQuat: THREE.Quaternion;
  alignQuat: THREE.Quaternion;
  alignQuatInv: THREE.Quaternion;
  weight: number;
}

export interface BoundCanonicalJoint {
  canonicalName: string;
  primary: BoundChainBone;
  segments: readonly BoundChainBone[];
}

interface ProportionBoneEntry {
  canonicalName: string;
  bone: THREE.Bone;
  depth: number;
  restLocalScale: THREE.Vector3;
  restAxisWorldLen: [number, number, number];
  longAxis: 0 | 1 | 2;
  latAxis: 0 | 1 | 2;
  depthAxis: 0 | 1 | 2;
}

const LOCAL_AXIS_VECTORS: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

function computeBoneDepth(
  bone: THREE.Object3D,
  rootScene: THREE.Object3D
): number {
  let depth = 0;
  let curr: THREE.Object3D | null = bone;
  while (curr && curr !== rootScene && depth < 128) {
    curr = curr.parent;
    depth += 1;
  }
  return depth;
}

function getCanonicalTPoseWorldAxes(canonicalName: string): {
  longDir: THREE.Vector3;
  latDir: THREE.Vector3;
} {
  const isArm =
    canonicalName.startsWith('clavicle_') ||
    canonicalName.startsWith('upperarm_') ||
    canonicalName.startsWith('lowerarm_') ||
    canonicalName.startsWith('hand_') ||
    canonicalName.startsWith('thumb_') ||
    canonicalName.startsWith('index_') ||
    canonicalName.startsWith('middle_') ||
    canonicalName.startsWith('ring_') ||
    canonicalName.startsWith('pinky_');

  if (isArm) {
    const sign = canonicalName.endsWith('_r') ? -1 : 1;
    return {
      longDir: new THREE.Vector3(sign, 0, 0),
      latDir: new THREE.Vector3(0, 1, 0),
    };
  }
  return {
    longDir: new THREE.Vector3(0, 1, 0),
    latDir: new THREE.Vector3(1, 0, 0),
  };
}

function getDesiredWorldScaleForJoint(
  canonicalName: string,
  p: FigureProportions
): { long: number; lat: number; depth: number } {
  switch (canonicalName) {
    case 'pelvis':
      return {
        lat: p.hipWidth,
        long: 1,
        depth: 1 + (p.hipWidth - 1) * 0.3,
      };
    case 'spine_01':
      return {
        lat: 1 + (p.hipWidth - 1) * 0.25,
        long: p.torsoLength,
        depth: 1,
      };
    case 'spine_02':
      return {
        lat: 1 + (p.shoulderWidth - 1) * 0.45,
        long: p.torsoLength,
        depth: 1 + (p.shoulderWidth - 1) * 0.15,
      };
    case 'spine_03':
      return {
        lat: p.shoulderWidth,
        long: p.torsoLength,
        depth: 1 + (p.shoulderWidth - 1) * 0.25,
      };
    case 'neck_01':
      return {
        lat: 1,
        long: 1 + (p.torsoLength - 1) * 0.25,
        depth: 1,
      };
    case 'Head':
      return {
        lat: p.headScale,
        long: p.headScale,
        depth: p.headScale,
      };
    case 'clavicle_l':
    case 'clavicle_r':
      return {
        lat: 1,
        long: p.shoulderWidth,
        depth: 1,
      };
    case 'upperarm_l':
    case 'upperarm_r':
    case 'lowerarm_l':
    case 'lowerarm_r':
      return {
        lat: 1,
        long: p.limbLength,
        depth: 1,
      };
    case 'thigh_l':
    case 'thigh_r':
      return {
        lat: 1 + (p.hipWidth - 1) * 0.25,
        long: p.limbLength,
        depth: 1 + (p.hipWidth - 1) * 0.15,
      };
    case 'calf_l':
    case 'calf_r':
      return {
        lat: 1,
        long: p.limbLength,
        depth: 1,
      };
    default:
      // Compensate hands, feet, toes, and fingers back to unstretched proportions.
      return { lat: 1, long: 1, depth: 1 };
  }
}

const IDENTITY_QUAT = new THREE.Quaternion();
const _wPosA = new THREE.Vector3();
const _wPosB = new THREE.Vector3();
const _wPosC = new THREE.Vector3();
const _wQuat = new THREE.Quaternion();
const _pQuat = new THREE.Quaternion();
const _deltaQuat = new THREE.Quaternion();
const _canonDeltaQuat = new THREE.Quaternion();
const _fracDeltaQuat = new THREE.Quaternion();
const _nativeDeltaQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();

const CLASSIC_MAPPING: Record<string, NativeChainMapping> = Object.fromEntries(
  POSEABLE_BONE_NAMES.map((name) => [name, { primary: name }])
);

const MANNEQUIN_2_MAPPING: Record<string, NativeChainMapping> = {
  pelvis: { primary: 'Bip001 Pelvis_04' },
  spine_01: { primary: 'Bip001 Spine_05' },
  // Biped uses 2 spine segments; spine_02 preset delta is folded into spine_01 + spine_03.
  spine_03: { primary: 'Bip001 Spine1_06' },
  neck_01: { primary: 'Bip001 Neck_07' },
  Head: { primary: 'Bip001 Head_00' },

  clavicle_l: { primary: 'Bip001 L Clavicle_08' },
  upperarm_l: { primary: 'Bip001 L UpperArm_09' },
  lowerarm_l: { primary: 'Bip001 L Forearm_010' },
  hand_l: { primary: 'Bip001 L Hand_011' },
  thumb_01_l: { primary: 'Bip001 L Finger0_012' },
  thumb_02_l: { primary: 'Bip001 L Finger01_013' },
  thumb_03_l: { primary: 'Bip001 L Finger02_014' },
  index_01_l: { primary: 'Bip001 L Finger1_015' },
  index_02_l: { primary: 'Bip001 L Finger11_016' },
  index_03_l: { primary: 'Bip001 L Finger12_017' },
  middle_01_l: { primary: 'Bip001 L Finger2_018' },
  middle_02_l: { primary: 'Bip001 L Finger21_019' },
  middle_03_l: { primary: 'Bip001 L Finger22_020' },
  ring_01_l: { primary: 'Bip001 L Finger3_021' },
  ring_02_l: { primary: 'Bip001 L Finger31_022' },
  ring_03_l: { primary: 'Bip001 L Finger32_023' },
  pinky_01_l: { primary: 'Bip001 L Finger4_024' },
  pinky_02_l: { primary: 'Bip001 L Finger41_025' },
  pinky_03_l: { primary: 'Bip001 L Finger42_026' },

  clavicle_r: { primary: 'Bip001 R Clavicle_027' },
  upperarm_r: { primary: 'Bip001 R UpperArm_028' },
  lowerarm_r: { primary: 'Bip001 R Forearm_029' },
  hand_r: { primary: 'Bip001 R Hand_030' },
  thumb_01_r: { primary: 'Bip001 R Finger0_031' },
  thumb_02_r: { primary: 'Bip001 R Finger01_032' },
  thumb_03_r: { primary: 'Bip001 R Finger02_033' },
  index_01_r: { primary: 'Bip001 R Finger1_034' },
  index_02_r: { primary: 'Bip001 R Finger11_035' },
  index_03_r: { primary: 'Bip001 R Finger12_036' },
  middle_01_r: { primary: 'Bip001 R Finger2_037' },
  middle_02_r: { primary: 'Bip001 R Finger21_038' },
  middle_03_r: { primary: 'Bip001 R Finger22_039' },
  ring_01_r: { primary: 'Bip001 R Finger3_040' },
  ring_02_r: { primary: 'Bip001 R Finger31_041' },
  ring_03_r: { primary: 'Bip001 R Finger32_042' },
  pinky_01_r: { primary: 'Bip001 R Finger4_043' },
  pinky_02_r: { primary: 'Bip001 R Finger41_044' },
  pinky_03_r: { primary: 'Bip001 R Finger42_045' },

  thigh_l: { primary: 'Bip001 L Thigh_046' },
  calf_l: { primary: 'Bip001 L Calf_047' },
  foot_l: { primary: 'Bip001 L Foot_048' },
  ball_l: { primary: 'Bip001 L Toe0_049' },

  thigh_r: { primary: 'Bip001 R Thigh_050' },
  calf_r: { primary: 'Bip001 R Calf_051' },
  foot_r: { primary: 'Bip001 R Foot_052' },
  ball_r: { primary: 'Bip001 R Toe0_053' },
};

const MANNEQUIN_3_MAPPING: Record<string, NativeChainMapping> = {
  pelvis: { primary: 'mixamorig1:Hips_01' },
  spine_01: { primary: 'mixamorig1:Spine_02' },
  spine_02: { primary: 'mixamorig1:Spine1_03' },
  spine_03: { primary: 'mixamorig1:Spine2_04' },
  neck_01: { primary: 'mixamorig1:Neck_05' },
  Head: { primary: 'mixamorig1:Head_06' },

  clavicle_l: { primary: 'mixamorig1:LeftShoulder_08' },
  upperarm_l: { primary: 'mixamorig1:LeftArm_09' },
  lowerarm_l: { primary: 'mixamorig1:LeftForeArm_010' },
  hand_l: { primary: 'mixamorig1:LeftHand_011' },
  thumb_01_l: { primary: 'mixamorig1:LeftHandThumb1_012' },
  thumb_02_l: { primary: 'mixamorig1:LeftHandThumb2_013' },
  thumb_03_l: { primary: 'mixamorig1:LeftHandThumb3_014' },
  index_01_l: { primary: 'mixamorig1:LeftHandIndex1_016' },
  index_02_l: { primary: 'mixamorig1:LeftHandIndex2_017' },
  index_03_l: { primary: 'mixamorig1:LeftHandIndex3_018' },
  middle_01_l: { primary: 'mixamorig1:LeftHandMiddle1_020' },
  middle_02_l: { primary: 'mixamorig1:LeftHandMiddle2_021' },
  middle_03_l: { primary: 'mixamorig1:LeftHandMiddle3_022' },
  ring_01_l: { primary: 'mixamorig1:LeftHandRing1_024' },
  ring_02_l: { primary: 'mixamorig1:LeftHandRing2_025' },
  ring_03_l: { primary: 'mixamorig1:LeftHandRing3_026' },
  pinky_01_l: { primary: 'mixamorig1:LeftHandPinky1_028' },
  pinky_02_l: { primary: 'mixamorig1:LeftHandPinky2_029' },
  pinky_03_l: { primary: 'mixamorig1:LeftHandPinky3_030' },

  clavicle_r: { primary: 'mixamorig1:RightShoulder_032' },
  upperarm_r: { primary: 'mixamorig1:RightArm_033' },
  lowerarm_r: { primary: 'mixamorig1:RightForeArm_034' },
  hand_r: { primary: 'mixamorig1:RightHand_035' },
  thumb_01_r: { primary: 'mixamorig1:RightHandThumb1_036' },
  thumb_02_r: { primary: 'mixamorig1:RightHandThumb2_037' },
  thumb_03_r: { primary: 'mixamorig1:RightHandThumb3_038' },
  index_01_r: { primary: 'mixamorig1:RightHandIndex1_040' },
  index_02_r: { primary: 'mixamorig1:RightHandIndex2_041' },
  index_03_r: { primary: 'mixamorig1:RightHandIndex3_042' },
  middle_01_r: { primary: 'mixamorig1:RightHandMiddle1_044' },
  middle_02_r: { primary: 'mixamorig1:RightHandMiddle2_045' },
  middle_03_r: { primary: 'mixamorig1:RightHandMiddle3_046' },
  ring_01_r: { primary: 'mixamorig1:RightHandRing1_048' },
  ring_02_r: { primary: 'mixamorig1:RightHandRing2_049' },
  ring_03_r: { primary: 'mixamorig1:RightHandRing3_050' },
  pinky_01_r: { primary: 'mixamorig1:RightHandPinky1_052' },
  pinky_02_r: { primary: 'mixamorig1:RightHandPinky2_053' },
  pinky_03_r: { primary: 'mixamorig1:RightHandPinky3_054' },

  thigh_l: { primary: 'mixamorig1:LeftUpLeg_056' },
  calf_l: { primary: 'mixamorig1:LeftLeg_057' },
  foot_l: { primary: 'mixamorig1:LeftFoot_058' },
  ball_l: { primary: 'mixamorig1:LeftToeBase_059' },

  thigh_r: { primary: 'mixamorig1:RightUpLeg_00' },
  calf_r: { primary: 'mixamorig1:RightLeg_061' },
  foot_r: { primary: 'mixamorig1:RightFoot_062' },
  ball_r: { primary: 'mixamorig1:RightToeBase_063' },
};

const FEMALE_MAPPING: Record<string, NativeChainMapping> = {
  pelvis: { primary: 'Hips_53' },
  spine_01: { primary: 'Spine_44' },
  spine_02: { primary: 'Spine1_43' },
  spine_03: { primary: 'Spine2_42' },
  neck_01: { primary: 'Neck_3' },
  Head: { primary: 'Head_2' },

  clavicle_l: { primary: 'LeftShoulder_22' },
  upperarm_l: { primary: 'LeftArm_21' },
  lowerarm_l: { primary: 'LeftForeArm_20' },
  hand_l: { primary: 'LeftHand_19' },
  thumb_01_l: { primary: 'LeftHandThumb1_6' },
  thumb_02_l: { primary: 'LeftHandThumb2_5' },
  thumb_03_l: { primary: 'LeftHandThumb3_4' },
  index_01_l: { primary: 'LeftHandIndex1_9' },
  index_02_l: { primary: 'LeftHandIndex2_8' },
  index_03_l: { primary: 'LeftHandIndex3_7' },
  middle_01_l: { primary: 'LeftHandMiddle1_12' },
  middle_02_l: { primary: 'LeftHandMiddle2_11' },
  middle_03_l: { primary: 'LeftHandMiddle3_10' },
  ring_01_l: { primary: 'LeftHandRing1_15' },
  ring_02_l: { primary: 'LeftHandRing2_14' },
  ring_03_l: { primary: 'LeftHandRing3_13' },
  pinky_01_l: { primary: 'LeftHandPinky1_18' },
  pinky_02_l: { primary: 'LeftHandPinky2_17' },
  pinky_03_l: { primary: 'LeftHandPinky3_16' },

  clavicle_r: { primary: 'RightShoulder_41' },
  upperarm_r: { primary: 'RightArm_40' },
  lowerarm_r: { primary: 'RightForeArm_39' },
  hand_r: { primary: 'RightHand_38' },
  thumb_01_r: { primary: 'RightHandThumb1_25' },
  thumb_02_r: { primary: 'RightHandThumb2_24' },
  thumb_03_r: { primary: 'RightHandThumb3_23' },
  index_01_r: { primary: 'RightHandIndex1_28' },
  index_02_r: { primary: 'RightHandIndex2_27' },
  index_03_r: { primary: 'RightHandIndex3_26' },
  middle_01_r: { primary: 'RightHandMiddle1_31' },
  middle_02_r: { primary: 'RightHandMiddle2_30' },
  middle_03_r: { primary: 'RightHandMiddle3_29' },
  ring_01_r: { primary: 'RightHandRing1_34' },
  ring_02_r: { primary: 'RightHandRing2_33' },
  ring_03_r: { primary: 'RightHandRing3_32' },
  pinky_01_r: { primary: 'RightHandPinky1_37' },
  pinky_02_r: { primary: 'RightHandPinky2_36' },
  pinky_03_r: { primary: 'RightHandPinky3_35' },

  thigh_l: { primary: 'LeftUpLeg_48' },
  calf_l: { primary: 'LeftLeg_47' },
  foot_l: { primary: 'LeftFoot_46' },
  ball_l: { primary: 'LeftToeBase_45' },

  thigh_r: { primary: 'RightUpLeg_52' },
  calf_r: { primary: 'RightLeg_51' },
  foot_r: { primary: 'RightFoot_50' },
  ball_r: { primary: 'RightToeBase_49' },
};

const SKELETON_MAPPING: Record<string, NativeChainMapping> = {
  pelvis: { primary: 'PELVIS_235' },
  spine_01: {
    primary: 'VERTEBRAE_L5_156',
    followers: [
      'VERTEBRAE_L4_155',
      'VERTEBRAE_L3_154',
      'VERTEBRAE_L2_153',
      'VERTEBRAE_L1_152',
    ],
  },
  spine_02: {
    primary: 'VERTEBRAE_T12_150',
    followers: [
      'VERTEBRAE_T11_148',
      'VERTEBRAE_T10_146',
      'VERTEBRAE_T9_144',
      'VERTEBRAE_T8_142',
      'VERTEBRAE_T7_140',
    ],
  },
  spine_03: {
    primary: 'VERTEBRAE_T6_138',
    followers: [
      'VERTEBRAE_T5_135',
      'VERTEBRAE_T4_133',
      'VERTEBRAE_T3_131',
      'VERTEBRAE_T2_129',
    ],
  },
  neck_01: {
    primary: 'VERTEBRAE_C7_42',
    followers: [
      'VERTEBRAE_C6_41',
      'VERTEBRAE_C5_40',
      'VERTEBRAE_C4_39',
      'VERTEBRAE_C3_38',
      'VERTEBRAE_C2_37',
      'VERTEBRAE_C1(atlas)_36',
    ],
  },
  Head: { primary: 'HEAD_29' },

  clavicle_l: { primary: 'PIV_SHOULDER.L_85' },
  upperarm_l: { primary: 'HUMERUS.L_83' },
  lowerarm_l: { primary: 'MCH_forearm.L_82' },
  hand_l: { primary: 'HAND.L_81' },
  thumb_01_l: { primary: 'THUMB_PALM.L_54' },
  thumb_02_l: { primary: 'FING_THUMB_A.L_53' },
  thumb_03_l: { primary: 'FING_THUMB_B.L_52' },
  index_01_l: { primary: 'FING_INDEX_A.L_60' },
  index_02_l: { primary: 'FING_INDEX_B.L_59' },
  index_03_l: { primary: 'FING_INDEX_C.L_58' },
  middle_01_l: { primary: 'FING_MID_A.L_57' },
  middle_02_l: { primary: 'FING_MID_B.L_56' },
  middle_03_l: { primary: 'FING_MID_C.L_55' },
  ring_01_l: { primary: 'FING_RING_A.L_63' },
  ring_02_l: { primary: 'FING_RING_B.L_62' },
  ring_03_l: { primary: 'FING_RING_C.L_61' },
  pinky_01_l: { primary: 'FING_PINKY_A.L_50' },
  pinky_02_l: { primary: 'FING_PINKY_B.L_49' },
  pinky_03_l: { primary: 'FING_PINKY_C.L_48' },

  clavicle_r: { primary: 'PIV_SHOULDER.R_126' },
  upperarm_r: { primary: 'HUMERUS.R_125' },
  lowerarm_r: { primary: 'MCH_forearm.R_124' },
  hand_r: { primary: 'HAND.R_123' },
  thumb_01_r: { primary: 'THUMB_PALM.R_98' },
  thumb_02_r: { primary: 'FING_THUMB_A.R_97' },
  thumb_03_r: { primary: 'FING_THUMB_B.R_96' },
  index_01_r: { primary: 'FING_INDEX_A.R_104' },
  index_02_r: { primary: 'FING_INDEX_B.R_103' },
  index_03_r: { primary: 'FING_INDEX_C.R_102' },
  middle_01_r: { primary: 'FING_MID_A.R_101' },
  middle_02_r: { primary: 'FING_MID_B.R_100' },
  middle_03_r: { primary: 'FING_MID_C.R_99' },
  ring_01_r: { primary: 'FING_RING_A.R_107' },
  ring_02_r: { primary: 'FING_RING_B.R_106' },
  ring_03_r: { primary: 'FING_RING_C.R_105' },
  pinky_01_r: { primary: 'FING_PINKY_A.R_94' },
  pinky_02_r: { primary: 'FING_PINKY_B.R_93' },
  pinky_03_r: { primary: 'FING_PINKY_C.R_92' },

  thigh_l: { primary: 'MCH_femur.L_234' },
  calf_l: { primary: 'TIBIA.L_232' },
  foot_l: { primary: 'FOOT.L_231' },
  ball_l: { primary: 'MCH_toes.L_196' },

  thigh_r: { primary: 'MCH_femur.R_195' },
  calf_r: { primary: 'TIBIA.R_193' },
  foot_r: { primary: 'FOOT.R_192' },
  ball_r: { primary: 'MCH_toes.R_157' },
};

const MODEL_MAPPINGS: Record<
  MannequinModelId,
  Record<string, NativeChainMapping>
> = {
  classic: CLASSIC_MAPPING,
  'mannequin-2': MANNEQUIN_2_MAPPING,
  'mannequin-3': MANNEQUIN_3_MAPPING,
  female: FEMALE_MAPPING,
  skeleton: SKELETON_MAPPING,
};

let _canonicalRestMap: Map<string, THREE.Quaternion> | null = null;
export function getCanonicalRestLocalQuatMap(): ReadonlyMap<
  string,
  THREE.Quaternion
> {
  if (!_canonicalRestMap) {
    const m = new Map<string, THREE.Quaternion>();
    for (const name of POSEABLE_BONE_NAMES) {
      const tuple = CANONICAL_REST_LOCAL_QUATS[name];
      if (tuple) {
        m.set(name, new THREE.Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]));
      }
    }
    _canonicalRestMap = m;
  }
  return _canonicalRestMap;
}

function resolveNativeBone(
  nativeBonesByName: Map<string, THREE.Bone>,
  targetName: string
): THREE.Bone | null {
  const exact = nativeBonesByName.get(targetName);
  if (exact) return exact;

  // Three.js GLTFLoader sanitizes GLTF node names (spaces -> '_', ':' and '.' removed).
  const sanitized = THREE.PropertyBinding.sanitizeNodeName(targetName);
  const bySanitized = nativeBonesByName.get(sanitized);
  if (bySanitized) return bySanitized;

  // Fallback strip trailing _<digits> in case exporter renumbers a suffix
  const base = sanitized.replace(/_\d+$/, '');
  for (const [k, bone] of Array.from(nativeBonesByName.entries())) {
    if (k === base || k.replace(/_\d+$/, '') === base) {
      return bone;
    }
  }
  return null;
}

function applyWorldDeltaToBone(
  bone: THREE.Bone,
  worldDelta: THREE.Quaternion,
  rootScene: THREE.Object3D
): void {
  rootScene.updateMatrixWorld(true);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_pQuat);
    bone.getWorldQuaternion(_wQuat);
    const nextWorldQuat = worldDelta.clone().multiply(_wQuat).normalize();
    const nextLocalQuat = _pQuat
      .clone()
      .invert()
      .multiply(nextWorldQuat)
      .normalize();
    bone.quaternion.copy(nextLocalQuat);
  } else {
    bone.quaternion.premultiply(worldDelta).normalize();
  }
  rootScene.updateMatrixWorld(true);
}

/**
 * Brings A-Pose limbs cleanly into canonical horizontal +X / -X T-Pose with
 * palms facing down (-Y) and thumbs/knuckles oriented forward (+Z).
 */
function calibrateArmSideToTPose(
  side: 'l' | 'r',
  modelId: MannequinModelId,
  rootScene: THREE.Object3D,
  resolve: (canonicalName: string) => THREE.Bone | null
): void {
  const upperBone = resolve(`upperarm_${side}`);
  const lowerBone = resolve(`lowerarm_${side}`);
  const handBone = resolve(`hand_${side}`);
  const indexBone = resolve(`index_01_${side}`);
  const middleBone = resolve(`middle_01_${side}`);
  const pinkyBone = resolve(`pinky_01_${side}`);
  if (!upperBone || !lowerBone || !handBone) return;

  const targetAxis =
    side === 'l' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);

  // 1. Raise upper arm from A-pose to horizontal targetAxis
  rootScene.updateMatrixWorld(true);
  upperBone.getWorldPosition(_wPosA);
  lowerBone.getWorldPosition(_wPosB);
  const vUpper = _wPosB.clone().sub(_wPosA);
  if (vUpper.lengthSq() > 1e-6) {
    vUpper.normalize();
    const qUpperSwing = new THREE.Quaternion().setFromUnitVectors(
      vUpper,
      targetAxis
    );
    applyWorldDeltaToBone(upperBone, qUpperSwing, rootScene);
  }

  // 2. Align forearm straight along targetAxis
  lowerBone.getWorldPosition(_wPosA);
  handBone.getWorldPosition(_wPosB);
  const vLower = _wPosB.clone().sub(_wPosA);
  if (vLower.lengthSq() > 1e-6) {
    vLower.normalize();
    const qLowerSwing = new THREE.Quaternion().setFromUnitVectors(
      vLower,
      targetAxis
    );
    applyWorldDeltaToBone(lowerBone, qLowerSwing, rootScene);
  }

  // 3. Align hand pitch/yaw so fingers extend cleanly along targetAxis
  if (middleBone) {
    handBone.getWorldPosition(_wPosA);
    middleBone.getWorldPosition(_wPosB);
    const vHand = _wPosB.clone().sub(_wPosA);
    if (vHand.lengthSq() > 1e-6) {
      vHand.normalize();
      const qHandSwing = new THREE.Quaternion().setFromUnitVectors(
        vHand,
        targetAxis
      );
      applyWorldDeltaToBone(handBone, qHandSwing, rootScene);
    }
  }

  // 4. Orient palm down (-Y) and radial/index edge forward (+Z).
  // For skeleton, pronate forearm (radius/ulna/hand together); otherwise twist hand/wrist.
  if (indexBone && pinkyBone) {
    pinkyBone.getWorldPosition(_wPosA);
    indexBone.getWorldPosition(_wPosB);
    const vKnuckle = _wPosB.clone().sub(_wPosA);
    vKnuckle.addScaledVector(targetAxis, -vKnuckle.dot(targetAxis));
    if (vKnuckle.lengthSq() > 1e-6) {
      vKnuckle.normalize();
      const desiredForward = new THREE.Vector3(0, 0, 1);
      const crossDot = new THREE.Vector3()
        .crossVectors(vKnuckle, desiredForward)
        .dot(targetAxis);
      const rollAngle = Math.atan2(crossDot, vKnuckle.dot(desiredForward));
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        targetAxis,
        rollAngle
      );
      const twistTarget = modelId === 'skeleton' ? lowerBone : handBone;
      applyWorldDeltaToBone(twistTarget, qRoll, rootScene);
    }
  }
}

export class RigAdapter {
  readonly modelId: MannequinModelId;
  readonly hasFingerBones: boolean;
  readonly joints: ReadonlyMap<string, BoundCanonicalJoint>;
  readonly bonesByCanonicalName: Map<string, THREE.Bone>;
  readonly canonicalRestLocalQuats: ReadonlyMap<string, THREE.Quaternion>;
  private readonly orderedJoints: readonly BoundCanonicalJoint[];
  private readonly rootScene: THREE.Object3D;
  private readonly proportionEntries: readonly ProportionBoneEntry[];
  private activeProportions: FigureProportions = {
    ...DEFAULT_FIGURE_PROPORTIONS,
  };
  private hasNonDefaultProportions = false;

  constructor(modelId: MannequinModelId, rootScene: THREE.Object3D) {
    this.rootScene = rootScene;
    this.modelId = modelId;
    this.canonicalRestLocalQuats = getCanonicalRestLocalQuatMap();

    const nativeBonesByName = new Map<string, THREE.Bone>();
    rootScene.traverse((child) => {
      if ((child as THREE.Bone).isBone && child.name) {
        nativeBonesByName.set(child.name, child as THREE.Bone);
      }
    });

    const table = MODEL_MAPPINGS[modelId];
    const resolveCanonical = (canonicalName: string): THREE.Bone | null => {
      const entry = table[canonicalName];
      if (!entry) return null;
      return resolveNativeBone(nativeBonesByName, entry.primary);
    };

    // Only A-Pose rigs need pre-alignment into T-Pose
    if (modelId === 'mannequin-2' || modelId === 'skeleton') {
      calibrateArmSideToTPose('l', modelId, rootScene, resolveCanonical);
      calibrateArmSideToTPose('r', modelId, rootScene, resolveCanonical);
    }

    rootScene.updateMatrixWorld(true);

    const joints = new Map<string, BoundCanonicalJoint>();
    const bonesByCanonicalName = new Map<string, THREE.Bone>();
    const orderedJoints: BoundCanonicalJoint[] = [];

    for (const canonicalName of POSEABLE_BONE_NAMES) {
      const entry = table[canonicalName];
      if (!entry) continue;

      const primaryBone = resolveNativeBone(nativeBonesByName, entry.primary);
      if (!primaryBone) continue;

      const canonWorldTuple = CANONICAL_REST_WORLD_QUATS[canonicalName];
      const canonWorldQuat = canonWorldTuple
        ? new THREE.Quaternion(
            canonWorldTuple[0],
            canonWorldTuple[1],
            canonWorldTuple[2],
            canonWorldTuple[3]
          )
        : new THREE.Quaternion();

      const chainBones: THREE.Bone[] = [primaryBone];
      if (entry.followers) {
        for (const fName of entry.followers) {
          const fb = resolveNativeBone(nativeBonesByName, fName);
          if (fb) chainBones.push(fb);
        }
      }

      const weight = 1 / chainBones.length;
      const segments: BoundChainBone[] = chainBones.map((bone) => {
        bone.getWorldQuaternion(_wQuat);
        const alignQuat =
          modelId === 'classic'
            ? new THREE.Quaternion()
            : _wQuat.clone().invert().multiply(canonWorldQuat).normalize();
        const alignQuatInv = alignQuat.clone().invert();
        return {
          bone,
          tPoseLocalQuat: bone.quaternion.clone(),
          alignQuat,
          alignQuatInv,
          weight,
        };
      });

      const bound: BoundCanonicalJoint = {
        canonicalName,
        primary: segments[0],
        segments,
      };
      joints.set(canonicalName, bound);
      orderedJoints.push(bound);
      bonesByCanonicalName.set(canonicalName, primaryBone);
    }

    this.joints = joints;
    this.orderedJoints = orderedJoints;
    this.bonesByCanonicalName = bonesByCanonicalName;
    this.hasFingerBones = Boolean(
      joints.has('index_01_l') &&
        joints.has('thumb_01_l') &&
        joints.has('index_01_r') &&
        joints.has('thumb_01_r')
    );

    const proportionEntries: ProportionBoneEntry[] = [];
    for (const bound of orderedJoints) {
      const { longDir, latDir } = getCanonicalTPoseWorldAxes(
        bound.canonicalName
      );
      for (const seg of bound.segments) {
        const bone = seg.bone;
        const m = bone.matrixWorld.elements;
        const basisCols = [
          new THREE.Vector3(m[0], m[1], m[2]),
          new THREE.Vector3(m[4], m[5], m[6]),
          new THREE.Vector3(m[8], m[9], m[10]),
        ];
        const restAxisWorldLen: [number, number, number] = [
          Math.max(1e-6, basisCols[0].length()),
          Math.max(1e-6, basisCols[1].length()),
          Math.max(1e-6, basisCols[2].length()),
        ];
        const unitCols = basisCols.map((c, idx) =>
          c.clone().divideScalar(restAxisWorldLen[idx])
        );

        let longAxis: 0 | 1 | 2 = 1;
        let bestLong = -1;
        for (let i = 0; i < 3; i += 1) {
          const d = Math.abs(unitCols[i].dot(longDir));
          if (d > bestLong) {
            bestLong = d;
            longAxis = i as 0 | 1 | 2;
          }
        }

        let latAxis: 0 | 1 | 2 = longAxis === 0 ? 1 : 0;
        let bestLat = -1;
        for (let i = 0; i < 3; i += 1) {
          if (i === longAxis) continue;
          const d = Math.abs(unitCols[i].dot(latDir));
          if (d > bestLat) {
            bestLat = d;
            latAxis = i as 0 | 1 | 2;
          }
        }
        const depthAxis = (3 - longAxis - latAxis) as 0 | 1 | 2;

        proportionEntries.push({
          canonicalName: bound.canonicalName,
          bone,
          depth: computeBoneDepth(bone, rootScene),
          restLocalScale: bone.scale.clone(),
          restAxisWorldLen,
          longAxis,
          latAxis,
          depthAxis,
        });
      }
    }
    proportionEntries.sort((a, b) => a.depth - b.depth);
    this.proportionEntries = proportionEntries;
  }

  get needsProportionSync(): boolean {
    return this.hasNonDefaultProportions;
  }

  getActiveProportions(): FigureProportions {
    return { ...this.activeProportions };
  }

  applyProportions(proportions: FigureProportions): void {
    const clamped = clampFigureProportions(proportions);
    this.activeProportions = clamped;
    this.hasNonDefaultProportions = !isDefaultProportions(clamped);
    this.syncProportionScales();
  }

  syncProportionScales(): void {
    if (!this.hasNonDefaultProportions) {
      for (const entry of this.proportionEntries) {
        entry.bone.scale.copy(entry.restLocalScale);
      }
      this.rootScene.updateMatrixWorld(true);
      return;
    }

    const rotatedAxis = new THREE.Vector3();
    for (const entry of this.proportionEntries) {
      const desired = getDesiredWorldScaleForJoint(
        entry.canonicalName,
        this.activeProportions
      );
      const axisTargets: [number, number, number] = [1, 1, 1];
      axisTargets[entry.longAxis] = desired.long;
      axisTargets[entry.latAxis] = desired.lat;
      axisTargets[entry.depthAxis] = desired.depth;

      const bone = entry.bone;
      const parentM = bone.parent ? bone.parent.matrixWorld.elements : null;
      const nextScale: [number, number, number] = [1, 1, 1];

      for (let i = 0; i < 3; i += 1) {
        rotatedAxis.copy(LOCAL_AXIS_VECTORS[i]).applyQuaternion(bone.quaternion);
        let unitWorldLen = 1;
        if (parentM) {
          const wx =
            parentM[0] * rotatedAxis.x +
            parentM[4] * rotatedAxis.y +
            parentM[8] * rotatedAxis.z;
          const wy =
            parentM[1] * rotatedAxis.x +
            parentM[5] * rotatedAxis.y +
            parentM[9] * rotatedAxis.z;
          const wz =
            parentM[2] * rotatedAxis.x +
            parentM[6] * rotatedAxis.y +
            parentM[10] * rotatedAxis.z;
          unitWorldLen = Math.hypot(wx, wy, wz);
        }
        const restComp = entry.restLocalScale.getComponent(i);
        const baseMag = Math.max(1e-5, Math.abs(restComp));
        const rawMag =
          (entry.restAxisWorldLen[i] * axisTargets[i]) /
          Math.max(1e-6, unitWorldLen);
        const clampedMag = Math.min(
          baseMag * 2.25,
          Math.max(baseMag * 0.45, rawMag)
        );
        nextScale[i] = restComp < 0 ? -clampedMag : clampedMag;
      }

      bone.scale.set(nextScale[0], nextScale[1], nextScale[2]);
      bone.updateMatrix();
      bone.updateMatrixWorld(true);
    }

    this.rootScene.updateMatrixWorld(true);
  }

  getBone(canonicalName: string): THREE.Bone | null {
    return this.bonesByCanonicalName.get(canonicalName) ?? null;
  }

  hasJoint(canonicalName: string): boolean {
    return this.joints.has(canonicalName);
  }

  resetToTPose(): void {
    for (const joint of this.orderedJoints) {
      for (const seg of joint.segments) {
        seg.bone.quaternion.copy(seg.tPoseLocalQuat);
      }
    }
    if (this.hasNonDefaultProportions) {
      this.syncProportionScales();
    }
  }

  applyCanonicalDeltaQuat(
    canonicalName: string,
    deltaCanon: THREE.Quaternion
  ): void {
    const joint = this.joints.get(canonicalName);
    if (!joint) return;

    if (joint.segments.length === 1) {
      const seg = joint.primary;
      _nativeDeltaQuat
        .copy(seg.alignQuat)
        .multiply(deltaCanon)
        .multiply(seg.alignQuatInv)
        .normalize();
      seg.bone.quaternion
        .copy(seg.tPoseLocalQuat)
        .multiply(_nativeDeltaQuat)
        .normalize();
      return;
    }

    for (const seg of joint.segments) {
      _fracDeltaQuat.copy(IDENTITY_QUAT).slerp(deltaCanon, seg.weight).normalize();
      _nativeDeltaQuat
        .copy(seg.alignQuat)
        .multiply(_fracDeltaQuat)
        .multiply(seg.alignQuatInv)
        .normalize();
      seg.bone.quaternion
        .copy(seg.tPoseLocalQuat)
        .multiply(_nativeDeltaQuat)
        .normalize();
    }
  }

  applyCanonicalAngles(
    canonicalName: string,
    anglesDeg: JointAngles,
    order: THREE.EulerOrder
  ): void {
    _euler.set(
      THREE.MathUtils.degToRad(anglesDeg.x),
      THREE.MathUtils.degToRad(anglesDeg.y),
      THREE.MathUtils.degToRad(anglesDeg.z),
      order
    );
    _deltaQuat.setFromEuler(_euler);
    this.applyCanonicalDeltaQuat(canonicalName, _deltaQuat);
  }

  readCanonicalDeltaQuat(
    canonicalName: string,
    out = new THREE.Quaternion()
  ): THREE.Quaternion {
    const joint = this.joints.get(canonicalName);
    if (!joint) return out.identity();

    if (joint.segments.length === 1) {
      const seg = joint.primary;
      _nativeDeltaQuat
        .copy(seg.tPoseLocalQuat)
        .invert()
        .multiply(seg.bone.quaternion);
      return out
        .copy(seg.alignQuatInv)
        .multiply(_nativeDeltaQuat)
        .multiply(seg.alignQuat)
        .normalize();
    }

    out.identity();
    for (const seg of joint.segments) {
      _nativeDeltaQuat
        .copy(seg.tPoseLocalQuat)
        .invert()
        .multiply(seg.bone.quaternion);
      _canonDeltaQuat
        .copy(seg.alignQuatInv)
        .multiply(_nativeDeltaQuat)
        .multiply(seg.alignQuat)
        .normalize();
      out.multiply(_canonDeltaQuat).normalize();
    }
    return out;
  }

  readCanonicalAngles(
    canonicalName: string,
    spec: JointSpec,
    roundToInt = true
  ): JointAngles {
    this.readCanonicalDeltaQuat(canonicalName, _deltaQuat);
    _euler.setFromQuaternion(_deltaQuat, spec.order);
    const x = THREE.MathUtils.radToDeg(_euler.x);
    const y = THREE.MathUtils.radToDeg(_euler.y);
    const z = THREE.MathUtils.radToDeg(_euler.z);

    if (!roundToInt) {
      return { x, y, z };
    }
    return {
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
    };
  }

  getCanonicalRestWorldQuat(
    canonicalName: string,
    out = new THREE.Quaternion()
  ): THREE.Quaternion {
    const joint = this.joints.get(canonicalName);
    if (!joint) return out.identity();

    const seg = joint.primary;
    if (seg.bone.parent) {
      seg.bone.parent.getWorldQuaternion(_pQuat);
      out.copy(_pQuat).multiply(seg.tPoseLocalQuat);
    } else {
      out.copy(seg.tPoseLocalQuat);
    }
    return out.multiply(seg.alignQuat).normalize();
  }

  getCanonicalCurrentWorldQuat(
    canonicalName: string,
    out = new THREE.Quaternion()
  ): THREE.Quaternion {
    const joint = this.joints.get(canonicalName);
    if (!joint) return out.identity();

    joint.primary.bone.getWorldQuaternion(out);
    return out.multiply(joint.primary.alignQuat).normalize();
  }

  /**
   * Produces a joint-name-keyed classic-compatible QuaternionTuple map
   * so Pose JSON, Scene JSON, Undo/Redo, Mirror L<->R, and live model swaps
   * share one universal canonical representation.
   */
  captureCanonicalSnapshotBones(): Record<string, QuaternionTuple> {
    const bones: Record<string, QuaternionTuple> = {};
    for (const canonicalName of POSEABLE_BONE_NAMES) {
      const restCanon = this.canonicalRestLocalQuats.get(canonicalName);
      if (!restCanon) continue;

      if (!this.joints.has(canonicalName)) {
        bones[canonicalName] = [
          restCanon.x,
          restCanon.y,
          restCanon.z,
          restCanon.w,
        ];
        continue;
      }

      this.readCanonicalDeltaQuat(canonicalName, _deltaQuat);
      _wQuat.copy(restCanon).multiply(_deltaQuat).normalize();
      bones[canonicalName] = [_wQuat.x, _wQuat.y, _wQuat.z, _wQuat.w];
    }
    return bones;
  }

  applyCanonicalSnapshotBones(
    bones: Readonly<Record<string, QuaternionTuple>>
  ): void {
    for (const canonicalName of POSEABLE_BONE_NAMES) {
      if (!this.joints.has(canonicalName)) continue;

      const tuple = bones[canonicalName];
      const restCanon = this.canonicalRestLocalQuats.get(canonicalName);
      if (tuple && restCanon) {
        _wQuat.set(tuple[0], tuple[1], tuple[2], tuple[3]).normalize();
        _deltaQuat.copy(restCanon).invert().multiply(_wQuat).normalize();
        this.applyCanonicalDeltaQuat(canonicalName, _deltaQuat);
      } else {
        this.applyCanonicalDeltaQuat(canonicalName, IDENTITY_QUAT);
      }
    }

    // If rig lacks spine_02 (e.g. Mannequin 2 Biped), fold half its canonical delta into spine_01 & spine_03
    if (!this.joints.has('spine_02')) {
      const sp2Tuple = bones.spine_02;
      const sp2Rest = this.canonicalRestLocalQuats.get('spine_02');
      if (sp2Tuple && sp2Rest) {
        _wQuat.set(sp2Tuple[0], sp2Tuple[1], sp2Tuple[2], sp2Tuple[3]).normalize();
        const sp2Delta = sp2Rest.clone().invert().multiply(_wQuat).normalize();
        if (sp2Delta.angleTo(IDENTITY_QUAT) > 1e-4) {
          const halfSp2 = IDENTITY_QUAT.clone().slerp(sp2Delta, 0.5).normalize();
          for (const target of ['spine_01', 'spine_03'] as const) {
            if (!this.joints.has(target)) continue;
            const cur = this.readCanonicalDeltaQuat(target, new THREE.Quaternion());
            cur.multiply(halfSp2).normalize();
            this.applyCanonicalDeltaQuat(target, cur);
          }
        }
      }
    }

    if (this.hasNonDefaultProportions) {
      this.syncProportionScales();
    }
  }

  /** Helper for applyPosePreset when a preset specifies spine_02 on a 2-spine model */
  resolvePresetBoneAngles(
    presetBones: Readonly<Record<string, JointAngles>>
  ): Record<string, JointAngles> {
    if (this.joints.has('spine_02') || !presetBones.spine_02) {
      return { ...presetBones };
    }
    const resolved: Record<string, JointAngles> = { ...presetBones };
    const sp2 = presetBones.spine_02;
    delete resolved.spine_02;

    for (const target of ['spine_01', 'spine_03'] as const) {
      const base = resolved[target] ?? { x: 0, y: 0, z: 0 };
      const spec = getJointSpec(target);
      resolved[target] = {
        x: THREE.MathUtils.clamp(
          base.x + Math.round(sp2.x * 0.5),
          spec.axes.x.min,
          spec.axes.x.max
        ),
        y: THREE.MathUtils.clamp(
          base.y + Math.round(sp2.y * 0.5),
          spec.axes.y.min,
          spec.axes.y.max
        ),
        z: THREE.MathUtils.clamp(
          base.z + Math.round(sp2.z * 0.5),
          spec.axes.z.min,
          spec.axes.z.max
        ),
      };
    }
    return resolved;
  }
}

export function createRigAdapter(
  modelId: MannequinModelId,
  rootScene: THREE.Object3D
): RigAdapter {
  return new RigAdapter(modelId, rootScene);
}
