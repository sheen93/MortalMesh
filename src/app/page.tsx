'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { CompositionOverlay } from '@/components/CompositionOverlay';
import { FloatingSidebar } from '@/components/FloatingSidebar';
import { HeadUnitRuler } from '@/components/HeadUnitRuler';
import { JointControlPopover } from '@/components/JointControlPopover';
import {
  PhotoToPoseModal,
  type PhotoToPoseApplyPayload,
  type PhotoToPoseStageAllPayload,
} from '@/components/PhotoToPoseModal';
import { PoseLibraryModal } from '@/components/PoseLibraryModal';
import { usePwaState } from '@/components/PwaManager';
import {
  buildMatchedCameraView,
  retargetDetectedPersonToPose,
} from '@/ai/poseRetargeting';
import { ReferenceOverlay } from '@/components/ReferenceOverlay';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { StudioCanvas } from '@/components/StudioCanvas';
import { StudioDock } from '@/components/StudioDock';
import {
  StudioRightRail,
  type RightRailTab,
} from '@/components/StudioRightRail';
import { StudioToast, type StudioToastData } from '@/components/StudioToast';
import { EyeIcon } from '@/components/StudioPrimitives';
import { HAND_GESTURE_BY_ID } from '@/data/handGestures';
import {
  clampStudioLighting,
  DEFAULT_STUDIO_LIGHTING,
  LIGHTING_PRESETS,
} from '@/data/lightingPresets';
import { MODEL_CATALOG, type MannequinModelId } from '@/data/modelCatalog';
import { getPosePreset } from '@/data/poses';
import {
  clampFigureProportions,
  DEFAULT_FIGURE_PROPORTIONS,
  PROPORTION_PRESETS,
  type ProportionPresetId,
} from '@/data/proportions';
import {
  isStudioThemeId,
  STUDIO_THEMES,
  STUDIO_THEME_STORAGE_KEY,
} from '@/data/studioThemes';
import { useStudioShortcuts } from '@/hooks/useStudioShortcuts';
import { useViewportProfile } from '@/hooks/useViewportProfile';
import {
  CAMERA_PRESETS,
  isCoreBoneName,
  ZERO_JOINT_ANGLES,
  type AxisKey,
  type CameraPreset,
  type CompositionCropRatio,
  type CompositionGridType,
  type ContextualAnchor,
  type DampingPreset,
  type ElevationCommand,
  type FigureProportions,
  type HandGestureId,
  type HandSide,
  type HeadRulerMetrics,
  type IKHandleId,
  type JointAngleCommand,
  type JointAngles,
  type JointsDisplayMode,
  type KeyLightSettings,
  type LayerVisibility,
  type LightingPresetId,
  type PoseControlMode,
  type PosePresetCommand,
  type ReferenceOverlayState,
  type SnapshotBridge,
  type SnapshotOptions,
  type StudioThemeId,
  type SvgExportOptions,
} from '@/types/anatomy';
import {
  clampStudioDrawing,
  DEFAULT_STUDIO_DRAWING,
  isDrawingActive,
  type StudioDrawingConfig,
} from '@/types/drawing';
import type { PoseBridge, PoseSnapshot } from '@/types/poseIO';
import {
  createStudioProp,
  MAX_STUDIO_PROPS,
  type PropDropCommand,
  type PropTransformMode,
  type StudioProp,
  type StudioPropType,
} from '@/types/props';
import {
  createInitialMannequin,
  MAX_MANNEQUINS,
  pickNextFinish,
  pickNextSpawnOffset,
  type MannequinFinish,
  type MannequinRecord,
} from '@/types/scene';
import {
  MAX_CAMERA_BOOKMARKS,
  type CameraBookmark,
  type CameraBridge,
  type CameraViewState,
  type MortalMeshSceneFile,
} from '@/types/sceneIO';
import {
  EMPTY_POSE_HISTORY,
  initPoseHistory,
  pushPoseHistory,
  redoPoseHistory,
  undoPoseHistory,
  type PoseHistoryState,
} from '@/utils/poseHistory';
import {
  clonePoseSnapshot,
  downloadPoseFile,
} from '@/utils/poseSerialization';
import {
  clearSavedSceneFromLocalStorage,
  downloadSceneFile,
  loadSceneFromLocalStorage,
  parseSceneOrPoseFile,
  saveSceneToLocalStorage,
  serializeSceneFile,
} from '@/utils/sceneSerialization';
import {
  clampLensCurvature,
  DEFAULT_LENS_CURVATURE,
} from '@/utils/lensWarp';

const ZERO_IK_SWIVEL: Record<Exclude<IKHandleId, 'pelvis'>, number> = {
  hand_l: 0,
  hand_r: 0,
  foot_l: 0,
  foot_r: 0,
};

const TOAST_DURATION_MS = 2500;
const AUTOSAVE_DEBOUNCE_MS = 600;

function parseTrailingInt(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

export default function HomePage() {
  const [studioTheme, setStudioTheme] = useState<StudioThemeId>('gray');
  const [layers, setLayers] = useState<LayerVisibility>({
    skeleton: false,
    muscle: false,
  });
  const [activePreset, setActivePreset] = useState<CameraPreset>('1-point');
  const [lensCurvature, setLensCurvature] = useState<number>(
    DEFAULT_LENS_CURVATURE
  );
  const [showPerspectiveGuides, setShowPerspectiveGuides] = useState(true);
  const [snapTrigger, setSnapTrigger] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [jointsDisplay, setJointsDisplay] = useState<JointsDisplayMode>('core');
  const [controlMode, setControlMode] = useState<PoseControlMode>('fk');
  const [jointLimitsEnabled, setJointLimitsEnabled] = useState(true);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [externalDeselectTrigger, setExternalDeselectTrigger] = useState(0);
  const [selectedBoneName, setSelectedBoneName] = useState<string | null>(null);
  const [selectedBoneAngles, setSelectedBoneAngles] =
    useState<JointAngles>(ZERO_JOINT_ANGLES);
  const [selectedIKHandle, setSelectedIKHandle] = useState<IKHandleId | null>(
    null
  );
  const [ikPinFeet, setIkPinFeet] = useState(true);
  const [ikSwivelByHandle, setIkSwivelByHandle] =
    useState<Record<Exclude<IKHandleId, 'pelvis'>, number>>(ZERO_IK_SWIVEL);
  const [contextualAnchor, setContextualAnchor] =
    useState<ContextualAnchor | null>(null);
  const [cameraRestSeq, setCameraRestSeq] = useState(0);
  const [activeHandGestureId, setActiveHandGestureId] =
    useState<HandGestureId | null>(null);
  const [jointAngleCommand, setJointAngleCommand] =
    useState<JointAngleCommand | null>(null);

  const [mannequins, setMannequins] = useState<MannequinRecord[]>(() => [
    createInitialMannequin(),
  ]);
  const [activeMannequinId, setActiveMannequinId] = useState<string>('figure-1');
  const [sceneLoadId, setSceneLoadId] = useState(0);

  const [studioProps, setStudioProps] = useState<StudioProp[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [propTransformMode, setPropTransformMode] =
    useState<PropTransformMode>('translate');
  const [dropPropToFloorCommand, setDropPropToFloorCommand] =
    useState<PropDropCommand | null>(null);

  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);

  const [groundEnabled, setGroundEnabled] = useState(true);
  const [elevationCommand, setElevationCommand] =
    useState<ElevationCommand | null>(null);
  const [dropToFloorTrigger, setDropToFloorTrigger] = useState(0);
  const [moveBodyEnabled, setMoveBodyEnabled] = useState(false);

  const [posePresetCommand, setPosePresetCommand] =
    useState<PosePresetCommand | null>(null);

  const [gravityEnabled, setGravityEnabled] = useState(false);
  const [dampingPreset, setDampingPreset] = useState<DampingPreset>('natural');

  const [keyLight, setKeyLight] = useState<KeyLightSettings>(
    DEFAULT_STUDIO_LIGHTING
  );
  const [drawing, setDrawing] = useState<StudioDrawingConfig>(
    DEFAULT_STUDIO_DRAWING
  );
  const [showHeadRuler, setShowHeadRuler] = useState(false);
  const [headRulerMetrics, setHeadRulerMetrics] =
    useState<HeadRulerMetrics | null>(null);
  const [compositionCrop, setCompositionCrop] =
    useState<CompositionCropRatio>('off');
  const [compositionGrid, setCompositionGrid] =
    useState<CompositionGridType>('off');
  const [goldenSpiralFlip, setGoldenSpiralFlip] = useState(false);
  const [referenceImage, setReferenceImage] =
    useState<ReferenceOverlayState | null>(null);
  const referenceUrlRef = useRef<string | null>(null);
  const referenceFileRef = useRef<File | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHudMinimized, setIsHudMinimized] = useState(false);
  const [activeRightRailTab, setActiveRightRailTab] =
    useState<RightRailTab | null>(null);
  const [isJointsPopoverOpen, setIsJointsPopoverOpen] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [snapshotFormat, setSnapshotFormat] = useState<'png' | 'svg'>('png');
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isPoseLibraryOpen, setIsPoseLibraryOpen] = useState(false);
  const [isPhotoToPoseOpen, setIsPhotoToPoseOpen] = useState(false);
  const [photoToPoseInitialFile, setPhotoToPoseInitialFile] =
    useState<File | null>(null);

  const [historyById, setHistoryById] = useState<
    Record<string, PoseHistoryState>
  >({});
  const [poseCommitVersion, setPoseCommitVersion] = useState(0);
  const [toast, setToast] = useState<StudioToastData | null>(null);

  const bridgesRef = useRef<Map<string, PoseBridge>>(new Map());
  const snapshotBridgeRef = useRef<SnapshotBridge | null>(null);
  const cameraBridgeRef = useRef<CameraBridge | null>(null);
  const poseByIdRef = useRef<Map<string, PoseSnapshot>>(new Map());
  const pendingCameraRestoreRef = useRef<CameraViewState | null>(null);
  const isHydratedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextFigureNumberRef = useRef(2);
  const nextPropSeqRef = useRef(1);
  const propDropSeqRef = useRef(0);
  const bookmarkSeqRef = useRef(1);
  const commandSeqRef = useRef(0);
  const elevationSeqRef = useRef(0);
  const posePresetSeqRef = useRef(0);
  const toastIdRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleViewportResize = useCallback(() => {
    cameraBridgeRef.current?.invalidateView();
  }, []);

  const viewport = useViewportProfile(handleViewportResize);
  const pwa = usePwaState();
  const prevAutoCollapseRef = useRef(false);

  const isDrawerOverlay = viewport.isMobile || viewport.isCompactLandscape;
  const shouldAutoCollapseSidebar =
    isDrawerOverlay || (viewport.isTablet && !viewport.isLandscape);

  useEffect(() => {
    if (shouldAutoCollapseSidebar && !prevAutoCollapseRef.current) {
      setIsSidebarOpen(false);
    }
    prevAutoCollapseRef.current = shouldAutoCollapseSidebar;
  }, [shouldAutoCollapseSidebar]);

  const activeMannequin =
    mannequins.find((m) => m.id === activeMannequinId) ?? mannequins[0];
  const activeLocked = activeMannequin?.locked ?? false;
  const activeHistory = historyById[activeMannequin.id] ?? EMPTY_POSE_HISTORY;
  const selectedProp =
    studioProps.find((p) => p.id === selectedPropId) ?? null;

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      if (referenceUrlRef.current) {
        URL.revokeObjectURL(referenceUrlRef.current);
        referenceUrlRef.current = null;
      }
    };
  }, []);

  const showToast = useCallback(
    (message: string, tone: 'success' | 'error' = 'success') => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastIdRef.current += 1;
      setToast({ id: toastIdRef.current, message, tone });
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, TOAST_DURATION_MS);
    },
    []
  );

  const applyParsedScene = useCallback(
    (sceneFile: MortalMeshSceneFile, options?: { silent?: boolean }) => {
      bridgesRef.current.clear();
      poseByIdRef.current.clear();

      const nextHistory: Record<string, PoseHistoryState> = {};
      let maxFigNum = 1;
      const restoredMannequins: MannequinRecord[] = sceneFile.mannequins.map(
        (m) => {
          maxFigNum = Math.max(maxFigNum, parseTrailingInt(m.id));
          const clonedPose = clonePoseSnapshot(m.pose);
          const restoredProps = clampFigureProportions(
            m.proportions ?? clonedPose.proportions
          );
          clonedPose.proportions = restoredProps;
          poseByIdRef.current.set(m.id, clonedPose);
          nextHistory[m.id] = initPoseHistory(clonedPose);
          return {
            id: m.id,
            name: m.name,
            modelId: m.modelId ?? 'classic',
            locked: m.locked,
            visible: m.visible,
            finish: m.finish,
            spawnOffset: [
              m.spawnOffset[0],
              m.spawnOffset[1],
              m.spawnOffset[2],
            ],
            elevationY: clonedPose.elevationY,
            groundSnapEnabled: clonedPose.groundSnapEnabled,
            pinnedBones: [...clonedPose.pinnedBones],
            activePosePresetId: m.activePosePresetId,
            proportions: restoredProps,
            initialSnapshot: clonedPose,
            preserveExactRootPosition: true,
          };
        }
      );

      let maxPropNum = 0;
      const restoredProps: StudioProp[] = sceneFile.props.map((p) => {
        maxPropNum = Math.max(maxPropNum, parseTrailingInt(p.id));
        return {
          ...p,
          position: [p.position[0], p.position[1], p.position[2]],
          rotation: [p.rotation[0], p.rotation[1], p.rotation[2]],
          scale: [p.scale[0], p.scale[1], p.scale[2]],
        };
      });

      let maxBmNum = 0;
      const restoredBookmarks: CameraBookmark[] = sceneFile.bookmarks.map(
        (b) => {
          maxBmNum = Math.max(maxBmNum, parseTrailingInt(b.id));
          return {
            ...b,
            position: [b.position[0], b.position[1], b.position[2]],
            target: [b.target[0], b.target[1], b.target[2]],
          };
        }
      );

      nextFigureNumberRef.current = maxFigNum + 1;
      nextPropSeqRef.current = maxPropNum + 1;
      bookmarkSeqRef.current = maxBmNum + 1;

      setStudioTheme(sceneFile.studio.theme);
      setGroundEnabled(sceneFile.studio.groundEnabled);
      setGravityEnabled(sceneFile.studio.gravityEnabled);
      setDampingPreset(sceneFile.studio.gravityDamping);
      setJointLimitsEnabled(sceneFile.studio.jointLimitsEnabled);
      setControlMode(sceneFile.studio.controlMode);
      setKeyLight(clampStudioLighting(sceneFile.studio.keyLight));
      setActivePreset(sceneFile.studio.perspectiveMode ?? '1-point');
      setLensCurvature(
        clampLensCurvature(
          sceneFile.studio.lensCurvature ?? DEFAULT_LENS_CURVATURE
        )
      );
      setShowPerspectiveGuides(sceneFile.studio.showPerspectiveGuides ?? true);
      setShowHeadRuler(sceneFile.studio.showHeadRuler ?? false);
      setCompositionCrop(sceneFile.studio.compositionCrop ?? 'off');
      setCompositionGrid(sceneFile.studio.compositionGrid ?? 'off');
      setGoldenSpiralFlip(sceneFile.studio.goldenSpiralFlip ?? false);
      setDrawing(clampStudioDrawing(sceneFile.studio.drawing));

      setMannequins(restoredMannequins);
      setActiveMannequinId(sceneFile.activeMannequinId);
      setHistoryById(nextHistory);
      setStudioProps(restoredProps);
      setSelectedPropId(null);
      setBookmarks(restoredBookmarks);
      setSelectedBoneName(null);
      setSelectedBoneAngles(ZERO_JOINT_ANGLES);
      setSelectedIKHandle(null);
      setContextualAnchor(null);
      setActiveHandGestureId(null);
      setActiveRightRailTab(null);
      setIsJointsPopoverOpen(false);
      setMoveBodyEnabled(false);
      setSceneLoadId((prev) => prev + 1);

      if (cameraBridgeRef.current) {
        cameraBridgeRef.current.setView(sceneFile.camera, false);
      } else {
        pendingCameraRestoreRef.current = sceneFile.camera;
      }

      if (!options?.silent) {
        showToast('Scene loaded', 'success');
      }
    },
    [showToast]
  );

  // Restore saved session or theme on client mount before enabling debounced autosave
  useEffect(() => {
    try {
      const savedScene = loadSceneFromLocalStorage();
      if (savedScene) {
        skipNextAutosaveRef.current = true;
        applyParsedScene(savedScene, { silent: true });
      } else {
        const savedTheme = window.localStorage.getItem(
          STUDIO_THEME_STORAGE_KEY
        );
        if (savedTheme && isStudioThemeId(savedTheme)) {
          setStudioTheme(savedTheme);
        }
      }
    } catch {
      // Ignore storage read errors in restricted contexts
    } finally {
      isHydratedRef.current = true;
    }
  }, [applyParsedScene]);

  const buildCurrentSceneFile = useCallback((): MortalMeshSceneFile => {
    const livePoseMap = new Map<string, PoseSnapshot>(poseByIdRef.current);
    for (const m of mannequins) {
      const liveSnap = bridgesRef.current.get(m.id)?.captureSnapshot();
      if (liveSnap) {
        livePoseMap.set(m.id, liveSnap);
      }
    }

    const liveCamera = cameraBridgeRef.current?.getView() ?? {
      position: [...CAMERA_PRESETS[activePreset].position] as [
        number,
        number,
        number,
      ],
      target: [...CAMERA_PRESETS[activePreset].target] as [
        number,
        number,
        number,
      ],
    };

    return serializeSceneFile({
      name: 'Mortal Mesh Studio Scene',
      mannequins,
      activeMannequinId: activeMannequin.id,
      poseById: livePoseMap,
      propsList: studioProps,
      studio: {
        theme: studioTheme,
        groundEnabled,
        gravityEnabled,
        gravityDamping: dampingPreset,
        jointLimitsEnabled,
        controlMode,
        keyLight,
        perspectiveMode: activePreset,
        lensCurvature,
        showPerspectiveGuides,
        showHeadRuler,
        compositionCrop,
        compositionGrid,
        goldenSpiralFlip,
        drawing,
      },
      camera: liveCamera,
      bookmarks,
    });
  }, [
    mannequins,
    activeMannequin.id,
    activePreset,
    lensCurvature,
    showPerspectiveGuides,
    showHeadRuler,
    compositionCrop,
    compositionGrid,
    goldenSpiralFlip,
    drawing,
    studioProps,
    studioTheme,
    groundEnabled,
    gravityEnabled,
    dampingPreset,
    jointLimitsEnabled,
    controlMode,
    keyLight,
    bookmarks,
  ]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      saveSceneToLocalStorage(buildCurrentSceneFile());
      autosaveTimerRef.current = null;
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [
    buildCurrentSceneFile,
    poseCommitVersion,
  ]);

  const handleMannequinBridgeChange = useCallback(
    (id: string, bridge: PoseBridge | null) => {
      if (bridge) {
        bridgesRef.current.set(id, bridge);
      } else {
        bridgesRef.current.delete(id);
      }
    },
    []
  );

  const handleSnapshotBridgeReady = useCallback(
    (bridge: SnapshotBridge | null) => {
      snapshotBridgeRef.current = bridge;
    },
    []
  );

  const handleCameraBridgeReady = useCallback((bridge: CameraBridge | null) => {
    cameraBridgeRef.current = bridge;
    if (bridge && pendingCameraRestoreRef.current) {
      const pending = pendingCameraRestoreRef.current;
      pendingCameraRestoreRef.current = null;
      bridge.setView(pending, false);
    }
  }, []);

  const handleInitialPoseSnapshot = useCallback(
    (id: string, snapshot: PoseSnapshot) => {
      poseByIdRef.current.set(id, clonePoseSnapshot(snapshot));
      setHistoryById((prev) => ({
        ...prev,
        [id]: prev[id] ?? initPoseHistory(snapshot),
      }));
    },
    []
  );

  const handleCommitPoseSnapshot = useCallback(
    (id: string, snapshot: PoseSnapshot) => {
      poseByIdRef.current.set(id, clonePoseSnapshot(snapshot));
      setHistoryById((prev) => ({
        ...prev,
        [id]: pushPoseHistory(prev[id] ?? EMPTY_POSE_HISTORY, snapshot),
      }));
      setPoseCommitVersion((prev) => prev + 1);
    },
    []
  );

  const handleCommitSliderHistory = useCallback(() => {
    if (activeLocked) return;
    const targetId = activeMannequin.id;
    const snapshot = bridgesRef.current.get(targetId)?.captureSnapshot();
    if (snapshot) {
      handleCommitPoseSnapshot(targetId, snapshot);
    }
  }, [activeLocked, activeMannequin.id, handleCommitPoseSnapshot]);

  const applyRestoredSnapshot = useCallback(
    (
      targetId: string,
      snapshot: PoseSnapshot,
      options?: { recomputeGroundIfSnapped?: boolean }
    ): PoseSnapshot | null => {
      const bridge = bridgesRef.current.get(targetId);
      if (!bridge) return null;

      const applied = bridge.applySnapshot(snapshot, options);
      if (!applied) return null;

      poseByIdRef.current.set(targetId, clonePoseSnapshot(applied));
      setGroundEnabled(applied.groundEnabled);
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === targetId
            ? {
                ...m,
                elevationY: applied.elevationY,
                groundSnapEnabled: applied.groundSnapEnabled,
                pinnedBones: [...applied.pinnedBones],
                proportions: clampFigureProportions(
                  applied.proportions ?? m.proportions
                ),
                activePosePresetId: null,
              }
            : m
        )
      );
      setMoveBodyEnabled(false);
      return applied;
    },
    []
  );

  const handleSelectMannequin = useCallback(
    (id: string) => {
      setSelectedPropId(null);
      if (id === activeMannequinId) return;
      setActiveMannequinId(id);
      setSelectedBoneName(null);
      setSelectedBoneAngles(ZERO_JOINT_ANGLES);
      setSelectedIKHandle(null);
      setIkSwivelByHandle(ZERO_IK_SWIVEL);
      setContextualAnchor(null);
      setActiveHandGestureId(null);
      setMoveBodyEnabled(false);
    },
    [activeMannequinId]
  );

  const handleAddMannequin = useCallback(() => {
    if (mannequins.length >= MAX_MANNEQUINS) {
      showToast(`Maximum ${MAX_MANNEQUINS} figures reached`, 'error');
      return;
    }

    const num = nextFigureNumberRef.current;
    nextFigureNumberRef.current += 1;
    const newId = `figure-${num}`;
    const newRecord: MannequinRecord = {
      id: newId,
      name: `Figure ${num}`,
      modelId: 'classic',
      locked: false,
      visible: true,
      finish: pickNextFinish(mannequins.length),
      spawnOffset: pickNextSpawnOffset(mannequins),
      elevationY: 0,
      groundSnapEnabled: groundEnabled,
      pinnedBones: [],
      activePosePresetId: 't-pose',
      proportions: { ...DEFAULT_FIGURE_PROPORTIONS },
    };

    setMannequins((prev) => [...prev, newRecord]);
    setActiveMannequinId(newId);
    setSelectedPropId(null);
    setSelectedBoneName(null);
    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setSelectedIKHandle(null);
    setContextualAnchor(null);
    setActiveHandGestureId(null);
    setMoveBodyEnabled(false);
    showToast(`Added ${newRecord.name}`, 'success');
  }, [mannequins, groundEnabled, showToast]);

  const handleDuplicateMannequin = useCallback(() => {
    if (mannequins.length >= MAX_MANNEQUINS) {
      showToast(`Maximum ${MAX_MANNEQUINS} figures reached`, 'error');
      return;
    }

    const source = activeMannequin;
    if (!source) return;

    const snap = bridgesRef.current.get(source.id)?.captureSnapshot();
    const num = nextFigureNumberRef.current;
    nextFigureNumberRef.current += 1;
    const newId = `figure-${num}`;

    const duplicateRecord: MannequinRecord = {
      id: newId,
      name: `Figure ${num}`,
      modelId: source.modelId,
      previousModelId: source.previousModelId,
      locked: false,
      visible: true,
      finish: pickNextFinish(mannequins.length),
      spawnOffset: pickNextSpawnOffset(mannequins),
      elevationY: snap ? snap.elevationY : source.elevationY,
      groundSnapEnabled: snap
        ? snap.groundSnapEnabled
        : source.groundSnapEnabled,
      pinnedBones: snap ? [...snap.pinnedBones] : [...source.pinnedBones],
      activePosePresetId: source.activePosePresetId,
      proportions: clampFigureProportions(
        snap?.proportions ?? source.proportions
      ),
      initialSnapshot: snap ? clonePoseSnapshot(snap) : undefined,
    };

    setMannequins((prev) => [...prev, duplicateRecord]);
    setActiveMannequinId(newId);
    setSelectedPropId(null);
    setSelectedBoneName(null);
    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setSelectedIKHandle(null);
    setContextualAnchor(null);
    setActiveHandGestureId(null);
    setMoveBodyEnabled(false);
    showToast(`Duplicated ${source.name}`, 'success');
  }, [mannequins, activeMannequin, showToast]);

  const handleToggleLockMannequin = useCallback(
    (id: string) => {
      const target = mannequins.find((m) => m.id === id);
      if (!target) return;

      const nextLocked = !target.locked;
      setMannequins((prev) =>
        prev.map((m) => (m.id === id ? { ...m, locked: nextLocked } : m))
      );

      if (id === activeMannequin.id && nextLocked) {
        setSelectedBoneName(null);
        setSelectedBoneAngles(ZERO_JOINT_ANGLES);
        setSelectedIKHandle(null);
        setIkSwivelByHandle(ZERO_IK_SWIVEL);
        setContextualAnchor(null);
        setActiveHandGestureId(null);
        setMoveBodyEnabled(false);
      }

      showToast(
        nextLocked ? `${target.name} locked` : `${target.name} unlocked`,
        'success'
      );
    },
    [mannequins, activeMannequin.id, showToast]
  );

  const handleToggleVisibleMannequin = useCallback(
    (id: string) => {
      const target = mannequins.find((m) => m.id === id);
      if (!target) return;

      const nextVisible = !target.visible;
      setMannequins((prev) =>
        prev.map((m) => (m.id === id ? { ...m, visible: nextVisible } : m))
      );

      if (id === activeMannequin.id && !nextVisible) {
        setSelectedBoneName(null);
        setSelectedBoneAngles(ZERO_JOINT_ANGLES);
        setSelectedIKHandle(null);
        setIkSwivelByHandle(ZERO_IK_SWIVEL);
        setContextualAnchor(null);
        setActiveHandGestureId(null);
        setMoveBodyEnabled(false);
      }
    },
    [mannequins, activeMannequin.id]
  );

  const handleChangeMannequinFinish = useCallback(
    (id: string, finish: MannequinFinish) => {
      setMannequins((prev) =>
        prev.map((m) => (m.id === id ? { ...m, finish } : m))
      );
    },
    []
  );

  const handleChangeMannequinModel = useCallback(
    (id: string, nextModelId: MannequinModelId) => {
      const target = mannequins.find((m) => m.id === id);
      if (!target) return;
      if (target.locked) {
        showToast(`Unlock ${target.name} before switching models`, 'error');
        return;
      }
      if (target.modelId === nextModelId) return;

      const captured = bridgesRef.current.get(id)?.captureSnapshot();
      const cached = poseByIdRef.current.get(id);
      const snap = captured ?? cached ?? target.initialSnapshot;
      const clonedSnap = snap ? clonePoseSnapshot(snap) : undefined;

      setMannequins((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const nextPrevModel: MannequinModelId | undefined =
            nextModelId === 'skeleton'
              ? m.modelId !== 'skeleton'
                ? m.modelId
                : m.previousModelId
              : nextModelId;
          return {
            ...m,
            modelId: nextModelId,
            previousModelId: nextPrevModel,
            spawnOffset: clonedSnap
              ? [clonedSnap.rootPosition[0], 0, clonedSnap.rootPosition[2]]
              : m.spawnOffset,
            elevationY: clonedSnap ? clonedSnap.elevationY : m.elevationY,
            pinnedBones: clonedSnap
              ? [...clonedSnap.pinnedBones]
              : m.pinnedBones,
            initialSnapshot: clonedSnap,
            preserveExactRootPosition: !m.groundSnapEnabled,
          };
        })
      );

      if (clonedSnap) {
        poseByIdRef.current.set(id, clonePoseSnapshot(clonedSnap));
      }

      if (id === activeMannequin.id) {
        setSelectedBoneName(null);
        setSelectedBoneAngles(ZERO_JOINT_ANGLES);
        setSelectedIKHandle(null);
        setIkSwivelByHandle(ZERO_IK_SWIVEL);
        setContextualAnchor(null);
        setActiveHandGestureId(null);
        setMoveBodyEnabled(false);
      }

      showToast(
        `Switched ${target.name} to ${MODEL_CATALOG[nextModelId].label}`,
        'success'
      );
    },
    [mannequins, activeMannequin.id, showToast]
  );

  const handleToggleSkeletonMode = useCallback(() => {
    if (!activeMannequin) return;
    const nextModel: MannequinModelId =
      activeMannequin.modelId === 'skeleton'
        ? activeMannequin.previousModelId &&
          activeMannequin.previousModelId !== 'skeleton'
          ? activeMannequin.previousModelId
          : 'classic'
        : 'skeleton';
    handleChangeMannequinModel(activeMannequin.id, nextModel);
  }, [activeMannequin, handleChangeMannequinModel]);

  const handleDeleteMannequin = useCallback(
    (id: string) => {
      if (mannequins.length <= 1) return;
      const targetIndex = mannequins.findIndex((m) => m.id === id);
      if (targetIndex === -1) return;

      const removed = mannequins[targetIndex];
      const remaining = mannequins.filter((m) => m.id !== id);
      poseByIdRef.current.delete(id);
      setMannequins(remaining);
      setHistoryById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (id === activeMannequin.id) {
        const nextActive =
          remaining[Math.min(targetIndex, remaining.length - 1)] ??
          remaining[0];
        setActiveMannequinId(nextActive.id);
        setSelectedBoneName(null);
        setSelectedBoneAngles(ZERO_JOINT_ANGLES);
        setSelectedIKHandle(null);
        setIkSwivelByHandle(ZERO_IK_SWIVEL);
        setContextualAnchor(null);
        setActiveHandGestureId(null);
        setMoveBodyEnabled(false);
      }

      showToast(`Removed ${removed.name}`, 'success');
    },
    [mannequins, activeMannequin.id, showToast]
  );

  const handleUndo = useCallback(() => {
    if (activeLocked || activeHistory.past.length === 0) return;

    const targetId = activeMannequin.id;
    const nextHistory = undoPoseHistory(activeHistory);
    if (!nextHistory.present) return;

    setHistoryById((prev) => ({
      ...prev,
      [targetId]: nextHistory,
    }));
    applyRestoredSnapshot(targetId, nextHistory.present);
    if (
      contextualAnchor &&
      contextualAnchor.kind !== 'prop' &&
      contextualAnchor.mannequinId === targetId &&
      (contextualAnchor.id === 'hand_l' || contextualAnchor.id === 'hand_r')
    ) {
      const side: HandSide = contextualAnchor.id === 'hand_l' ? 'l' : 'r';
      setActiveHandGestureId(
        bridgesRef.current.get(targetId)?.getHandGestureId(side) ?? null
      );
    }
    setPoseCommitVersion((prev) => prev + 1);
  }, [
    activeLocked,
    activeHistory,
    activeMannequin.id,
    applyRestoredSnapshot,
    contextualAnchor,
  ]);

  const handleRedo = useCallback(() => {
    if (activeLocked || activeHistory.future.length === 0) return;

    const targetId = activeMannequin.id;
    const nextHistory = redoPoseHistory(activeHistory);
    if (!nextHistory.present) return;

    setHistoryById((prev) => ({
      ...prev,
      [targetId]: nextHistory,
    }));
    applyRestoredSnapshot(targetId, nextHistory.present);
    if (
      contextualAnchor &&
      contextualAnchor.kind !== 'prop' &&
      contextualAnchor.mannequinId === targetId &&
      (contextualAnchor.id === 'hand_l' || contextualAnchor.id === 'hand_r')
    ) {
      const side: HandSide = contextualAnchor.id === 'hand_l' ? 'l' : 'r';
      setActiveHandGestureId(
        bridgesRef.current.get(targetId)?.getHandGestureId(side) ?? null
      );
    }
    setPoseCommitVersion((prev) => prev + 1);
  }, [
    activeLocked,
    activeHistory,
    activeMannequin.id,
    applyRestoredSnapshot,
    contextualAnchor,
  ]);

  const handleMirrorPose = useCallback(() => {
    if (activeLocked) {
      showToast('Unlock figure to mirror pose', 'error');
      return;
    }

    const targetId = activeMannequin.id;
    const mirrored = bridgesRef.current.get(targetId)?.mirrorCurrentPose();
    if (!mirrored) return;

    poseByIdRef.current.set(targetId, clonePoseSnapshot(mirrored));
    setGroundEnabled(mirrored.groundEnabled);
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === targetId
          ? {
              ...m,
              elevationY: mirrored.elevationY,
              groundSnapEnabled: mirrored.groundSnapEnabled,
              pinnedBones: [...mirrored.pinnedBones],
              activePosePresetId: null,
            }
          : m
      )
    );
    setMoveBodyEnabled(false);
    handleCommitPoseSnapshot(targetId, mirrored);
    showToast('Pose mirrored', 'success');
  }, [activeLocked, activeMannequin.id, handleCommitPoseSnapshot, showToast]);

  const handleExportPoseJson = useCallback(() => {
    const targetId = activeMannequin.id;
    const snapshot = bridgesRef.current.get(targetId)?.captureSnapshot();
    if (!snapshot) return;

    const presetName = activeMannequin.activePosePresetId
      ? getPosePreset(activeMannequin.activePosePresetId)?.label
      : undefined;
    downloadPoseFile(snapshot, presetName ?? activeMannequin.name);
    showToast('Pose saved', 'success');
  }, [activeMannequin, showToast]);

  const handleExportSceneJson = useCallback(() => {
    const sceneFile = buildCurrentSceneFile();
    downloadSceneFile(sceneFile);
    saveSceneToLocalStorage(sceneFile);
    showToast('Scene saved', 'success');
  }, [buildCurrentSceneFile, showToast]);

  const handleImportSceneOrPoseJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const raw: unknown = JSON.parse(text);
        const parsed = parseSceneOrPoseFile(raw);
        if (!parsed.ok) {
          showToast(parsed.error, 'error');
          return;
        }

        if (parsed.kind === 'scene') {
          applyParsedScene(parsed.file);
          saveSceneToLocalStorage(parsed.file);
          return;
        }

        if (activeLocked) {
          showToast('Unlock figure to load JSON', 'error');
          return;
        }

        const targetId = activeMannequin.id;
        const applied = applyRestoredSnapshot(targetId, parsed.file.pose, {
          recomputeGroundIfSnapped: true,
        });
        if (applied) {
          handleCommitPoseSnapshot(targetId, applied);
          showToast('Pose loaded', 'success');
        }
      } catch {
        showToast('Invalid JSON file', 'error');
      }
    },
    [
      activeLocked,
      activeMannequin.id,
      applyParsedScene,
      applyRestoredSnapshot,
      handleCommitPoseSnapshot,
      showToast,
    ]
  );

  const handleNewBlankScene = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    clearSavedSceneFromLocalStorage();
    try {
      window.localStorage.removeItem(STUDIO_THEME_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    skipNextAutosaveRef.current = true;

    bridgesRef.current.clear();
    poseByIdRef.current.clear();
    nextFigureNumberRef.current = 2;
    nextPropSeqRef.current = 1;
    bookmarkSeqRef.current = 1;

    setStudioTheme('gray');
    setMannequins([createInitialMannequin('female')]);
    setActiveMannequinId('figure-1');
    setHistoryById({});
    setStudioProps([]);
    setSelectedPropId(null);
    setBookmarks([]);
    setSelectedBoneName(null);
    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setSelectedIKHandle(null);
    setIkSwivelByHandle(ZERO_IK_SWIVEL);
    setControlMode('fk');
    setGroundEnabled(true);
    setGravityEnabled(false);
    setJointLimitsEnabled(true);
    setMoveBodyEnabled(false);
    setKeyLight(DEFAULT_STUDIO_LIGHTING);
    setDrawing(DEFAULT_STUDIO_DRAWING);
    setSnapshotFormat('png');
    setActivePreset('1-point');
    setLensCurvature(DEFAULT_LENS_CURVATURE);
    setShowPerspectiveGuides(true);
    setShowHeadRuler(false);
    setHeadRulerMetrics(null);
    setCompositionCrop('off');
    setCompositionGrid('off');
    setGoldenSpiralFlip(false);
    setContextualAnchor(null);
    setActiveHandGestureId(null);
    setActiveRightRailTab(null);
    setIsJointsPopoverOpen(false);
    setSnapTrigger((prev) => prev + 1);
    setSceneLoadId((prev) => prev + 1);
    showToast('Started new atelier scene', 'success');
  }, [showToast]);

  const handleChangeControlMode = useCallback((mode: PoseControlMode) => {
    setControlMode(mode);
    setMoveBodyEnabled(false);
    setSelectedPropId(null);
    setSelectedBoneName(null);
    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setSelectedIKHandle(null);
    setContextualAnchor(null);
    setActiveHandGestureId(null);
    if (mode === 'ik') {
      setJointsDisplay((prev) => (prev === 'hidden' ? 'core' : prev));
    }
  }, []);

  // Studio Props Handlers
  const handleSelectProp = useCallback((id: string | null) => {
    setSelectedPropId(id);
    if (id !== null) {
      setSelectedBoneName(null);
      setSelectedBoneAngles(ZERO_JOINT_ANGLES);
      setSelectedIKHandle(null);
      setMoveBodyEnabled(false);
    }
  }, []);

  const handleAddProp = useCallback(
    (type: StudioPropType) => {
      if (studioProps.length >= MAX_STUDIO_PROPS) {
        showToast(`Maximum ${MAX_STUDIO_PROPS} props reached`, 'error');
        return;
      }

      const seq = nextPropSeqRef.current;
      nextPropSeqRef.current += 1;
      const newProp = createStudioProp(type, studioProps, seq, groundEnabled);
      setStudioProps((prev) => [...prev, newProp]);
      handleSelectProp(newProp.id);
      showToast(`Added ${newProp.name}`, 'success');
    },
    [studioProps, groundEnabled, handleSelectProp, showToast]
  );

  const handleToggleLockProp = useCallback(
    (id: string) => {
      const target = studioProps.find((p) => p.id === id);
      if (!target) return;
      const nextLocked = !target.locked;
      setStudioProps((prev) =>
        prev.map((p) => (p.id === id ? { ...p, locked: nextLocked } : p))
      );
      if (nextLocked) {
        setContextualAnchor((prev) =>
          prev?.kind === 'prop' && prev.id === id ? null : prev
        );
      }
      showToast(
        nextLocked ? `${target.name} locked` : `${target.name} unlocked`,
        'success'
      );
    },
    [studioProps, showToast]
  );

  const handleToggleVisibleProp = useCallback((id: string) => {
    setStudioProps((prev) =>
      prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
    );
  }, []);

  const handleDeleteProp = useCallback(
    (id: string) => {
      const target = studioProps.find((p) => p.id === id);
      if (!target) return;
      setStudioProps((prev) => prev.filter((p) => p.id !== id));
      if (selectedPropId === id) {
        setSelectedPropId(null);
      }
      setContextualAnchor((prev) =>
        prev?.kind === 'prop' && prev.id === id ? null : prev
      );
      showToast(`Removed ${target.name}`, 'success');
    },
    [studioProps, selectedPropId, showToast]
  );

  const handleUpdatePropTransform = useCallback(
    (
      id: string,
      patch: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      }
    ) => {
      setStudioProps((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                position: patch.position,
                rotation: patch.rotation,
                scale: patch.scale,
              }
            : p
        )
      );
    },
    []
  );

  const handleDropPropToFloor = useCallback((id: string) => {
    propDropSeqRef.current += 1;
    setDropPropToFloorCommand({ propId: id, seq: propDropSeqRef.current });
  }, []);

  const handleResetPropScale = useCallback((id: string) => {
    setStudioProps((prev) =>
      prev.map((p) => (p.id === id ? { ...p, scale: [1, 1, 1] } : p))
    );
  }, []);

  // Camera Bookmark Handlers
  const handleAddBookmark = useCallback(() => {
    if (bookmarks.length >= MAX_CAMERA_BOOKMARKS) {
      showToast(`Maximum ${MAX_CAMERA_BOOKMARKS} views saved`, 'error');
      return;
    }

    const view = cameraBridgeRef.current?.getView();
    if (!view) return;

    const seq = bookmarkSeqRef.current;
    bookmarkSeqRef.current += 1;
    const bookmark: CameraBookmark = {
      id: `bookmark-${seq}`,
      name: `View ${seq}`,
      position: view.position,
      target: view.target,
    };

    setBookmarks((prev) => [...prev, bookmark]);
    showToast(`Saved ${bookmark.name}`, 'success');
  }, [bookmarks.length, showToast]);

  const handleSelectBookmark = useCallback((bookmark: CameraBookmark) => {
    cameraBridgeRef.current?.setView(
      { position: bookmark.position, target: bookmark.target },
      true
    );
  }, []);

  const handleDeleteBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const handleChangeKeyLight = useCallback(
    (patch: Partial<KeyLightSettings>) => {
      setKeyLight((prev) => clampStudioLighting({ ...prev, ...patch }));
    },
    []
  );

  const handleSelectLightingPreset = useCallback(
    (presetId: LightingPresetId) => {
      const preset = LIGHTING_PRESETS[presetId];
      setKeyLight((prev) =>
        clampStudioLighting({
          azimuth: preset.azimuth,
          elevation: preset.elevation,
          intensity: preset.intensity,
          rimIntensity: preset.rimIntensity,
          rimAzimuthOffset: preset.rimAzimuthOffset,
          fillIntensity: preset.fillIntensity,
          notanEnabled: prev.notanEnabled,
          notanSplit: prev.notanSplit,
          presetId,
        })
      );
    },
    []
  );

  const handleResetKeyLight = useCallback(() => {
    setKeyLight(DEFAULT_STUDIO_LIGHTING);
  }, []);

  const handleChangeDrawing = useCallback(
    (patch: Partial<StudioDrawingConfig>) => {
      setDrawing((prev) => {
        const merged = { ...prev, ...patch };
        if (
          patch.drawingStyle === 'skeleton-sheet' &&
          prev.drawingStyle !== 'skeleton-sheet'
        ) {
          merged.showLandmarks = true;
        }
        return clampStudioDrawing(merged);
      });
    },
    []
  );

  const handleResetDrawing = useCallback(() => {
    setDrawing(DEFAULT_STUDIO_DRAWING);
  }, []);

  const handleChangeMannequinProportions = useCallback(
    (id: string, patch: Partial<FigureProportions>) => {
      const target = mannequins.find((m) => m.id === id);
      if (!target || target.locked) return;

      const nextProps = clampFigureProportions({
        ...target.proportions,
        ...patch,
      });
      const snapped = bridgesRef.current.get(id)?.syncProportions(nextProps, false);
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                proportions: nextProps,
                elevationY: snapped ? snapped.elevationY : m.elevationY,
              }
            : m
        )
      );
    },
    [mannequins]
  );

  const handleApplyProportionPreset = useCallback(
    (id: string, presetId: ProportionPresetId) => {
      const target = mannequins.find((m) => m.id === id);
      if (!target || target.locked) {
        if (target?.locked) {
          showToast(`Unlock ${target.name} before editing proportions`, 'error');
        }
        return;
      }

      const nextProps = clampFigureProportions(
        PROPORTION_PRESETS[presetId].proportions
      );
      const snapped = bridgesRef.current.get(id)?.syncProportions(nextProps, true);
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                proportions: nextProps,
                elevationY: snapped ? snapped.elevationY : m.elevationY,
              }
            : m
        )
      );
    },
    [mannequins, showToast]
  );

  const handleImportReferenceImage = useCallback(
    (file: File) => {
      if (referenceUrlRef.current) {
        URL.revokeObjectURL(referenceUrlRef.current);
        referenceUrlRef.current = null;
      }
      referenceFileRef.current = file;
      const url = URL.createObjectURL(file);
      referenceUrlRef.current = url;
      setReferenceImage((prev) => ({
        objectUrl: url,
        filename: file.name,
        mode: prev?.mode ?? 'backdrop',
        opacity: prev ? prev.opacity : 0.35,
        scale: prev ? prev.scale : 1,
        flipH: prev?.flipH ?? false,
        locked: prev?.locked ?? true,
        offsetX: 0,
        offsetY: 0,
      }));
      showToast('Reference image loaded', 'success');
    },
    [showToast]
  );

  const handlePinPhotoReferenceBackdrop = useCallback((file: File) => {
    if (referenceUrlRef.current) {
      URL.revokeObjectURL(referenceUrlRef.current);
      referenceUrlRef.current = null;
    }
    referenceFileRef.current = file;
    const url = URL.createObjectURL(file);
    referenceUrlRef.current = url;
    setReferenceImage({
      objectUrl: url,
      filename: file.name,
      mode: 'backdrop',
      opacity: 0.35,
      scale: 1,
      flipH: false,
      locked: true,
      offsetX: 0,
      offsetY: 0,
    });
  }, []);

  const handleUpdateReferenceImage = useCallback(
    (patch: Partial<ReferenceOverlayState>) => {
      setReferenceImage((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    []
  );

  const handleRemoveReferenceImage = useCallback(() => {
    if (referenceUrlRef.current) {
      URL.revokeObjectURL(referenceUrlRef.current);
      referenceUrlRef.current = null;
    }
    referenceFileRef.current = null;
    setReferenceImage(null);
  }, []);

  const handleOpenPhotoToPose = useCallback((initialFile: File | null = null) => {
    setActiveRightRailTab(null);
    setIsJointsPopoverOpen(false);
    setIsSnapshotOpen(false);
    setIsShortcutsOpen(false);
    setIsPoseLibraryOpen(false);
    setPhotoToPoseInitialFile(initialFile);
    setIsPhotoToPoseOpen(true);
  }, []);

  const handleApplyPhotoPose = useCallback(
    ({
      person,
      file,
      pinBackdrop,
      matchHandGestures,
      matchCameraAngle,
    }: PhotoToPoseApplyPayload) => {
      if (activeLocked) {
        showToast('Unlock figure to apply', 'error');
        return;
      }

      try {
        const targetId = activeMannequin.id;
        const retargeted = retargetDetectedPersonToPose(person, {
          includeHandGestures: matchHandGestures,
          normalizeFacingYaw: matchCameraAngle,
          groundEnabled,
          groundSnapEnabled: activeMannequin.groundSnapEnabled,
        });

        const applied = bridgesRef.current
          .get(targetId)
          ?.applyReconstructedPose(retargeted.snapshot, {
            preserveRootXZ: true,
          });
        if (!applied) {
          showToast('Figure rig not ready yet — try again in a moment', 'error');
          return;
        }

        poseByIdRef.current.set(targetId, clonePoseSnapshot(applied));
        setMoveBodyEnabled(false);
        setIkSwivelByHandle(ZERO_IK_SWIVEL);
        setMannequins((prev) =>
          prev.map((m) =>
            m.id === targetId
              ? {
                  ...m,
                  elevationY: applied.elevationY,
                  groundSnapEnabled: applied.groundSnapEnabled,
                  pinnedBones: [...applied.pinnedBones],
                  activePosePresetId: null,
                }
              : m
          )
        );
        handleCommitPoseSnapshot(targetId, applied);
        setPoseCommitVersion((prev) => prev + 1);

        if (pinBackdrop) {
          handlePinPhotoReferenceBackdrop(file);
        }

        if (matchCameraAngle) {
          const camView = buildMatchedCameraView(
            retargeted.cameraEstimate,
            applied.rootPosition
          );
          cameraBridgeRef.current?.setView(camView, true);
        }

        setIsPhotoToPoseOpen(false);
        setPhotoToPoseInitialFile(null);
        const modelLabel = MODEL_CATALOG[activeMannequin.modelId].label;
        showToast(
          `Pose reconstructed on ${modelLabel} — drag IK handles to fine-tune`,
          'success'
        );
      } catch {
        showToast('Unable to retarget detected landmarks onto figure', 'error');
      }
    },
    [
      activeLocked,
      activeMannequin,
      groundEnabled,
      handleCommitPoseSnapshot,
      handlePinPhotoReferenceBackdrop,
      showToast,
    ]
  );

  const handleStageAllPhotoPoses = useCallback(
    ({
      people,
      file,
      pinBackdrop,
      matchHandGestures,
      matchCameraAngle,
    }: PhotoToPoseStageAllPayload) => {
      const targetCount = Math.min(people.length, MAX_MANNEQUINS);
      if (targetCount === 0) return;

      try {
        const spacingX = targetCount <= 2 ? 1.15 : 1.05;
        const centerShift = ((targetCount - 1) * spacingX) / 2;

        const reusable = [
          ...(!activeMannequin.locked ? [activeMannequin] : []),
          ...mannequins.filter(
            (m) => m.id !== activeMannequin.id && !m.locked
          ),
        ];

        const updatedIds = new Set<string>();
        const spawnedRecords: MannequinRecord[] = [];
        const patchById = new Map<
          string,
          { applied: PoseSnapshot; x: number }
        >();

        for (let i = 0; i < targetCount; i += 1) {
          const person = people[i];
          const xPos = Number((i * spacingX - centerShift).toFixed(2));
          const retargeted = retargetDetectedPersonToPose(person, {
            includeHandGestures: matchHandGestures,
            normalizeFacingYaw: false,
            groundEnabled,
            groundSnapEnabled: groundEnabled,
          });
          const stagedSnap: PoseSnapshot = {
            ...retargeted.snapshot,
            rootPosition: [xPos, retargeted.snapshot.rootPosition[1], 0],
            proportions: { ...DEFAULT_FIGURE_PROPORTIONS },
          };

          const existing = reusable[i];
          if (existing) {
            const applied = bridgesRef.current
              .get(existing.id)
              ?.applyReconstructedPose(stagedSnap, { preserveRootXZ: false });
            if (applied) {
              poseByIdRef.current.set(existing.id, clonePoseSnapshot(applied));
              handleCommitPoseSnapshot(existing.id, applied);
              updatedIds.add(existing.id);
              patchById.set(existing.id, { applied, x: xPos });
            }
          } else if (mannequins.length + spawnedRecords.length < MAX_MANNEQUINS) {
            const num = nextFigureNumberRef.current;
            nextFigureNumberRef.current += 1;
            const newId = `figure-${num}`;
            const clonedSnap = clonePoseSnapshot(stagedSnap);
            poseByIdRef.current.set(newId, clonedSnap);
            spawnedRecords.push({
              id: newId,
              name: `Figure ${num}`,
              modelId: activeMannequin.modelId,
              previousModelId: activeMannequin.previousModelId,
              locked: false,
              visible: true,
              finish: pickNextFinish(
                mannequins.length + spawnedRecords.length
              ),
              spawnOffset: [xPos, 0, 0],
              elevationY: clonedSnap.elevationY,
              groundSnapEnabled: groundEnabled,
              pinnedBones: [],
              activePosePresetId: null,
              proportions: { ...DEFAULT_FIGURE_PROPORTIONS },
              initialSnapshot: clonedSnap,
            });
          }
        }

        setMannequins((prev) => {
          const updated = prev.map((m) => {
            const p = patchById.get(m.id);
            if (!p) return m;
            return {
              ...m,
              spawnOffset: [p.x, 0, 0] as [number, number, number],
              elevationY: p.applied.elevationY,
              groundSnapEnabled: p.applied.groundSnapEnabled,
              pinnedBones: [...p.applied.pinnedBones],
              activePosePresetId: null,
            };
          });
          return [...updated, ...spawnedRecords];
        });

        setMoveBodyEnabled(false);
        setIkSwivelByHandle(ZERO_IK_SWIVEL);
        setPoseCommitVersion((prev) => prev + 1);

        if (pinBackdrop) {
          handlePinPhotoReferenceBackdrop(file);
        }

        if (matchCameraAngle) {
          cameraBridgeRef.current?.setView(
            {
              position: [0, 1.35, 5.2 + targetCount * 0.45],
              target: [0, 0.98, 0],
            },
            true
          );
        }

        setIsPhotoToPoseOpen(false);
        setPhotoToPoseInitialFile(null);
        const totalApplied = updatedIds.size + spawnedRecords.length;
        showToast(
          `Staged ${totalApplied} reconstructed ${totalApplied === 1 ? 'figure' : 'figures'}`,
          'success'
        );
      } catch {
        showToast('Unable to stage all detected poses', 'error');
      }
    },
    [
      activeMannequin,
      groundEnabled,
      handleCommitPoseSnapshot,
      handlePinPhotoReferenceBackdrop,
      mannequins,
      showToast,
    ]
  );

  const handleUpdateReferenceOffset = useCallback((x: number, y: number) => {
    setReferenceImage((prev) =>
      prev ? { ...prev, offsetX: x, offsetY: y } : prev
    );
  }, []);

  const handleToggleReferenceLock = useCallback(() => {
    setReferenceImage((prev) =>
      prev ? { ...prev, locked: !prev.locked } : prev
    );
  }, []);

  const handleToggleRightRailTab = useCallback((tab: RightRailTab) => {
    setActiveRightRailTab((prev) => {
      const next = prev === tab ? null : tab;
      if (next !== null) {
        setIsJointsPopoverOpen(false);
        setIsSnapshotOpen(false);
        setIsShortcutsOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleJointsPopover = useCallback(() => {
    if (!isJointsPopoverOpen) {
      setActiveRightRailTab(null);
      setIsSnapshotOpen(false);
      setIsShortcutsOpen(false);
    }
    setIsJointsPopoverOpen(!isJointsPopoverOpen);
  }, [isJointsPopoverOpen]);

  const handleToggleSnapshot = useCallback(() => {
    if (!isSnapshotOpen) {
      setActiveRightRailTab(null);
      setIsJointsPopoverOpen(false);
      setIsShortcutsOpen(false);
    }
    setIsSnapshotOpen(!isSnapshotOpen);
  }, [isSnapshotOpen]);

  const handleOpenSnapshotSvg = useCallback(() => {
    setActiveRightRailTab(null);
    setIsJointsPopoverOpen(false);
    setIsShortcutsOpen(false);
    setSnapshotFormat('svg');
    setIsSnapshotOpen(true);
  }, []);

  const handleToggleShortcuts = useCallback(() => {
    if (!isShortcutsOpen) {
      setActiveRightRailTab(null);
      setIsJointsPopoverOpen(false);
      setIsSnapshotOpen(false);
    }
    setIsShortcutsOpen(!isShortcutsOpen);
  }, [isShortcutsOpen]);

  const handleCaptureSnapshot = useCallback(
    (options: SnapshotOptions) => {
      const result = snapshotBridgeRef.current?.captureSnapshot(options);
      setIsSnapshotOpen(false);
      if (result) {
        showToast(
          options.transparent
            ? 'Transparent PNG exported'
            : 'Studio PNG exported',
          'success'
        );
      } else {
        showToast('Failed to export PNG snapshot', 'error');
      }
    },
    [showToast]
  );

  const handleExportBlueprintSvg = useCallback(
    (options: SvgExportOptions) => {
      const result = snapshotBridgeRef.current?.exportBlueprintSvg(options);
      setIsSnapshotOpen(false);
      if (result) {
        showToast('Layered SVG blueprint exported', 'success');
      } else {
        showToast('Failed to export layered SVG', 'error');
      }
    },
    [showToast]
  );

  const handleChangeStudioTheme = useCallback((nextTheme: StudioThemeId) => {
    setStudioTheme(nextTheme);
    try {
      window.localStorage.setItem(STUDIO_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleToggleLayer = useCallback((layer: keyof LayerVisibility) => {
    setLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  }, []);

  const handleSelectCameraPreset = useCallback((preset: CameraPreset) => {
    setActivePreset(preset);
    setSnapTrigger((prev) => prev + 1);
  }, []);

  const handleCameraRest = useCallback(() => {
    setCameraRestSeq((prev) => prev + 1);
  }, []);

  const handleMannequinAnchorChange = useCallback(
    (anchor: ContextualAnchor | null) => {
      if (anchor === null) {
        setContextualAnchor((prev) =>
          prev && prev.kind !== 'prop' ? null : prev
        );
        setActiveHandGestureId(null);
        return;
      }
      setContextualAnchor(anchor);
      if (
        anchor.mannequinId &&
        (anchor.id === 'hand_l' || anchor.id === 'hand_r')
      ) {
        const side: HandSide = anchor.id === 'hand_l' ? 'l' : 'r';
        const matched =
          bridgesRef.current
            .get(anchor.mannequinId)
            ?.getHandGestureId(side) ?? null;
        setActiveHandGestureId(matched);
      } else {
        setActiveHandGestureId(null);
      }
    },
    []
  );

  const handlePropAnchorChange = useCallback(
    (anchor: ContextualAnchor | null) => {
      if (anchor === null) {
        setContextualAnchor((prev) => (prev?.kind === 'prop' ? null : prev));
        return;
      }
      setContextualAnchor(anchor);
      setActiveHandGestureId(null);
    },
    []
  );

  const handleApplyHandGesture = useCallback(
    (side: HandSide, gestureId: HandGestureId) => {
      if (activeLocked) {
        showToast('Unlock figure to set hand gesture', 'error');
        return;
      }
      const targetId = activeMannequin.id;
      const updated = bridgesRef.current
        .get(targetId)
        ?.applyHandGesture(side, gestureId);
      if (!updated) return;

      setMannequins((prev) =>
        prev.map((m) =>
          m.id === targetId ? { ...m, activePosePresetId: null } : m
        )
      );
      setActiveHandGestureId(gestureId);
      handleCommitPoseSnapshot(targetId, updated);
      showToast(`${HAND_GESTURE_BY_ID[gestureId].label} applied`, 'success');
    },
    [activeLocked, activeMannequin.id, handleCommitPoseSnapshot, showToast]
  );

  const handleMirrorHandGesture = useCallback(
    (fromSide: HandSide) => {
      if (activeLocked) {
        showToast('Unlock figure to mirror hand gesture', 'error');
        return;
      }
      const targetId = activeMannequin.id;
      const bridge = bridgesRef.current.get(targetId);
      const updated = bridge?.mirrorHandGesture(fromSide);
      if (!updated) return;

      setMannequins((prev) =>
        prev.map((m) =>
          m.id === targetId ? { ...m, activePosePresetId: null } : m
        )
      );
      setActiveHandGestureId(bridge?.getHandGestureId(fromSide) ?? null);
      handleCommitPoseSnapshot(targetId, updated);
      showToast(
        fromSide === 'l'
          ? 'Left hand mirrored to Right'
          : 'Right hand mirrored to Left',
        'success'
      );
    },
    [activeLocked, activeMannequin.id, handleCommitPoseSnapshot, showToast]
  );

  const handleChangeIKSwivel = useCallback(
    (deg: number) => {
      if (activeLocked || !selectedIKHandle || selectedIKHandle === 'pelvis') {
        return;
      }
      setIkSwivelByHandle((prev) => ({ ...prev, [selectedIKHandle]: deg }));
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === activeMannequin.id ? { ...m, activePosePresetId: null } : m
        )
      );
      bridgesRef.current
        .get(activeMannequin.id)
        ?.applyIKSwivel(selectedIKHandle, deg, false);
    },
    [activeLocked, activeMannequin.id, selectedIKHandle]
  );

  const handleCommitIKSwivel = useCallback(() => {
    if (activeLocked || !selectedIKHandle || selectedIKHandle === 'pelvis') {
      return;
    }
    const deg = ikSwivelByHandle[selectedIKHandle] ?? 0;
    bridgesRef.current
      .get(activeMannequin.id)
      ?.applyIKSwivel(selectedIKHandle, deg, true);
  }, [activeLocked, activeMannequin.id, selectedIKHandle, ikSwivelByHandle]);

  const handleResetIKLimb = useCallback(() => {
    if (activeLocked || !selectedIKHandle) return;
    if (selectedIKHandle !== 'pelvis') {
      setIkSwivelByHandle((prev) => ({ ...prev, [selectedIKHandle]: 0 }));
    }
    const updated = bridgesRef.current
      .get(activeMannequin.id)
      ?.resetIKLimb(selectedIKHandle);
    if (!updated) return;
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id ? { ...m, activePosePresetId: null } : m
      )
    );
    showToast(
      selectedIKHandle === 'pelvis' ? 'Standing pose restored' : 'Limb reset',
      'success'
    );
  }, [activeLocked, activeMannequin.id, selectedIKHandle, showToast]);

  const handlePlantFootIK = useCallback(() => {
    if (
      activeLocked ||
      (selectedIKHandle !== 'foot_l' && selectedIKHandle !== 'foot_r')
    ) {
      return;
    }
    const updated = bridgesRef.current
      .get(activeMannequin.id)
      ?.plantFootIK(selectedIKHandle);
    if (!updated) return;
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id ? { ...m, activePosePresetId: null } : m
      )
    );
    showToast('Planted foot to floor', 'success');
  }, [activeLocked, activeMannequin.id, selectedIKHandle, showToast]);

  const handleCloseContextualPopover = useCallback(() => {
    setContextualAnchor(null);
    setActiveHandGestureId(null);
    setSelectedPropId(null);
    setSelectedBoneName(null);
    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setSelectedIKHandle(null);
    setMoveBodyEnabled(false);
    setExternalDeselectTrigger((prev) => prev + 1);
  }, []);

  const handleSelectBoneChange = useCallback(
    (boneName: string | null, angles: JointAngles) => {
      setSelectedBoneName(boneName);
      setSelectedBoneAngles(angles);
      if (boneName !== null) {
        setSelectedIKHandle(null);
        setSelectedPropId(null);
      }
    },
    []
  );

  const handleSelectIKHandleChange = useCallback(
    (handleId: IKHandleId | null) => {
      setSelectedIKHandle(handleId);
      if (handleId !== null) {
        setSelectedBoneName(null);
        setSelectedBoneAngles(ZERO_JOINT_ANGLES);
        setSelectedPropId(null);
      }
    },
    []
  );

  const handleBoneAnglesChange = useCallback(
    (angles: JointAngles) => {
      setSelectedBoneAngles(angles);
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === activeMannequin.id ? { ...m, activePosePresetId: null } : m
        )
      );
    },
    [activeMannequin.id]
  );

  const handleElevationSync = useCallback(
    (id: string, nextElevationY: number) => {
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === id && Math.abs(m.elevationY - nextElevationY) >= 0.005
            ? { ...m, elevationY: nextElevationY }
            : m
        )
      );
    },
    []
  );

  const handleChangeAxisAngle = useCallback(
    (axis: AxisKey, value: number) => {
      if (activeLocked || !selectedBoneName) return;

      const nextAngles = { ...selectedBoneAngles, [axis]: value };
      commandSeqRef.current += 1;
      setSelectedBoneAngles(nextAngles);
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === activeMannequin.id ? { ...m, activePosePresetId: null } : m
        )
      );
      setJointAngleCommand({
        boneName: selectedBoneName,
        angles: nextAngles,
        seq: commandSeqRef.current,
      });
    },
    [activeLocked, activeMannequin.id, selectedBoneName, selectedBoneAngles]
  );

  const handleResetSelectedJoint = useCallback(() => {
    if (activeLocked || !selectedBoneName) return;

    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id ? { ...m, activePosePresetId: null } : m
      )
    );
    commandSeqRef.current += 1;
    setJointAngleCommand({
      boneName: selectedBoneName,
      angles: ZERO_JOINT_ANGLES,
      seq: commandSeqRef.current,
      commitHistory: true,
    });
  }, [activeLocked, activeMannequin.id, selectedBoneName]);

  const handleToggleGround = useCallback(() => {
    const next = !groundEnabled;
    setGroundEnabled(next);
    if (!next) {
      setMannequins((prev) =>
        prev.map((m) => (m.locked ? m : { ...m, groundSnapEnabled: false }))
      );
    } else {
      setMannequins((prev) =>
        prev.map((m) =>
          m.locked ? m : m.elevationY < 0 ? { ...m, elevationY: 0 } : m
        )
      );
    }
  }, [groundEnabled]);

  const handleToggleGroundSnap = useCallback(() => {
    if (activeLocked) return;

    const next = !activeMannequin.groundSnapEnabled;
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id ? { ...m, groundSnapEnabled: next } : m
      )
    );
    if (next) {
      setGroundEnabled(true);
      setMoveBodyEnabled(false);
    }
  }, [activeLocked, activeMannequin.id, activeMannequin.groundSnapEnabled]);

  const handleChangeElevation = useCallback(
    (nextY: number) => {
      if (activeLocked) return;

      const clampedY = groundEnabled ? Math.max(0, nextY) : nextY;
      setMannequins((prev) =>
        prev.map((m) =>
          m.id === activeMannequin.id
            ? {
                ...m,
                elevationY: clampedY,
                groundSnapEnabled:
                  clampedY !== 0 ? false : m.groundSnapEnabled,
                activePosePresetId: null,
              }
            : m
        )
      );
      elevationSeqRef.current += 1;
      setElevationCommand({
        y: clampedY,
        seq: elevationSeqRef.current,
      });
    },
    [activeLocked, activeMannequin.id, groundEnabled]
  );

  const handleDropToFloor = useCallback(() => {
    if (activeLocked) return;

    setGroundEnabled(true);
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id ? { ...m, elevationY: 0 } : m
      )
    );
    setDropToFloorTrigger((prev) => prev + 1);
  }, [activeLocked, activeMannequin.id]);

  const handleSetMoveBody = useCallback(
    (enabled: boolean) => {
      if (activeLocked && enabled) return;

      setMoveBodyEnabled(enabled);
      if (enabled) {
        setSelectedPropId(null);
        setSelectedIKHandle(null);
        setMannequins((prev) =>
          prev.map((m) =>
            m.id === activeMannequin.id
              ? { ...m, groundSnapEnabled: false, activePosePresetId: null }
              : m
          )
        );
      }
    },
    [activeLocked, activeMannequin.id]
  );

  const handleSelectPosePreset = useCallback(
    (presetId: string) => {
      if (activeLocked) {
        showToast('Unlock figure to apply a pose', 'error');
        return;
      }

      const preset = getPosePreset(presetId);
      if (!preset) return;

      setMannequins((prev) =>
        prev.map((m) =>
          m.id === activeMannequin.id
            ? {
                ...m,
                activePosePresetId: preset.id,
                groundSnapEnabled: groundEnabled ? preset.groundSnap : false,
                elevationY: preset.groundSnap ? 0 : preset.elevationY,
              }
            : m
        )
      );
      setMoveBodyEnabled(false);
      setIkSwivelByHandle(ZERO_IK_SWIVEL);
      posePresetSeqRef.current += 1;
      setPosePresetCommand({
        presetId: preset.id,
        seq: posePresetSeqRef.current,
      });
    },
    [activeLocked, activeMannequin.id, groundEnabled, showToast]
  );

  const handleResetPose = useCallback(() => {
    if (activeLocked) return;

    setMoveBodyEnabled(false);
    setIkSwivelByHandle(ZERO_IK_SWIVEL);
    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id
          ? {
              ...m,
              groundSnapEnabled: groundEnabled,
              elevationY: 0,
              activePosePresetId: 't-pose',
            }
          : m
      )
    );
    setResetTrigger((prev) => prev + 1);
  }, [activeLocked, activeMannequin.id, groundEnabled]);

  const handleToggleGravity = useCallback(() => {
    const next = !gravityEnabled;
    setGravityEnabled(next);
    if (next) {
      setMannequins((prev) =>
        prev.map((m) => (m.locked ? m : { ...m, activePosePresetId: null }))
      );
    }
  }, [gravityEnabled]);

  const handleTogglePinSelectedJoint = useCallback(() => {
    if (
      activeLocked ||
      !selectedBoneName ||
      !isCoreBoneName(selectedBoneName)
    ) {
      return;
    }

    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id
          ? {
              ...m,
              pinnedBones: m.pinnedBones.includes(selectedBoneName)
                ? m.pinnedBones.filter((name) => name !== selectedBoneName)
                : [...m.pinnedBones, selectedBoneName],
            }
          : m
      )
    );
  }, [activeLocked, activeMannequin.id, selectedBoneName]);

  const handleClearAllPins = useCallback(() => {
    if (activeLocked) return;

    setMannequins((prev) =>
      prev.map((m) =>
        m.id === activeMannequin.id ? { ...m, pinnedBones: [] } : m
      )
    );
  }, [activeLocked, activeMannequin.id]);

  const handleEscape = useCallback(() => {
    if (
      isPhotoToPoseOpen ||
      isPoseLibraryOpen ||
      isSnapshotOpen ||
      isShortcutsOpen ||
      isJointsPopoverOpen ||
      activeRightRailTab !== null
    ) {
      setIsPhotoToPoseOpen(false);
      setPhotoToPoseInitialFile(null);
      setIsPoseLibraryOpen(false);
      setIsSnapshotOpen(false);
      setIsShortcutsOpen(false);
      setIsJointsPopoverOpen(false);
      setActiveRightRailTab(null);
      return;
    }
    if (
      contextualAnchor ||
      selectedBoneName ||
      selectedIKHandle ||
      selectedPropId ||
      moveBodyEnabled
    ) {
      handleCloseContextualPopover();
      return;
    }
    if (isHudMinimized) {
      setIsHudMinimized(false);
    }
  }, [
    isPhotoToPoseOpen,
    isPoseLibraryOpen,
    isSnapshotOpen,
    isShortcutsOpen,
    isJointsPopoverOpen,
    activeRightRailTab,
    contextualAnchor,
    selectedBoneName,
    selectedIKHandle,
    selectedPropId,
    moveBodyEnabled,
    isHudMinimized,
    handleCloseContextualPopover,
  ]);

  const handleCanvasBackgroundTap = useCallback(() => {
    if (isHudMinimized) {
      setIsHudMinimized(false);
      return;
    }
    setIsPhotoToPoseOpen(false);
    setPhotoToPoseInitialFile(null);
    setIsPoseLibraryOpen(false);
    setIsSnapshotOpen(false);
    setIsShortcutsOpen(false);
    setIsJointsPopoverOpen(false);
    setActiveRightRailTab(null);
    if (viewport.isMobile || viewport.isCompactLandscape) {
      setIsSidebarOpen(false);
    }
    handleCloseContextualPopover();
    setIsHudMinimized(true);
  }, [
    isHudMinimized,
    viewport.isMobile,
    viewport.isCompactLandscape,
    handleCloseContextualPopover,
  ]);

  const handleInstallApp = useCallback(async () => {
    const outcome = await pwa.promptInstall();
    if (outcome === 'accepted') {
      showToast('Mortal Mesh installed for offline use', 'success');
    }
  }, [pwa, showToast]);

  useStudioShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onRotateMode: () => {
      if (!activeLocked) {
        setControlMode('fk');
        handleSetMoveBody(false);
      }
    },
    onToggleControlMode: () =>
      handleChangeControlMode(controlMode === 'fk' ? 'ik' : 'fk'),
    onToggleMoveBody: () => {
      if (!activeLocked) handleSetMoveBody(!moveBodyEnabled);
    },
    onToggleJointsVisibility: () =>
      setJointsDisplay((prev) => (prev === 'hidden' ? 'core' : 'hidden')),
    onResetCameraHome: () => handleSelectCameraPreset('1-point'),
    onEscape: handleEscape,
    onToggleShortcuts: handleToggleShortcuts,
  });

  const activeTheme = STUDIO_THEMES[studioTheme];
  const themeVars = {
    backgroundColor: activeTheme.bg,
    '--studio-track': activeTheme.rangeVars.track,
    '--studio-track-fill': activeTheme.rangeVars.trackFill,
    '--studio-thumb': activeTheme.rangeVars.thumb,
    '--studio-thumb-border': activeTheme.rangeVars.thumbBorder,
    '--studio-focus': activeTheme.rangeVars.focus,
    '--studio-scroll-thumb': activeTheme.rangeVars.scrollThumb,
    '--studio-scroll-thumb-hover': activeTheme.rangeVars.scrollThumbHover,
  } as CSSProperties;

  return (
    <main
      className="relative h-[100dvh] w-[100dvw] overflow-hidden overscroll-none transition-colors duration-200"
      style={themeVars}
      onPointerDown={() => {
        if (
          isSnapshotOpen ||
          isShortcutsOpen ||
          isJointsPopoverOpen ||
          activeRightRailTab !== null
        ) {
          setIsSnapshotOpen(false);
          setIsShortcutsOpen(false);
          setIsJointsPopoverOpen(false);
          setActiveRightRailTab(null);
        }
      }}
    >
      <StudioToast toast={toast} studioTheme={studioTheme} />
      {isHudMinimized && !contextualAnchor && (
        <button
          type="button"
          data-testid="restore-hud-pill"
          aria-label="Show studio controls"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setIsHudMinimized(false)}
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
          }}
          className={`fixed z-20 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] font-medium opacity-55 hover:opacity-100 transition-opacity duration-150 select-none ${activeTheme.ui.panel}`}
        >
          <EyeIcon className="h-3.5 w-3.5 shrink-0" />
          <span>Controls</span>
        </button>
      )}
      <FloatingSidebar
        studioTheme={studioTheme}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
        isOpen={isSidebarOpen}
        onToggleOpen={setIsSidebarOpen}
        mannequins={mannequins}
        activeMannequinId={activeMannequin.id}
        onSelectMannequin={handleSelectMannequin}
        onAddMannequin={handleAddMannequin}
        onDuplicateMannequin={handleDuplicateMannequin}
        onToggleLockMannequin={handleToggleLockMannequin}
        onToggleVisibleMannequin={handleToggleVisibleMannequin}
        onChangeMannequinFinish={handleChangeMannequinFinish}
        onChangeMannequinModel={handleChangeMannequinModel}
        onChangeMannequinProportions={handleChangeMannequinProportions}
        onApplyProportionPreset={handleApplyProportionPreset}
        onCommitSliderHistory={handleCommitSliderHistory}
        onToggleSkeletonMode={handleToggleSkeletonMode}
        onDeleteMannequin={handleDeleteMannequin}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        activePosePresetId={activeMannequin.activePosePresetId}
        onSelectPosePreset={handleSelectPosePreset}
        onOpenPoseLibrary={() => {
          setActiveRightRailTab(null);
          setIsJointsPopoverOpen(false);
          setIsSnapshotOpen(false);
          setIsShortcutsOpen(false);
          setIsPoseLibraryOpen(true);
        }}
        onOpenPhotoToPose={() => handleOpenPhotoToPose(null)}
        aiCacheReady={pwa.aiCacheReady}
        onMirrorPose={handleMirrorPose}
        onExportPoseJson={handleExportPoseJson}
        onImportSceneOrPoseJson={handleImportSceneOrPoseJson}
        onExportSceneJson={handleExportSceneJson}
        onNewBlankScene={handleNewBlankScene}
        studioProps={studioProps}
        selectedPropId={selectedPropId}
        onSelectProp={handleSelectProp}
        onAddProp={handleAddProp}
        onToggleLockProp={handleToggleLockProp}
        onToggleVisibleProp={handleToggleVisibleProp}
        onDeleteProp={handleDeleteProp}
        pwa={pwa}
        onInstallApp={handleInstallApp}
      />
      <PoseLibraryModal
        isOpen={isPoseLibraryOpen}
        onClose={() => setIsPoseLibraryOpen(false)}
        studioTheme={studioTheme}
        activePosePresetId={activeMannequin.activePosePresetId}
        isLocked={activeLocked}
        onSelectPosePreset={(presetId) => {
          handleSelectPosePreset(presetId);
          if (!activeLocked) {
            setIsPoseLibraryOpen(false);
          }
        }}
      />
      <PhotoToPoseModal
        isOpen={isPhotoToPoseOpen}
        initialFile={photoToPoseInitialFile}
        onClose={() => {
          setIsPhotoToPoseOpen(false);
          setPhotoToPoseInitialFile(null);
        }}
        studioTheme={studioTheme}
        activeFigureName={activeMannequin.name}
        activeFigureModelLabel={MODEL_CATALOG[activeMannequin.modelId].label}
        activeFigureLocked={activeLocked}
        maxFigures={MAX_MANNEQUINS}
        aiCacheReady={pwa.aiCacheReady}
        onAiCacheReadyChange={(ready) => {
          if (ready) pwa.refreshAiCacheStatus();
        }}
        onApplySinglePerson={handleApplyPhotoPose}
        onStageAllPeople={handleStageAllPhotoPoses}
      />
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        studioTheme={studioTheme}
      />
      <StudioRightRail
        studioTheme={studioTheme}
        activeTab={activeRightRailTab}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
        isLocked={activeLocked}
        gravityEnabled={gravityEnabled}
        dampingPreset={dampingPreset}
        pinnedBonesCount={activeMannequin.pinnedBones.length}
        groundEnabled={groundEnabled}
        groundSnapEnabled={activeMannequin.groundSnapEnabled}
        elevationY={activeMannequin.elevationY}
        keyLight={keyLight}
        drawing={drawing}
        showHeadRuler={showHeadRuler}
        compositionCrop={compositionCrop}
        compositionGrid={compositionGrid}
        goldenSpiralFlip={goldenSpiralFlip}
        referenceImage={referenceImage}
        onToggleTab={handleToggleRightRailTab}
        onCloseTab={() => setActiveRightRailTab(null)}
        onSelectStudioTheme={handleChangeStudioTheme}
        onToggleGravity={handleToggleGravity}
        onChangeDampingPreset={setDampingPreset}
        onClearAllPins={handleClearAllPins}
        onToggleGround={handleToggleGround}
        onToggleGroundSnap={handleToggleGroundSnap}
        onChangeElevation={handleChangeElevation}
        onCommitSliderHistory={handleCommitSliderHistory}
        onDropToFloor={handleDropToFloor}
        onChangeKeyLight={handleChangeKeyLight}
        onSelectLightingPreset={handleSelectLightingPreset}
        onResetKeyLight={handleResetKeyLight}
        onChangeDrawing={handleChangeDrawing}
        onResetDrawing={handleResetDrawing}
        onOpenSnapshotSvg={handleOpenSnapshotSvg}
        onToggleHeadRuler={() => setShowHeadRuler((prev) => !prev)}
        onChangeCompositionCrop={setCompositionCrop}
        onChangeCompositionGrid={setCompositionGrid}
        onToggleGoldenSpiralFlip={() =>
          setGoldenSpiralFlip((prev) => !prev)
        }
        onImportReferenceImage={handleImportReferenceImage}
        onUpdateReferenceImage={handleUpdateReferenceImage}
        onRemoveReferenceImage={handleRemoveReferenceImage}
        canExtractPoseFromReference={referenceFileRef.current !== null}
        onExtractPoseFromReference={() => {
          if (referenceFileRef.current) {
            handleOpenPhotoToPose(referenceFileRef.current);
          }
        }}
      />
      <StudioDock
        studioTheme={studioTheme}
        jointsDisplay={jointsDisplay}
        onChangeJointsDisplay={setJointsDisplay}
        jointLimitsEnabled={jointLimitsEnabled}
        onToggleJointLimits={() => {
          if (!activeLocked) setJointLimitsEnabled((prev) => !prev);
        }}
        isJointsPopoverOpen={isJointsPopoverOpen}
        onToggleJointsPopover={handleToggleJointsPopover}
        onCloseJointsPopover={() => setIsJointsPopoverOpen(false)}
        controlMode={controlMode}
        onChangeControlMode={handleChangeControlMode}
        moveBodyEnabled={moveBodyEnabled}
        onSetMoveBody={handleSetMoveBody}
        activeMannequinLocked={activeLocked}
        onToggleLockActive={() => handleToggleLockMannequin(activeMannequin.id)}
        onResetPose={handleResetPose}
        canUndo={!activeLocked && activeHistory.past.length > 0}
        canRedo={!activeLocked && activeHistory.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isSnapshotOpen={isSnapshotOpen}
        snapshotFormat={snapshotFormat}
        onChangeSnapshotFormat={setSnapshotFormat}
        drawingActive={keyLight.notanEnabled || isDrawingActive(drawing)}
        onToggleSnapshot={handleToggleSnapshot}
        onCaptureSnapshot={handleCaptureSnapshot}
        onExportBlueprintSvg={handleExportBlueprintSvg}
        isShortcutsOpen={isShortcutsOpen}
        onToggleShortcuts={handleToggleShortcuts}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
      />
      <JointControlPopover
        anchor={contextualAnchor}
        studioTheme={studioTheme}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
        isSidebarOpen={isSidebarOpen}
        jointsDisplay={jointsDisplay}
        jointLimitsEnabled={jointLimitsEnabled}
        selectedBoneName={selectedBoneName}
        selectedBoneAngles={selectedBoneAngles}
        selectedIKHandle={selectedIKHandle}
        moveBodyEnabled={moveBodyEnabled}
        pinnedBones={activeMannequin.pinnedBones}
        activeHandGestureId={activeHandGestureId}
        hasFingerBones={MODEL_CATALOG[activeMannequin.modelId].hasFingerBones}
        selectedProp={selectedProp}
        propTransformMode={propTransformMode}
        ikPinFeet={ikPinFeet}
        ikSwivelDeg={
          selectedIKHandle && selectedIKHandle !== 'pelvis'
            ? ikSwivelByHandle[selectedIKHandle]
            : 0
        }
        onChangeAxisAngle={handleChangeAxisAngle}
        onCommitSliderHistory={handleCommitSliderHistory}
        onTogglePinSelectedJoint={handleTogglePinSelectedJoint}
        onResetSelectedJoint={handleResetSelectedJoint}
        onSetMoveBody={handleSetMoveBody}
        onDropToFloor={handleDropToFloor}
        onApplyHandGesture={handleApplyHandGesture}
        onMirrorHandGesture={handleMirrorHandGesture}
        onToggleIKPinFeet={() => setIkPinFeet((prev) => !prev)}
        onChangeIKSwivel={handleChangeIKSwivel}
        onCommitIKSwivel={handleCommitIKSwivel}
        onResetIKLimb={handleResetIKLimb}
        onPlantFootIK={handlePlantFootIK}
        onChangePropTransformMode={setPropTransformMode}
        onDropPropToFloor={handleDropPropToFloor}
        onResetPropScale={handleResetPropScale}
        onToggleLockProp={handleToggleLockProp}
        onDeleteProp={handleDeleteProp}
        onClose={handleCloseContextualPopover}
      />
      <StudioCanvas
        mannequins={mannequins}
        activeMannequinId={activeMannequin.id}
        sceneLoadId={sceneLoadId}
        studioTheme={studioTheme}
        activePreset={activePreset}
        lensCurvature={lensCurvature}
        showPerspectiveGuides={showPerspectiveGuides}
        snapTrigger={snapTrigger}
        onSelectCameraPreset={handleSelectCameraPreset}
        onChangeLensCurvature={setLensCurvature}
        onTogglePerspectiveGuides={setShowPerspectiveGuides}
        isDragging={isDragging}
        onDraggingChange={setIsDragging}
        jointsDisplay={jointsDisplay}
        controlMode={controlMode}
        jointLimitsEnabled={jointLimitsEnabled}
        jointAngleCommand={jointAngleCommand}
        groundEnabled={groundEnabled}
        elevationCommand={elevationCommand}
        dropToFloorTrigger={dropToFloorTrigger}
        moveBodyEnabled={moveBodyEnabled}
        posePresetCommand={posePresetCommand}
        gravityEnabled={gravityEnabled}
        dampingPreset={dampingPreset}
        resetTrigger={resetTrigger}
        externalDeselectTrigger={externalDeselectTrigger}
        keyLight={keyLight}
        studioProps={studioProps}
        selectedPropId={selectedPropId}
        propTransformMode={propTransformMode}
        dropPropToFloorCommand={dropPropToFloorCommand}
        bookmarks={bookmarks}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
        onCanvasBackgroundTap={handleCanvasBackgroundTap}
        cameraRestSeq={cameraRestSeq}
        ikPinFeet={ikPinFeet}
        ikSwivelByHandle={ikSwivelByHandle}
        drawing={drawing}
        showHeadRuler={showHeadRuler}
        onSelectMannequin={handleSelectMannequin}
        onSelectBoneChange={handleSelectBoneChange}
        onSelectIKHandleChange={handleSelectIKHandleChange}
        onBoneAnglesChange={handleBoneAnglesChange}
        onElevationSync={handleElevationSync}
        onMoveBodyChange={handleSetMoveBody}
        onSelectProp={handleSelectProp}
        onUpdatePropTransform={handleUpdatePropTransform}
        onAddBookmark={handleAddBookmark}
        onSelectBookmark={handleSelectBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onMannequinBridgeChange={handleMannequinBridgeChange}
        onInitialPoseSnapshot={handleInitialPoseSnapshot}
        onCommitPoseSnapshot={handleCommitPoseSnapshot}
        onMannequinAnchorChange={handleMannequinAnchorChange}
        onPropAnchorChange={handlePropAnchorChange}
        onHeadRulerMetricsChange={setHeadRulerMetrics}
        onCameraRest={handleCameraRest}
        onSnapshotBridgeReady={handleSnapshotBridgeReady}
        onCameraBridgeReady={handleCameraBridgeReady}
      />
      <ReferenceOverlay
        reference={referenceImage}
        studioTheme={studioTheme}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
        onUpdateOffset={handleUpdateReferenceOffset}
        onToggleLock={handleToggleReferenceLock}
        onRemove={handleRemoveReferenceImage}
      />
      <HeadUnitRuler
        metrics={headRulerMetrics}
        studioTheme={studioTheme}
        width={viewport.width}
        height={viewport.height}
        isHudMinimized={isHudMinimized}
      />
      <CompositionOverlay
        crop={compositionCrop}
        grid={compositionGrid}
        goldenSpiralFlip={goldenSpiralFlip}
        studioTheme={studioTheme}
        width={viewport.width}
        height={viewport.height}
      />
    </main>
  );
}
