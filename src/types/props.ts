export const MAX_STUDIO_PROPS = 12;

export type StudioPropType = 'box' | 'stool' | 'cylinder' | 'sphere' | 'staff';

export type PropTransformMode = 'translate' | 'rotate' | 'scale';

export interface StudioProp {
  id: string;
  type: StudioPropType;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number]; // degrees Euler XYZ
  scale: [number, number, number];
  locked: boolean;
  visible: boolean;
}

export interface StudioPropCatalogSpec {
  type: StudioPropType;
  label: string;
  shortLabel: string;
  defaultHalfHeight: number;
}

export const STUDIO_PROP_ORDER: readonly StudioPropType[] = [
  'box',
  'stool',
  'cylinder',
  'sphere',
  'staff',
];

export const STUDIO_PROP_CATALOG: Record<StudioPropType, StudioPropCatalogSpec> = {
  box: {
    type: 'box',
    label: 'Box / Block',
    shortLabel: 'Box',
    defaultHalfHeight: 0.25,
  },
  stool: {
    type: 'stool',
    label: 'Stool / Seat',
    shortLabel: 'Stool',
    defaultHalfHeight: 0.23,
  },
  cylinder: {
    type: 'cylinder',
    label: 'Cylinder / Column',
    shortLabel: 'Column',
    defaultHalfHeight: 0.4,
  },
  sphere: {
    type: 'sphere',
    label: 'Sphere',
    shortLabel: 'Sphere',
    defaultHalfHeight: 0.24,
  },
  staff: {
    type: 'staff',
    label: 'Staff / Pole',
    shortLabel: 'Staff',
    defaultHalfHeight: 0.875,
  },
};

export interface PropDropCommand {
  propId: string;
  seq: number;
}

const PROP_SPAWN_XZ_OFFSETS: readonly [number, number][] = [
  [0.65, 0.25],
  [-0.65, 0.25],
  [0.7, -0.35],
  [-0.7, -0.35],
  [1.15, 0.25],
  [-1.15, 0.25],
  [1.15, -0.35],
  [-1.15, -0.35],
  [0, -0.65],
  [0.65, 0.75],
  [-0.65, 0.75],
  [0, 0.85],
];

function pickNextPropXZ(existingProps: readonly StudioProp[]): [number, number] {
  for (const [cx, cz] of PROP_SPAWN_XZ_OFFSETS) {
    const occupied = existingProps.some(
      (item) => Math.hypot(item.position[0] - cx, item.position[2] - cz) <= 0.28
    );
    if (!occupied) return [cx, cz];
  }
  const idx = existingProps.length;
  return [((idx % 4) - 1.5) * 0.55, 0.55 + Math.floor(idx / 4) * 0.45];
}

export function createStudioProp(
  type: StudioPropType,
  existingProps: readonly StudioProp[],
  seqNum: number,
  groundEnabled = true
): StudioProp {
  const spec = STUDIO_PROP_CATALOG[type];
  const [x, z] = pickNextPropXZ(existingProps);
  const y = groundEnabled ? spec.defaultHalfHeight : 0.6;
  return {
    id: `prop-${seqNum}`,
    type,
    name: `${spec.shortLabel} ${seqNum}`,
    position: [x, y, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    locked: false,
    visible: true,
  };
}
