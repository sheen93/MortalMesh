import type { FigureProportions } from '@/types/anatomy';

export type ProportionPresetId = 'stylized' | 'natural' | 'heroic';

export interface ProportionPresetSpec {
  id: ProportionPresetId;
  shortLabel: string;
  label: string;
  description: string;
  proportions: FigureProportions;
}

export const PROPORTION_LIMITS: Record<
  keyof FigureProportions,
  { min: number; max: number; step: number; label: string }
> = {
  headScale: { min: 0.75, max: 1.3, step: 0.01, label: 'Head Size' },
  shoulderWidth: { min: 0.75, max: 1.35, step: 0.01, label: 'Shoulders' },
  torsoLength: { min: 0.8, max: 1.25, step: 0.01, label: 'Torso Length' },
  hipWidth: { min: 0.75, max: 1.35, step: 0.01, label: 'Hip Width' },
  limbLength: { min: 0.8, max: 1.25, step: 0.01, label: 'Limb Length' },
};

export const DEFAULT_FIGURE_PROPORTIONS: FigureProportions = {
  headScale: 1,
  shoulderWidth: 1,
  torsoLength: 1,
  hipWidth: 1,
  limbLength: 1,
};

export const PROPORTION_PRESET_ORDER: readonly ProportionPresetId[] = [
  'stylized',
  'natural',
  'heroic',
];

export const PROPORTION_PRESETS: Record<
  ProportionPresetId,
  ProportionPresetSpec
> = {
  stylized: {
    id: 'stylized',
    shortLabel: '6.5H',
    label: 'Stylized (6.5H)',
    description: 'Compact expressive canon with fuller head proportion',
    proportions: {
      headScale: 1.16,
      shoulderWidth: 0.94,
      torsoLength: 0.94,
      hipWidth: 0.96,
      limbLength: 0.9,
    },
  },
  natural: {
    id: 'natural',
    shortLabel: '7.5H',
    label: 'Natural (7.5H)',
    description: 'Classical life-drawing human canon',
    proportions: { ...DEFAULT_FIGURE_PROPORTIONS },
  },
  heroic: {
    id: 'heroic',
    shortLabel: '8.5H',
    label: 'Heroic (8.5H)',
    description: 'Tall heroic canon with broad shoulders and long limbs',
    proportions: {
      headScale: 0.88,
      shoulderWidth: 1.16,
      torsoLength: 1.05,
      hipWidth: 0.96,
      limbLength: 1.12,
    },
  },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampFigureProportions(
  raw?: Partial<FigureProportions> | null
): FigureProportions {
  const safe = raw ?? {};
  const clampKey = (k: keyof FigureProportions): number => {
    const { min, max } = PROPORTION_LIMITS[k];
    const v = safe[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return DEFAULT_FIGURE_PROPORTIONS[k];
    }
    return round2(Math.min(max, Math.max(min, v)));
  };
  return {
    headScale: clampKey('headScale'),
    shoulderWidth: clampKey('shoulderWidth'),
    torsoLength: clampKey('torsoLength'),
    hipWidth: clampKey('hipWidth'),
    limbLength: clampKey('limbLength'),
  };
}

export function isDefaultProportions(
  p: FigureProportions,
  eps = 0.005
): boolean {
  return (
    Math.abs(p.headScale - 1) <= eps &&
    Math.abs(p.shoulderWidth - 1) <= eps &&
    Math.abs(p.torsoLength - 1) <= eps &&
    Math.abs(p.hipWidth - 1) <= eps &&
    Math.abs(p.limbLength - 1) <= eps
  );
}

export function detectMatchingProportionPreset(
  p: FigureProportions
): ProportionPresetId | null {
  for (const id of PROPORTION_PRESET_ORDER) {
    const target = PROPORTION_PRESETS[id].proportions;
    if (
      Math.abs(p.headScale - target.headScale) <= 0.015 &&
      Math.abs(p.shoulderWidth - target.shoulderWidth) <= 0.015 &&
      Math.abs(p.torsoLength - target.torsoLength) <= 0.015 &&
      Math.abs(p.hipWidth - target.hipWidth) <= 0.015 &&
      Math.abs(p.limbLength - target.limbLength) <= 0.015
    ) {
      return id;
    }
  }
  return null;
}

export function proportionsEqual(
  a?: FigureProportions | null,
  b?: FigureProportions | null,
  eps = 0.005
): boolean {
  const pa = clampFigureProportions(a);
  const pb = clampFigureProportions(b);
  return (
    Math.abs(pa.headScale - pb.headScale) <= eps &&
    Math.abs(pa.shoulderWidth - pb.shoulderWidth) <= eps &&
    Math.abs(pa.torsoLength - pb.torsoLength) <= eps &&
    Math.abs(pa.hipWidth - pb.hipWidth) <= eps &&
    Math.abs(pa.limbLength - pb.limbLength) <= eps
  );
}
