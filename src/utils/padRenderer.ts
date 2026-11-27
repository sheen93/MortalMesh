import getStroke from 'perfect-freehand';
import type {
  PadLayerId,
  PadStroke,
  PadStrokePoint,
  PadStrokeTelemetry,
} from '@/types/pad';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function buildEffectivePoints(
  stroke: PadStroke,
  width: number,
  height: number
): Array<[number, number, number]> {
  const pts = stroke.points;
  if (pts.length === 0) return [];

  if (stroke.isStraightLine && pts.length >= 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    const samples: Array<[number, number, number]> = [];
    const steps = 16;
    const pStart = clamp01(first[2] > 0 ? first[2] : 0.55);
    const pEnd = clamp01(last[2] > 0 ? last[2] : 0.55);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = (first[0] + (last[0] - first[0]) * t) * width;
      const y = (first[1] + (last[1] - first[1]) * t) * height;
      const p = pStart + (pEnd - pStart) * t;
      samples.push([x, y, p]);
    }
    return samples;
  }

  return pts.map((pt) => {
    const x = pt[0] * width;
    const y = pt[1] * height;
    let p = pt[2] > 0 ? pt[2] : 0.5;
    if (stroke.tool === 'charcoal') {
      const tiltMag = Math.min(1, Math.hypot(pt[3], pt[4]) / 65);
      p = Math.min(1.35, Math.max(0.2, p * (1 + tiltMag * 1.45)));
    }
    return [x, y, p];
  });
}

export function getStrokePixelSize(
  baseSize: number,
  width: number,
  height: number
): number {
  const refSpan = Math.max(320, Math.min(width, height)) / 1000;
  return Math.max(1.2, baseSize * refSpan);
}

export function computeStrokeOutline(
  stroke: PadStroke,
  width: number,
  height: number
): number[][] {
  if (stroke.points.length === 0 || width <= 0 || height <= 0) return [];

  const pxSize = getStrokePixelSize(stroke.baseSize, width, height);
  const inputPts = buildEffectivePoints(stroke, width, height);
  const hasRealPressure = stroke.points.some(
    (p) => Math.abs(p[2] - 0.5) > 0.03 && p[2] > 0
  );

  if (stroke.tool === 'eraser') {
    return getStroke(inputPts, {
      size: pxSize * 1.5,
      thinning: 0.15,
      smoothing: 0.45,
      streamline: 0.4,
      simulatePressure: false,
      last: true,
    });
  }

  if (stroke.tool === 'charcoal') {
    return getStroke(inputPts, {
      size: pxSize * 1.65,
      thinning: 0.55,
      smoothing: 0.65,
      streamline: 0.4,
      simulatePressure: !hasRealPressure,
      easing: (t) => t,
      start: { taper: Math.max(2, pxSize * 0.2), cap: true },
      end: { taper: Math.max(2, pxSize * 0.25), cap: true },
      last: true,
    });
  }

  if (stroke.tool === 'pencil') {
    return getStroke(inputPts, {
      size: Math.max(1.5, pxSize * 0.72),
      thinning: 0.42,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: !hasRealPressure,
      start: { taper: Math.max(1.5, pxSize * 0.18), cap: true },
      end: { taper: Math.max(2, pxSize * 0.25), cap: true },
      last: true,
    });
  }

  // Fineliner ink
  return getStroke(inputPts, {
    size: pxSize,
    thinning: 0.65,
    smoothing: 0.55,
    streamline: 0.5,
    simulatePressure: !hasRealPressure,
    start: { taper: Math.max(2, pxSize * 0.3), cap: true },
    end: { taper: Math.max(2.5, pxSize * 0.4), cap: true },
    last: true,
  });
}

function outlineToCanvasPath(outline: number[][]): Path2D | null {
  const len = outline.length;
  if (len === 0) return null;

  const path = new Path2D();
  if (len < 3) {
    const [x, y] = outline[0];
    path.arc(x, y, 1, 0, Math.PI * 2);
    return path;
  }

  const [p0x, p0y] = outline[0];
  path.moveTo(p0x, p0y);
  for (let i = 0; i < len; i += 1) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % len];
    path.quadraticCurveTo(ax, ay, (ax + bx) * 0.5, (ay + by) * 0.5);
  }
  path.closePath();
  return path;
}

export function drawStrokeToContext(
  ctx: CanvasRenderingContext2D,
  stroke: PadStroke,
  width: number,
  height: number
): void {
  const outline = computeStrokeOutline(stroke, width, height);
  const path = outlineToCanvasPath(outline);
  if (!path) return;

  ctx.save();
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fill(path);
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = Math.min(1, Math.max(0.05, stroke.opacity));
  ctx.fillStyle = stroke.color;

  if (stroke.tool === 'charcoal') {
    const pxSize = getStrokePixelSize(stroke.baseSize, width, height);
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = Math.max(1.2, pxSize * 0.14);
  }

  ctx.fill(path);
  ctx.restore();
}

export function renderLayerToCanvas(
  canvas: HTMLCanvasElement,
  strokes: readonly PadStroke[],
  layerId: PadLayerId,
  cssWidth: number,
  cssHeight: number,
  dpr = 1
): void {
  const targetW = Math.max(1, Math.round(cssWidth * dpr));
  const targetH = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, targetW, targetH);

  ctx.save();
  ctx.scale(dpr, dpr);
  for (const stroke of strokes) {
    if (stroke.layerId !== layerId) continue;
    drawStrokeToContext(ctx, stroke, cssWidth, cssHeight);
  }
  ctx.restore();
}

function fmt2(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Number.isFinite(r) ? String(r) : '0';
}

export function strokeToSvgPathD(
  stroke: PadStroke,
  width: number,
  height: number
): string {
  const outline = computeStrokeOutline(stroke, width, height);
  const len = outline.length;
  if (len === 0) return '';
  if (len < 3) {
    const [x, y] = outline[0];
    return `M ${fmt2(x)} ${fmt2(y)} m -1 0 a 1 1 0 1 0 2 0 a 1 1 0 1 0 -2 0`;
  }

  const parts: string[] = [`M ${fmt2(outline[0][0])} ${fmt2(outline[0][1])}`];
  for (let i = 0; i < len; i += 1) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % len];
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    parts.push(`Q ${fmt2(ax)} ${fmt2(ay)} ${fmt2(mx)} ${fmt2(my)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

export function pointInPolygon(
  px: number,
  py: number,
  poly: readonly [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function computeStrokeTelemetry(
  strokes: readonly PadStroke[]
): PadStrokeTelemetry {
  const countsByLayer: Record<PadLayerId, number> = {
    construction: 0,
    ink: 0,
    value: 0,
  };
  let totalStrokes = 0;
  let straightLineCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const recentPoints: PadStrokePoint[] = [];

  for (const s of strokes) {
    if (s.tool === 'eraser') continue;
    totalStrokes += 1;
    countsByLayer[s.layerId] += 1;
    if (s.isStraightLine) straightLineCount += 1;
    for (const pt of s.points) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }

  const lastNonEraser = [...strokes]
    .reverse()
    .find((s) => s.tool !== 'eraser');
  if (lastNonEraser) {
    for (const pt of lastNonEraser.points.slice(-24)) {
      recentPoints.push(pt);
    }
  }

  return {
    totalStrokes,
    countsByLayer,
    straightLineCount,
    boundingBox:
      totalStrokes > 0 && Number.isFinite(minX)
        ? { minX, minY, maxX, maxY }
        : null,
    recentPoints,
    hasDrawn: totalStrokes > 0,
  };
}
