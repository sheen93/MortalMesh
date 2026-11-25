'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PwaStatusFooter, type PwaState } from '@/components/PwaManager';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import { getIKHandleLabel } from '@/physics/runtimeIK';
import {
  ANATOMY_LAYERS_AVAILABLE,
  isCoreBoneName,
  type AxisKey,
  type DampingPreset,
  type IKHandleId,
  type JointAngles,
  type JointsDisplayMode,
  type KeyLightSettings,
  type LayerVisibility,
  type PoseControlMode,
  type StudioThemeId,
} from '@/types/anatomy';
import {
  MAX_STUDIO_PROPS,
  STUDIO_PROP_CATALOG,
  STUDIO_PROP_ORDER,
  type PropTransformMode,
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
import { getJointSpec } from '@/data/jointLimits';
import {
  filterPosePresets,
  POSE_CATEGORIES,
  POSE_PRESETS,
  type PoseCategory,
} from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  AccordionSection,
  ArrowDownToLineIcon,
  BoxIcon,
  CopyIcon,
  DownloadIcon,
  ExpandGalleryIcon,
  EyeIcon,
  EyeOffIcon,
  FilePlusIcon,
  FlipHorizontalIcon,
  FolderOpenIcon,
  JointNodesIcon,
  LayersIcon,
  LightbulbIcon,
  LockIcon,
  LogoMarkIcon,
  Move3dIcon,
  OrbitIcon,
  PanelToggleIcon,
  PinIcon,
  PlusIcon,
  PrecisionSlider,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  SegmentedControl,
  SparklesIcon,
  ToggleSwitch,
  TrashIcon,
  UnlockIcon,
  UploadIcon,
  UsersIcon,
  XIcon,
  type SegmentedOption,
} from '@/components/StudioPrimitives';

interface FloatingSidebarProps {
  studioTheme: StudioThemeId;
  viewport: ViewportProfile;
  mannequins: readonly MannequinRecord[];
  activeMannequinId: string;
  onSelectMannequin: (id: string) => void;
  onAddMannequin: () => void;
  onDuplicateMannequin: () => void;
  onToggleLockMannequin: (id: string) => void;
  onToggleVisibleMannequin: (id: string) => void;
  onChangeMannequinFinish: (id: string, finish: MannequinFinish) => void;
  onDeleteMannequin: (id: string) => void;
  layers: LayerVisibility;
  onToggleLayer: (layer: keyof LayerVisibility) => void;
  jointsDisplay: JointsDisplayMode;
  onChangeJointsDisplay: (mode: JointsDisplayMode) => void;
  controlMode: PoseControlMode;
  onChangeControlMode: (mode: PoseControlMode) => void;
  jointLimitsEnabled: boolean;
  onToggleJointLimits: () => void;
  selectedBoneName: string | null;
  selectedBoneAngles: JointAngles;
  selectedIKHandle: IKHandleId | null;
  onChangeAxisAngle: (axis: AxisKey, value: number) => void;
  onResetSelectedJoint: () => void;
  onResetPose: () => void;
  groundEnabled: boolean;
  onToggleGround: () => void;
  groundSnapEnabled: boolean;
  onToggleGroundSnap: () => void;
  elevationY: number;
  onChangeElevation: (elevationY: number) => void;
  onDropToFloor: () => void;
  moveBodyEnabled: boolean;
  onSetMoveBody: (enabled: boolean) => void;
  activePosePresetId: string | null;
  onSelectPosePreset: (presetId: string) => void;
  onOpenPoseLibrary: () => void;
  gravityEnabled: boolean;
  onToggleGravity: () => void;
  dampingPreset: DampingPreset;
  onChangeDampingPreset: (preset: DampingPreset) => void;
  pinnedBones: readonly string[];
  onTogglePinSelectedJoint: () => void;
  onClearAllPins: () => void;
  onCommitSliderHistory: () => void;
  onMirrorPose: () => void;
  onExportPoseJson: () => void;
  onImportSceneOrPoseJson: (file: File) => void;
  onExportSceneJson: () => void;
  onNewBlankScene: () => void;
  studioProps: readonly StudioProp[];
  selectedPropId: string | null;
  propTransformMode: PropTransformMode;
  onSelectProp: (id: string | null) => void;
  onAddProp: (type: StudioPropType) => void;
  onToggleLockProp: (id: string) => void;
  onToggleVisibleProp: (id: string) => void;
  onDeleteProp: (id: string) => void;
  onChangePropTransformMode: (mode: PropTransformMode) => void;
  onDropPropToFloor: (id: string) => void;
  onResetPropScale: (id: string) => void;
  keyLight: KeyLightSettings;
  onChangeKeyLight: (patch: Partial<KeyLightSettings>) => void;
  onResetKeyLight: () => void;
  pwa: PwaState;
  onInstallApp: () => void;
}

const JOINTS_DISPLAY_OPTIONS: ReadonlyArray<
  SegmentedOption<JointsDisplayMode>
> = [
  { id: 'core', label: 'Core', title: 'Show 22 core joints' },
  { id: 'all', label: 'All', title: 'Show all 52 poseable joints' },
  { id: 'hidden', label: 'Off', title: 'Hide joint handles' },
];

const CONTROL_MODE_OPTIONS: ReadonlyArray<SegmentedOption<PoseControlMode>> = [
  { id: 'fk', label: 'FK Rotate', title: 'Forward Kinematics joint rotation' },
  { id: 'ik', label: 'IK Drag', title: 'Two-bone end-effector IK targets' },
];

const DAMPING_OPTIONS: ReadonlyArray<SegmentedOption<DampingPreset>> = [
  { id: 'soft', label: 'Soft' },
  { id: 'natural', label: 'Natural' },
  { id: 'heavy', label: 'Heavy' },
];

const GIZMO_MODE_OPTIONS: ReadonlyArray<SegmentedOption<'rotate' | 'move'>> = [
  { id: 'rotate', label: 'Rotate' },
  { id: 'move', label: 'Move' },
];

const PROP_TRANSFORM_OPTIONS: ReadonlyArray<SegmentedOption<PropTransformMode>> =
  [
    { id: 'translate', label: 'Move' },
    { id: 'rotate', label: 'Rotate' },
    { id: 'scale', label: 'Scale' },
  ];

export function FloatingSidebar({
  studioTheme,
  viewport,
  mannequins,
  activeMannequinId,
  onSelectMannequin,
  onAddMannequin,
  onDuplicateMannequin,
  onToggleLockMannequin,
  onToggleVisibleMannequin,
  onChangeMannequinFinish,
  onDeleteMannequin,
  layers,
  onToggleLayer,
  jointsDisplay,
  onChangeJointsDisplay,
  controlMode,
  onChangeControlMode,
  jointLimitsEnabled,
  onToggleJointLimits,
  selectedBoneName,
  selectedBoneAngles,
  selectedIKHandle,
  onChangeAxisAngle,
  onResetSelectedJoint,
  onResetPose,
  groundEnabled,
  onToggleGround,
  groundSnapEnabled,
  onToggleGroundSnap,
  elevationY,
  onChangeElevation,
  onDropToFloor,
  moveBodyEnabled,
  onSetMoveBody,
  activePosePresetId,
  onSelectPosePreset,
  onOpenPoseLibrary,
  gravityEnabled,
  onToggleGravity,
  dampingPreset,
  onChangeDampingPreset,
  pinnedBones,
  onTogglePinSelectedJoint,
  onClearAllPins,
  onCommitSliderHistory,
  onMirrorPose,
  onExportPoseJson,
  onImportSceneOrPoseJson,
  onExportSceneJson,
  onNewBlankScene,
  studioProps,
  selectedPropId,
  propTransformMode,
  onSelectProp,
  onAddProp,
  onToggleLockProp,
  onToggleVisibleProp,
  onDeleteProp,
  onChangePropTransformMode,
  onDropPropToFloor,
  onResetPropScale,
  keyLight,
  onChangeKeyLight,
  onResetKeyLight,
  pwa,
  onInstallApp,
}: FloatingSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [poseQuery, setPoseQuery] = useState('');
  const [poseCategory, setPoseCategory] = useState<PoseCategory | 'all'>('all');
  const poseFileInputRef = useRef<HTMLInputElement>(null);
  const sceneFileInputRef = useRef<HTMLInputElement>(null);
  const hasAutoCollapsedMountRef = useRef(false);
  const prevCompactModeRef = useRef(false);
  const [openSections, setOpenSections] = useState({
    figures: true,
    presets: true,
    rig: true,
    physicsFloor: true,
    props: false,
    lighting: false,
    layers: false,
  });

  const isDrawerOverlay = viewport.isMobile || viewport.isCompactLandscape;

  useEffect(() => {
    const isPortraitTablet = viewport.isTablet && !viewport.isLandscape;
    if (!hasAutoCollapsedMountRef.current) {
      hasAutoCollapsedMountRef.current = true;
      if (isDrawerOverlay || isPortraitTablet) {
        setIsCollapsed(true);
      }
      prevCompactModeRef.current = isDrawerOverlay;
      return;
    }

    if (isDrawerOverlay && !prevCompactModeRef.current) {
      setIsCollapsed(true);
    }
    prevCompactModeRef.current = isDrawerOverlay;
  }, [isDrawerOverlay, viewport.isTablet, viewport.isLandscape]);

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
  const selectedProp =
    studioProps.find((p) => p.id === selectedPropId) ?? null;

  const layersDisabled = !ANATOMY_LAYERS_AVAILABLE;
  const theme = STUDIO_THEMES[studioTheme];
  const { ui } = theme;
  const selectedSpec = selectedBoneName ? getJointSpec(selectedBoneName) : null;
  const selectedIsCore = selectedBoneName
    ? isCoreBoneName(selectedBoneName)
    : false;
  const selectedIsPinned = selectedBoneName
    ? pinnedBones.includes(selectedBoneName)
    : false;
  const visibleAxes = selectedSpec
    ? (['x', 'y', 'z'] as const).filter((axis) =>
        jointLimitsEnabled
          ? axis === 'x'
            ? selectedSpec.showX
            : axis === 'y'
              ? selectedSpec.showY
              : selectedSpec.showZ
          : true
      )
    : [];
  const minElevation = groundEnabled ? 0 : -2;

  const safeTopStyle = 'calc(env(safe-area-inset-top, 0px) + 12px)';
  const safeLeftStyle = 'calc(env(safe-area-inset-left, 0px) + 12px)';

  if (isCollapsed) {
    return (
      <aside
        aria-label="Viewport controls"
        onPointerDown={(event) => event.stopPropagation()}
        style={{ top: safeTopStyle, left: safeLeftStyle }}
        className={`fixed z-20 flex min-h-[42px] items-center gap-2 rounded-2xl px-3 py-1.5 select-none transition-all duration-200 ${ui.panel}`}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          aria-expanded={false}
          aria-controls="sidebar-controls-panel"
          aria-label="Expand sidebar controls"
          title="Open Studio Inspector"
          className={`flex min-h-[30px] items-center gap-2 rounded-lg transition-colors ${ui.textPrimary}`}
        >
          <LogoMarkIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">
            {isDrawerOverlay ? 'Tools' : 'Mortal Mesh'}
          </span>
          <PanelToggleIcon collapsed className="h-3.5 w-3.5 shrink-0 opacity-80" />
        </button>
      </aside>
    );
  }

  return (
    <>
      {isDrawerOverlay && (
        <div
          aria-hidden="true"
          onClick={() => setIsCollapsed(true)}
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px]"
        />
      )}
      <aside
        aria-label="Viewport controls"
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          top: safeTopStyle,
          left: safeLeftStyle,
          maxHeight: isDrawerOverlay
            ? 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)'
            : 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 5.75rem)',
        }}
        className={`fixed flex flex-col overflow-hidden rounded-2xl select-none transition-all duration-200 ${ui.panel} ${
          isDrawerOverlay
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
            onClick={() => setIsCollapsed(true)}
            aria-expanded
            aria-controls="sidebar-controls-panel"
            aria-label="Collapse sidebar controls"
            title="Collapse Inspector"
            className={`flex ${
              isDrawerOverlay || viewport.isCoarsePointer ? 'h-9 w-9' : 'h-6 w-6'
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
                      {!fig.visible && (
                        <span
                          className={`text-[9.5px] font-mono uppercase ${ui.textMuted}`}
                        >
                          Hidden
                        </span>
                      )}
                    </button>

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
                    <div className="flex items-center justify-between gap-2 px-2 pb-0.5">
                      <span className={`text-[10px] font-medium ${ui.textMuted}`}>
                        Finish: {finishSpec.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {MANNEQUIN_FINISH_ORDER.map((finishId) => {
                          const opt = MANNEQUIN_FINISHES[finishId];
                          const selectedFinish = fig.finish === finishId;
                          return (
                            <button
                              key={finishId}
                              type="button"
                              aria-label={`${opt.label} finish`}
                              aria-pressed={selectedFinish}
                              title={opt.label}
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
                  )}
                </div>
              );
            })}
          </div>

          <div className={`border-t pt-2.5 space-y-1.5 ${ui.hairline}`}>
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
          </div>
        </AccordionSection>

        {/* Locked Banner when Active Figure is Frozen */}
        {isLocked && activeMannequin && (
          <div
            role="status"
            className="px-3.5 py-2.5 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <LockIcon className={`h-3.5 w-3.5 shrink-0 ${ui.textPrimary}`} />
              <span
                className={`text-[11px] font-medium leading-tight ${ui.textPrimary}`}
              >
                Figure locked — immune to edits &amp; gravity
              </span>
            </div>
            <button
              type="button"
              onClick={() => onToggleLockMannequin(activeMannequin.id)}
              className={`shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButtonActive}`}
            >
              Unlock
            </button>
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

          <div className={`border-t pt-2.5 space-y-1.5 ${ui.hairline}`}>
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

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onExportPoseJson}
                title="Download current figure pose as a versioned JSON file"
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButton}`}
              >
                <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Save JSON</span>
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (!isLocked) poseFileInputRef.current?.click();
                }}
                title={
                  isLocked
                    ? 'Unlock figure to load JSON'
                    : 'Load a Mortal Mesh Pose or Scene JSON file'
                }
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isLocked ? ui.pillButtonDisabled : ui.pillButton
                }`}
              >
                <UploadIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Load JSON</span>
              </button>
            </div>

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

        {/* 3. Joint & Rig */}
        <AccordionSection
          id="joint-rig"
          title="Joint & Rig"
          icon={<JointNodesIcon className="h-3.5 w-3.5" />}
          badge={controlMode.toUpperCase()}
          isOpen={openSections.rig}
          onToggle={() => toggleSection('rig')}
          theme={theme}
        >
          <SegmentedControl
            label="Control Mode"
            options={CONTROL_MODE_OPTIONS}
            value={controlMode}
            onChange={onChangeControlMode}
            theme={theme}
          />

          <SegmentedControl
            label="Joint Handles"
            options={JOINTS_DISPLAY_OPTIONS}
            value={jointsDisplay}
            onChange={onChangeJointsDisplay}
            theme={theme}
          />

          <ToggleSwitch
            label="Joint Limits"
            checked={jointLimitsEnabled}
            disabled={isLocked}
            onChange={onToggleJointLimits}
            theme={theme}
          />

          {isLocked ? (
            <div
              className={`rounded-xl px-2.5 py-2 text-[11px] leading-snug ${ui.card} ${ui.textMuted}`}
            >
              Locked figure joints are hidden &amp; frozen
            </div>
          ) : controlMode === 'ik' ? (
            <div className={`rounded-xl p-2.5 space-y-1.5 ${ui.card}`}>
              <div
                className={`text-[11.5px] font-semibold leading-tight ${ui.textPrimary}`}
              >
                {selectedIKHandle
                  ? getIKHandleLabel(selectedIKHandle)
                  : 'Two-Bone IK Active'}
              </div>
              <p className={`text-[10.5px] leading-snug ${ui.textMuted}`}>
                {selectedIKHandle
                  ? 'Drag the world translation arrows to position limbs or hips live.'
                  : 'Tap any diamond ring handle on hands, feet, or pelvis.'}
              </p>
            </div>
          ) : selectedBoneName && selectedSpec ? (
            <div className={`rounded-xl p-2.5 space-y-2.5 ${ui.card}`}>
              <div className={`space-y-2 pb-2 border-b ${ui.hairline}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className={`text-[12px] font-semibold leading-tight truncate ${ui.textPrimary}`}
                    >
                      {selectedSpec.label}
                    </div>
                    <div
                      className={`font-mono text-[10px] leading-tight mt-0.5 truncate ${ui.textMuted}`}
                    >
                      {selectedBoneName}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {selectedIsCore && (
                    <button
                      type="button"
                      aria-pressed={selectedIsPinned}
                      onClick={onTogglePinSelectedJoint}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${
                        selectedIsPinned ? ui.pillButtonActive : ui.pillButton
                      }`}
                    >
                      <PinIcon className="h-3 w-3" />
                      <span>{selectedIsPinned ? 'Pinned' : 'Pin'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onResetSelectedJoint}
                    className={`flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                  >
                    <RotateCcwIcon className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {selectedBoneName === 'pelvis' && (
                <SegmentedControl
                  label="Pelvis Gizmo"
                  options={GIZMO_MODE_OPTIONS}
                  value={moveBodyEnabled ? 'move' : 'rotate'}
                  onChange={(mode) => onSetMoveBody(mode === 'move')}
                  theme={theme}
                />
              )}

              <div className="space-y-2">
                {visibleAxes.map((axis) => {
                  const axisSpec = selectedSpec.axes[axis];
                  const min = jointLimitsEnabled ? axisSpec.min : -180;
                  const max = jointLimitsEnabled ? axisSpec.max : 180;
                  const value = selectedBoneAngles[axis];

                  return (
                    <PrecisionSlider
                      key={axis}
                      id={`joint-axis-${axis}`}
                      label={axisSpec.label}
                      value={value}
                      min={min}
                      max={max}
                      step={1}
                      displayValue={`${value}°`}
                      onChange={(nextVal) => onChangeAxisAngle(axis, nextVal)}
                      onCommit={onCommitSliderHistory}
                      theme={theme}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`rounded-xl px-2.5 py-2 text-[11px] leading-snug ${ui.card} ${ui.textMuted}`}
            >
              Click any joint on the rig to pose
            </div>
          )}

          <button
            type="button"
            disabled={isLocked}
            onClick={onResetPose}
            className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
              isLocked ? ui.pillButtonDisabled : ui.pillButton
            }`}
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
            <span>Reset to T-Pose</span>
          </button>
        </AccordionSection>

        {/* 4. Physics & Floor */}
        <AccordionSection
          id="physics-floor"
          title="Physics & Floor"
          icon={<OrbitIcon className="h-3.5 w-3.5" />}
          isOpen={openSections.physicsFloor}
          onToggle={() => toggleSection('physicsFloor')}
          theme={theme}
        >
          <div className="space-y-2">
            <ToggleSwitch
              label="Gravity Physics"
              checked={gravityEnabled}
              onChange={onToggleGravity}
              theme={theme}
            />

            <SegmentedControl
              label="Joint Damping"
              options={DAMPING_OPTIONS}
              value={dampingPreset}
              onChange={onChangeDampingPreset}
              theme={theme}
            />

            {pinnedBones.length > 0 && (
              <button
                type="button"
                disabled={isLocked}
                onClick={onClearAllPins}
                className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  isLocked ? ui.pillButtonDisabled : ui.pillButton
                }`}
              >
                <PinIcon className="h-3 w-3" />
                <span>Clear All Pins ({pinnedBones.length})</span>
              </button>
            )}
          </div>

          <div className={`border-t pt-2.5 space-y-2 ${ui.hairline}`}>
            <ToggleSwitch
              label="Ground Floor"
              checked={groundEnabled}
              onChange={onToggleGround}
              theme={theme}
            />

            <ToggleSwitch
              label="Ground Snap"
              checked={groundSnapEnabled}
              disabled={isLocked}
              onChange={onToggleGroundSnap}
              theme={theme}
            />

            <PrecisionSlider
              id="elevation-y-slider"
              label="Elevation (Y)"
              value={elevationY}
              min={minElevation}
              max={2}
              step={0.01}
              disabled={isLocked}
              displayValue={`${elevationY.toFixed(2)}m`}
              onChange={onChangeElevation}
              onCommit={onCommitSliderHistory}
              theme={theme}
            />

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                disabled={isLocked}
                onClick={onDropToFloor}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isLocked ? ui.pillButtonDisabled : ui.pillButton
                }`}
              >
                <ArrowDownToLineIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Drop</span>
              </button>
              <button
                type="button"
                disabled={isLocked}
                aria-pressed={!isLocked && moveBodyEnabled}
                onClick={() => onSetMoveBody(!moveBodyEnabled)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isLocked
                    ? ui.pillButtonDisabled
                    : moveBodyEnabled
                      ? ui.pillButtonActive
                      : ui.pillButton
                }`}
              >
                <Move3dIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Move Body</span>
              </button>
            </div>
          </div>
        </AccordionSection>

        {/* 5. Studio Props */}
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
                        prop.locked ? `Unlock ${prop.name}` : `Lock ${prop.name}`
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
                        prop.visible ? `Hide ${prop.name}` : `Show ${prop.name}`
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
              Spawn blocks, stools, or staffs to stage seated/leaning poses.
            </p>
          )}

          {selectedProp && !selectedProp.locked && (
            <div className={`rounded-xl p-2 space-y-2 ${ui.card}`}>
              <SegmentedControl
                label="Prop Gizmo"
                options={PROP_TRANSFORM_OPTIONS}
                value={propTransformMode}
                onChange={onChangePropTransformMode}
                theme={theme}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onDropPropToFloor(selectedProp.id)}
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <ArrowDownToLineIcon className="h-3 w-3 shrink-0" />
                  <span>Drop Floor</span>
                </button>
                <button
                  type="button"
                  onClick={() => onResetPropScale(selectedProp.id)}
                  className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-medium transition-colors ${ui.pillButton}`}
                >
                  <RotateCcwIcon className="h-3 w-3 shrink-0" />
                  <span>Reset Scale</span>
                </button>
              </div>
            </div>
          )}
        </AccordionSection>

        {/* 6. Studio Lighting (Collapsed by default) */}
        <AccordionSection
          id="studio-lighting"
          title="Studio Lighting"
          icon={<LightbulbIcon className="h-3.5 w-3.5" />}
          isOpen={openSections.lighting}
          onToggle={() => toggleSection('lighting')}
          theme={theme}
        >
          <div className="space-y-2.5">
            <PrecisionSlider
              id="key-light-azimuth"
              label="Key Azimuth"
              value={keyLight.azimuth}
              min={0}
              max={360}
              step={1}
              displayValue={`${keyLight.azimuth}°`}
              onChange={(azimuth) => onChangeKeyLight({ azimuth })}
              theme={theme}
            />

            <PrecisionSlider
              id="key-light-elevation"
              label="Key Elevation"
              value={keyLight.elevation}
              min={15}
              max={85}
              step={1}
              displayValue={`${keyLight.elevation}°`}
              onChange={(elevation) => onChangeKeyLight({ elevation })}
              theme={theme}
            />

            <PrecisionSlider
              id="key-light-intensity"
              label="Key Intensity"
              value={keyLight.intensity}
              min={0.4}
              max={2.8}
              step={0.05}
              displayValue={keyLight.intensity.toFixed(2)}
              onChange={(intensity) => onChangeKeyLight({ intensity })}
              theme={theme}
            />

            <button
              type="button"
              onClick={onResetKeyLight}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${ui.pillButton}`}
            >
              <RotateCcwIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Reset Light</span>
            </button>
          </div>
        </AccordionSection>

        {/* 7. Anatomy Layers (Collapsed by default) */}
        <AccordionSection
          id="anatomy-layers"
          title="Anatomy Layers"
          icon={<LayersIcon className="h-3.5 w-3.5" />}
          badge={layersDisabled ? 'Soon' : undefined}
          isOpen={openSections.layers}
          onToggle={() => toggleSection('layers')}
          theme={theme}
        >
          <div className="space-y-1">
            <ToggleSwitch
              label="Skeleton Layer"
              description="Skeletal reference overlay"
              checked={!layersDisabled && layers.skeleton}
              disabled={layersDisabled}
              onChange={() => {
                if (!layersDisabled) onToggleLayer('skeleton');
              }}
              theme={theme}
            />
            <ToggleSwitch
              label="Muscle Layer"
              description="Ecorche surface groups"
              checked={!layersDisabled && layers.muscle}
              disabled={layersDisabled}
              onChange={() => {
                if (!layersDisabled) onToggleLayer('muscle');
              }}
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
