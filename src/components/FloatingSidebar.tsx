'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PwaStatusFooter, type PwaState } from '@/components/PwaManager';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import type {
  FigureProportions,
  LayerVisibility,
  StudioThemeId,
} from '@/types/anatomy';
import {
  detectMatchingProportionPreset,
  PROPORTION_LIMITS,
  PROPORTION_PRESET_ORDER,
  PROPORTION_PRESETS,
  type ProportionPresetId,
} from '@/data/proportions';
import {
  MAX_STUDIO_PROPS,
  STUDIO_PROP_CATALOG,
  STUDIO_PROP_ORDER,
  type StudioProp,
  type StudioPropType,
} from '@/types/props';
import {
  MANNEQUIN_FINISHES,
  MANNEQUIN_FINISH_ORDER,
  MAX_MANNEQUINS,
  type MannequinFinish,
  type MannequinRecord,
} from '@/types/scene';
import {
  MODEL_CATALOG,
  MODEL_ORDER,
  type MannequinModelId,
} from '@/data/modelCatalog';
import {
  filterPosePresets,
  POSE_CATEGORIES,
  POSE_PRESETS,
  type PoseCategory,
} from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  AccordionSection,
  BoxIcon,
  CameraIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExpandGalleryIcon,
  EyeIcon,
  EyeOffIcon,
  FilePlusIcon,
  FlipHorizontalIcon,
  FolderOpenIcon,
  LayersIcon,
  LockIcon,
  LogoMarkIcon,
  PanelToggleIcon,
  PlusIcon,
  PrecisionSlider,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  Share2Icon,
  SparklesIcon,
  ToggleSwitch,
  TrashIcon,
  UnlockIcon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from '@/components/StudioPrimitives';

interface FloatingSidebarProps {
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  isHudMinimized?: boolean;
  containInPane?: boolean;
  paneTopOffsetPx?: number;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  mannequins: readonly MannequinRecord[];
  activeMannequinId: string;
  onSelectMannequin: (id: string) => void;
  onAddMannequin: () => void;
  onDuplicateMannequin: () => void;
  onToggleLockMannequin: (id: string) => void;
  onToggleVisibleMannequin: (id: string) => void;
  onChangeMannequinFinish: (id: string, finish: MannequinFinish) => void;
  onChangeMannequinModel: (id: string, modelId: MannequinModelId) => void;
  onChangeMannequinProportions: (
    id: string,
    patch: Partial<FigureProportions>
  ) => void;
  onApplyProportionPreset: (id: string, presetId: ProportionPresetId) => void;
  onCommitSliderHistory: () => void;
  onToggleSkeletonMode: () => void;
  onDeleteMannequin: (id: string) => void;
  layers: LayerVisibility;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
  activePosePresetId: string | null;
  onSelectPosePreset: (presetId: string) => void;
  onOpenPoseLibrary: () => void;
  onOpenPhotoToPose: () => void;
  aiCacheReady: boolean;
  onMirrorPose: () => void;
  onExportPoseJson: () => void;
  onImportSceneOrPoseJson: (file: File) => void;
  onExportSceneJson: () => void;
  onSharePoseLink: () => void;
  onNewBlankScene: () => void;
  studioProps: readonly StudioProp[];
  selectedPropId: string | null;
  onSelectProp: (id: string | null) => void;
  onAddProp: (type: StudioPropType) => void;
  onToggleLockProp: (id: string) => void;
  onToggleVisibleProp: (id: string) => void;
  onDeleteProp: (id: string) => void;
  pwa: PwaState;
  onInstallApp: () => void;
}

export function FloatingSidebar({
  studioTheme,
  viewport,
  isHudMinimized = false,
  containInPane = false,
  paneTopOffsetPx = 0,
  isOpen,
  onToggleOpen,
  mannequins,
  activeMannequinId,
  onSelectMannequin,
  onAddMannequin,
  onDuplicateMannequin,
  onToggleLockMannequin,
  onToggleVisibleMannequin,
  onChangeMannequinFinish,
  onChangeMannequinModel,
  onChangeMannequinProportions,
  onApplyProportionPreset,
  onCommitSliderHistory,
  onToggleSkeletonMode,
  onDeleteMannequin,
  layers,
  onToggleLayer,
  activePosePresetId,
  onSelectPosePreset,
  onOpenPoseLibrary,
  onOpenPhotoToPose,
  aiCacheReady,
  onMirrorPose,
  onExportPoseJson,
  onImportSceneOrPoseJson,
  onExportSceneJson,
  onSharePoseLink,
  onNewBlankScene,
  studioProps,
  selectedPropId,
  onSelectProp,
  onAddProp,
  onToggleLockProp,
  onToggleVisibleProp,
  onDeleteProp,
  pwa,
  onInstallApp,
}: FloatingSidebarProps) {
  const [poseQuery, setPoseQuery] = useState('');
  const [poseCategory, setPoseCategory] = useState<PoseCategory | 'all'>('all');
  const [isProportionsOpen, setIsProportionsOpen] = useState(false);
  const poseFileInputRef = useRef<HTMLInputElement>(null);
  const sceneFileInputRef = useRef<HTMLInputElement>(null);
  const [openSections, setOpenSections] = useState({
    figures: true,
    presets: true,
    props: false,
    files: false,
    layers: false,
  });

  const isDrawerOverlay = viewport.isMobile || viewport.isCompactLandscape;

  useEffect(() => {
    if (selectedPropId) {
      setOpenSections((prev) => (prev.props ? prev : { ...prev, props: true }));
    }
  }, [selectedPropId]);

  const filteredPoses = useMemo(
    () => filterPosePresets(poseQuery, poseCategory),
    [poseQuery, poseCategory]
  );

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeMannequin =
    mannequins.find((m) => m.id === activeMannequinId) ?? mannequins[0];
  const isLocked = activeMannequin?.locked ?? false;
  const atCapacity = mannequins.length >= MAX_MANNEQUINS;
  const canDeleteFigure = mannequins.length > 1;
  const propsAtCapacity = studioProps.length >= MAX_STUDIO_PROPS;

  const theme = STUDIO_THEMES[studioTheme];
  const { ui } = theme;

  const safeTopStyle = 'calc(env(safe-area-inset-top, 0px) + 12px)';
  const safeLeftStyle = 'calc(env(safe-area-inset-left, 0px) + 12px)';
  const compactSafeLeftStyle = 'calc(env(safe-area-inset-left, 0px) + 10px)';
  const useOverlayDrawer = isDrawerOverlay || containInPane;

  if (!isOpen) {
    // PadWorkspace's unified top header already includes the Stage drawer trigger.
    if (containInPane) return null;

    return (
      <aside
        aria-label="Viewport controls"
        aria-hidden={isHudMinimized}
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          top: safeTopStyle,
          left: isDrawerOverlay ? compactSafeLeftStyle : safeLeftStyle,
        }}
        className={`fixed z-20 flex select-none transition-all duration-200 ${ui.panel} ${
          isDrawerOverlay
            ? 'h-[38px] w-[38px] items-center justify-center rounded-xl p-0'
            : 'min-h-[42px] items-center gap-2 rounded-2xl px-3 py-1.5'
        } ${
          isHudMinimized
            ? 'opacity-0 -translate-x-4 pointer-events-none'
            : 'opacity-100 translate-x-0 pointer-events-auto'
        }`}
      >
        <button
          type="button"
          onClick={() => onToggleOpen(true)}
          aria-expanded={false}
          aria-controls="sidebar-controls-panel"
          aria-label="Expand sidebar controls"
          title="Open Stage Inspector"
          className={`flex items-center justify-center rounded-lg transition-colors ${ui.textPrimary} ${
            isDrawerOverlay ? 'h-full w-full' : 'min-h-[30px] gap-2'
          }`}
        >
          {isDrawerOverlay ? (
            <PanelToggleIcon collapsed className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <LogoMarkIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">
                Mortal Mesh
              </span>
              <PanelToggleIcon collapsed className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </>
          )}
        </button>
      </aside>
    );
  }

  return (
    <>
      {useOverlayDrawer && (
        <div
          aria-hidden="true"
          onClick={() => onToggleOpen(false)}
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px]"
        />
      )}
      <aside
        aria-label="Viewport controls"
        aria-hidden={isHudMinimized}
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          top:
            containInPane && paneTopOffsetPx > 0
              ? `${paneTopOffsetPx + 8}px`
              : safeTopStyle,
          left: safeLeftStyle,
          maxHeight:
            containInPane && paneTopOffsetPx > 0
              ? `calc(100dvh - ${paneTopOffsetPx + 20}px)`
              : useOverlayDrawer
                ? 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)'
                : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 5.75rem)',
        }}
        className={`fixed flex flex-col overflow-hidden rounded-2xl select-none transition-all duration-200 ${ui.panel} ${
          isHudMinimized
            ? 'opacity-0 -translate-x-4 pointer-events-none'
            : 'opacity-100 translate-x-0 pointer-events-auto'
        } ${
          useOverlayDrawer
            ? 'z-40 w-[min(88vw,320px)]'
            : viewport.isTablet
              ? 'z-20 w-[264px]'
              : 'z-20 w-[276px]'
        }`}
      >
        {/* Header */}
        <header
          className={`flex shrink-0 items-center justify-between px-3.5 py-2.5 backdrop-blur-xl ${ui.header}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <LogoMarkIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textPrimary}`} />
            <h1
              className={`text-[11px] font-semibold uppercase tracking-[0.14em] truncate ${ui.textPrimary}`}
            >
              Mortal Mesh
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onToggleOpen(false)}
            aria-expanded
            aria-controls="sidebar-controls-panel"
            aria-label="Collapse sidebar controls"
            title="Collapse Stage Inspector"
            className={`flex ${
              useOverlayDrawer || viewport.isCoarsePointer ? 'h-9 w-9' : 'h-6 w-6'
            } items-center justify-center rounded-lg transition-colors ${ui.iconButton}`}
          >
            <PanelToggleIcon collapsed={false} className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Scrollable Accordion Stack */}
        <div
          id="sidebar-controls-panel"
          className={`studio-scroll studio-modal-scroll flex-1 overflow-y-auto ${ui.divider}`}
        >
          {/* 1. Scene Figures */}
          <AccordionSection
            id="scene-figures"
            title="Scene Figures"
            icon={<UsersIcon className="h-3.5 w-3.5" />}
            badge={`${mannequins.length}/${MAX_MANNEQUINS}`}
            isOpen={openSections.figures}
            onToggle={() => toggleSection('figures')}
            theme={theme}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={atCapacity}
                onClick={onAddMannequin}
                title={
                  atCapacity
                    ? `Maximum ${MAX_MANNEQUINS} figures`
                    : 'Add another figure beside existing ones'
                }
                className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  atCapacity ? ui.pillButtonDisabled : ui.pillButton
                }`}
              >
                <PlusIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Add Figure</span>
              </button>
              <button
                type="button"
                disabled={atCapacity}
                onClick={onDuplicateMannequin}
                title={
                  atCapacity
                    ? `Maximum ${MAX_MANNEQUINS} figures`
                    : 'Duplicate active figure with its current pose'
                }
                className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  atCapacity ? ui.pillButtonDisabled : ui.pillButton
                }`}
              >
                <CopyIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Duplicate</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {mannequins.map((fig) => {
                const isSelected = fig.id === activeMannequinId;
                const finishSpec = MANNEQUIN_FINISHES[fig.finish];
                return (
                  <div
                    key={fig.id}
                    className={`rounded-xl p-1.5 space-y-1.5 transition-colors ${
                      isSelected ? ui.card : 'border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onSelectMannequin(fig.id)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={`flex-1 min-w-0 flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors ${
                          isSelected
                            ? `${ui.textPrimary} font-semibold`
                            : `${ui.textSecondary} hover:bg-zinc-500/10`
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20"
                          style={{ backgroundColor: finishSpec.swatchHex }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[11.5px]">{fig.name}</span>
                        {!isSelected && fig.modelId !== 'classic' && (
                          <span
                            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-mono uppercase ${ui.monoPill}`}
                          >
                            {MODEL_CATALOG[fig.modelId].shortLabel}
                          </span>
                        )}
                        {!fig.visible && (
                          <span
                            className={`text-[9.5px] font-mono uppercase ${ui.textMuted}`}
                          >
                            Hidden
                          </span>
                        )}
                      </button>

                      {!isSelected && (
                        <button
                          type="button"
                          aria-pressed={fig.locked}
                          aria-label={
                            fig.locked ? `Unlock ${fig.name}` : `Lock ${fig.name}`
                          }
                          title={
                            fig.locked
                              ? 'Unlock figure'
                              : 'Lock figure (immune to edits & gravity)'
                          }
                          onClick={() => onToggleLockMannequin(fig.id)}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                            fig.locked ? ui.pillButtonActive : ui.iconButton
                          }`}
                        >
                          {fig.locked ? (
                            <LockIcon className="h-3 w-3" />
                          ) : (
                            <UnlockIcon className="h-3 w-3" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        aria-pressed={!fig.visible}
                        aria-label={
                          fig.visible ? `Hide ${fig.name}` : `Show ${fig.name}`
                        }
                        title={fig.visible ? 'Hide figure' : 'Show figure'}
                        onClick={() => onToggleVisibleMannequin(fig.id)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                          !fig.visible ? ui.pillButtonActive : ui.iconButton
                        }`}
                      >
                        {fig.visible ? (
                          <EyeIcon className="h-3 w-3" />
                        ) : (
                          <EyeOffIcon className="h-3 w-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={!canDeleteFigure}
                        aria-label={`Delete ${fig.name}`}
                        title={
                          canDeleteFigure
                            ? `Delete ${fig.name}`
                            : 'At least one figure is required'
                        }
                        onClick={() => {
                          if (canDeleteFigure) onDeleteMannequin(fig.id);
                        }}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                          canDeleteFigure
                            ? ui.iconButton
                            : `opacity-30 cursor-not-allowed ${ui.textMuted}`
                        }`}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    </div>

                    {isSelected && (
                      <div className="space-y-1.5 px-2 pb-0.5">
                        <div className="space-y-1">
                          <span
                            className={`block text-[10px] font-medium ${ui.textMuted}`}
                          >
                            Model: {MODEL_CATALOG[fig.modelId].label}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {MODEL_ORDER.map((modelId) => {
                              const spec = MODEL_CATALOG[modelId];
                              const selectedModel = fig.modelId === modelId;
                              return (
                                <button
                                  key={modelId}
                                  type="button"
                                  data-model-id={modelId}
                                  disabled={fig.locked}
                                  aria-pressed={selectedModel}
                                  title={
                                    fig.locked
                                      ? `Unlock ${fig.name} to switch model`
                                      : `${spec.label} — ${spec.description}`
                                  }
                                  onClick={() =>
                                    onChangeMannequinModel(fig.id, modelId)
                                  }
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                    fig.locked
                                      ? ui.pillButtonDisabled
                                      : selectedModel
                                        ? ui.pillButtonActive
                                        : ui.pillButton
                                  }`}
                                >
                                  {spec.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-medium ${ui.textMuted}`}
                          >
                            Finish:{' '}
                            {fig.finish === 'classic'
                              ? MODEL_CATALOG[fig.modelId].defaultFinishLabel
                              : finishSpec.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {MANNEQUIN_FINISH_ORDER.map((finishId) => {
                              const opt = MANNEQUIN_FINISHES[finishId];
                              const selectedFinish = fig.finish === finishId;
                              const optLabel =
                                finishId === 'classic'
                                  ? MODEL_CATALOG[fig.modelId]
                                      .defaultFinishLabel
                                  : opt.label;
                              return (
                                <button
                                  key={finishId}
                                  type="button"
                                  aria-label={`${optLabel} finish`}
                                  aria-pressed={selectedFinish}
                                  title={optLabel}
                                  onClick={() =>
                                    onChangeMannequinFinish(fig.id, finishId)
                                  }
                                  className={`h-3.5 w-3.5 rounded-full border transition-transform ${
                                    selectedFinish
                                      ? 'scale-115 ring-1 ring-offset-1 ring-current'
                                      : 'opacity-75 hover:opacity-100'
                                  }`}
                                  style={{
                                    backgroundColor: opt.swatchHex,
                                    borderColor: 'rgba(0,0,0,0.28)',
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>

                        {/* Collapsible Proportions Morph Sub-Drawer */}
                        {(() => {
                          const matchedCanon = detectMatchingProportionPreset(
                            fig.proportions
                          );
                          const badgeLabel = matchedCanon
                            ? PROPORTION_PRESETS[matchedCanon].shortLabel
                            : 'Custom';
                          return (
                            <div className={`border-t pt-1.5 ${ui.hairline}`}>
                              <button
                                type="button"
                                data-testid="proportions-toggle"
                                aria-expanded={isProportionsOpen}
                                onClick={() =>
                                  setIsProportionsOpen((prev) => !prev)
                                }
                                className={`flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-[10.5px] font-medium transition-colors ${ui.textSecondary} hover:bg-zinc-500/10`}
                              >
                                <span>Proportions</span>
                                <span className="flex items-center gap-1">
                                  <span
                                    className={`rounded px-1 py-0.5 font-mono text-[9.5px] ${ui.monoPill}`}
                                  >
                                    {badgeLabel}
                                  </span>
                                  <ChevronDownIcon
                                    className={`h-3 w-3 transition-transform ${
                                      isProportionsOpen ? 'rotate-180' : ''
                                    }`}
                                  />
                                </span>
                              </button>

                              {isProportionsOpen && (
                                <div className="mt-1.5 space-y-2 px-0.5 pb-1">
                                  <div className="flex items-center gap-1">
                                    {PROPORTION_PRESET_ORDER.map((presetId) => {
                                      const preset =
                                        PROPORTION_PRESETS[presetId];
                                      const isCanonActive =
                                        matchedCanon === presetId;
                                      return (
                                        <button
                                          key={presetId}
                                          type="button"
                                          data-proportion-preset={presetId}
                                          disabled={fig.locked}
                                          aria-pressed={isCanonActive}
                                          title={preset.description}
                                          onClick={() =>
                                            onApplyProportionPreset(
                                              fig.id,
                                              presetId
                                            )
                                          }
                                          className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors ${
                                            fig.locked
                                              ? ui.pillButtonDisabled
                                              : isCanonActive
                                                ? ui.pillButtonActive
                                                : ui.pillButton
                                          }`}
                                        >
                                          {preset.shortLabel}
                                        </button>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      disabled={fig.locked}
                                      title="Reset proportions to Natural (7.5H)"
                                      aria-label="Reset proportions"
                                      onClick={() =>
                                        onApplyProportionPreset(
                                          fig.id,
                                          'natural'
                                        )
                                      }
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                                        fig.locked
                                          ? ui.pillButtonDisabled
                                          : ui.pillButton
                                      }`}
                                    >
                                      <RotateCcwIcon className="h-3 w-3" />
                                    </button>
                                  </div>

                                  {(
                                    [
                                      'headScale',
                                      'shoulderWidth',
                                      'torsoLength',
                                      'hipWidth',
                                      'limbLength',
                                    ] as const
                                  ).map((key) => {
                                    const spec = PROPORTION_LIMITS[key];
                                    const val = fig.proportions[key];
                                    return (
                                      <PrecisionSlider
                                        key={key}
                                        id={`prop-${fig.id}-${key}`}
                                        label={spec.label}
                                        value={val}
                                        min={spec.min}
                                        max={spec.max}
                                        step={spec.step}
                                        disabled={fig.locked}
                                        displayValue={`${Math.round(val * 100)}%`}
                                        onChange={(nextVal) =>
                                          onChangeMannequinProportions(
                                            fig.id,
                                            { [key]: nextVal }
                                          )
                                        }
                                        onCommit={onCommitSliderHistory}
                                        theme={theme}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AccordionSection>

          {/* Concise non-interactive lock notice for active figure */}
          {isLocked && activeMannequin && (
            <div
              role="status"
              className="px-3.5 py-2 flex items-center gap-2"
            >
              <LockIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textPrimary}`} />
              <span
                className={`text-[11px] font-medium leading-tight ${ui.textPrimary}`}
              >
                Figure locked — unlock in bottom dock
              </span>
            </div>
          )}

          {/* 2. Pose Presets */}
          <AccordionSection
            id="pose-presets"
            title="Pose Presets"
            icon={<SparklesIcon className="h-3.5 w-3.5" />}
            badge={`${filteredPoses.length}/${POSE_PRESETS.length}`}
            isOpen={openSections.presets}
            onToggle={() => toggleSection('presets')}
            theme={theme}
          >
            {/* On-Device AI Photo-to-Pose Launch Button */}
            <button
              type="button"
              data-testid="open-photo-to-pose-btn"
              onClick={onOpenPhotoToPose}
              title="Reconstruct 3D pose & hand gestures directly from a reference photo (100% on-device)"
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButton}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <CameraIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Photo → Pose</span>
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${ui.monoPill}`}
              >
                {aiCacheReady ? 'AI · Offline' : 'AI'}
              </span>
            </button>

            {/* Search + Expand Gallery Row */}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex flex-1 min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 ${ui.card}`}
              >
                <SearchIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textMuted}`} />
                <input
                  type="text"
                  value={poseQuery}
                  onChange={(event) => setPoseQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && poseQuery.length > 0) {
                      event.stopPropagation();
                      setPoseQuery('');
                    }
                  }}
                  placeholder="Search 50 poses..."
                  aria-label="Search 50 poses"
                  className={`w-full min-w-0 bg-transparent text-[11px] outline-none placeholder:opacity-60 ${ui.textPrimary}`}
                />
                {poseQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPoseQuery('')}
                    aria-label="Clear pose search"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${ui.iconButton}`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onOpenPoseLibrary}
                aria-label="Expand 50-pose gallery"
                title="Expand Gallery"
                className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg transition-colors ${ui.pillButton}`}
              >
                <ExpandGalleryIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Horizontal Category Filter Pills */}
            <div className="studio-scroll flex items-center gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                aria-pressed={poseCategory === 'all'}
                onClick={() => {
                  setPoseCategory('all');
                  setPoseQuery('');
                }}
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                  poseCategory === 'all' ? ui.pillButtonActive : ui.pillButton
                }`}
              >
                All
              </button>
              {POSE_CATEGORIES.map((cat) => {
                const isSelected = poseCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setPoseCategory(cat.id);
                      if (
                        poseQuery.trim().length > 0 &&
                        filterPosePresets(poseQuery, cat.id).length === 0
                      ) {
                        setPoseQuery('');
                      }
                    }}
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                      isSelected ? ui.pillButtonActive : ui.pillButton
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Pose List */}
            <div className="studio-scroll max-h-[220px] space-y-1 overflow-y-auto pr-0.5">
              {filteredPoses.length > 0 ? (
                filteredPoses.map((preset) => {
                  const isSelected = activePosePresetId === preset.id;
                  const isAerial = !preset.groundSnap && preset.elevationY > 0;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-disabled={isLocked}
                      aria-pressed={isSelected}
                      title={
                        isLocked
                          ? 'Unlock figure to apply a pose'
                          : preset.description
                      }
                      onClick={() => onSelectPosePreset(preset.id)}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-all duration-150 ${
                        isLocked
                          ? ui.pillButtonDisabled
                          : isSelected
                            ? ui.pillButtonActive
                            : ui.pillButton
                      }`}
                    >
                      <span className="truncate">{preset.name}</span>
                      {isAerial && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                            isSelected && !isLocked
                              ? 'border border-current opacity-80'
                              : ui.monoPill
                          }`}
                        >
                          AIR
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div
                  className={`flex flex-col items-center gap-2 rounded-lg px-2.5 py-3 text-center text-[11px] ${ui.card} ${ui.textMuted}`}
                >
                  <span>No poses match your filter</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPoseQuery('');
                      setPoseCategory('all');
                    }}
                    className={`rounded-md px-2.5 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                  >
                    Show all 50 poses
                  </button>
                </div>
              )}
            </div>

            <div className={`border-t pt-2.5 ${ui.hairline}`}>
              <button
                type="button"
                disabled={isLocked}
                onClick={onMirrorPose}
                title={
                  isLocked
                    ? 'Unlock figure to mirror pose'
                    : 'Mirror left and right limbs across the body midline'
                }
                className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  isLocked ? ui.pillButtonDisabled : ui.pillButton
                }`}
              >
                <FlipHorizontalIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Mirror L↔R</span>
              </button>
            </div>
          </AccordionSection>

          {/* 3. Studio Props */}
          <AccordionSection
            id="studio-props"
            title="Studio Props"
            icon={<BoxIcon className="h-3.5 w-3.5" />}
            badge={`${studioProps.length}/${MAX_STUDIO_PROPS}`}
            isOpen={openSections.props}
            onToggle={() => toggleSection('props')}
            theme={theme}
          >
            <div className="grid grid-cols-3 gap-1">
              {STUDIO_PROP_ORDER.map((type) => {
                const spec = STUDIO_PROP_CATALOG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={propsAtCapacity}
                    onClick={() => onAddProp(type)}
                    title={
                      propsAtCapacity
                        ? `Maximum ${MAX_STUDIO_PROPS} props reached`
                        : `Spawn ${spec.label}`
                    }
                    className={`flex items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10.5px] font-medium transition-colors ${
                      propsAtCapacity ? ui.pillButtonDisabled : ui.pillButton
                    }`}
                  >
                    <PlusIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{spec.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {studioProps.length > 0 ? (
              <div className="studio-scroll max-h-[140px] space-y-1 overflow-y-auto pr-0.5">
                {studioProps.map((prop) => {
                  const isSelected = prop.id === selectedPropId;
                  return (
                    <div
                      key={prop.id}
                      className={`flex items-center gap-1 rounded-xl p-1 transition-colors ${
                        isSelected ? ui.card : 'border border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectProp(isSelected ? null : prop.id)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={`flex-1 min-w-0 rounded-lg px-2 py-1 text-left text-[11px] truncate transition-colors ${
                          isSelected
                            ? `${ui.textPrimary} font-semibold`
                            : `${ui.textSecondary} hover:bg-zinc-500/10`
                        }`}
                      >
                        {prop.name}
                      </button>
                      <button
                        type="button"
                        aria-pressed={prop.locked}
                        aria-label={
                          prop.locked
                            ? `Unlock ${prop.name}`
                            : `Lock ${prop.name}`
                        }
                        onClick={() => onToggleLockProp(prop.id)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                          prop.locked ? ui.pillButtonActive : ui.iconButton
                        }`}
                      >
                        {prop.locked ? (
                          <LockIcon className="h-3 w-3" />
                        ) : (
                          <UnlockIcon className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-pressed={!prop.visible}
                        aria-label={
                          prop.visible
                            ? `Hide ${prop.name}`
                            : `Show ${prop.name}`
                        }
                        onClick={() => onToggleVisibleProp(prop.id)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                          !prop.visible ? ui.pillButtonActive : ui.iconButton
                        }`}
                      >
                        {prop.visible ? (
                          <EyeIcon className="h-3 w-3" />
                        ) : (
                          <EyeOffIcon className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${prop.name}`}
                        onClick={() => onDeleteProp(prop.id)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${ui.iconButton}`}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={`text-[10.5px] leading-snug ${ui.textMuted}`}>
                Spawn blocks, stools, or staffs — tap on canvas to move, rotate,
                or scale.
              </p>
            )}
          </AccordionSection>

          {/* 4. Scene & Files (Collapsed by default) */}
          <AccordionSection
            id="scene-files"
            title="Scene & Files"
            icon={<SaveIcon className="h-3.5 w-3.5" />}
            isOpen={openSections.files}
            onToggle={() => toggleSection('files')}
            theme={theme}
          >
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onExportSceneJson}
                  title="Save complete multi-figure scene, props, lighting, and bookmarks as JSON"
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <SaveIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Save Scene</span>
                </button>
                <button
                  type="button"
                  onClick={() => sceneFileInputRef.current?.click()}
                  title="Load a saved Mortal Mesh Scene or Pose JSON file"
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <FolderOpenIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Load Scene</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onExportPoseJson}
                  title="Download current figure pose as a versioned JSON file"
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Save Pose</span>
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) poseFileInputRef.current?.click();
                  }}
                  title={
                    isLocked
                      ? 'Unlock figure to load pose JSON'
                      : 'Load a Pose JSON file onto the active figure'
                  }
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] font-medium transition-colors ${
                    isLocked ? ui.pillButtonDisabled : ui.pillButton
                  }`}
                >
                  <UploadIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Load Pose</span>
                </button>
              </div>

              <button
                type="button"
                data-testid="share-3d-link-btn"
                onClick={onSharePoseLink}
                title="Copy compact shareable URL for this exact 3D pose, lighting, and camera"
                className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
              >
                <Share2Icon className="h-3.5 w-3.5 shrink-0" />
                <span>Share 3D Link</span>
              </button>

              <button
                type="button"
                onClick={onNewBlankScene}
                title="Reset workspace to a blank single-figure scene"
                className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
              >
                <FilePlusIcon className="h-3.5 w-3.5 shrink-0" />
                <span>New Blank Scene</span>
              </button>

              <input
                ref={sceneFileInputRef}
                type="file"
                accept=".json,application/json"
                aria-label="Load Mortal Mesh Scene or Pose JSON file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) {
                    onImportSceneOrPoseJson(file);
                  }
                }}
              />
              <input
                ref={poseFileInputRef}
                type="file"
                accept=".json,application/json"
                aria-label="Load pose JSON file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) {
                    onImportSceneOrPoseJson(file);
                  }
                }}
              />
            </div>
          </AccordionSection>

          {/* 5. Anatomy Layers (Collapsed by default) */}
          <AccordionSection
            id="anatomy-layers"
            title="Anatomy Layers"
            icon={<LayersIcon className="h-3.5 w-3.5" />}
            badge={
              activeMannequin?.modelId === 'skeleton' ? 'Active' : undefined
            }
            isOpen={openSections.layers}
            onToggle={() => toggleSection('layers')}
            theme={theme}
          >
            <div className="space-y-1">
              <ToggleSwitch
                id="anatomy-skeleton-mode-toggle"
                label="Skeleton Mode"
                description="Switch active figure to skeletal landmark rig"
                checked={activeMannequin?.modelId === 'skeleton'}
                disabled={isLocked}
                onChange={onToggleSkeletonMode}
                theme={theme}
              />
              <ToggleSwitch
                label="Muscle Layer (Ecorché)"
                description="Coming Soon"
                checked={layers.muscle}
                disabled={true}
                onChange={() => onToggleLayer('muscle')}
                theme={theme}
              />
            </div>
          </AccordionSection>
        </div>

        <PwaStatusFooter
          pwa={pwa}
          theme={theme}
          onInstallApp={onInstallApp}
        />
      </aside>
    </>
  );
}
