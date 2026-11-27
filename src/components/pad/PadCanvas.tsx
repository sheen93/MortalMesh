'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  PAD_LAYER_ORDER,
  PAD_PAPER_META,
  type PadDocumentV1,
  type PadLayerId,
  type PadLayoutMode,
  type PadStroke,
  type PadStrokePoint,
  type PadToolId,
  type PadXRayConfig,
} from '@/types/pad';
import type { PadPinPlacedCallback } from '@/types/padBridge';
import {
  drawStrokeToContext,
  pointInPolygon,
  renderLayerToCanvas,
} from '@/utils/padRenderer';

interface PadCanvasProps {
  document: PadDocumentV1;
  activeLayer: PadLayerId;
  tool: PadToolId;
  color: string;
  brushSize: number;
  opacity: number;
  layoutMode: PadLayoutMode;
  flipHorizontal: boolean;
  stylusOnly: boolean;
  onAutoEnableStylusOnly: () => void;
  xRayConfig: PadXRayConfig;
  xRayAlignMode: boolean;
  onUpdateXRayOffset: (offsetX: number, offsetY: number) => void;
  landmarkPinMode: {
    enabled: boolean;
    onPinPlaced: PadPinPlacedCallback | null;
  };
  onCommitStroke: (stroke: PadStroke) => void;
  onMoveLayerStrokes: (moves: Array<{ id: string; dx: number; dy: number }>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCanvasSizeChange?: (size: { width: number; height: number }) => void;
}

interface LassoSelection {
  strokeIds: Set<string>;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

interface TouchTrackEntry {
  startX: number;
  startY: number;
  maxMove: number;
}

function makeStrokeId(): string {
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function PadCanvas({
  document: doc,
  activeLayer,
  tool,
  color,
  brushSize,
  opacity,
  layoutMode,
  flipHorizontal,
  stylusOnly,
  onAutoEnableStylusOnly,
  xRayConfig,
  xRayAlignMode,
  onUpdateXRayOffset,
  landmarkPinMode,
  onCommitStroke,
  onMoveLayerStrokes,
  onUndo,
  onRedo,
  onCanvasSizeChange,
}: PadCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);

  const layerCanvasesRef = useRef<Record<PadLayerId, HTMLCanvasElement | null>>({
    construction: null,
    ink: null,
    value: null,
  });

  const [size, setSize] = useState({ width: 640, height: 640 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const [snapBanner, setSnapBanner] = useState(false);
  const snapBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest props in refs for zero-stale high-frequency pointer handlers
  const docRef = useRef(doc);
  docRef.current = doc;
  const activeLayerRef = useRef(activeLayer);
  activeLayerRef.current = activeLayer;
  const layoutModeRef = useRef(layoutMode);
  layoutModeRef.current = layoutMode;
  const flipRef = useRef(flipHorizontal);
  flipRef.current = flipHorizontal;
  const xRayRef = useRef(xRayConfig);
  xRayRef.current = xRayConfig;

  const activeStrokeRef = useRef<PadStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // Straight-line snap timer state
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapAnchorCssRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const latestCssRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Lasso state
  const lassoPolyRef = useRef<Array<[number, number]>>([]);
  const lassoSelectionRef = useRef<LassoSelection | null>(null);
  const lassoDragRef = useRef<{
    active: boolean;
    startNormX: number;
    startNormY: number;
    dx: number;
    dy: number;
  }>({ active: false, startNormX: 0, startNormY: 0, dx: 0, dy: 0 });

  // X-Ray alignment drag state
  const xRayDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    initOffsetX: number;
    initOffsetY: number;
  }>({ active: false, startX: 0, startY: 0, initOffsetX: 0, initOffsetY: 0 });

  // Multi-finger touch gestures (2-finger tap Undo, 3-finger tap Redo)
  const touchTrackRef = useRef<{
    active: Map<number, TouchTrackEntry>;
    maxFingers: number;
    startTime: number;
  }>({
    active: new Map(),
    maxFingers: 0,
    startTime: 0,
  });

  // Loaded X-Ray image element
  const xRayImageRef = useRef<{ src: string; img: HTMLImageElement } | null>(
    null
  );

  const rafIdRef = useRef<number | null>(null);

  const ensureLayerCanvas = (layerId: PadLayerId): HTMLCanvasElement => {
    let c = layerCanvasesRef.current[layerId];
    if (!c) {
      c = window.document.createElement('canvas');
      layerCanvasesRef.current[layerId] = c;
    }
    return c;
  };

  const getContext2D = useCallback((canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
    const isOpaque = layoutModeRef.current !== 'vellum';
    if (isOpaque) {
      return (
        canvas.getContext('2d', { alpha: false, desynchronized: true }) ??
        canvas.getContext('2d', { alpha: false }) ??
        canvas.getContext('2d')
      );
    }
    return canvas.getContext('2d', { alpha: true }) ?? canvas.getContext('2d');
  }, []);

  const compositeNow = useCallback(() => {
    rafIdRef.current = null;
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const { width: cssW, height: cssH } = sizeRef.current;
    if (cssW <= 0 || cssH <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = getContext2D(canvas);
    if (!ctx) return;

    const curDoc = docRef.current;
    const curLayout = layoutModeRef.current;
    const isOpaque = curLayout !== 'vellum';
    const xRay = xRayRef.current;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (isOpaque) {
      ctx.fillStyle = PAD_PAPER_META[curDoc.paperTone]?.hex ?? '#FAF9F5';
      ctx.fillRect(0, 0, targetW, targetH);
    } else {
      ctx.clearRect(0, 0, targetW, targetH);
    }

    ctx.scale(dpr, dpr);

    if (flipRef.current) {
      ctx.translate(cssW, 0);
      ctx.scale(-1, 1);
    }

    // 1. Optional X-Ray 3D ghost beneath sketch strokes
    if (
      xRay.active &&
      xRay.dataUrl &&
      xRayImageRef.current?.src === xRay.dataUrl &&
      xRayImageRef.current.img.complete &&
      xRayImageRef.current.img.naturalWidth > 0
    ) {
      const img = xRayImageRef.current.img;
      const fitScale = Math.min(cssW / img.naturalWidth, cssH / img.naturalHeight);
      const drawW = img.naturalWidth * fitScale * xRay.scale;
      const drawH = img.naturalHeight * fitScale * xRay.scale;
      const drawX = (cssW - drawW) * 0.5 + xRay.offsetX;
      const drawY = (cssH - drawH) * 0.5 + xRay.offsetY;
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0.05, xRay.opacity));
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    // 2. Cached layer canvases
    const lassoDrag = lassoDragRef.current;
    const sel = lassoSelectionRef.current;

    for (const layerId of PAD_LAYER_ORDER) {
      const layerCfg = curDoc.layers[layerId];
      if (!layerCfg?.visible || layerCfg.opacity <= 0) continue;

      const off = layerCanvasesRef.current[layerId];
      if (!off || off.width === 0 || off.height === 0) continue;

      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, layerCfg.opacity));
      if (
        lassoDrag.active &&
        sel &&
        sel.strokeIds.size > 0 &&
        layerId === activeLayerRef.current &&
        (lassoDrag.dx !== 0 || lassoDrag.dy !== 0)
      ) {
        // Live drag preview shifts active layer cleanly (strokes already filtered into offscreen vs live drag)
        ctx.drawImage(off, 0, 0, cssW, cssH);
      } else {
        ctx.drawImage(off, 0, 0, cssW, cssH);
      }
      ctx.restore();
    }

    // 3. In-progress stroke (rendered strictly on top layer during drag)
    const activeStroke = activeStrokeRef.current;
    if (activeStroke && curDoc.layers[activeStroke.layerId]?.visible) {
      if (activeStroke.tool === 'eraser') {
        // Preview eraser softly if offscreen hasn't rebuilt yet
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const previewStroke: PadStroke = {
          ...activeStroke,
          tool: 'ink',
          color: isOpaque
            ? PAD_PAPER_META[curDoc.paperTone]?.hex ?? '#FAF9F5'
            : 'rgba(255,255,255,0.65)',
          opacity: 0.75,
        };
        drawStrokeToContext(ctx, previewStroke, cssW, cssH);
        ctx.restore();
      } else {
        drawStrokeToContext(ctx, activeStroke, cssW, cssH);
      }
    }

    // 4. Shifted strokes live preview during Lasso drag
    if (lassoDrag.active && sel && sel.strokeIds.size > 0) {
      for (const s of curDoc.strokes) {
        if (!sel.strokeIds.has(s.id)) continue;
        const shifted: PadStroke = {
          ...s,
          points: s.points.map((pt) => [
            pt[0] + lassoDrag.dx,
            pt[1] + lassoDrag.dy,
            pt[2],
            pt[3],
            pt[4],
          ]),
        };
        drawStrokeToContext(ctx, shifted, cssW, cssH);
      }
    }

    // 5. Lasso polygon & selection marquee
    if (lassoPolyRef.current.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      lassoPolyRef.current.forEach(([nx, ny], idx) => {
        const px = nx * cssW;
        const py = ny * cssH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    if (sel && sel.strokeIds.size > 0) {
      const dx = lassoDrag.active ? lassoDrag.dx : 0;
      const dy = lassoDrag.active ? lassoDrag.dy : 0;
      const x = (sel.bbox.minX + dx) * cssW - 6;
      const y = (sel.bbox.minY + dy) * cssH - 6;
      const w = (sel.bbox.maxX - sel.bbox.minX) * cssW + 12;
      const h = (sel.bbox.maxY - sel.bbox.minY) * cssH + 12;
      ctx.save();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    ctx.restore();
  }, [getContext2D]);

  const scheduleComposite = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(compositeNow);
  }, [compositeNow]);

  const rebuildAllLayerCaches = useCallback(
    (excludeIds?: Set<string>) => {
      const { width: cssW, height: cssH } = sizeRef.current;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const strokes = excludeIds
        ? docRef.current.strokes.filter((s) => !excludeIds.has(s.id))
        : docRef.current.strokes;
      for (const layerId of PAD_LAYER_ORDER) {
        const off = ensureLayerCanvas(layerId);
        renderLayerToCanvas(off, strokes, layerId, cssW, cssH, dpr);
      }
      scheduleComposite();
    },
    [scheduleComposite]
  );

  // Measure container size via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(64, Math.floor(rect.width));
      const h = Math.max(64, Math.floor(rect.height));
      if (w !== sizeRef.current.width || h !== sizeRef.current.height) {
        sizeRef.current = { width: w, height: h };
        setSize({ width: w, height: h });
        onCanvasSizeChange?.({ width: w, height: h });
        rebuildAllLayerCaches();
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onCanvasSizeChange, rebuildAllLayerCaches]);

  // Clear lasso selection if document changes externally or tool leaves lasso
  useEffect(() => {
    if (tool !== 'lasso' && lassoSelectionRef.current) {
      lassoSelectionRef.current = null;
      lassoPolyRef.current = [];
      rebuildAllLayerCaches();
    }
  }, [tool, rebuildAllLayerCaches]);

  useEffect(() => {
    lassoSelectionRef.current = null;
    lassoPolyRef.current = [];
    rebuildAllLayerCaches();
  }, [doc, layoutMode, flipHorizontal, size.width, size.height, rebuildAllLayerCaches]);

  // Load X-Ray ghost image cleanly when dataUrl changes
  useEffect(() => {
    if (!xRayConfig.active || !xRayConfig.dataUrl) {
      xRayImageRef.current = null;
      scheduleComposite();
      return;
    }
    if (xRayImageRef.current?.src === xRayConfig.dataUrl) {
      scheduleComposite();
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      xRayImageRef.current = { src: xRayConfig.dataUrl!, img };
      scheduleComposite();
    };
    img.src = xRayConfig.dataUrl;
  }, [
    xRayConfig.active,
    xRayConfig.dataUrl,
    xRayConfig.opacity,
    xRayConfig.offsetX,
    xRayConfig.offsetY,
    xRayConfig.scale,
    scheduleComposite,
  ]);

  // Cancel any pending rAF/timers on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      if (snapBannerTimerRef.current) clearTimeout(snapBannerTimerRef.current);
    };
  }, []);

  const clientToPoint = (
    clientX: number,
    clientY: number,
    pressure: number,
    tiltX: number,
    tiltY: number
  ): { point: PadStrokePoint; cssX: number; cssY: number } => {
    const canvas = displayCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const w = rect?.width || sizeRef.current.width || 1;
    const h = rect?.height || sizeRef.current.height || 1;
    const cssX = clientX - (rect?.left ?? 0);
    const cssY = clientY - (rect?.top ?? 0);
    const rawNormX = clamp01(cssX / w);
    const normX = flipRef.current ? 1 - rawNormX : rawNormX;
    const normY = clamp01(cssY / h);
    const p =
      Number.isFinite(pressure) && pressure > 0 ? Math.min(1, pressure) : 0.5;
    const tx = flipRef.current ? -(tiltX || 0) : tiltX || 0;
    const ty = tiltY || 0;
    return {
      point: [
        Math.round(normX * 10000) / 10000,
        Math.round(normY * 10000) / 10000,
        Math.round(p * 1000) / 1000,
        Math.round(tx),
        Math.round(ty),
      ],
      cssX,
      cssY,
    };
  };

  const clearSnapTimer = () => {
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  };

  const armSnapTimer = () => {
    clearSnapTimer();
    snapTimerRef.current = setTimeout(() => {
      const active = activeStrokeRef.current;
      if (!active || active.isStraightLine || active.points.length < 2) return;
      const first = active.points[0];
      const last = active.points[active.points.length - 1];
      const dxPx = (last[0] - first[0]) * sizeRef.current.width;
      const dyPx = (last[1] - first[1]) * sizeRef.current.height;
      if (Math.hypot(dxPx, dyPx) < 18) return;

      active.isStraightLine = true;
      active.points = [first, last];
      setSnapBanner(true);
      scheduleComposite();
    }, 320);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();

    // Phase 19 landmark pin placement hook (supports mouse, pen, and single-finger touch)
    if (
      landmarkPinMode.enabled &&
      landmarkPinMode.onPinPlaced &&
      event.isPrimary !== false &&
      (event.button === 0 ||
        event.pointerType === 'pen' ||
        event.pointerType === 'touch')
    ) {
      const { point } = clientToPoint(
        event.clientX,
        event.clientY,
        event.pressure,
        event.tiltX,
        event.tiltY
      );
      landmarkPinMode.onPinPlaced(point[0], point[1]);
      return;
    }

    // Multi-finger touch tracking (for 2-finger Undo / 3-finger Redo & blocking palm strokes)
    if (event.pointerType === 'touch') {
      const tracker = touchTrackRef.current;
      if (tracker.active.size === 0) {
        tracker.maxFingers = 0;
        tracker.startTime = performance.now();
      }
      tracker.active.set(event.pointerId, {
        startX: event.clientX,
        startY: event.clientY,
        maxMove: 0,
      });
      tracker.maxFingers = Math.max(tracker.maxFingers, tracker.active.size);

      if (stylusOnly) {
        return;
      }
      if (tracker.active.size > 1) {
        // Cancel any single-finger accidental stroke when second finger lands
        if (isDrawingRef.current) {
          isDrawingRef.current = false;
          activeStrokeRef.current = null;
          activePointerIdRef.current = null;
          clearSnapTimer();
          scheduleComposite();
        }
        return;
      }
    }

    if (event.pointerType === 'pen') {
      if (!stylusOnly) {
        onAutoEnableStylusOnly();
      }
    }

    if (event.button !== 0 && event.button !== 5 && event.pointerType !== 'pen') {
      return;
    }

    const { point, cssX, cssY } = clientToPoint(
      event.clientX,
      event.clientY,
      event.pressure,
      event.tiltX,
      event.tiltY
    );

    // X-Ray Ghost alignment nudge drag
    if (xRayConfig.active && xRayAlignMode) {
      xRayDragRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        initOffsetX: xRayConfig.offsetX,
        initOffsetY: xRayConfig.offsetY,
      };
      activePointerIdRef.current = event.pointerId;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {}
      return;
    }

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {}
    activePointerIdRef.current = event.pointerId;

    // Lasso workflow
    if (tool === 'lasso') {
      const sel = lassoSelectionRef.current;
      if (
        sel &&
        sel.strokeIds.size > 0 &&
        point[0] >= sel.bbox.minX - 0.02 &&
        point[0] <= sel.bbox.maxX + 0.02 &&
        point[1] >= sel.bbox.minY - 0.02 &&
        point[1] <= sel.bbox.maxY + 0.02
      ) {
        lassoDragRef.current = {
          active: true,
          startNormX: point[0],
          startNormY: point[1],
          dx: 0,
          dy: 0,
        };
        rebuildAllLayerCaches(sel.strokeIds);
        return;
      }
      lassoSelectionRef.current = null;
      lassoPolyRef.current = [[point[0], point[1]]];
      rebuildAllLayerCaches();
      return;
    }

    const barrelEraser =
      event.pointerType === 'pen' &&
      ((event.buttons & 32) !== 0 || event.button === 5);
    const effectiveTool: Exclude<PadToolId, 'lasso'> = barrelEraser
      ? 'eraser'
      : tool;

    isDrawingRef.current = true;
    activeStrokeRef.current = {
      id: makeStrokeId(),
      layerId: activeLayer,
      tool: effectiveTool,
      color,
      baseSize: brushSize,
      opacity,
      isStraightLine: false,
      points: [point],
    };
    snapAnchorCssRef.current = { x: cssX, y: cssY };
    latestCssRef.current = { x: cssX, y: cssY };
    if (effectiveTool === 'pencil' || effectiveTool === 'ink') {
      armSnapTimer();
    }
    scheduleComposite();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();

    if (event.pointerType === 'touch') {
      const entry = touchTrackRef.current.active.get(event.pointerId);
      if (entry) {
        const d = Math.hypot(
          event.clientX - entry.startX,
          event.clientY - entry.startY
        );
        if (d > entry.maxMove) entry.maxMove = d;
      }
    }

    if (xRayDragRef.current.active && activePointerIdRef.current === event.pointerId) {
      const dx = event.clientX - xRayDragRef.current.startX;
      const dy = event.clientY - xRayDragRef.current.startY;
      const dirX = flipRef.current ? -dx : dx;
      onUpdateXRayOffset(
        Math.round(xRayDragRef.current.initOffsetX + dirX),
        Math.round(xRayDragRef.current.initOffsetY + dy)
      );
      return;
    }

    if (activePointerIdRef.current !== event.pointerId) return;

    if (tool === 'lasso') {
      const { point } = clientToPoint(
        event.clientX,
        event.clientY,
        event.pressure,
        event.tiltX,
        event.tiltY
      );
      if (lassoDragRef.current.active) {
        lassoDragRef.current.dx = point[0] - lassoDragRef.current.startNormX;
        lassoDragRef.current.dy = point[1] - lassoDragRef.current.startNormY;
        scheduleComposite();
        return;
      }
      if (lassoPolyRef.current.length > 0) {
        const prev = lassoPolyRef.current[lassoPolyRef.current.length - 1];
        if (Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.004) {
          lassoPolyRef.current.push([point[0], point[1]]);
          scheduleComposite();
        }
      }
      return;
    }

    const active = activeStrokeRef.current;
    if (!isDrawingRef.current || !active) return;

    const nativeEvt = event.nativeEvent;
    const coalesced =
      typeof nativeEvt.getCoalescedEvents === 'function'
        ? nativeEvt.getCoalescedEvents()
        : null;
    const eventsToProcess =
      coalesced && coalesced.length > 0 ? coalesced : [nativeEvt];

    for (const ev of eventsToProcess) {
      const { point, cssX, cssY } = clientToPoint(
        ev.clientX,
        ev.clientY,
        ev.pressure,
        ev.tiltX,
        ev.tiltY
      );
      latestCssRef.current = { x: cssX, y: cssY };

      if (active.isStraightLine) {
        active.points = [active.points[0], point];
      } else {
        active.points.push(point);
        if (
          Math.hypot(
            cssX - snapAnchorCssRef.current.x,
            cssY - snapAnchorCssRef.current.y
          ) >= 4
        ) {
          snapAnchorCssRef.current = { x: cssX, y: cssY };
          if (active.tool === 'pencil' || active.tool === 'ink') {
            armSnapTimer();
          }
        }
      }
    }

    scheduleComposite();
  };

  const finishStrokeOrGesture = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    canceled: boolean
  ) => {
    event.stopPropagation();

    if (event.pointerType === 'touch') {
      const tracker = touchTrackRef.current;
      const entry = tracker.active.get(event.pointerId);
      if (entry) {
        const d = Math.hypot(
          event.clientX - entry.startX,
          event.clientY - entry.startY
        );
        if (d > entry.maxMove) entry.maxMove = d;
      }
      tracker.active.delete(event.pointerId);
      if (tracker.active.size === 0 && !canceled) {
        const elapsed = performance.now() - tracker.startTime;
        if (tracker.maxFingers === 2 && elapsed < 260) {
          onUndo();
        } else if (tracker.maxFingers === 3 && elapsed < 300) {
          onRedo();
        }
        tracker.maxFingers = 0;
      }
    }

    if (xRayDragRef.current.active && activePointerIdRef.current === event.pointerId) {
      xRayDragRef.current.active = false;
      activePointerIdRef.current = null;
      return;
    }

    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {}

    if (tool === 'lasso') {
      const drag = lassoDragRef.current;
      const sel = lassoSelectionRef.current;
      if (drag.active && sel) {
        const { dx, dy } = drag;
        drag.active = false;
        drag.dx = 0;
        drag.dy = 0;
        if (!canceled && (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002)) {
          sel.bbox = {
            minX: sel.bbox.minX + dx,
            minY: sel.bbox.minY + dy,
            maxX: sel.bbox.maxX + dx,
            maxY: sel.bbox.maxY + dy,
          };
          onMoveLayerStrokes(
            Array.from(sel.strokeIds).map((id) => ({ id, dx, dy }))
          );
        } else {
          rebuildAllLayerCaches();
        }
        return;
      }

      const poly = lassoPolyRef.current;
      lassoPolyRef.current = [];
      if (!canceled && poly.length >= 3) {
        const matchedIds = new Set<string>();
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const s of docRef.current.strokes) {
          if (s.layerId !== activeLayerRef.current || s.tool === 'eraser') {
            continue;
          }
          if (s.points.length === 0) continue;
          let insideCount = 0;
          let sumX = 0;
          let sumY = 0;
          for (const pt of s.points) {
            sumX += pt[0];
            sumY += pt[1];
            if (pointInPolygon(pt[0], pt[1], poly)) {
              insideCount += 1;
            }
          }
          const cx = sumX / s.points.length;
          const cy = sumY / s.points.length;
          if (
            pointInPolygon(cx, cy, poly) ||
            insideCount / s.points.length >= 0.4
          ) {
            matchedIds.add(s.id);
            for (const pt of s.points) {
              if (pt[0] < minX) minX = pt[0];
              if (pt[1] < minY) minY = pt[1];
              if (pt[0] > maxX) maxX = pt[0];
              if (pt[1] > maxY) maxY = pt[1];
            }
          }
        }

        lassoSelectionRef.current =
          matchedIds.size > 0
            ? {
                strokeIds: matchedIds,
                bbox: { minX, minY, maxX, maxY },
              }
            : null;
      }
      scheduleComposite();
      return;
    }

    clearSnapTimer();
    const active = activeStrokeRef.current;
    isDrawingRef.current = false;
    activeStrokeRef.current = null;

    if (snapBanner) {
      if (snapBannerTimerRef.current) clearTimeout(snapBannerTimerRef.current);
      snapBannerTimerRef.current = setTimeout(() => setSnapBanner(false), 900);
    }

    if (!canceled && active && active.points.length > 0) {
      if (active.points.length === 1) {
        const p = active.points[0];
        active.points.push([
          clamp01(p[0] + 0.0005),
          clamp01(p[1] + 0.0005),
          p[2],
          p[3],
          p[4],
        ]);
      }
      onCommitStroke(active);
    } else {
      scheduleComposite();
    }
  };

  const isOpaque = layoutMode !== 'vellum';

  return (
    <div
      ref={containerRef}
      data-testid="pad-canvas-container"
      className="relative h-full w-full overflow-hidden select-none"
      style={{
        backgroundColor: isOpaque
          ? PAD_PAPER_META[doc.paperTone]?.hex ?? '#FAF9F5'
          : 'transparent',
      }}
    >
      <canvas
        key={isOpaque ? 'opaque' : 'vellum'}
        ref={displayCanvasRef}
        data-testid="pad-drawing-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishStrokeOrGesture(e, false)}
        onPointerCancel={(e) => finishStrokeOrGesture(e, true)}
        style={{ touchAction: 'none' }}
        className={`block h-full w-full ${
          landmarkPinMode.enabled
            ? 'cursor-crosshair'
            : xRayConfig.active && xRayAlignMode
              ? 'cursor-move'
              : tool === 'lasso'
                ? 'cursor-crosshair'
                : 'cursor-crosshair'
        }`}
      />
      {snapBanner && (
        <div
          data-testid="pad-straight-snap-badge"
          className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-950 shadow-sm"
        >
          Straight Line Snapped
        </div>
      )}
    </div>
  );
}
