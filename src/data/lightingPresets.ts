import type { LightingPresetId, StudioLightingConfig } from '@/types/anatomy';

export interface LightingPresetSpec {
  id: LightingPresetId;
  label: string;
  description: string;
  azimuth: number;
  elevation: number;
  intensity: number;
  rimIntensity: number;
  rimAzimuthOffset: number;
  fillIntensity: number;
}

export const LIGHTING_PRESET_ORDER: readonly LightingPresetId[] = [
  'rembrandt',
  'chiaroscuro',
  'top-down',
  'rim',
];

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPresetSpec> = {
  rembrandt: {
    id: 'rembrandt',
    label: 'Rembrandt',
    description: 'Balanced 3/4 key, subtle cool rim, readable form terminator',
    azimuth: 42,
    elevation: 48,
    intensity: 1.85,
    rimIntensity: 0.75,
    rimAzimuthOffset: 175,
    fillIntensity: 0.38,
  },
  chiaroscuro: {
    id: 'chiaroscuro',
    label: 'Chiaroscuro',
    description: 'Dramatic side key with deep shadow masses and low bounce',
    azimuth: 78,
    elevation: 32,
    intensity: 2.35,
    rimIntensity: 0.28,
    rimAzimuthOffset: 195,
    fillIntensity: 0.08,
  },
  'top-down': {
    id: 'top-down',
    label: 'Top-Down',
    description: 'High overhead light for brow, nose, and ribcage cast shadows',
    azimuth: 20,
    elevation: 80,
    intensity: 2.1,
    rimIntensity: 0.45,
    rimAzimuthOffset: 180,
    fillIntensity: 0.24,
  },
  rim: {
    id: 'rim',
    label: 'Rim',
    description: 'Low key fill paired with strong edge silhouette separation',
    azimuth: 158,
    elevation: 36,
    intensity: 0.95,
    rimIntensity: 2.2,
    rimAzimuthOffset: 170,
    fillIntensity: 0.12,
  },
};

export const DEFAULT_STUDIO_LIGHTING: StudioLightingConfig = {
  ...LIGHTING_PRESETS.rembrandt,
  notanEnabled: false,
  notanSplit: 0.5,
  presetId: 'rembrandt',
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function detectMatchingLightingPreset(
  light: StudioLightingConfig
): LightingPresetId | null {
  for (const id of LIGHTING_PRESET_ORDER) {
    const p = LIGHTING_PRESETS[id];
    if (
      Math.abs(light.azimuth - p.azimuth) <= 1 &&
      Math.abs(light.elevation - p.elevation) <= 1 &&
      Math.abs(light.intensity - p.intensity) <= 0.03 &&
      Math.abs(light.rimIntensity - p.rimIntensity) <= 0.03 &&
      Math.abs(light.rimAzimuthOffset - p.rimAzimuthOffset) <= 1 &&
      Math.abs(light.fillIntensity - p.fillIntensity) <= 0.02
    ) {
      return id;
    }
  }
  return null;
}

export function clampStudioLighting(
  raw: Partial<StudioLightingConfig>
): StudioLightingConfig {
  const merged: StudioLightingConfig = {
    azimuth: clamp(
      Number.isFinite(raw.azimuth) ? raw.azimuth! : DEFAULT_STUDIO_LIGHTING.azimuth,
      0,
      360
    ),
    elevation: clamp(
      Number.isFinite(raw.elevation)
        ? raw.elevation!
        : DEFAULT_STUDIO_LIGHTING.elevation,
      15,
      85
    ),
    intensity: clamp(
      Number.isFinite(raw.intensity)
        ? raw.intensity!
        : DEFAULT_STUDIO_LIGHTING.intensity,
      0.4,
      2.8
    ),
    rimIntensity: clamp(
      Number.isFinite(raw.rimIntensity)
        ? raw.rimIntensity!
        : DEFAULT_STUDIO_LIGHTING.rimIntensity,
      0,
      2.4
    ),
    rimAzimuthOffset: clamp(
      Number.isFinite(raw.rimAzimuthOffset)
        ? raw.rimAzimuthOffset!
        : DEFAULT_STUDIO_LIGHTING.rimAzimuthOffset,
      90,
      270
    ),
    fillIntensity: clamp(
      Number.isFinite(raw.fillIntensity)
        ? raw.fillIntensity!
        : DEFAULT_STUDIO_LIGHTING.fillIntensity,
      0.05,
      1.2
    ),
    notanEnabled:
      typeof raw.notanEnabled === 'boolean'
        ? raw.notanEnabled
        : DEFAULT_STUDIO_LIGHTING.notanEnabled,
    notanSplit: clamp(
      Number.isFinite(raw.notanSplit)
        ? raw.notanSplit!
        : DEFAULT_STUDIO_LIGHTING.notanSplit,
      0.2,
      0.8
    ),
    presetId: raw.presetId ?? null,
  };
  merged.presetId = detectMatchingLightingPreset(merged);
  return merged;
}
