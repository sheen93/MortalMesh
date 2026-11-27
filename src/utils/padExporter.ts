import {
  PAD_LAYER_META,
  PAD_LAYER_ORDER,
  PAD_PAPER_META,
  type PadDocumentV1,
  type PadLayerId,
  type PadStroke,
  type PadTimelapseOptions,
} from '@/types/pad';
import type { SnapshotBridge } from '@/types/anatomy';
import {
  drawStrokeToContext,
  renderLayerToCanvas,
  strokeToSvgPathD,
} from '@/utils/padRenderer';
import { formatPoseTimestamp } from '@/utils/poseSerialization';

export interface PadExportContext {
  document: PadDocumentV1;
  logicalWidth: number;
  logicalHeight: number;
  scale: 1 | 2;
  include3D: boolean;
  transparentBg?: boolean;
  snapshotBridge: SnapshotBridge | null;
}

export interface PadExportResult {
  filename: string;
  byteLength: number;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function capture3DRasterCanvas(
  snapshotBridge: SnapshotBridge | null,
  width: number,
  height: number,
  scale: 1 | 2
): Promise<HTMLCanvasElement | null> {
  if (!snapshotBridge) return null;
  const captured = snapshotBridge.captureDataUrl({
    transparent: true,
    scale,
  });
  if (!captured) return null;
  const img = await loadImage(captured.dataUrl);
  if (!img || img.naturalWidth <= 0) return null;

  const out = window.document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  const fit = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const dw = img.naturalWidth * fit;
  const dh = img.naturalHeight * fit;
  const dx = (width - dw) * 0.5;
  const dy = (height - dh) * 0.5;
  ctx.drawImage(img, dx, dy, dw, dh);
  return out;
}

function buildCompositeCanvas(
  doc: PadDocumentV1,
  width: number,
  height: number,
  layerCanvases: Record<PadLayerId, HTMLCanvasElement>,
  ref3dCanvas: HTMLCanvasElement | null,
  transparentBg: boolean
): HTMLCanvasElement {
  const out = window.document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;

  if (!transparentBg) {
    ctx.fillStyle = PAD_PAPER_META[doc.paperTone]?.hex ?? '#FAF9F5';
    ctx.fillRect(0, 0, width, height);
  }
  if (ref3dCanvas) {
    ctx.drawImage(ref3dCanvas, 0, 0, width, height);
  }
  for (const layerId of PAD_LAYER_ORDER) {
    const cfg = doc.layers[layerId];
    if (!cfg?.visible || cfg.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, cfg.opacity));
    ctx.drawImage(layerCanvases[layerId], 0, 0, width, height);
    ctx.restore();
  }
  return out;
}

function renderAllLayerCanvases(
  doc: PadDocumentV1,
  cssW: number,
  cssH: number,
  scale: 1 | 2
): { width: number; height: number; layers: Record<PadLayerId, HTMLCanvasElement> } {
  const width = Math.max(64, Math.round(cssW * scale));
  const height = Math.max(64, Math.round(cssH * scale));
  const layers = {} as Record<PadLayerId, HTMLCanvasElement>;
  for (const layerId of PAD_LAYER_ORDER) {
    const c = window.document.createElement('canvas');
    renderLayerToCanvas(c, doc.strokes, layerId, cssW, cssH, scale);
    layers[layerId] = c;
  }
  return { width, height, layers };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

export async function exportPadPng(
  ctx: PadExportContext
): Promise<PadExportResult> {
  const { width, height, layers } = renderAllLayerCanvases(
    ctx.document,
    ctx.logicalWidth,
    ctx.logicalHeight,
    ctx.scale
  );
  const transparent = ctx.transparentBg ?? !ctx.include3D;
  const ref3d = ctx.include3D
    ? await capture3DRasterCanvas(ctx.snapshotBridge, width, height, ctx.scale)
    : null;
  const composite = buildCompositeCanvas(
    ctx.document,
    width,
    height,
    layers,
    ref3d,
    transparent
  );

  const blob = await canvasToBlob(composite, 'image/png');
  if (!blob) throw new Error('PNG encoding failed');

  const prefix = transparent ? 'mortal-mesh-pad-cutout' : 'mortal-mesh-pad';
  const filename = `${prefix}-${formatPoseTimestamp()}.png`;
  triggerBlobDownload(blob, filename);
  return { filename, byteLength: blob.size };
}

export async function exportPadWebp(
  ctx: PadExportContext
): Promise<PadExportResult> {
  const { width, height, layers } = renderAllLayerCanvases(
    ctx.document,
    ctx.logicalWidth,
    ctx.logicalHeight,
    ctx.scale
  );
  const ref3d = ctx.include3D
    ? await capture3DRasterCanvas(ctx.snapshotBridge, width, height, ctx.scale)
    : null;
  const composite = buildCompositeCanvas(
    ctx.document,
    width,
    height,
    layers,
    ref3d,
    false
  );

  let blob = await canvasToBlob(composite, 'image/webp', 0.92);
  let ext = 'webp';
  if (!blob || !blob.type.includes('webp')) {
    blob = await canvasToBlob(composite, 'image/jpeg', 0.92);
    ext = 'jpg';
  }
  if (!blob) throw new Error('Image encoding failed');

  const filename = `mortal-mesh-pad-${formatPoseTimestamp()}.${ext}`;
  triggerBlobDownload(blob, filename);
  return { filename, byteLength: blob.size };
}

function escapeXmlAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export async function exportPadSvg(
  ctx: PadExportContext
): Promise<PadExportResult> {
  const W = Math.max(64, Math.round(ctx.logicalWidth * ctx.scale));
  const H = Math.max(64, Math.round(ctx.logicalHeight * ctx.scale));
  const paperHex = PAD_PAPER_META[ctx.document.paperTone]?.hex ?? '#FAF9F5';

  const defs: string[] = [];
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  ];

  if (!ctx.transparentBg && ctx.include3D) {
    lines.push(
      `  <g id="pad-paper" inkscape:groupmode="layer" inkscape:label="Paper Backdrop">`,
      `    <rect x="0" y="0" width="${W}" height="${H}" fill="${paperHex}" />`,
      `  </g>`
    );
  }

  if (ctx.include3D && ctx.snapshotBridge) {
    const bp = ctx.snapshotBridge.generateBlueprintSvgData({ transparent: true });
    if (bp && bp.svgText) {
      const startOpen = bp.svgText.indexOf('<svg');
      const endOpen = startOpen >= 0 ? bp.svgText.indexOf('>', startOpen) : -1;
      const closeTag = bp.svgText.lastIndexOf('</svg>');
      if (endOpen >= 0 && closeTag > endOpen) {
        const innerSvg = bp.svgText.slice(endOpen + 1, closeTag).trim();
        const s = Math.min(W / bp.width, H / bp.height);
        const tx = ((W - bp.width * s) * 0.5).toFixed(2);
        const ty = ((H - bp.height * s) * 0.5).toFixed(2);
        if (innerSvg) {
          lines.push(
            `  <g id="studio-3d-blueprint" inkscape:groupmode="layer" inkscape:label="3D Blueprint Reference" transform="translate(${tx} ${ty}) scale(${s.toFixed(4)})">`,
            `    ${innerSvg}`,
            `  </g>`
          );
        }
      }
    }
  }

  let maskSeq = 0;
  for (const layerId of PAD_LAYER_ORDER) {
    const meta = PAD_LAYER_META[layerId];
    const layerCfg = ctx.document.layers[layerId];
    const layerStrokes = ctx.document.strokes.filter((s) => s.layerId === layerId);
    const layerOpacity = layerCfg ? Math.min(1, Math.max(0, layerCfg.opacity)) : 1;
    const displayAttr = layerCfg?.visible === false ? ' display="none"' : '';

    lines.push(
      `  <g id="${meta.svgId}" inkscape:groupmode="layer" inkscape:label="${escapeXmlAttr(meta.label)}" opacity="${layerOpacity.toFixed(2)}"${displayAttr}>`
    );

    for (let i = 0; i < layerStrokes.length; i += 1) {
      const s = layerStrokes[i];
      if (s.tool === 'eraser') continue;
      const d = strokeToSvgPathD(s, W, H);
      if (!d) continue;

      const subsequentErasers: string[] = [];
      for (let j = i + 1; j < layerStrokes.length; j += 1) {
        if (layerStrokes[j].tool !== 'eraser') continue;
        const ed = strokeToSvgPathD(layerStrokes[j], W, H);
        if (ed) subsequentErasers.push(ed);
      }

      let maskAttr = '';
      if (subsequentErasers.length > 0) {
        maskSeq += 1;
        const maskId = `eraser-mask-${maskSeq}`;
        defs.push(
          `    <mask id="${maskId}">`,
          `      <rect x="0" y="0" width="${W}" height="${H}" fill="white" />`,
          ...subsequentErasers.map((ed) => `      <path d="${ed}" fill="black" />`),
          `    </mask>`
        );
        maskAttr = ` mask="url(#${maskId})"`;
      }

      const op = Math.min(1, Math.max(0.05, s.opacity)).toFixed(2);
      lines.push(
        `    <path d="${d}" fill="${escapeXmlAttr(s.color)}" fill-opacity="${op}"${maskAttr} />`
      );
    }

    lines.push(`  </g>`);
  }

  if (defs.length > 0) {
    lines.splice(1, 0, '  <defs>', ...defs, '  </defs>');
  }
  lines.push('</svg>');

  const svgText = lines.join('\n');
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const filename = `mortal-mesh-pad-${formatPoseTimestamp()}.svg`;
  triggerBlobDownload(blob, filename);
  return { filename, byteLength: blob.size };
}

export async function exportPadPsd(
  ctx: PadExportContext
): Promise<PadExportResult> {
  const { width, height, layers } = renderAllLayerCanvases(
    ctx.document,
    ctx.logicalWidth,
    ctx.logicalHeight,
    ctx.scale
  );
  const ref3d = ctx.include3D
    ? await capture3DRasterCanvas(ctx.snapshotBridge, width, height, ctx.scale)
    : null;

  const { writePsdUint8Array } = await import('ag-psd');

  const children: Array<{
    name: string;
    opacity: number;
    hidden?: boolean;
    canvas: HTMLCanvasElement;
  }> = [];

  if (ref3d) {
    children.push({
      name: '3D Studio Reference',
      opacity: 1,
      canvas: ref3d,
    });
  }

  for (const layerId of PAD_LAYER_ORDER) {
    const meta = PAD_LAYER_META[layerId];
    const cfg = ctx.document.layers[layerId];
    children.push({
      name: meta.psdName,
      opacity: cfg ? Math.min(1, Math.max(0, cfg.opacity)) : 1,
      hidden: cfg ? !cfg.visible : false,
      canvas: layers[layerId],
    });
  }

  const composite = buildCompositeCanvas(
    ctx.document,
    width,
    height,
    layers,
    ref3d,
    false
  );

  const bytes = writePsdUint8Array({
    width,
    height,
    channels: 4,
    canvas: composite,
    children,
  });

  const arrayCopy = new Uint8Array(bytes.byteLength);
  arrayCopy.set(bytes);
  const blob = new Blob([arrayCopy], { type: 'application/octet-stream' });
  const filename = `mortal-mesh-study-${formatPoseTimestamp()}.psd`;
  triggerBlobDownload(blob, filename);
  return { filename, byteLength: blob.size };
}

export async function buildPadTimelapseBlob(
  strokes: readonly PadStroke[],
  doc: PadDocumentV1,
  options?: PadTimelapseOptions
): Promise<Blob | null> {
  if (
    typeof window === 'undefined' ||
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function'
  ) {
    return null;
  }

  const W = options?.width ?? 1024;
  const H = options?.height ?? 1024;
  const durationMs = options?.durationMs ?? 5000;
  const fps = options?.fps ?? 30;
  const totalFrames = Math.max(30, Math.round((durationMs / 1000) * fps));
  const frameIntervalMs = Math.round(1000 / fps);
  const paperHex =
    options?.paperHex ?? PAD_PAPER_META[doc.paperTone]?.hex ?? '#FAF9F5';

  const backdropImg = options?.include3DBackdropDataUrl
    ? await loadImage(options.include3DBackdropDataUrl)
    : null;

  const recCanvas = window.document.createElement('canvas');
  recCanvas.width = W;
  recCanvas.height = H;
  const ctx = recCanvas.getContext('2d');
  if (!ctx) return null;

  const layerOff = {
    value: window.document.createElement('canvas'),
    construction: window.document.createElement('canvas'),
    ink: window.document.createElement('canvas'),
  };
  for (const id of PAD_LAYER_ORDER) {
    layerOff[id].width = W;
    layerOff[id].height = H;
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : '';
  if (!mimeType) return null;

  const stream = recCanvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_200_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });

  recorder.start(250);

  const visibleStrokes = strokes.filter((s) => s.points.length > 0);
  let lastDrawnIdx = -1;

  for (let frame = 0; frame <= totalFrames; frame += 1) {
    const progress = frame / totalFrames;
    const targetIdx =
      visibleStrokes.length > 0
        ? Math.min(
            visibleStrokes.length - 1,
            Math.floor(progress * visibleStrokes.length)
          )
        : -1;

    while (lastDrawnIdx < targetIdx) {
      lastDrawnIdx += 1;
      const st = visibleStrokes[lastDrawnIdx];
      const offCtx = layerOff[st.layerId].getContext('2d');
      if (offCtx) {
        drawStrokeToContext(offCtx, st, W, H);
      }
    }

    ctx.fillStyle = paperHex;
    ctx.fillRect(0, 0, W, H);
    if (backdropImg && backdropImg.naturalWidth > 0) {
      const fit = Math.min(
        W / backdropImg.naturalWidth,
        H / backdropImg.naturalHeight
      );
      const dw = backdropImg.naturalWidth * fit;
      const dh = backdropImg.naturalHeight * fit;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(backdropImg, (W - dw) * 0.5, (H - dh) * 0.5, dw, dh);
      ctx.restore();
    }

    for (const id of PAD_LAYER_ORDER) {
      const cfg = doc.layers[id];
      if (!cfg?.visible || cfg.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, cfg.opacity));
      ctx.drawImage(layerOff[id], 0, 0, W, H);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle =
      doc.paperTone === 'dark-slate'
        ? 'rgba(243,244,246,0.45)'
        : 'rgba(17,19,23,0.45)';
    ctx.font = '600 13px sans-serif';
    ctx.fillText('Mortal Mesh · Atelier', 18, H - 18);
    ctx.restore();

    await new Promise((r) => setTimeout(r, frameIntervalMs));
  }

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return stopPromise;
}

export async function exportPadTimelapse(
  ctx: PadExportContext
): Promise<PadExportResult> {
  const W = Math.min(1280, Math.max(512, Math.round(ctx.logicalWidth)));
  const H = Math.min(1280, Math.max(512, Math.round(ctx.logicalHeight)));
  const backdrop =
    ctx.include3D && ctx.snapshotBridge
      ? ctx.snapshotBridge.captureDataUrl({ transparent: true, scale: 1 })
          ?.dataUrl ?? null
      : null;

  const blob = await buildPadTimelapseBlob(ctx.document.strokes, ctx.document, {
    width: W,
    height: H,
    durationMs: 5000,
    fps: 30,
    include3DBackdropDataUrl: backdrop,
  });

  if (!blob) {
    throw new Error('Timelapse MediaRecorder unavailable in this browser');
  }

  const filename = `mortal-mesh-timelapse-${formatPoseTimestamp()}.webm`;
  triggerBlobDownload(blob, filename);
  return { filename, byteLength: blob.size };
}
