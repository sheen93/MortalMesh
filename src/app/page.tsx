'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { FloatingSidebar } from '@/components/FloatingSidebar';
import { JointControlPopover } from '@/components/JointControlPopover';
import { PoseLibraryModal } from '@/components/PoseLibraryModal';
import { usePwaState } from '@/components/PwaManager';
import { ShortcutsModal } from '@/components/ShortcutsModal';
import { StudioCanvas } from '@/components/StudioCanvas';
import { StudioDock } from '@/components/StudioDock';
import {
  StudioRightRail,
  type RightRailTab,
} from '@/components/StudioRightRail';
import { StudioToast, type StudioToastData } from '@/components/StudioToast';
import { HAND_GESTURE_BY_ID } from '@/data/handGestures';
import { getPosePreset } from '@/data/poses';
import {
  isStudioThemeId,
  STUDIO_THEMES,
  STUDIO_THEME_STORAGE_KEY,
} from '@/data/studioThemes';
import { useStudioShortcuts } from '@/hooks/useStudioShortcuts';
import { useViewportProfile } from '@/hooks/useViewportProfile';
import {
  CAMERA_PRESETS,
  DEFAULT_KEY_LIGHT,
  isCoreBoneName,
  ZERO_JOINT_ANGLES,
  type AxisKey,
  type CameraPreset,
  type ContextualAnchor,
  type DampingPreset,
  type ElevationCommand,
  type HandGestureId,
  type HandSide,
  type IKHandleId,
  type JointAngleCommand,
  type JointAngles,
  type JointsDisplayMode,
  type KeyLightSettings,
  type LayerVisibility,
  type PoseControlMode,
  type PosePresetCommand,
  type SnapshotBridge,
  type SnapshotOptions,
  type StudioThemeId,
} from '@/types/anatomy';
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

  const [keyLight, setKeyLight] = useState<KeyLightSettings>(DEFAULT_KEY_LIGHT);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeRightRailTab, setActiveRightRailTab] =
    useState<RightRailTab | null>(null);
  const [isJointsPopoverOpen, setIsJointsPopoverOpen] = useState(false);
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isPoseLibraryOpen, setIsPoseLibraryOpen] = useState(false);

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
          poseByIdRef.current.set(m.id, clonedPose);
          nextHistory[m.id] = initPoseHistory(clonedPose);
          return {
            id: m.id,
            name: m.name,
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
      setKeyLight({ ...sceneFile.studio.keyLight });
      setActivePreset(sceneFile.studio.perspectiveMode ?? '1-point');
      setLensCurvature(
        clampLensCurvature(
          sceneFile.studio.lensCurvature ?? DEFAULT_LENS_CURVATURE
        )
      );
      setShowPerspectiveGuides(sceneFile.studio.showPerspectiveGuides ?? true);

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
        [id]: initPoseHistory(snapshot),
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
      locked: false,
      visible: true,
      finish: pickNextFinish(mannequins.length),
      spawnOffset: pickNextSpawnOffset(mannequins),
      elevationY: 0,
      groundSnapEnabled: groundEnabled,
      pinnedBones: [],
      activePosePresetId: 't-pose',
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
    skipNextAutosaveRef.current = true;

    bridgesRef.current.clear();
    poseByIdRef.current.clear();
    nextFigureNumberRef.current = 2;
    nextPropSeqRef.current = 1;
    bookmarkSeqRef.current = 1;

    setMannequins([createInitialMannequin()]);
    setActiveMannequinId('figure-1');
    setHistoryById({});
    setStudioProps([]);
    setSelectedPropId(null);
    setBookmarks([]);
    setSelectedBoneName(null);
    setSelectedBoneAngles(ZERO_JOINT_ANGLES);
    setSelectedIKHandle(null);
    setControlMode('fk');
    setGroundEnabled(true);
    setGravityEnabled(false);
    setJointLimitsEnabled(true);
    setMoveBodyEnabled(false);
    setKeyLight(DEFAULT_KEY_LIGHT);
    setActivePreset('1-point');
    setLensCurvature(DEFAULT_LENS_CURVATURE);
    setShowPerspectiveGuides(true);
    setContextualAnchor(null);
    setActiveHandGestureId(null);
    setActiveRightRailTab(null);
    setIsJointsPopoverOpen(false);
    setSnapTrigger((prev) => prev + 1);
    setSceneLoadId((prev) => prev + 1);
    showToast('Started new blank scene', 'success');
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
      setKeyLight((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleResetKeyLight = useCallback(() => {
    setKeyLight({
      azimuth: DEFAULT_KEY_LIGHT.azimuth,
      elevation: DEFAULT_KEY_LIGHT.elevation,
      intensity: STUDIO_THEMES[studioTheme].lighting.key,
    });
  }, [studioTheme]);

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
      isPoseLibraryOpen ||
      isSnapshotOpen ||
      isShortcutsOpen ||
      isJointsPopoverOpen ||
      activeRightRailTab !== null
    ) {
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
    }
  }, [
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
      <FloatingSidebar
        studioTheme={studioTheme}
        viewport={viewport}
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
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        studioTheme={studioTheme}
      />
      <StudioRightRail
        studioTheme={studioTheme}
        activeTab={activeRightRailTab}
        viewport={viewport}
        isLocked={activeLocked}
        gravityEnabled={gravityEnabled}
        dampingPreset={dampingPreset}
        pinnedBonesCount={activeMannequin.pinnedBones.length}
        groundEnabled={groundEnabled}
        groundSnapEnabled={activeMannequin.groundSnapEnabled}
        elevationY={activeMannequin.elevationY}
        keyLight={keyLight}
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
        onResetKeyLight={handleResetKeyLight}
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
        onToggleSnapshot={handleToggleSnapshot}
        onCaptureSnapshot={handleCaptureSnapshot}
        isShortcutsOpen={isShortcutsOpen}
        onToggleShortcuts={handleToggleShortcuts}
        viewport={viewport}
      />
      <JointControlPopover
        anchor={contextualAnchor}
        studioTheme={studioTheme}
        viewport={viewport}
        isSidebarOpen={isSidebarOpen}
        jointsDisplay={jointsDisplay}
        jointLimitsEnabled={jointLimitsEnabled}
        selectedBoneName={selectedBoneName}
        selectedBoneAngles={selectedBoneAngles}
        selectedIKHandle={selectedIKHandle}
        moveBodyEnabled={moveBodyEnabled}
        pinnedBones={activeMannequin.pinnedBones}
        activeHandGestureId={activeHandGestureId}
        selectedProp={selectedProp}
        propTransformMode={propTransformMode}
        onChangeAxisAngle={handleChangeAxisAngle}
        onCommitSliderHistory={handleCommitSliderHistory}
        onTogglePinSelectedJoint={handleTogglePinSelectedJoint}
        onResetSelectedJoint={handleResetSelectedJoint}
        onSetMoveBody={handleSetMoveBody}
        onDropToFloor={handleDropToFloor}
        onApplyHandGesture={handleApplyHandGesture}
        onMirrorHandGesture={handleMirrorHandGesture}
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
        cameraRestSeq={cameraRestSeq}
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
        onCameraRest={handleCameraRest}
        onSnapshotBridgeReady={handleSnapshotBridgeReady}
        onCameraBridgeReady={handleCameraBridgeReady}
      />
    </main>
  );
}
