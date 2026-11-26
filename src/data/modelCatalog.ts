export type MannequinModelId =
  | 'classic'
  | 'mannequin-2'
  | 'mannequin-3'
  | 'female'
  | 'skeleton';

export interface MannequinModelSpec {
  id: MannequinModelId;
  label: string;
  shortLabel: string;
  description: string;
  url: string;
  hasRig: boolean;
  hasFingerBones: boolean;
  defaultFinishLabel: string;
  facingYawOffset: number;
}

export const MODEL_ORDER: readonly MannequinModelId[] = [
  'classic',
  'mannequin-2',
  'mannequin-3',
  'female',
  'skeleton',
];

export const MODEL_CATALOG: Record<MannequinModelId, MannequinModelSpec> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    shortLabel: 'Classic',
    description: 'Quaternius 52-bone artist reference figure',
    url: '/models/anatomy.glb',
    hasRig: true,
    hasFingerBones: true,
    defaultFinishLabel: 'Classic',
    facingYawOffset: 0,
  },
  'mannequin-2': {
    id: 'mannequin-2',
    label: 'Mannequin 2',
    shortLabel: 'M2',
    description: 'Sculpted jointed wooden/atelier mannequin',
    url: '/models/mannequin-2.glb',
    hasRig: true,
    hasFingerBones: true,
    defaultFinishLabel: 'Classic',
    facingYawOffset: 0,
  },
  'mannequin-3': {
    id: 'mannequin-3',
    label: 'Mannequin 3',
    shortLabel: 'M3',
    description: 'Detailed athletic reference mannequin',
    url: '/models/mannequin-3.glb',
    hasRig: true,
    hasFingerBones: true,
    defaultFinishLabel: 'Classic',
    facingYawOffset: 0,
  },
  female: {
    id: 'female',
    label: 'Female',
    shortLabel: 'Female',
    description: 'Proportioned female anatomy figure',
    url: '/models/mannequin-female.glb',
    hasRig: true,
    hasFingerBones: true,
    defaultFinishLabel: 'Classic',
    facingYawOffset: 0,
  },
  skeleton: {
    id: 'skeleton',
    label: 'Skeleton',
    shortLabel: 'Skeleton',
    description: 'Anatomical skeletal landmark rig',
    url: '/models/skeleton-rig.glb',
    hasRig: true,
    hasFingerBones: true,
    defaultFinishLabel: 'Bone',
    facingYawOffset: 0,
  },
};

export function isMannequinModelId(value: string): value is MannequinModelId {
  return (
    value === 'classic' ||
    value === 'mannequin-2' ||
    value === 'mannequin-3' ||
    value === 'female' ||
    value === 'skeleton'
  );
}
