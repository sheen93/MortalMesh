import * as THREE from 'three';
import type { StudioThemeId } from '@/types/anatomy';

const TEXTURE_WIDTH = 256;

export interface NotanThemePalette {
  figureColor: string;
  propColor: string;
  ambient: number;
  keyIntensity: number;
}

export function getNotanThemePalette(theme: StudioThemeId): NotanThemePalette {
  switch (theme) {
    case 'light':
      return {
        figureColor: '#E6E2DA',
        propColor: '#D6D3CB',
        ambient: 0.16,
        keyIntensity: 2.3,
      };
    case 'gray':
      return {
        figureColor: '#EFECE6',
        propColor: '#DFDCD5',
        ambient: 0.2,
        keyIntensity: 2.55,
      };
    case 'dark':
      return {
        figureColor: '#F0EDE7',
        propColor: '#DFDCD5',
        ambient: 0.28,
        keyIntensity: 2.55,
      };
  }
}

function writeSplitTexels(data: Uint8Array, split: number): void {
  const clamped = THREE.MathUtils.clamp(split, 0.2, 0.8);
  const splitIdx = Math.round(clamped * (TEXTURE_WIDTH - 1));
  for (let i = 0; i < TEXTURE_WIDTH; i += 1) {
    const val = i <= splitIdx ? 0 : 255;
    const base = i * 4;
    data[base] = val;
    data[base + 1] = val;
    data[base + 2] = val;
    data[base + 3] = 255;
  }
}

export function createNotanGradientTexture(split = 0.5): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_WIDTH * 4);
  writeSplitTexels(data, split);
  const texture = new THREE.DataTexture(
    data,
    TEXTURE_WIDTH,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function updateNotanGradientTexture(
  texture: THREE.DataTexture,
  split: number
): void {
  const data = texture.image?.data;
  if (!(data instanceof Uint8Array)) return;
  writeSplitTexels(data, split);
  texture.needsUpdate = true;
}
