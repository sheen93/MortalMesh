import type { PoseSnapshot } from '@/types/poseIO';

export const MAX_MANNEQUINS = 6;

export type MannequinFinish = 'classic' | 'slate' | 'ivory' | 'clay';

export interface MannequinFinishSpec {
  id: MannequinFinish;
  label: string;
  swatchHex: string;
  mainColor: string | null;
  jointsColor: string | null;
  roughness: number;
}

export const MANNEQUIN_FINISH_ORDER: readonly MannequinFinish[] = [
  'classic',
  'slate',
  'ivory',
  'clay',
];

export const MANNEQUIN_FINISHES: Record<MannequinFinish, MannequinFinishSpec> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    swatchHex: '#D98C2B',
    mainColor: null,
    jointsColor: null,
    roughness: 0.5,
  },
  slate: {
    id: 'slate',
    label: 'Slate',
    swatchHex: '#7B8596',
    mainColor: '#7B8596',
    jointsColor: '#424956',
    roughness: 0.55,
  },
  ivory: {
    id: 'ivory',
    label: 'Ivory',
    swatchHex: '#E8E4DC',
    mainColor: '#E8E4DC',
    jointsColor: '#A9A297',
    roughness: 0.65,
  },
  clay: {
    id: 'clay',
    label: 'Clay',
    swatchHex: '#C48368',
    mainColor: '#C48368',
    jointsColor: '#7A5447',
    roughness: 0.62,
  },
};

export const MANNEQUIN_SPAWN_OFFSETS: readonly [number, number, number][] = [
  [0, 0, 0],
  [0.9, 0, 0],
  [-0.9, 0, 0],
  [1.8, 0, 0],
  [-1.8, 0, 0],
  [0, 0, -0.9],
];

export interface MannequinRecord {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
  finish: MannequinFinish;
  spawnOffset: [number, number, number];
  elevationY: number;
  groundSnapEnabled: boolean;
  pinnedBones: string[];
  activePosePresetId: string | null;
  initialSnapshot?: PoseSnapshot;
  preserveExactRootPosition?: boolean;
}

export function pickNextSpawnOffset(
  existing: readonly MannequinRecord[]
): [number, number, number] {
  for (const candidate of MANNEQUIN_SPAWN_OFFSETS) {
    const occupied = existing.some((item) => {
      const dx = item.spawnOffset[0] - candidate[0];
      const dz = item.spawnOffset[2] - candidate[2];
      return Math.hypot(dx, dz) <= 0.25;
    });
    if (!occupied) {
      return [candidate[0], candidate[1], candidate[2]];
    }
  }
  const fallbackIndex = existing.length;
  return [fallbackIndex * 0.85, 0, 0];
}

export function pickNextFinish(count: number): MannequinFinish {
  return MANNEQUIN_FINISH_ORDER[count % MANNEQUIN_FINISH_ORDER.length];
}

export function createInitialMannequin(): MannequinRecord {
  return {
    id: 'figure-1',
    name: 'Figure 1',
    locked: false,
    visible: true,
    finish: 'classic',
    spawnOffset: [0, 0, 0],
    elevationY: 0,
    groundSnapEnabled: true,
    pinnedBones: [],
    activePosePresetId: 't-pose',
  };
}
