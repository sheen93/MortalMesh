'use client';

import { useCallback, useEffect, useState } from 'react';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  DownloadIcon,
  PencilIcon,
  TrashIcon,
  VideoIcon,
  XIcon,
} from '@/components/StudioPrimitives';
import type { SnapshotBridge, StudioThemeId } from '@/types/anatomy';
import {
  PAD_PAPER_META,
  type PadDocumentV1,
  type PadStudyRecord,
} from '@/types/pad';
import {
  exportPadPsd,
  exportPadSvg,
  exportPadTimelapse,
} from '@/utils/padExporter';
import { deletePadStudy, listPadStudies } from '@/utils/padStorage';

interface StudyGalleryViewProps {
  studioTheme: StudioThemeId;
  snapshotBridge: SnapshotBridge | null;
  onReopenInPad: (doc: PadDocumentV1) => void;
  onToast: (message: string, tone?: 'success' | 'error') => void;
  refreshToken?: number;
}

export function StudyGalleryView({
  studioTheme,
  snapshotBridge,
  onReopenInPad,
  onToast,
  refreshToken = 0,
}: StudyGalleryViewProps) {
  const [studies, setStudies] = useState<PadStudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const list = await listPadStudies();
    setStudies(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  const handleExport = async (
    study: PadStudyRecord,
    fmt: 'psd' | 'svg' | 'timelapse'
  ) => {
    if (busyId) return;
    setBusyId(study.id);
    try {
      const ctx = {
        document: study.document,
        logicalWidth: 900,
        logicalHeight: 900,
        scale: 1 as const,
        include3D: false,
        transparentBg: false,
        snapshotBridge,
      };
      const res =
        fmt === 'psd'
          ? await exportPadPsd(ctx)
          : fmt === 'svg'
            ? await exportPadSvg(ctx)
            : await exportPadTimelapse(ctx);
      onToast(`Exported ${res.filename}`, 'success');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deletePadStudy(id);
    setStudies((prev) => prev.filter((s) => s.id !== id));
    onToast('Deleted saved study', 'success');
  };

  const { ui } = STUDIO_THEMES[studioTheme];

  if (loading) {
    return (
      <div className={`py-10 text-center text-xs ${ui.textMuted}`}>
        Loading saved studies from offline sketchbook…
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <div
        data-testid="study-gallery-empty"
        className={`rounded-xl p-6 text-center space-y-2 ${ui.card}`}
      >
        <p className={`text-xs font-semibold ${ui.textPrimary}`}>
          No Saved Studies Yet
        </p>
        <p className={`text-[11px] leading-relaxed ${ui.textSecondary}`}>
          Save finished drawings inside any KINETIC-5 lesson or post-timer Gesture Gym session to review, export layered PSD/SVG files, or replay timelapses completely offline.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="study-gallery-grid"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {studies.map((study) => {
        const paperHex =
          PAD_PAPER_META[study.document.paperTone]?.hex ?? '#FAF9F5';
        const isBusy = busyId === study.id;
        return (
          <div
            key={study.id}
            data-testid={`study-card-${study.id}`}
            className={`flex flex-col justify-between gap-2.5 rounded-xl p-3 ${ui.card}`}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/15"
                style={{ backgroundColor: paperHex }}
              >
                {study.thumbnailDataUrl ? (
                  <img
                    src={study.thumbnailDataUrl}
                    alt={study.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="font-mono text-[10px] text-zinc-500">
                    {study.document.strokes.length} strokes
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase text-emerald-400">
                    {study.sourceKind ?? (study.moduleId ? 'school' : 'pad')}
                  </span>
                  <span className={`font-mono text-[9.5px] ${ui.textMuted}`}>
                    {new Date(study.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <h4 className={`text-xs font-semibold truncate ${ui.textPrimary}`}>
                  {study.title}
                </h4>
                <p className={`text-[10.5px] ${ui.textSecondary}`}>
                  {study.document.strokes.length} strokes ·{' '}
                  {study.posePresetId ?? 'Custom Stage'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-current/10 pt-2">
              <button
                type="button"
                data-testid={`study-open-pad-${study.id}`}
                onClick={() => onReopenInPad(study.document)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold ${ui.pillButtonActive}`}
              >
                <PencilIcon className="h-3 w-3" />
                <span>Open in Pad</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleExport(study, 'psd')}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium ${ui.pillButton}`}
                >
                  <DownloadIcon className="h-3 w-3" />
                  <span>PSD</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleExport(study, 'svg')}
                  className={`rounded-lg px-2 py-1 text-[10px] font-medium ${ui.pillButton}`}
                >
                  SVG
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleExport(study, 'timelapse')}
                  title="Download 5s WebM Timelapse"
                  className={`flex h-6 w-6 items-center justify-center rounded-lg ${ui.pillButton}`}
                >
                  <VideoIcon className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label="Delete study"
                  onClick={() => void handleDelete(study.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-lg ${ui.iconButton}`}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface StudyGalleryModalProps extends StudyGalleryViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StudyGalleryModal({
  isOpen,
  onClose,
  ...rest
}: StudyGalleryModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const { ui } = STUDIO_THEMES[rest.studioTheme];

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Saved Sketchbook Studies"
        data-testid="study-gallery-modal"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl select-none ${ui.panel}`}
      >
        <header className={`flex shrink-0 items-center justify-between gap-2 px-4 py-3 ${ui.header}`}>
          <h2 className={`text-xs font-semibold uppercase tracking-[0.14em] ${ui.textPrimary}`}>
            My Saved Studies (Offline IndexedDB)
          </h2>
          <button
            type="button"
            aria-label="Close study gallery"
            onClick={onClose}
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${ui.iconButton}`}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="studio-scroll flex-1 overflow-y-auto p-4">
          <StudyGalleryView {...rest} />
        </div>
      </div>
    </div>
  );
}
