'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { PadCanvas } from '@/components/pad/PadCanvas';
import { PadExportPopover } from '@/components/pad/PadExportPopover';
import { WorkspaceModeBar } from '@/components/WorkspaceModeBar';
import {
  BrushIcon,
  DownloadIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  FlipHorizontalIcon,
  LassoIcon,
  LayersIcon,
  Move3dIcon,
  PanelToggleIcon,
  PencilIcon,
  PenNibIcon,
  PrecisionSlider,
  RedoIcon,
  RotateCcwIcon,
  ScanEyeIcon,
  SlidersIcon,
  SplitPaneIcon,
  StylusIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type { SnapshotBridge, StudioThemeId } from '@/types/anatomy';
import {
  CHARCOAL_SWATCHES,
  createEmptyPadDocument,
  DEFAULT_PAD_XRAY_CONFIG,
  INK_SWATCHES,
  PAD_LAYER_META,
  PAD_LAYER_ORDER,
  PAD_LAYER_UI_ORDER,
  PAD_PAPER_META,
  PAD_PAPER_ORDER,
  PENCIL_SWATCHES,
  type PadDocumentV1,
  type PadLayerId,
  type PadLayoutMode,
  type PadPaperTone,
  type PadStroke,
  type PadToolId,
  type PadXRayConfig,
  type PadXRaySource,
  type WorkspaceTier,
} from '@/types/pad';
import type { PadBridge, PadPinPlacedCallback } from '@/types/padBridge';
import { buildPadTimelapseBlob } from '@/utils/padExporter';
import { computeStrokeTelemetry, renderLayerToCanvas } from '@/utils/padRenderer';
import { loadPadAutosave, savePadAutosave } from '@/utils/padStorage';

const MAX_PAD_HISTORY = 50;
const PAD_AUTOSAVE_DEBOUNCE_MS = 800;

interface PadWorkspaceProps {
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  workspaceTier: WorkspaceTier;
  onSelectTier: (tier: WorkspaceTier) => void;
  layoutMode: PadLayoutMode;
  onChangeLayoutMode: (mode: PadLayoutMode) => void;
  splitRatio: number;
  onChangeSplitRatio: (ratio: number) => void;
  leftHandedFlip: boolean;
  onToggleLeftHandedFlip: () => void;
  flipHorizontal: boolean;
  onToggleFlipHorizontal: () => void;
  onSetFlipHorizontalDirect: (flipped: boolean) => void;
  vellumOpacity: number;
  onChangeVellumOpacity: (opacity: number) => void;
  vellumInteraction: 'draw' | 'pose';
  onChangeVellumInteraction: (mode: 'draw' | 'pose') => void;
  vellumXRayActive: boolean;
  onToggleVellumXRay: (active: boolean) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: (open: boolean) => void;
  snapshotBridge: SnapshotBridge | null;
  onCaptureXRaySnapshot: (source: PadXRaySource) => Promise<string | null>;
  onPadBridgeReady: (bridge: PadBridge | null) => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
  headerHeightPx: number;
}

function cloneDoc(doc: PadDocumentV1): PadDocumentV1 {
  return {
    version: 1,
    updatedAt: doc.updatedAt,
    paperTone: doc.paperTone,
    layers: {
      construction: { ...doc.layers.construction },
      ink: { ...doc.layers.ink },
      value: { ...doc.layers.value },
    },
    strokes: doc.strokes.map((s) => ({
      ...s,
      points: s.points.map((pt) => [...pt] as typeof pt),
    })),
  };
}

export function PadWorkspace({
  studioTheme,
  viewport,
  workspaceTier,
  onSelectTier,
  layoutMode,
  onChangeLayoutMode,
  splitRatio,
  onChangeSplitRatio,
  leftHandedFlip,
  onToggleLeftHandedFlip,
  flipHorizontal,
  onToggleFlipHorizontal,
  onSetFlipHorizontalDirect,
  vellumOpacity,
  onChangeVellumOpacity,
  vellumInteraction,
  onChangeVellumInteraction,
  vellumXRayActive,
  onToggleVellumXRay,
  isSidebarOpen,
  onToggleSidebar,
  snapshotBridge,
  onCaptureXRaySnapshot,
  onPadBridgeReady,
  onToast,
  headerHeightPx,
}: PadWorkspaceProps) {
  const [doc, setDoc] = useState<PadDocumentV1>(() =>
    createEmptyPadDocument('white')
  );
  const [past, setPast] = useState<PadDocumentV1[]>([]);
  const [future, setFuture] = useState<PadDocumentV1[]>([]);
  const [hasLoadedIdb, setHasLoadedIdb] = useState(false);

  const [tool, setTool] = useState<PadToolId>('pencil');
  const [activeLayer, setActiveLayer] = useState<PadLayerId>('construction');
  const [toolColors, setToolColors] = useState<Record<PadToolId, string>>({
    pencil: PENCIL_SWATCHES[0].hex,
    charcoal: CHARCOAL_SWATCHES[0].hex,
    ink: INK_SWATCHES[0].hex,
    eraser: '#000000',
    lasso: '#10B981',
  });
  const [toolSizes, setToolSizes] = useState<Record<PadToolId, number>>({
    pencil: 4,
    charcoal: 18,
    ink: 5,
    eraser: 14,
    lasso: 4,
  });
  const [toolOpacity, setToolOpacity] = useState<Record<PadToolId, number>>({
    pencil: 0.72,
    charcoal: 0.42,
    ink: 0.96,
    eraser: 1,
    lasso: 1,
  });

  const [stylusOnly, setStylusOnly] = useState(false);
  const [isBrushPopoverOpen, setIsBrushPopoverOpen] = useState(false);
  const [isLayersPopoverOpen, setIsLayersPopoverOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const [xRayConfig, setXRayConfig] = useState<PadXRayConfig>(
    DEFAULT_PAD_XRAY_CONFIG
  );
  const [xRayAlignMode, setXRayAlignMode] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 640, height: 640 });
  const [landmarkPinMode, setLandmarkPinMode] = useState<{
    enabled: boolean;
    onPinPlaced: PadPinPlacedCallback | null;
  }>({ enabled: false, onPinPlaced: null });

  const docRef = useRef(doc);
  docRef.current = doc;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResizingSplitRef = useRef(false);

  // Hydrate persisted IndexedDB sketch cleanly on mount
  useEffect(() => {
    let alive = true;
    void loadPadAutosave().then((saved) => {
      if (!alive) return;
      if (saved) {
        setDoc(saved);
      }
      setHasLoadedIdb(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Debounced IndexedDB persistence (800ms)
  useEffect(() => {
    if (!hasLoadedIdb) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void savePadAutosave(doc);
      autosaveTimerRef.current = null;
    }, PAD_AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [doc, hasLoadedIdb]);

  const commitNextDoc = useCallback((nextDoc: PadDocumentV1) => {
    const prevSnapshot = cloneDoc(docRef.current);
    setPast((prev) => [...prev.slice(-(MAX_PAD_HISTORY - 1)), prevSnapshot]);
    setFuture([]);
    setDoc({ ...nextDoc, updatedAt: Date.now() });
  }, []);

  const handleSelectTool = useCallback((nextTool: PadToolId) => {
    toolRef.current = nextTool;
    setTool(nextTool);
    if (nextTool === 'pencil') setActiveLayer('construction');
    else if (nextTool === 'charcoal') setActiveLayer('value');
    else if (nextTool === 'ink') setActiveLayer('ink');
  }, []);

  const handleCommitStroke = useCallback(
    (stroke: PadStroke) => {
      const next = cloneDoc(docRef.current);
      next.strokes.push(stroke);
      commitNextDoc(next);
    },
    [commitNextDoc]
  );

  const handleMoveLayerStrokes = useCallback(
    (moves: Array<{ id: string; dx: number; dy: number }>) => {
      if (moves.length === 0) return;
      const moveMap = new Map(moves.map((m) => [m.id, m]));
      const next = cloneDoc(docRef.current);
      next.strokes = next.strokes.map((s) => {
        const mv = moveMap.get(s.id);
        if (!mv) return s;
        return {
          ...s,
          points: s.points.map((pt) => [
            pt[0] + mv.dx,
            pt[1] + mv.dy,
            pt[2],
            pt[3],
            pt[4],
          ]),
        };
      });
      commitNextDoc(next);
    },
    [commitNextDoc]
  );

  const handleUndo = useCallback((): boolean => {
    const p = pastRef.current;
    if (p.length === 0) return false;
    const prev = p[p.length - 1];
    const current = cloneDoc(docRef.current);
    setPast(p.slice(0, -1));
    setFuture((f) => [current, ...f.slice(0, MAX_PAD_HISTORY - 1)]);
    setDoc(prev);
    return true;
  }, []);

  const handleRedo = useCallback((): boolean => {
    const f = futureRef.current;
    if (f.length === 0) return false;
    const next = f[0];
    const current = cloneDoc(docRef.current);
    setFuture(f.slice(1));
    setPast((p) => [...p.slice(-(MAX_PAD_HISTORY - 1)), current]);
    setDoc(next);
    return true;
  }, []);

  const handleClearPad = useCallback(() => {
    if (docRef.current.strokes.length === 0) return;
    const next = cloneDoc(docRef.current);
    next.strokes = [];
    commitNextDoc(next);
    onToast('Cleared Pad canvas', 'success');
  }, [commitNextDoc, onToast]);

  const handleSetColor = useCallback(
    (hex: string) => {
      setToolColors((prev) => ({ ...prev, [tool]: hex }));
    },
    [tool]
  );

  const handleTriggerXRaySource = useCallback(
    async (source: PadXRaySource) => {
      const dataUrl = await onCaptureXRaySnapshot(source);
      setXRayConfig((prev) => ({
        ...prev,
        active: true,
        source,
        dataUrl,
      }));
    },
    [onCaptureXRaySnapshot]
  );

  const handleToggleXRayCheck = useCallback(async () => {
    if (layoutMode === 'vellum') {
      onToggleVellumXRay(!vellumXRayActive);
      return;
    }
    if (xRayConfig.active) {
      setXRayConfig((prev) => ({ ...prev, active: false }));
      setXRayAlignMode(false);
      return;
    }
    await handleTriggerXRaySource(xRayConfig.source);
  }, [
    layoutMode,
    vellumXRayActive,
    onToggleVellumXRay,
    xRayConfig.active,
    xRayConfig.source,
    handleTriggerXRaySource,
  ]);

  // Register Phase 19 PadBridge imperatively + expose cleanly on window for QA
  useEffect(() => {
    const bridge: PadBridge = {
      setTool: handleSelectTool,
      setColor: (hex) =>
        setToolColors((prev) => ({ ...prev, [toolRef.current]: hex })),
      setActiveLayer,
      setLayerVisibility: (layerId, visible) => {
        setDoc((prev) => ({
          ...prev,
          updatedAt: Date.now(),
          layers: {
            ...prev.layers,
            [layerId]: { ...prev.layers[layerId], visible },
          },
        }));
      },
      setLayoutMode: onChangeLayoutMode,
      setVellumOpacity: onChangeVellumOpacity,
      setXRayCheck: (patch) =>
        setXRayConfig((prev) => ({ ...prev, ...patch })),
      setFlipHorizontal: onSetFlipHorizontalDirect,
      clearPad: handleClearPad,
      undo: handleUndo,
      redo: handleRedo,
      getStrokeTelemetry: () => computeStrokeTelemetry(docRef.current.strokes),
      setLandmarkPinMode: (enabled, onPinPlaced) =>
        setLandmarkPinMode({ enabled, onPinPlaced: onPinPlaced ?? null }),
      serializeDocument: () => cloneDoc(docRef.current),
      restoreDocument: (restored) => {
        setPast([]);
        setFuture([]);
        setDoc(cloneDoc(restored));
      },
      captureLayerCanvases: (scale = 1) => {
        const { width: cssW, height: cssH } = canvasSizeRef.current;
        const outW = Math.max(64, Math.round(cssW * scale));
        const outH = Math.max(64, Math.round(cssH * scale));
        const layers = {} as Record<PadLayerId, HTMLCanvasElement>;
        for (const id of PAD_LAYER_ORDER) {
          const c = window.document.createElement('canvas');
          renderLayerToCanvas(c, docRef.current.strokes, id, cssW, cssH, scale);
          layers[id] = c;
        }
        return { width: outW, height: outH, layers };
      },
      exportTimelapseBlob: (options) =>
        buildPadTimelapseBlob(docRef.current.strokes, docRef.current, options),
    };

    onPadBridgeReady(bridge);
    (window as Window & { __padBridge?: PadBridge | null }).__padBridge =
      bridge;

    return () => {
      onPadBridgeReady(null);
      (window as Window & { __padBridge?: PadBridge | null }).__padBridge =
        null;
    };
  }, [
    handleSelectTool,
    onChangeLayoutMode,
    onChangeVellumOpacity,
    onSetFlipHorizontalDirect,
    handleClearPad,
    handleUndo,
    handleRedo,
    onPadBridgeReady,
    tool,
  ]);

  // Split divider drag handlers
  const handleDividerPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    isResizingSplitRef.current = true;
    const onMove = (ev: PointerEvent) => {
      if (!isResizingSplitRef.current) return;
      const w = window.innerWidth || 1280;
      const raw = ev.clientX / w;
      const studioRatio = leftHandedFlip ? 1 - raw : raw;
      onChangeSplitRatio(Math.min(0.7, Math.max(0.3, studioRatio)));
    };
    const onUp = () => {
      isResizingSplitRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  if (workspaceTier !== 'pad') return null;

  const { ui } = STUDIO_THEMES[studioTheme];
  const isPhone = viewport.isMobile;
  const activeColor = toolColors[tool];
  const activeSize = toolSizes[tool];
  const activeOpacity = toolOpacity[tool];

  const activeSwatches =
    tool === 'pencil'
      ? PENCIL_SWATCHES
      : tool === 'charcoal'
        ? CHARCOAL_SWATCHES
        : tool === 'ink'
          ? INK_SWATCHES
          : [];

  // Position Pad pane strictly complementary to StudioCanvas pane so controls never cover canvas
  let padPaneStyle: CSSProperties;
  if (layoutMode === 'split') {
    const padPct = `${((1 - splitRatio) * 100).toFixed(3)}%`;
    padPaneStyle = leftHandedFlip
      ? { top: headerHeightPx, bottom: 0, left: 0, width: padPct }
      : { top: headerHeightPx, bottom: 0, right: 0, width: padPct };
  } else if (layoutMode === 'stacked') {
    padPaneStyle = { top: `calc(${headerHeightPx}px + (100dvh - ${headerHeightPx}px) * 0.42)`, bottom: 0, left: 0, right: 0 };
  } else {
    padPaneStyle = { top: headerHeightPx, bottom: 0, left: 0, right: 0 };
  }

  const dividerLeftStyle: CSSProperties = leftHandedFlip
    ? { left: `calc(${((1 - splitRatio) * 100).toFixed(3)}% - 6px)` }
    : { left: `calc(${(splitRatio * 100).toFixed(3)}% - 6px)` };

  const activeToolList: ReadonlyArray<{
    id: PadToolId;
    label: string;
    icon: JSX.Element;
  }> = [
    { id: 'pencil', label: 'Col-Erase Pencil', icon: <PencilIcon className="h-4 w-4" /> },
    { id: 'charcoal', label: 'Charcoal / Value', icon: <BrushIcon className="h-4 w-4" /> },
    { id: 'ink', label: 'Fineliner Ink', icon: <PenNibIcon className="h-4 w-4" /> },
    { id: 'eraser', label: 'Smart Eraser', icon: <EraserIcon className="h-4 w-4" /> },
    { id: 'lasso', label: 'Lasso Move', icon: <LassoIcon className="h-4 w-4" /> },
  ];

  const toolStripButtons = (
    <>
      {activeToolList.map((t) => {
        const selected = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            data-testid={`pad-tool-${t.id}`}
            aria-label={t.label}
            aria-pressed={selected}
            title={t.label}
            onClick={() => handleSelectTool(t.id)}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              selected ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            {t.icon}
            {t.id !== 'eraser' && t.id !== 'lasso' && (
              <span
                className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full border border-white/60"
                style={{ backgroundColor: toolColors[t.id] }}
              />
            )}
          </button>
        );
      })}

      <span className={`h-px w-5 shrink-0 ${isPhone || viewport.isCompactLandscape ? 'h-5 w-px' : ''} bg-current opacity-15`} />

      <button
        type="button"
        data-testid="pad-brush-settings-btn"
        aria-label="Brush size, color & paper"
        aria-expanded={isBrushPopoverOpen}
        title="Brush, Swatches & Paper"
        onClick={() => {
          setIsLayersPopoverOpen(false);
          setIsExportOpen(false);
          setIsBrushPopoverOpen((p) => !p);
        }}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          isBrushPopoverOpen ? ui.pillButtonActive : ui.pillButton
        }`}
      >
        <SlidersIcon className="h-4 w-4" />
      </button>

      <button
        type="button"
        data-testid="pad-layers-btn"
        aria-label="3-Layer Stack"
        aria-expanded={isLayersPopoverOpen}
        title={`Layers (${PAD_LAYER_META[activeLayer].shortLabel})`}
        onClick={() => {
          setIsBrushPopoverOpen(false);
          setIsExportOpen(false);
          setIsLayersPopoverOpen((p) => !p);
        }}
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          isLayersPopoverOpen ? ui.pillButtonActive : ui.pillButton
        }`}
      >
        <LayersIcon className="h-4 w-4" />
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 font-mono text-[8.5px] font-bold text-zinc-950">
          {PAD_LAYER_META[activeLayer].number}
        </span>
      </button>

      <button
        type="button"
        data-testid="pad-stylus-only-btn"
        aria-label="Stylus-only palm rejection"
        aria-pressed={stylusOnly}
        title={stylusOnly ? 'Stylus-Only ON (palm rejected)' : 'Stylus + Touch Draw'}
        onClick={() => setStylusOnly((p) => !p)}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          stylusOnly ? ui.pillButtonActive : ui.pillButton
        }`}
      >
        <StylusIcon className="h-4 w-4" />
      </button>

      <button
        type="button"
        data-testid="pad-undo-btn"
        aria-label="Undo stroke (Ctrl+Z)"
        title="Undo"
        disabled={past.length === 0}
        onClick={handleUndo}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          past.length === 0 ? ui.pillButtonDisabled : ui.pillButton
        }`}
      >
        <UndoIcon className="h-4 w-4" />
      </button>

      <button
        type="button"
        data-testid="pad-redo-btn"
        aria-label="Redo stroke (Ctrl+Shift+Z)"
        title="Redo"
        disabled={future.length === 0}
        onClick={handleRedo}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          future.length === 0 ? ui.pillButtonDisabled : ui.pillButton
        }`}
      >
        <RedoIcon className="h-4 w-4" />
      </button>

      <button
        type="button"
        data-testid="pad-clear-btn"
        aria-label="Clear pad strokes"
        title="Clear Canvas"
        disabled={doc.strokes.length === 0}
        onClick={handleClearPad}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          doc.strokes.length === 0 ? ui.pillButtonDisabled : ui.pillButton
        }`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </>
  );

  const isPadVellum = layoutMode === 'vellum';
  const passThroughTo3D = isPadVellum && vellumInteraction === 'pose';

  return (
    <>
      {/* Unified Slim Top Header Bar */}
      <header
        data-testid="pad-top-header"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ height: headerHeightPx }}
        className={`fixed top-0 left-0 right-0 z-30 flex flex-col justify-center border-b px-2.5 sm:px-3.5 backdrop-blur-xl select-none ${ui.panel}`}
      >
        {isPhone ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1.5">
              <WorkspaceModeBar
                tier={workspaceTier}
                onSelectTier={onSelectTier}
                studioTheme={studioTheme}
                inline
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="pad-layout-toggle-btn"
                  onClick={() =>
                    onChangeLayoutMode(
                      layoutMode === 'vellum' ? 'stacked' : 'vellum'
                    )
                  }
                  className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${ui.pillButton}`}
                >
                  {layoutMode === 'vellum' ? 'Stack' : 'Vellum'}
                </button>
                <button
                  type="button"
                  data-testid="pad-xray-check-btn"
                  aria-pressed={isPadVellum ? vellumXRayActive : xRayConfig.active}
                  onClick={() => void handleToggleXRayCheck()}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                    (isPadVellum ? vellumXRayActive : xRayConfig.active)
                      ? ui.pillButtonActive
                      : ui.pillButton
                  }`}
                >
                  <ScanEyeIcon className="h-3.5 w-3.5" />
                  <span>X-Ray</span>
                </button>
                <button
                  type="button"
                  data-testid="pad-export-btn"
                  aria-expanded={isExportOpen}
                  onClick={() => {
                    setIsBrushPopoverOpen(false);
                    setIsLayersPopoverOpen(false);
                    setIsExportOpen((p) => !p);
                  }}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${ui.pillButtonActive}`}
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="pad-stage-btn"
                  onClick={() => onToggleSidebar(!isSidebarOpen)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${ui.pillButton}`}
                >
                  <PanelToggleIcon collapsed={!isSidebarOpen} className="h-3 w-3" />
                  <span>Stage</span>
                </button>
                {isPadVellum && (
                  <button
                    type="button"
                    data-testid="pad-vellum-interact-btn"
                    onClick={() =>
                      onChangeVellumInteraction(
                        vellumInteraction === 'draw' ? 'pose' : 'draw'
                      )
                    }
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                      vellumInteraction === 'pose'
                        ? ui.pillButtonActive
                        : ui.pillButton
                    }`}
                  >
                    <Move3dIcon className="h-3 w-3" />
                    <span>{vellumInteraction === 'draw' ? 'Draw' : 'Pose 3D'}</span>
                  </button>
                )}
              </div>

              {isPadVellum && (
                <div className="flex flex-1 max-w-[140px] items-center gap-1.5">
                  <span className={`text-[9.5px] font-mono shrink-0 ${ui.textMuted}`}>
                    3D {Math.round(vellumOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    aria-label="3D Vellum backdrop opacity"
                    data-testid="pad-vellum-opacity-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={vellumOpacity}
                    onChange={(e) => onChangeVellumOpacity(Number(e.target.value))}
                    className="studio-range"
                  />
                </div>
              )}

              <button
                type="button"
                data-testid="pad-flip-h-btn"
                aria-pressed={flipHorizontal}
                title="Diagnostic Horizontal Flip (H)"
                onClick={onToggleFlipHorizontal}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${
                  flipHorizontal ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                <FlipHorizontalIcon className="h-3 w-3" />
                <span>Flip H</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="pad-stage-btn"
                onClick={() => onToggleSidebar(!isSidebarOpen)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-medium ${ui.pillButton}`}
              >
                <PanelToggleIcon collapsed={!isSidebarOpen} className="h-3.5 w-3.5" />
                <span>Stage</span>
              </button>

              <div className={`inline-flex items-center gap-0.5 rounded-lg p-0.5 ${ui.segmentedTrack}`}>
                <button
                  type="button"
                  data-testid="pad-layout-split-btn"
                  aria-pressed={layoutMode === 'split'}
                  onClick={() => onChangeLayoutMode('split')}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    layoutMode === 'split' ? ui.segmentedItemActive : ui.segmentedItem
                  }`}
                >
                  50/50 Split
                </button>
                <button
                  type="button"
                  data-testid="pad-layout-vellum-btn"
                  aria-pressed={layoutMode === 'vellum'}
                  onClick={() => onChangeLayoutMode('vellum')}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    layoutMode === 'vellum' ? ui.segmentedItemActive : ui.segmentedItem
                  }`}
                >
                  Vellum
                </button>
              </div>

              {layoutMode === 'split' && (
                <button
                  type="button"
                  data-testid="pad-swap-sides-btn"
                  aria-pressed={leftHandedFlip}
                  title="Left-Handed Swap (3D Right / Pad Left)"
                  onClick={onToggleLeftHandedFlip}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${
                    leftHandedFlip ? ui.pillButtonActive : ui.pillButton
                  }`}
                >
                  <SplitPaneIcon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Swap</span>
                </button>
              )}

              {isPadVellum && (
                <>
                  <button
                    type="button"
                    data-testid="pad-vellum-interact-btn"
                    onClick={() =>
                      onChangeVellumInteraction(
                        vellumInteraction === 'draw' ? 'pose' : 'draw'
                      )
                    }
                    className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                      vellumInteraction === 'pose'
                        ? ui.pillButtonActive
                        : ui.pillButton
                    }`}
                  >
                    {vellumInteraction === 'draw' ? 'Draw Mode' : 'Pose 3D'}
                  </button>
                  <div className="flex w-[115px] items-center gap-1.5">
                    <span className={`font-mono text-[9.5px] shrink-0 ${ui.textMuted}`}>
                      3D {Math.round(vellumOpacity * 100)}%
                    </span>
                    <input
                      type="range"
                      aria-label="3D Vellum backdrop opacity"
                      data-testid="pad-vellum-opacity-slider"
                      min={0}
                      max={1}
                      step={0.05}
                      value={vellumOpacity}
                      onChange={(e) => onChangeVellumOpacity(Number(e.target.value))}
                      className="studio-range"
                    />
                  </div>
                </>
              )}
            </div>

            <WorkspaceModeBar
              tier={workspaceTier}
              onSelectTier={onSelectTier}
              studioTheme={studioTheme}
              inline
            />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="pad-xray-check-btn"
                aria-pressed={isPadVellum ? vellumXRayActive : xRayConfig.active}
                onClick={() => void handleToggleXRayCheck()}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold ${
                  (isPadVellum ? vellumXRayActive : xRayConfig.active)
                    ? ui.pillButtonActive
                    : ui.pillButton
                }`}
              >
                <ScanEyeIcon className="h-3.5 w-3.5" />
                <span>{isPadVellum ? 'X-Ray Flash' : 'X-Ray Check'}</span>
              </button>

              <button
                type="button"
                data-testid="pad-flip-h-btn"
                aria-pressed={flipHorizontal}
                title="Diagnostic Horizontal Flip (H)"
                onClick={onToggleFlipHorizontal}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium ${
                  flipHorizontal ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                <FlipHorizontalIcon className="h-3.5 w-3.5" />
                <span>Flip H</span>
              </button>

              <button
                type="button"
                data-testid="pad-export-btn"
                aria-expanded={isExportOpen}
                onClick={() => {
                  setIsBrushPopoverOpen(false);
                  setIsLayersPopoverOpen(false);
                  setIsExportOpen((p) => !p);
                }}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold ${ui.pillButtonActive}`}
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                <span>Export</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Draggable Split Divider (Desktop & Tab S8 Split Mode) */}
      {layoutMode === 'split' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize 3D Studio and Drawing Pad split"
          data-testid="pad-split-divider"
          onPointerDown={handleDividerPointerDown}
          style={{
            top: headerHeightPx,
            bottom: 0,
            ...dividerLeftStyle,
            touchAction: 'none',
          }}
          className="fixed z-30 flex w-3 cursor-col-resize items-center justify-center group"
        >
          <div className="h-full w-px bg-black/25 dark:bg-white/20 group-hover:bg-emerald-400 transition-colors" />
          <div className="absolute flex h-10 w-2 items-center justify-center rounded-full bg-zinc-900/80 border border-white/25">
            <span className="h-4 w-0.5 rounded-full bg-white/75" />
          </div>
        </div>
      )}

      {/* Active Pad Container */}
      <section
        aria-label="Atelier Study Pad"
        data-testid="pad-workspace-pane"
        style={padPaneStyle}
        className={`fixed z-20 flex ${
          isPhone || viewport.isCompactLandscape ? 'flex-col' : 'flex-row'
        } ${passThroughTo3D ? 'pointer-events-none' : 'pointer-events-auto'}`}
      >
        {/* Main Column inside Pad Pane (X-Ray bar + pure Canvas 2D rect) */}
        <div className="relative flex flex-1 min-w-0 min-h-0 flex-col">
          {/* Split/Stacked X-Ray Slide Check Bar */}
          {xRayConfig.active && !isPadVellum && (
            <div
              data-testid="pad-xray-bar"
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-2.5 py-1.5 backdrop-blur-md ${ui.header}`}
            >
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'surface', label: 'Surface' },
                    { id: 'skeleton', label: 'Skeleton' },
                    { id: 'loomis', label: 'Loomis' },
                    { id: 'notan', label: 'Notan' },
                  ] as const
                ).map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    data-testid={`pad-xray-src-${src.id}`}
                    aria-pressed={xRayConfig.source === src.id}
                    onClick={() => void handleTriggerXRaySource(src.id)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      xRayConfig.source === src.id
                        ? ui.pillButtonActive
                        : ui.pillButton
                    }`}
                  >
                    {src.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex w-[96px] items-center gap-1">
                  <span className={`font-mono text-[9.5px] shrink-0 ${ui.textMuted}`}>
                    {Math.round(xRayConfig.opacity * 100)}%
                  </span>
                  <input
                    type="range"
                    aria-label="X-Ray ghost opacity"
                    min={0.15}
                    max={0.7}
                    step={0.05}
                    value={xRayConfig.opacity}
                    onChange={(e) =>
                      setXRayConfig((p) => ({ ...p, opacity: Number(e.target.value) }))
                    }
                    className="studio-range"
                  />
                </div>

                <div className="flex w-[86px] items-center gap-1">
                  <span className={`font-mono text-[9.5px] shrink-0 ${ui.textMuted}`}>
                    {Math.round(xRayConfig.scale * 100)}%
                  </span>
                  <input
                    type="range"
                    aria-label="X-Ray ghost scale"
                    min={0.5}
                    max={1.6}
                    step={0.05}
                    value={xRayConfig.scale}
                    onChange={(e) =>
                      setXRayConfig((p) => ({ ...p, scale: Number(e.target.value) }))
                    }
                    className="studio-range"
                  />
                </div>

                <button
                  type="button"
                  data-testid="pad-xray-align-btn"
                  aria-pressed={xRayAlignMode}
                  onClick={() => setXRayAlignMode((p) => !p)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                    xRayAlignMode ? ui.pillButtonActive : ui.pillButton
                  }`}
                >
                  Align Drag
                </button>

                <button
                  type="button"
                  title="Reset X-Ray position and scale"
                  onClick={() =>
                    setXRayConfig((p) => ({ ...p, offsetX: 0, offsetY: 0, scale: 1 }))
                  }
                  className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
                >
                  <RotateCcwIcon className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  data-testid="pad-xray-done-btn"
                  onClick={() => {
                    setXRayConfig((p) => ({ ...p, active: false }));
                    setXRayAlignMode(false);
                  }}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${ui.pillButtonActive}`}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Pure Drawing Canvas Rect (zero floating buttons inside canvas!) */}
          <div className="relative flex-1 min-w-0 min-h-0">
            <PadCanvas
              document={doc}
              activeLayer={activeLayer}
              tool={tool}
              color={activeColor}
              brushSize={activeSize}
              opacity={activeOpacity}
              layoutMode={layoutMode}
              flipHorizontal={flipHorizontal}
              stylusOnly={stylusOnly}
              onAutoEnableStylusOnly={() => setStylusOnly(true)}
              xRayConfig={xRayConfig}
              xRayAlignMode={xRayAlignMode}
              onUpdateXRayOffset={(offsetX, offsetY) =>
                setXRayConfig((p) => ({ ...p, offsetX, offsetY }))
              }
              landmarkPinMode={landmarkPinMode}
              onCommitStroke={handleCommitStroke}
              onMoveLayerStrokes={handleMoveLayerStrokes}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onCanvasSizeChange={setCanvasSize}
            />
          </div>
        </div>

        {/* Minimal Atelier 8 Toolstrip (strictly outside canvas rect!) */}
        <aside
          aria-label="Atelier Drawing Toolstrip"
          data-testid="pad-toolstrip"
          onPointerDown={(e) => e.stopPropagation()}
          className={`pointer-events-auto studio-scroll flex shrink-0 items-center gap-1.5 backdrop-blur-xl ${ui.panel} ${
            isPhone || viewport.isCompactLandscape
              ? 'w-full overflow-x-auto border-t px-2.5 py-1.5'
              : 'w-[54px] flex-col overflow-y-auto border-l py-2.5 px-1.5'
          }`}
          style={
            isPhone || viewport.isCompactLandscape
              ? { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)' }
              : undefined
          }
        >
          {toolStripButtons}
        </aside>
      </section>

      {/* Brush, Color Swatches & Paper Popover */}
      {isBrushPopoverOpen && (
        <div
          role="dialog"
          aria-label="Brush Settings & Paper"
          data-testid="pad-brush-popover"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            bottom:
              isPhone || viewport.isCompactLandscape
                ? 'calc(env(safe-area-inset-bottom, 0px) + 62px)'
                : undefined,
            top:
              isPhone || viewport.isCompactLandscape
                ? undefined
                : `${headerHeightPx + 12}px`,
            right:
              isPhone || viewport.isCompactLandscape ? '12px' : '64px',
          }}
          className={`fixed z-40 w-[248px] max-w-[calc(100vw-24px)] rounded-2xl p-3.5 space-y-3 backdrop-blur-xl select-none ${ui.panel}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${ui.textPrimary}`}>
              Brush &amp; Paper
            </span>
            <button
              type="button"
              aria-label="Close brush settings"
              onClick={() => setIsBrushPopoverOpen(false)}
              className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {activeSwatches.length > 0 && (
            <div className="space-y-1">
              <span className={`block text-[10px] font-medium ${ui.textMuted}`}>
                Color Swatches
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeSwatches.map((sw) => {
                  const active = activeColor.toLowerCase() === sw.hex.toLowerCase();
                  return (
                    <button
                      key={sw.hex}
                      type="button"
                      title={sw.label}
                      aria-label={sw.label}
                      aria-pressed={active}
                      onClick={() => handleSetColor(sw.hex)}
                      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium border ${
                        active ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-white/50 shrink-0"
                        style={{ backgroundColor: sw.hex }}
                      />
                      <span>{sw.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <PrecisionSlider
            id="pad-brush-size"
            label="Brush Size"
            value={activeSize}
            min={2}
            max={40}
            step={1}
            displayValue={`${activeSize}px`}
            onChange={(v) =>
              setToolSizes((prev) => ({ ...prev, [tool]: v }))
            }
            theme={STUDIO_THEMES[studioTheme]}
          />

          {tool !== 'eraser' && tool !== 'lasso' && (
            <PrecisionSlider
              id="pad-brush-opacity"
              label="Stroke Opacity"
              value={Math.round(activeOpacity * 100)}
              min={15}
              max={100}
              step={5}
              displayValue={`${Math.round(activeOpacity * 100)}%`}
              onChange={(v) =>
                setToolOpacity((prev) => ({ ...prev, [tool]: v / 100 }))
              }
              theme={STUDIO_THEMES[studioTheme]}
            />
          )}

          {layoutMode !== 'vellum' && (
            <div className="space-y-1.5 pt-1 border-t border-current/10">
              <span className={`block text-[10px] font-medium ${ui.textMuted}`}>
                Paper Tone
              </span>
              <div className="grid grid-cols-4 gap-1">
                {PAD_PAPER_ORDER.map((tone: PadPaperTone) => {
                  const meta = PAD_PAPER_META[tone];
                  const active = doc.paperTone === tone;
                  return (
                    <button
                      key={tone}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setDoc((prev) => ({
                          ...prev,
                          updatedAt: Date.now(),
                          paperTone: tone,
                        }))
                      }
                      className={`rounded-lg px-1.5 py-1 text-[9.5px] font-medium ${
                        active ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      <span
                        className="mx-auto mb-0.5 block h-2.5 w-full rounded border border-black/15"
                        style={{ backgroundColor: meta.hex }}
                      />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3-Layer Stack Popover */}
      {isLayersPopoverOpen && (
        <div
          role="dialog"
          aria-label="3-Layer Sketch Stack"
          data-testid="pad-layers-popover"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            bottom:
              isPhone || viewport.isCompactLandscape
                ? 'calc(env(safe-area-inset-bottom, 0px) + 62px)'
                : undefined,
            top:
              isPhone || viewport.isCompactLandscape
                ? undefined
                : `${headerHeightPx + 12}px`,
            right:
              isPhone || viewport.isCompactLandscape ? '12px' : '64px',
          }}
          className={`fixed z-40 w-[256px] max-w-[calc(100vw-24px)] rounded-2xl p-3.5 space-y-2.5 backdrop-blur-xl select-none ${ui.panel}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${ui.textPrimary}`}>
              3-Layer Stack
            </span>
            <button
              type="button"
              aria-label="Close layers popover"
              onClick={() => setIsLayersPopoverOpen(false)}
              className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {PAD_LAYER_UI_ORDER.map((layerId) => {
              const meta = PAD_LAYER_META[layerId];
              const cfg = doc.layers[layerId];
              const isAct = activeLayer === layerId;
              return (
                <div
                  key={layerId}
                  className={`rounded-xl p-2 space-y-1.5 border ${
                    isAct ? 'border-emerald-400/60 ' : ''
                  }${ui.card}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      data-testid={`pad-layer-select-${layerId}`}
                      onClick={() => setActiveLayer(layerId)}
                      className={`text-left text-[11px] font-semibold flex-1 truncate ${
                        isAct ? 'text-emerald-400' : ui.textPrimary
                      }`}
                    >
                      {meta.label}
                    </button>
                    <button
                      type="button"
                      data-testid={`pad-layer-vis-${layerId}`}
                      aria-label={cfg.visible ? `Hide ${meta.label}` : `Show ${meta.label}`}
                      onClick={() =>
                        setDoc((prev) => ({
                          ...prev,
                          updatedAt: Date.now(),
                          layers: {
                            ...prev.layers,
                            [layerId]: { ...cfg, visible: !cfg.visible },
                          },
                        }))
                      }
                      className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
                    >
                      {cfg.visible ? (
                        <EyeIcon className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOffIcon className="h-3.5 w-3.5 opacity-55" />
                      )}
                    </button>
                  </div>

                  <PrecisionSlider
                    id={`pad-layer-opacity-${layerId}`}
                    label="Opacity"
                    value={Math.round(cfg.opacity * 100)}
                    min={10}
                    max={100}
                    step={5}
                    displayValue={`${Math.round(cfg.opacity * 100)}%`}
                    onChange={(v) =>
                      setDoc((prev) => ({
                        ...prev,
                        updatedAt: Date.now(),
                        layers: {
                          ...prev.layers,
                          [layerId]: { ...cfg, opacity: v / 100 },
                        },
                      }))
                    }
                    theme={STUDIO_THEMES[studioTheme]}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Format Export Popover */}
      <PadExportPopover
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        studioTheme={studioTheme}
        document={doc}
        canvasSize={canvasSize}
        snapshotBridge={snapshotBridge}
        onExportDone={onToast}
      />
    </>
  );
}
