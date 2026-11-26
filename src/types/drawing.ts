export type ConstructiveMode = 'off' | 'overlay' | 'only';

export type DrawingStyleId =
  | 'off'
  | 'blue-pencil'
  | 'planar'
  | 'comic-ink'
  | 'skeleton-sheet';

export interface StudioDrawingConfig {
  constructiveMode: ConstructiveMode;
  drawingStyle: DrawingStyleId;
  showLineOfAction: boolean;
  showPlumbLine: boolean;
  showCrossContours: boolean;
  showLandmarks: boolean;
  inkWeight: number;
  drawingHatching: boolean;
}

export const MIN_INK_WEIGHT = 0.6;
export const MAX_INK_WEIGHT = 2.0;

export const DEFAULT_STUDIO_DRAWING: StudioDrawingConfig = {
  constructiveMode: 'off',
  drawingStyle: 'off',
  showLineOfAction: true,
  showPlumbLine: true,
  showCrossContours: true,
  showLandmarks: false,
  inkWeight: 1.1,
  drawingHatching: true,
};

export interface DrawingStyleSpec {
  id: DrawingStyleId;
  label: string;
  description: string;
}

export const DRAWING_STYLE_ORDER: readonly DrawingStyleId[] = [
  'off',
  'blue-pencil',
  'planar',
  'comic-ink',
  'skeleton-sheet',
];

export const DRAWING_STYLE_META: Record<DrawingStyleId, DrawingStyleSpec> = {
  off: {
    id: 'off',
    label: 'Off',
    description: 'Standard shaded 3D studio render',
  },
  'blue-pencil': {
    id: 'blue-pencil',
    label: 'Blue-Pencil',
    description: 'Non-photo blue construction & graphite silhouette on paper',
  },
  planar: {
    id: 'planar',
    label: 'Planar',
    description: 'Bridgman 2-value light/shadow planes with bold ink edges',
  },
  'comic-ink': {
    id: 'comic-ink',
    label: 'Ink',
    description: 'Crisp black silhouette & anatomical ink with shadow hatching',
  },
  'skeleton-sheet': {
    id: 'skeleton-sheet',
    label: 'Skeleton',
    description: 'Scientific plate linework with elevated bony creases & landmarks',
  },
};

export const CONSTRUCTIVE_MODE_OPTIONS: ReadonlyArray<{
  id: ConstructiveMode;
  label: string;
  title: string;
}> = [
  { id: 'off', label: 'Off', title: 'Hide 3D constructive masses' },
  {
    id: 'overlay',
    label: 'Ghost',
    title: 'Show Loomis/Bridgman breakdown inside translucent mannequin',
  },
  {
    id: 'only',
    label: 'Only',
    title: 'Show constructive anatomical primitives only',
  },
];

export function isConstructiveMode(val: unknown): val is ConstructiveMode {
  return val === 'off' || val === 'overlay' || val === 'only';
}

export function isDrawingStyleId(val: unknown): val is DrawingStyleId {
  return (
    val === 'off' ||
    val === 'blue-pencil' ||
    val === 'planar' ||
    val === 'comic-ink' ||
    val === 'skeleton-sheet'
  );
}

export function clampInkWeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STUDIO_DRAWING.inkWeight;
  return Math.min(
    MAX_INK_WEIGHT,
    Math.max(MIN_INK_WEIGHT, Math.round(value * 100) / 100)
  );
}

export function clampStudioDrawing(
  partial?: Partial<StudioDrawingConfig> | null
): StudioDrawingConfig {
  if (!partial) return { ...DEFAULT_STUDIO_DRAWING };
  return {
    constructiveMode: isConstructiveMode(partial.constructiveMode)
      ? partial.constructiveMode
      : DEFAULT_STUDIO_DRAWING.constructiveMode,
    drawingStyle: isDrawingStyleId(partial.drawingStyle)
      ? partial.drawingStyle
      : DEFAULT_STUDIO_DRAWING.drawingStyle,
    showLineOfAction:
      typeof partial.showLineOfAction === 'boolean'
        ? partial.showLineOfAction
        : DEFAULT_STUDIO_DRAWING.showLineOfAction,
    showPlumbLine:
      typeof partial.showPlumbLine === 'boolean'
        ? partial.showPlumbLine
        : DEFAULT_STUDIO_DRAWING.showPlumbLine,
    showCrossContours:
      typeof partial.showCrossContours === 'boolean'
        ? partial.showCrossContours
        : DEFAULT_STUDIO_DRAWING.showCrossContours,
    showLandmarks:
      typeof partial.showLandmarks === 'boolean'
        ? partial.showLandmarks
        : DEFAULT_STUDIO_DRAWING.showLandmarks,
    inkWeight:
      typeof partial.inkWeight === 'number'
        ? clampInkWeight(partial.inkWeight)
        : DEFAULT_STUDIO_DRAWING.inkWeight,
    drawingHatching:
      typeof partial.drawingHatching === 'boolean'
        ? partial.drawingHatching
        : DEFAULT_STUDIO_DRAWING.drawingHatching,
  };
}

export function isDrawingActive(config: StudioDrawingConfig): boolean {
  return config.constructiveMode !== 'off' || config.drawingStyle !== 'off';
}

export function shouldShowConstructiveRig(
  config: StudioDrawingConfig
): boolean {
  return (
    config.constructiveMode !== 'off' ||
    config.drawingStyle === 'blue-pencil' ||
    config.drawingStyle === 'planar'
  );
}

export function effectiveShowLandmarks(config: StudioDrawingConfig): boolean {
  return config.showLandmarks || config.drawingStyle === 'skeleton-sheet';
}
