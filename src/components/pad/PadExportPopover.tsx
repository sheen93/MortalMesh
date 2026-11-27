'use client';

import { useState } from 'react';
import {
  DownloadIcon,
  LayersIcon,
  ToggleSwitch,
  VideoIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { SnapshotBridge, StudioThemeId } from '@/types/anatomy';
import type { PadDocumentV1, PadExportFormat } from '@/types/pad';
import {
  exportPadPng,
  exportPadPsd,
  exportPadSvg,
  exportPadTimelapse,
  exportPadWebp,
} from '@/utils/padExporter';

interface PadExportPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  studioTheme: StudioThemeId;
  document: PadDocumentV1;
  canvasSize: { width: number; height: number };
  snapshotBridge: SnapshotBridge | null;
  onExportDone: (message: string, tone?: 'success' | 'error') => void;
  onExportCompleted?: (format: PadExportFormat) => void;
}

const FORMAT_OPTIONS: ReadonlyArray<{
  id: PadExportFormat;
  label: string;
  desc: string;
}> = [
  { id: 'psd', label: 'PSD', desc: 'Editable multi-layer file for Procreate / CSP / Photoshop' },
  { id: 'png', label: 'PNG', desc: 'Crisp high-resolution image (Transparent or 3D composite)' },
  { id: 'svg', label: 'SVG', desc: 'Scalable Inkscape/Illustrator vector curves + optional 3D blueprint' },
  { id: 'webp', label: 'WEBP', desc: 'Lightweight compressed study sheet for Discord / web sharing' },
  { id: 'timelapse', label: 'Timelapse', desc: '5-second offline stroke replay video (.webm)' },
];

export function PadExportPopover({
  isOpen,
  onClose,
  studioTheme,
  document: doc,
  canvasSize,
  snapshotBridge,
  onExportDone,
  onExportCompleted,
}: PadExportPopoverProps) {
  const [format, setFormat] = useState<PadExportFormat>('psd');
  const [include3D, setInclude3D] = useState(true);
  const [transparentPng, setTransparentPng] = useState(true);
  const [scale, setScale] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const { ui } = STUDIO_THEMES[studioTheme];
  const activeMeta =
    FORMAT_OPTIONS.find((f) => f.id === format) ?? FORMAT_OPTIONS[0];

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ctx = {
        document: doc,
        logicalWidth: canvasSize.width,
        logicalHeight: canvasSize.height,
        scale,
        include3D: format === 'png' ? !transparentPng : include3D,
        transparentBg: format === 'png' ? transparentPng : false,
        snapshotBridge,
      };
      let res;
      if (format === 'psd') res = await exportPadPsd(ctx);
      else if (format === 'png') res = await exportPadPng(ctx);
      else if (format === 'svg') res = await exportPadSvg(ctx);
      else if (format === 'webp') res = await exportPadWebp(ctx);
      else res = await exportPadTimelapse(ctx);

      onExportDone(`Exported ${res.filename}`, 'success');
      onExportCompleted?.(format);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Pad export failed';
      onExportDone(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Export Atelier Study"
      data-testid="pad-export-popover"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 52px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }}
      className={`fixed z-50 w-[min(92vw,310px)] rounded-2xl p-3.5 space-y-3 backdrop-blur-xl select-none ${ui.panel}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <LayersIcon className={`h-3.5 w-3.5 ${ui.textPrimary}`} />
          <span
            className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${ui.textPrimary}`}
          >
            Export Study
          </span>
        </div>
        <button
          type="button"
          aria-label="Close export menu"
          onClick={onClose}
          className={`flex h-6 w-6 items-center justify-center rounded-md ${ui.iconButton}`}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Format Tabs */}
      <div className="grid grid-cols-5 gap-1">
        {FORMAT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            data-testid={`pad-export-fmt-${opt.id}`}
            aria-pressed={format === opt.id}
            onClick={() => setFormat(opt.id)}
            className={`rounded-lg py-1.5 text-[10px] font-semibold transition-colors ${
              format === opt.id ? ui.pillButtonActive : ui.pillButton
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className={`text-[10.5px] leading-snug ${ui.textSecondary}`}>
        {activeMeta.desc}
      </p>

      <div className="space-y-1.5">
        {format === 'png' ? (
          <ToggleSwitch
            id="pad-export-transparent-png"
            label="Transparent Sketch Only"
            description={transparentPng ? 'Alpha 0 sketch cutout' : 'Composite with 3D + paper'}
            checked={transparentPng}
            onChange={() => setTransparentPng((prev) => !prev)}
            theme={STUDIO_THEMES[studioTheme]}
          />
        ) : (
          <ToggleSwitch
            id="pad-export-include-3d"
            label={
              format === 'svg'
                ? 'Include 3D Blueprint Layers'
                : 'Include 3D Reference'
            }
            checked={include3D}
            onChange={() => setInclude3D((prev) => !prev)}
            theme={STUDIO_THEMES[studioTheme]}
          />
        )}

        {format !== 'timelapse' && (
          <div className="flex items-center justify-between pt-1">
            <span className={`text-[11px] font-medium ${ui.textSecondary}`}>
              Resolution Scale
            </span>
            <div className="flex items-center gap-1">
              {([1, 2] as const).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  data-testid={`pad-export-scale-${sc}x`}
                  aria-pressed={scale === sc}
                  onClick={() => setScale(sc)}
                  className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold ${
                    scale === sc ? ui.pillButtonActive : ui.pillButton
                  }`}
                >
                  {sc === 2 ? '2x HD' : '1x'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        data-testid="pad-export-download-btn"
        onClick={() => void handleDownload()}
        className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-semibold transition-colors ${
          busy ? ui.pillButtonDisabled : ui.pillButtonActive
        }`}
      >
        {format === 'timelapse' ? (
          <VideoIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span>{busy ? 'Rendering Export…' : `Download .${format === 'timelapse' ? 'WEBM' : format.toUpperCase()}`}</span>
      </button>
    </div>
  );
}
