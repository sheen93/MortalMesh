import type {
  PadDocumentV1,
  PadLayerId,
  PadLayoutMode,
  PadStrokeTelemetry,
  PadTimelapseOptions,
  PadToolId,
  PadXRayConfig,
} from '@/types/pad';

export type PadPinPlacedCallback = (normX: number, normY: number) => void;

/**
 * Imperative Phase 19 contract uniting KINETIC-5 lessons, Gesture Gym sessions,
 * and X-Ray Sight landmark pins cleanly with the Canvas 2D Atelier Study Pad.
 */
export interface PadBridge {
  setTool: (tool: PadToolId) => void;
  setColor: (hex: string) => void;
  setActiveLayer: (layerId: PadLayerId) => void;
  setLayerVisibility: (layerId: PadLayerId, visible: boolean) => void;
  setLayoutMode: (mode: PadLayoutMode) => void;
  setVellumOpacity: (opacity: number) => void;
  setXRayCheck: (config: Partial<PadXRayConfig>) => void;
  setFlipHorizontal: (flipped: boolean) => void;
  clearPad: (silent?: boolean) => void;
  undo: () => boolean;
  redo: () => boolean;
  getStrokeTelemetry: () => PadStrokeTelemetry;
  getCanvasSize: () => { width: number; height: number };
  getCanvasRect: () => DOMRect | null;
  subscribeTelemetry: (
    listener: (telemetry: PadStrokeTelemetry) => void
  ) => () => void;
  setLandmarkPinMode: (
    enabled: boolean,
    onPinPlaced?: PadPinPlacedCallback | null
  ) => void;
  serializeDocument: () => PadDocumentV1;
  restoreDocument: (doc: PadDocumentV1) => void;
  captureLayerCanvases: (
    scale?: 1 | 2
  ) => {
    width: number;
    height: number;
    layers: Record<PadLayerId, HTMLCanvasElement>;
  };
  captureThumbnailDataUrl: (
    maxEdgePx?: number,
    backdropDataUrl?: string | null
  ) => Promise<string | null>;
  exportTimelapseBlob: (options?: PadTimelapseOptions) => Promise<Blob | null>;
}
