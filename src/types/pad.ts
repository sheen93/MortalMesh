export type WorkspaceTier = 'studio' | 'pad' | 'school';

export type PadLayoutMode = 'split' | 'vellum' | 'stacked';

export type PadToolId = 'pencil' | 'charcoal' | 'ink' | 'eraser' | 'lasso';

export type PadLayerId = 'construction' | 'ink' | 'value';

/** Bottom-to-top compositing order (Layer 3 value behind Layer 1 construction behind Layer 2 ink). */
export const PAD_LAYER_ORDER: readonly PadLayerId[] = [
  'value',
  'construction',
  'ink',
];

export const PAD_LAYER_UI_ORDER: readonly PadLayerId[] = [
  'ink',
  'construction',
  'value',
];

export const PAD_LAYER_META: Record<
  PadLayerId,
  { number: number; label: string; shortLabel: string; psdName: string; svgId: string }
> = {
  construction: {
    number: 1,
    label: '1. Construction',
    shortLabel: 'Construct',
    psdName: 'Construction',
    svgId: 'pad-construction',
  },
  ink: {
    number: 2,
    label: '2. Structure / Ink',
    shortLabel: 'Ink',
    psdName: 'Structure & Ink',
    svgId: 'pad-ink',
  },
  value: {
    number: 3,
    label: '3. Value / Shadow',
    shortLabel: 'Value',
    psdName: 'Value & Shadow',
    svgId: 'pad-value',
  },
};

export type PadPaperTone = 'white' | 'warm-newsprint' | 'atelier-gray' | 'dark-slate';

export const PAD_PAPER_META: Record<
  PadPaperTone,
  { label: string; hex: string; inkDefault: string }
> = {
  white: { label: 'Bristol', hex: '#FAF9F5', inkDefault: '#111317' },
  'warm-newsprint': { label: 'Newsprint', hex: '#F1E8D6', inkDefault: '#18181B' },
  'atelier-gray': { label: 'Gray', hex: '#707680', inkDefault: '#111317' },
  'dark-slate': { label: 'Chalkboard', hex: '#1F2229', inkDefault: '#F3F4F6' },
};

export const PAD_PAPER_ORDER: readonly PadPaperTone[] = [
  'white',
  'warm-newsprint',
  'atelier-gray',
  'dark-slate',
];

export const PENCIL_SWATCHES: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Col-Erase Blue', hex: '#2E73B8' },
  { label: 'Terracotta Red', hex: '#C94A38' },
  { label: 'Graphite', hex: '#2B2F36' },
];

export const CHARCOAL_SWATCHES: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Willow Charcoal', hex: '#1B1D22' },
  { label: 'Warm Sepia', hex: '#4B362A' },
  { label: 'Chalk Highlight', hex: '#F8FAFC' },
];

export const INK_SWATCHES: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'India Ink', hex: '#111317' },
  { label: 'Chalk White', hex: '#F3F4F6' },
  { label: 'Cobalt Ink', hex: '#1E3A5F' },
  { label: 'Vermilion Ink', hex: '#7F1D1D' },
];

/** [normX (0..1), normY (0..1), pressure (0..1), tiltX (-90..90), tiltY (-90..90)] */
export type PadStrokePoint = [number, number, number, number, number];

export interface PadStroke {
  id: string;
  layerId: PadLayerId;
  tool: Exclude<PadToolId, 'lasso'>;
  color: string;
  baseSize: number;
  opacity: number;
  isStraightLine: boolean;
  points: PadStrokePoint[];
}

export interface PadLayerState {
  visible: boolean;
  opacity: number;
}

export interface PadDocumentV1 {
  version: 1;
  updatedAt: number;
  paperTone: PadPaperTone;
  layers: Record<PadLayerId, PadLayerState>;
  strokes: PadStroke[];
}

export function createEmptyPadDocument(
  paperTone: PadPaperTone = 'white'
): PadDocumentV1 {
  return {
    version: 1,
    updatedAt: Date.now(),
    paperTone,
    layers: {
      construction: { visible: true, opacity: 1 },
      ink: { visible: true, opacity: 1 },
      value: { visible: true, opacity: 1 },
    },
    strokes: [],
  };
}

export interface PadStudyRecord {
  id: string;
  title: string;
  createdAt: number;
  posePresetId: string | null;
  moduleId?: string | null;
  document: PadDocumentV1;
}

export type PadXRaySource = 'surface' | 'skeleton' | 'loomis' | 'notan';

export interface PadXRayConfig {
  active: boolean;
  source: PadXRaySource;
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  dataUrl: string | null;
}

export const DEFAULT_PAD_XRAY_CONFIG: PadXRayConfig = {
  active: false,
  source: 'surface',
  opacity: 0.35,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  dataUrl: null,
};

export interface PadStrokeTelemetry {
  totalStrokes: number;
  countsByLayer: Record<PadLayerId, number>;
  straightLineCount: number;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  recentPoints: PadStrokePoint[];
  hasDrawn: boolean;
}

export interface PadTimelapseOptions {
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  include3DBackdropDataUrl?: string | null;
  paperHex?: string;
}

export type PadExportFormat = 'psd' | 'png' | 'svg' | 'webp' | 'timelapse';
