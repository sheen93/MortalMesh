'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  ConstructiveOverlay,
  type ConstructiveOverlayHandle,
} from '@/components/ConstructiveOverlay';
import {
  IKHandleMarkers,
  type IKDragMode,
} from '@/components/IKHandleMarkers';
import {
  IKMoveGizmo,
  type IKDragFeedback,
} from '@/components/IKMoveGizmo';
import { JointArcGizmo } from '@/components/JointArcGizmo';
import { JointRingMarkers } from '@/components/JointRingMarkers';
import {
  IK_HANDLE_ORDER,
  isCoreBoneName,
  ZERO_JOINT_ANGLES,
  type CameraPreset,
  type ContextualAnchor,
  type DampingPreset,
  type ElevationCommand,
  type FigureProportions,
  type HandGestureId,
  type HandSide,
  type HeadRulerMetrics,
  type HeadRulerTick,
  type IKHandleId,
  type JointAngleCommand,
  type JointAngles,
  type JointsDisplayMode,
  type PoseControlMode,
  type PosePresetCommand,
  type StudioThemeId,
} from '@/types/anatomy';
import type { PoseBridge, PoseSnapshot, QuaternionTuple } from '@/types/poseIO';
import type { StudioDrawingConfig } from '@/types/drawing';
import { MANNEQUIN_FINISHES, type MannequinRecord } from '@/types/scene';
import {
  buildHandGestureBones,
  detectMatchingHandGesture,
  getHandFingerBoneNames,
} from '@/data/handGestures';
import { clampJointAngles, getJointSpec } from '@/data/jointLimits';
import { MODEL_CATALOG, type MannequinModelId } from '@/data/modelCatalog';
import { getPosePreset } from '@/data/poses';
import {
  clampFigureProportions,
  proportionsEqual,
} from '@/data/proportions';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  getInitialGravityWakeBones,
  JointSpaceGravitySolver,
} from '@/physics/gravitySolver';
import {
  getIKHandleLabel,
  IK_CHAINS,
  solveLimbIK,
  solvePelvisSquatIK,
} from '@/physics/runtimeIK';
import { createRigAdapter, type RigAdapter } from '@/rig/rigAdapter';
import {
  attachCurvilinearPointerWarp,
  projectWorldPointToScreen,
} from '@/utils/lensWarp';
import {
  getMirroredBoneName,
  mirrorPoseSnapshot,
} from '@/utils/mirrorPose';
import {
  createNotanGradientTexture,
  getNotanThemePalette,
  updateNotanGradientTexture,
} from '@/utils/notanGradient';

interface MannequinTemplate {
  modelId: MannequinModelId;
  scene: THREE.Group;
  fitScale: number;
  sceneOffset: THREE.Vector3;
}

interface MaterialBinding {
  material: THREE.MeshStandardMaterial;
  role: 'main' | 'joint';
  originalColor: THREE.Color;
  originalRoughness: number;
}

interface NotanMeshEntry {
  mesh: THREE.Mesh;
  standardMaterial: THREE.Material | THREE.Material[];
  toonMaterial: THREE.MeshToonMaterial;
  ghostMaterial: THREE.MeshStandardMaterial;
}

interface CanonicalBoneEntry {
  canonicalName: string;
  bone: THREE.Bone;
}

interface ClonedInstanceData {
  rootGroup: THREE.Group;
  scene: THREE.Group;
  rigAdapter: RigAdapter;
  skinnedMeshes: THREE.SkinnedMesh[];
  canonicalBones: CanonicalBoneEntry[];
  bonesByName: Map<string, THREE.Bone>;
  restQuaternions: ReadonlyMap<string, THREE.Quaternion>;
  materialBindings: MaterialBinding[];
  clonedMaterials: THREE.Material[];
  meshEntries: NotanMeshEntry[];
  toonMaterials: THREE.MeshToonMaterial[];
  ghostMaterials: THREE.MeshStandardMaterial[];
  baseHeadHeight: number;
}

interface DragGuardState {
  isDragging: boolean;
  lastDragEndTime: number;
}

interface AnatomyModelProps {
  mannequins: readonly MannequinRecord[];
  activeMannequinId: string;
  sceneLoadId: number;
  studioTheme: StudioThemeId;
  jointsDisplay: JointsDisplayMode;
  controlMode: PoseControlMode;
  jointLimitsEnabled: boolean;
  jointAngleCommand: JointAngleCommand | null;
  groundEnabled: boolean;
  elevationCommand: ElevationCommand | null;
  dropToFloorTrigger: number;
  moveBodyEnabled: boolean;
  selectedPropId: string | null;
  posePresetCommand: PosePresetCommand | null;
  gravityEnabled: boolean;
  dampingPreset: DampingPreset;
  resetTrigger: number;
  deselectTrigger: number;
  isCoarsePointer: boolean;
  activePreset: CameraPreset;
  lensCurvature: number;
  cameraRestSeq: number;
  ikPinFeet: boolean;
  ikSwivelByHandle: Record<Exclude<IKHandleId, 'pelvis'>, number>;
  notanEnabled: boolean;
  notanSplit: number;
  drawing: StudioDrawingConfig;
  showHeadRuler: boolean;
  onSelectMannequin: (id: string) => void;
  onDraggingChange: (isDragging: boolean) => void;
  onSelectBoneChange: (boneName: string | null, angles: JointAngles) => void;
  onSelectIKHandleChange: (handleId: IKHandleId | null) => void;
  onBoneAnglesChange: (angles: JointAngles) => void;
  onElevationSync: (id: string, elevationY: number) => void;
  onMoveBodyChange: (enabled: boolean) => void;
  onClearPropSelection: () => void;
  onMannequinBridgeChange: (id: string, bridge: PoseBridge | null) => void;
  onInitialPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onCommitPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onContextualAnchorChange: (anchor: ContextualAnchor | null) => void;
  onHeadRulerMetricsChange: (metrics: HeadRulerMetrics | null) => void;
}

interface MannequinInstanceProps {
  template: MannequinTemplate;
  record: MannequinRecord;
  isActive: boolean;
  dragGuardRef: MutableRefObject<DragGuardState>;
  studioTheme: StudioThemeId;
  jointsDisplay: JointsDisplayMode;
  controlMode: PoseControlMode;
  jointLimitsEnabled: boolean;
  jointAngleCommand: JointAngleCommand | null;
  groundEnabled: boolean;
  elevationCommand: ElevationCommand | null;
  dropToFloorTrigger: number;
  moveBodyEnabled: boolean;
  selectedPropId: string | null;
  posePresetCommand: PosePresetCommand | null;
  gravityEnabled: boolean;
  dampingPreset: DampingPreset;
  resetTrigger: number;
  deselectTrigger: number;
  isCoarsePointer: boolean;
  activePreset: CameraPreset;
  lensCurvature: number;
  cameraRestSeq: number;
  ikPinFeet: boolean;
  ikSwivelByHandle: Record<Exclude<IKHandleId, 'pelvis'>, number>;
  notanEnabled: boolean;
  notanSplit: number;
  drawing: StudioDrawingConfig;
  showHeadRuler: boolean;
  onSelectMannequin: (id: string) => void;
  onDraggingChange: (isDragging: boolean) => void;
  onSelectBoneChange: (boneName: string | null, angles: JointAngles) => void;
  onSelectIKHandleChange: (handleId: IKHandleId | null) => void;
  onBoneAnglesChange: (angles: JointAngles) => void;
  onElevationSync: (id: string, elevationY: number) => void;
  onMoveBodyChange: (enabled: boolean) => void;
  onClearPropSelection: () => void;
  onMannequinBridgeChange: (id: string, bridge: PoseBridge | null) => void;
  onInitialPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onCommitPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onContextualAnchorChange: (anchor: ContextualAnchor | null) => void;
  onHeadRulerMetricsChange: (metrics: HeadRulerMetrics | null) => void;
}

interface DraggingChangedDispatcher {
  addEventListener: (
    type: 'dragging-changed',
    listener: (event: { value: boolean }) => void
  ) => void;
  removeEventListener: (
    type: 'dragging-changed',
    listener: (event: { value: boolean }) => void
  ) => void;
}

function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) || Math.abs(rounded) < 0.005 ? 0 : rounded;
}

function classifyMaterialRole(materialName: string): 'main' | 'joint' {
  if (
    materialName === 'M_Joints' ||
    materialName === '01_-_Default' ||
    materialName.toLowerCase().includes('joint')
  ) {
    return 'joint';
  }
  return 'main';
}

function cloneMaterialSafely(
  mat: THREE.Material,
  clonedMaterials: THREE.Material[],
  materialBindings: MaterialBinding[]
): THREE.Material {
  const cloned = mat.clone();
  clonedMaterials.push(cloned);
  if (cloned instanceof THREE.MeshStandardMaterial) {
    materialBindings.push({
      material: cloned,
      role: classifyMaterialRole(cloned.name),
      originalColor: cloned.color.clone(),
      originalRoughness: cloned.roughness,
    });
  }
  return cloned;
}

function MannequinInstance({
  template,
  record,
  isActive,
  dragGuardRef,
  studioTheme,
  jointsDisplay,
  controlMode,
  jointLimitsEnabled,
  jointAngleCommand,
  groundEnabled,
  elevationCommand,
  dropToFloorTrigger,
  moveBodyEnabled,
  selectedPropId,
  posePresetCommand,
  gravityEnabled,
  dampingPreset,
  resetTrigger,
  deselectTrigger,
  isCoarsePointer,
  activePreset,
  lensCurvature,
  cameraRestSeq,
  ikPinFeet,
  ikSwivelByHandle,
  notanEnabled,
  notanSplit,
  drawing,
  showHeadRuler,
  onSelectMannequin,
  onDraggingChange,
  onSelectBoneChange,
  onSelectIKHandleChange,
  onBoneAnglesChange,
  onElevationSync,
  onMoveBodyChange,
  onClearPropSelection,
  onMannequinBridgeChange,
  onInitialPoseSnapshot,
  onCommitPoseSnapshot,
  onContextualAnchorChange,
  onHeadRulerMetricsChange,
}: MannequinInstanceProps) {
  const [selectedBoneName, setSelectedBoneName] = useState<string | null>(null);
  const [hoveredBoneName, setHoveredBoneName] = useState<string | null>(null);
  const [selectedIKHandle, setSelectedIKHandle] = useState<IKHandleId | null>(
    null
  );
  const [hoveredIKHandle, setHoveredIKHandle] = useState<IKHandleId | null>(
    null
  );

  const initialIdRef = useRef(record.id);
  const initialSpawnOffsetRef = useRef(record.spawnOffset);
  const initialSnapshotRef = useRef(record.initialSnapshot);
  const initialPosePresetIdRef = useRef(record.activePosePresetId);
  const initialProportionsRef = useRef(
    clampFigureProportions(record.proportions)
  );
  const initialPreserveExactPosRef = useRef(
    Boolean(record.preserveExactRootPosition)
  );
  const lastAppliedProportionsRef = useRef(
    clampFigureProportions(record.proportions)
  );
  const lastRulerEmitKeyRef = useRef<string>('');
  const constructiveOverlayRef = useRef<ConstructiveOverlayHandle>(null);
  const hitboxRefs = useRef<Map<string, THREE.Object3D>>(new Map());
  const ikHandleRefs = useRef<Map<IKHandleId, THREE.Group>>(new Map());
  const ikProxyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const transformRef = useRef<ComponentRef<typeof TransformControls>>(null);
  const localDraggingRef = useRef(false);
  const ikDraggingRef = useRef(false);
  const [isDraggingFK, setIsDraggingFK] = useState(false);
  const [isDraggingIK, setIsDraggingIK] = useState(false);
  const [ikDragFeedback, setIkDragFeedback] = useState<IKDragFeedback | null>(
    null
  );
  const ikDragStartWorldRef = useRef<THREE.Vector3 | null>(null);
  const ikDragStartRootRef = useRef<THREE.Vector3 | null>(null);
  const ikDragAnchoredFootLRef = useRef<THREE.Vector3 | null>(null);
  const ikDragAnchoredFootRRef = useRef<THREE.Vector3 | null>(null);
  const ikDragPoleRef = useRef<THREE.Vector3 | null>(null);

  const lastHandledSeqRef = useRef(jointAngleCommand?.seq ?? 0);
  const lastElevationSeqRef = useRef(elevationCommand?.seq ?? 0);
  const lastPosePresetSeqRef = useRef(posePresetCommand?.seq ?? 0);
  const lastResetTriggerRef = useRef(resetTrigger);
  const lastDropTriggerRef = useRef(dropToFloorTrigger);
  const lastDeselectTriggerRef = useRef(deselectTrigger);

  const hasInitializedGroundRef = useRef(false);
  const prevLimitsEnabledRef = useRef(jointLimitsEnabled);
  const prevGroundEnabledRef = useRef(groundEnabled);
  const prevGroundSnapRef = useRef(record.groundSnapEnabled);
  const prevGravityEnabledRef = useRef(gravityEnabled);
  const prevPinnedRef = useRef<readonly string[]>(record.pinnedBones);
  const prevLockedRef = useRef(record.locked);

  const groundEnabledRef = useRef(groundEnabled);
  const groundSnapEnabledRef = useRef(record.groundSnapEnabled);
  const gravityEnabledRef = useRef(gravityEnabled);
  const pinnedBonesRef = useRef<readonly string[]>(record.pinnedBones);
  const lockedRef = useRef(record.locked);
  const jointLimitsEnabledRef = useRef(jointLimitsEnabled);
  const isActiveRef = useRef(isActive);
  const selectedBoneNameRef = useRef<string | null>(selectedBoneName);
  const selectedIKHandleRef = useRef<IKHandleId | null>(selectedIKHandle);
  const activePresetRef = useRef<CameraPreset>(activePreset);
  const lensCurvatureRef = useRef<number>(lensCurvature);
  const ikPinFeetRef = useRef<boolean>(ikPinFeet);
  const ikSwivelByHandleRef = useRef(ikSwivelByHandle);
  const proportionsRef = useRef(clampFigureProportions(record.proportions));
  const showHeadRulerRef = useRef(showHeadRuler);
  const recordVisibleRef = useRef(record.visible);

  const onSelectBoneChangeRef = useRef(onSelectBoneChange);
  const onSelectIKHandleChangeRef = useRef(onSelectIKHandleChange);
  const onElevationSyncRef = useRef(onElevationSync);
  const onInitialPoseSnapshotRef = useRef(onInitialPoseSnapshot);
  const onCommitPoseSnapshotRef = useRef(onCommitPoseSnapshot);
  const onContextualAnchorChangeRef = useRef(onContextualAnchorChange);
  const onHeadRulerMetricsChangeRef = useRef(onHeadRulerMetricsChange);

  const solverRef = useRef(new JointSpaceGravitySolver());
  const solverAwakeRef = useRef(false);
  const gravityMovedSinceWakeRef = useRef(false);
  const tempWorldPosRef = useRef(new THREE.Vector3());
  const anchorWorldVecRef = useRef(new THREE.Vector3());
  const figureCenterWorldVecRef = useRef(new THREE.Vector3());
  const emittedAnchorKeyRef = useRef<string | null>(null);
  const tempBoxRef = useRef(new THREE.Box3());

  groundEnabledRef.current = groundEnabled;
  groundSnapEnabledRef.current = record.groundSnapEnabled;
  gravityEnabledRef.current = gravityEnabled;
  pinnedBonesRef.current = record.pinnedBones;
  lockedRef.current = record.locked;
  jointLimitsEnabledRef.current = jointLimitsEnabled;
  isActiveRef.current = isActive;
  selectedBoneNameRef.current = selectedBoneName;
  selectedIKHandleRef.current = selectedIKHandle;
  activePresetRef.current = activePreset;
  lensCurvatureRef.current = lensCurvature;
  ikPinFeetRef.current = ikPinFeet;
  ikSwivelByHandleRef.current = ikSwivelByHandle;
  proportionsRef.current = clampFigureProportions(record.proportions);
  showHeadRulerRef.current = showHeadRuler;
  recordVisibleRef.current = record.visible;
  onSelectBoneChangeRef.current = onSelectBoneChange;
  onSelectIKHandleChangeRef.current = onSelectIKHandleChange;
  onElevationSyncRef.current = onElevationSync;
  onInitialPoseSnapshotRef.current = onInitialPoseSnapshot;
  onCommitPoseSnapshotRef.current = onCommitPoseSnapshot;
  onContextualAnchorChangeRef.current = onContextualAnchorChange;
  onHeadRulerMetricsChangeRef.current = onHeadRulerMetricsChange;

  const { camera, size, invalidate } = useThree();

  const notanGradientTex = useMemo(() => createNotanGradientTexture(0.5), []);

  useEffect(() => {
    return () => {
      notanGradientTex.dispose();
    };
  }, [notanGradientTex]);

  useEffect(() => {
    updateNotanGradientTexture(notanGradientTex, notanSplit);
    invalidate();
  }, [notanGradientTex, notanSplit, invalidate]);

  const instance = useMemo<ClonedInstanceData>(() => {
    const clonedScene = SkeletonUtils.clone(template.scene) as THREE.Group;
    const modelSpec = MODEL_CATALOG[template.modelId];
    if (modelSpec.facingYawOffset !== 0) {
      clonedScene.rotation.y = modelSpec.facingYawOffset;
    }
    clonedScene.scale.setScalar(template.fitScale);
    clonedScene.position.copy(template.sceneOffset);

    const rootGroup = new THREE.Group();
    rootGroup.name = `MannequinRoot_${initialIdRef.current}_${template.modelId}`;
    rootGroup.position.set(
      initialSpawnOffsetRef.current[0],
      1,
      initialSpawnOffsetRef.current[2]
    );
    rootGroup.add(clonedScene);
    rootGroup.updateMatrixWorld(true);

    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const materialBindings: MaterialBinding[] = [];
    const clonedMaterials: THREE.Material[] = [];
    const meshEntries: NotanMeshEntry[] = [];
    const toonMaterials: THREE.MeshToonMaterial[] = [];
    const ghostMaterials: THREE.MeshStandardMaterial[] = [];

    clonedScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const skinnedMesh = child as THREE.SkinnedMesh;
      const isMesh = Boolean(mesh.isMesh);
      const isSkinnedMesh = Boolean(skinnedMesh.isSkinnedMesh);

      if (isMesh || isSkinnedMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) =>
            cloneMaterialSafely(m, clonedMaterials, materialBindings)
          );
        } else if (mesh.material) {
          mesh.material = cloneMaterialSafely(
            mesh.material,
            clonedMaterials,
            materialBindings
          );
        }
        const toonMat = new THREE.MeshToonMaterial({ color: '#EFECE6' });
        const ghostMat = new THREE.MeshStandardMaterial({
          color: '#E5E7EB',
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          roughness: 0.85,
          metalness: 0.02,
        });
        toonMaterials.push(toonMat);
        ghostMaterials.push(ghostMat);
        meshEntries.push({
          mesh,
          standardMaterial: mesh.material,
          toonMaterial: toonMat,
          ghostMaterial: ghostMat,
        });
      }

      if (isSkinnedMesh) {
        // Prevent posed limbs from disappearing when moving outside the rest bounding sphere.
        skinnedMesh.frustumCulled = false;
        skinnedMeshes.push(skinnedMesh);
      }
    });

    const rigAdapter = createRigAdapter(template.modelId, clonedScene);
    const canonicalBones: CanonicalBoneEntry[] = Array.from(
      rigAdapter.bonesByCanonicalName.entries()
    ).map(([canonicalName, bone]) => ({ canonicalName, bone }));

    rootGroup.updateMatrixWorld(true);
    let maxTPoseY = -Infinity;
    const tmpBox = new THREE.Box3();
    for (const sm of skinnedMeshes) {
      sm.computeBoundingBox();
      if (!sm.boundingBox) continue;
      tmpBox.copy(sm.boundingBox).applyMatrix4(sm.matrixWorld);
      if (tmpBox.max.y > maxTPoseY) maxTPoseY = tmpBox.max.y;
    }
    if (!Number.isFinite(maxTPoseY)) maxTPoseY = 2.0;

    const headBone = rigAdapter.bonesByCanonicalName.get('Head');
    const neckBone = rigAdapter.bonesByCanonicalName.get('neck_01');
    let baseHeadHeight = 2.0 / 7.5;
    if (headBone && neckBone) {
      const headW = new THREE.Vector3();
      const neckW = new THREE.Vector3();
      headBone.getWorldPosition(headW);
      neckBone.getWorldPosition(neckW);
      const chinApproxY = THREE.MathUtils.lerp(neckW.y, headW.y, 0.25);
      baseHeadHeight = THREE.MathUtils.clamp(
        maxTPoseY - chinApproxY,
        0.255,
        0.275
      );
    }

    rootGroup.userData.mortalMeshFigure = {
      mannequinId: initialIdRef.current,
      rigAdapter,
      skinnedMeshes,
      baseHeadHeight,
      proportions: initialProportionsRef.current,
    };

    return {
      rootGroup,
      scene: clonedScene,
      rigAdapter,
      skinnedMeshes,
      canonicalBones,
      bonesByName: rigAdapter.bonesByCanonicalName,
      restQuaternions: rigAdapter.canonicalRestLocalQuats,
      materialBindings,
      clonedMaterials,
      meshEntries,
      toonMaterials,
      ghostMaterials,
      baseHeadHeight,
    };
  }, [template]);

  useEffect(() => {
    return () => {
      for (const material of instance.clonedMaterials) {
        material.dispose();
      }
      for (const toonMat of instance.toonMaterials) {
        toonMat.dispose();
      }
      for (const ghostMat of instance.ghostMaterials) {
        ghostMat.dispose();
      }
    };
  }, [instance]);

  useEffect(() => {
    const palette = getNotanThemePalette(studioTheme);
    const useToon = notanEnabled || drawing.drawingStyle === 'planar';
    const isConstructiveOnly = drawing.constructiveMode === 'only';
    const useGhost =
      !isConstructiveOnly &&
      !useToon &&
      drawing.constructiveMode === 'overlay' &&
      drawing.drawingStyle === 'off';

    for (const entry of instance.meshEntries) {
      entry.mesh.visible = !isConstructiveOnly;
      if (useToon) {
        entry.toonMaterial.color.set(palette.figureColor);
        entry.toonMaterial.gradientMap = notanGradientTex;
        entry.toonMaterial.needsUpdate = true;
        entry.mesh.material = entry.toonMaterial;
      } else if (useGhost) {
        entry.ghostMaterial.color.set(
          studioTheme === 'light' ? '#D1D5DB' : '#E5E7EB'
        );
        entry.mesh.material = entry.ghostMaterial;
      } else {
        entry.mesh.material = entry.standardMaterial;
      }
    }
    invalidate();
  }, [
    notanEnabled,
    drawing.drawingStyle,
    drawing.constructiveMode,
    studioTheme,
    instance,
    notanGradientTex,
    invalidate,
  ]);

  useEffect(() => {
    const spec = MANNEQUIN_FINISHES[record.finish];
    for (const binding of instance.materialBindings) {
      if (record.finish === 'classic') {
        binding.material.color.copy(binding.originalColor);
        binding.material.roughness = binding.originalRoughness;
      } else if (binding.role === 'joint') {
        if (spec.jointsColor) {
          binding.material.color.set(spec.jointsColor);
        }
        binding.material.roughness = spec.roughness;
      } else {
        if (spec.mainColor) {
          binding.material.color.set(spec.mainColor);
        }
        binding.material.roughness = spec.roughness;
      }
    }
    invalidate();
  }, [record.finish, instance, invalidate]);

  useEffect(() => {
    instance.rootGroup.visible = record.visible;
    invalidate();
  }, [record.visible, instance, invalidate]);

  const pinnedSet = useMemo(
    () => new Set(record.pinnedBones),
    [record.pinnedBones]
  );

  const visibleBones = useMemo(() => {
    if (
      !isActive ||
      record.locked ||
      !record.visible ||
      controlMode !== 'fk' ||
      jointsDisplay === 'hidden'
    ) {
      return [];
    }
    if (jointsDisplay === 'core') {
      return instance.canonicalBones.filter((entry) =>
        isCoreBoneName(entry.canonicalName)
      );
    }
    return instance.canonicalBones;
  }, [
    instance,
    isActive,
    record.locked,
    record.visible,
    controlMode,
    jointsDisplay,
  ]);

  const selectedSpec = useMemo(
    () => (selectedBoneName ? getJointSpec(selectedBoneName) : null),
    [selectedBoneName]
  );

  const computeSkinnedBounds = useCallback((): {
    minY: number;
    maxY: number;
    minX: number;
    maxX: number;
  } => {
    if (instance.skinnedMeshes.length === 0) {
      return { minY: 0, maxY: 2, minX: -0.5, maxX: 0.5 };
    }

    instance.rootGroup.updateMatrixWorld(true);
    const meshBox = tempBoxRef.current;
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    for (const skinnedMesh of instance.skinnedMeshes) {
      skinnedMesh.computeBoundingBox();
      if (!skinnedMesh.boundingBox) continue;
      meshBox
        .copy(skinnedMesh.boundingBox)
        .applyMatrix4(skinnedMesh.matrixWorld);
      if (meshBox.min.y < minY) minY = meshBox.min.y;
      if (meshBox.max.y > maxY) maxY = meshBox.max.y;
      if (meshBox.min.x < minX) minX = meshBox.min.x;
      if (meshBox.max.x > maxX) maxX = meshBox.max.x;
    }

    return {
      minY: Number.isFinite(minY) ? minY : 0,
      maxY: Number.isFinite(maxY) ? maxY : 2,
      minX: Number.isFinite(minX) ? minX : -0.5,
      maxX: Number.isFinite(maxX) ? maxX : 0.5,
    };
  }, [instance]);

  const computeSkinnedMinY = useCallback((): number => {
    return computeSkinnedBounds().minY;
  }, [computeSkinnedBounds]);

  const emitHeadRulerMetrics = useCallback(() => {
    if (
      !isActiveRef.current ||
      !showHeadRulerRef.current ||
      !recordVisibleRef.current
    ) {
      if (lastRulerEmitKeyRef.current !== '') {
        lastRulerEmitKeyRef.current = '';
        onHeadRulerMetricsChangeRef.current(null);
      }
      return;
    }

    const bounds = computeSkinnedBounds();
    const standingHeightMeters = Math.max(0.4, bounds.maxY - bounds.minY);
    const headHeightMeters = Math.max(
      0.12,
      instance.baseHeadHeight * proportionsRef.current.headScale
    );
    const headCount = standingHeightMeters / headHeightMeters;

    const rulerWorldX = bounds.maxX + 0.18;
    const rulerWorldZ = instance.rootGroup.position.z;
    const topProj = projectWorldPointToScreen(
      new THREE.Vector3(rulerWorldX, bounds.maxY, rulerWorldZ),
      camera,
      size.width,
      size.height,
      activePresetRef.current,
      lensCurvatureRef.current
    );
    const bottomProj = projectWorldPointToScreen(
      new THREE.Vector3(rulerWorldX, bounds.minY, rulerWorldZ),
      camera,
      size.width,
      size.height,
      activePresetRef.current,
      lensCurvatureRef.current
    );

    const ticks: HeadRulerTick[] = [
      {
        headIndex: 0,
        label: '0H',
        screenX: Math.round(topProj.screenX * 2) / 2,
        screenY: Math.round(topProj.screenY * 2) / 2,
        isMajor: true,
      },
    ];

    const wholeHeads = Math.floor(headCount);
    for (let k = 1; k <= wholeHeads && k <= 12; k += 1) {
      const worldY = bounds.maxY - k * headHeightMeters;
      const p = projectWorldPointToScreen(
        new THREE.Vector3(rulerWorldX, worldY, rulerWorldZ),
        camera,
        size.width,
        size.height,
        activePresetRef.current,
        lensCurvatureRef.current
      );
      ticks.push({
        headIndex: k,
        label: `${k}H`,
        screenX: Math.round(p.screenX * 2) / 2,
        screenY: Math.round(p.screenY * 2) / 2,
        isMajor: k === 1 || k % 2 === 0,
      });
    }

    if (headCount - wholeHeads >= 0.12) {
      ticks.push({
        headIndex: 99,
        label: `${headCount.toFixed(1)}H`,
        screenX: Math.round(bottomProj.screenX * 2) / 2,
        screenY: Math.round(bottomProj.screenY * 2) / 2,
        isMajor: true,
      });
    }

    const anchorX = Math.round(topProj.screenX * 2) / 2;
    const topY = Math.round(topProj.screenY * 2) / 2;
    const bottomY = Math.round(bottomProj.screenY * 2) / 2;
    const roundedHeads = headCount.toFixed(1);
    const key = `${anchorX}:${topY}:${bottomY}:${roundedHeads}:${Math.round(standingHeightMeters * 100)}:${ticks.length}`;
    if (key === lastRulerEmitKeyRef.current) return;
    lastRulerEmitKeyRef.current = key;

    onHeadRulerMetricsChangeRef.current({
      visible: true,
      headCount,
      headHeightMeters,
      standingHeightMeters,
      anchorX,
      topY,
      bottomY,
      ticks,
    });
  }, [instance, computeSkinnedBounds, camera, size.width, size.height]);

  const syncHitboxPositions = useCallback(() => {
    instance.rootGroup.updateMatrixWorld(true);
    const tempVec = tempWorldPosRef.current;

    for (const entry of instance.canonicalBones) {
      const hitboxObj = hitboxRefs.current.get(entry.canonicalName);
      if (hitboxObj) {
        entry.bone.getWorldPosition(tempVec);
        hitboxObj.position.copy(tempVec);
      }
    }

    for (const handleId of IK_HANDLE_ORDER) {
      const bone = instance.bonesByName.get(handleId);
      const handleGroup = ikHandleRefs.current.get(handleId);
      if (bone && handleGroup) {
        bone.getWorldPosition(tempVec);
        handleGroup.position.copy(tempVec);
      }
    }

    const activeIK = selectedIKHandleRef.current;
    if (activeIK && !ikDraggingRef.current) {
      const bone = instance.bonesByName.get(activeIK);
      if (bone) {
        bone.getWorldPosition(ikProxyRef.current.position);
        ikProxyRef.current.updateMatrixWorld(true);
      }
    }

    constructiveOverlayRef.current?.sync();
    emitHeadRulerMetrics();
    invalidate();
  }, [instance, emitHeadRulerMetrics, invalidate]);

  const recomputeGroundOffset = useCallback(
    (targetElevationY = 0) => {
      const minY = computeSkinnedMinY();
      const deltaY = targetElevationY - minY;
      instance.rootGroup.position.y += deltaY;
      instance.rootGroup.updateMatrixWorld(true);
      onElevationSyncRef.current(record.id, round2(targetElevationY));
      syncHitboxPositions();
    },
    [instance, record.id, computeSkinnedMinY, syncHitboxPositions]
  );

  const captureSnapshot = useCallback((): PoseSnapshot => {
    instance.rootGroup.updateMatrixWorld(true);
    const bones = instance.rigAdapter.captureCanonicalSnapshotBones();

    return {
      bones,
      rootPosition: [
        instance.rootGroup.position.x,
        instance.rootGroup.position.y,
        instance.rootGroup.position.z,
      ],
      elevationY: round2(computeSkinnedMinY()),
      groundEnabled: groundEnabledRef.current,
      groundSnapEnabled: groundSnapEnabledRef.current,
      pinnedBones: [...pinnedBonesRef.current],
      proportions: instance.rigAdapter.getActiveProportions(),
    };
  }, [instance, computeSkinnedMinY]);

  const applySnapshot = useCallback(
    (
      snapshot: PoseSnapshot,
      options?: { recomputeGroundIfSnapped?: boolean }
    ): PoseSnapshot | null => {
      if (lockedRef.current) return null;

      prevGroundEnabledRef.current = snapshot.groundEnabled;
      prevGroundSnapRef.current = snapshot.groundSnapEnabled;
      prevPinnedRef.current = snapshot.pinnedBones;
      groundEnabledRef.current = snapshot.groundEnabled;
      groundSnapEnabledRef.current = snapshot.groundSnapEnabled;
      pinnedBonesRef.current = snapshot.pinnedBones;

      const restoredProps = clampFigureProportions(
        snapshot.proportions ?? proportionsRef.current
      );
      lastAppliedProportionsRef.current = restoredProps;
      proportionsRef.current = restoredProps;
      if (instance.rootGroup.userData.mortalMeshFigure) {
        instance.rootGroup.userData.mortalMeshFigure.proportions = restoredProps;
      }

      solverRef.current.sleepAll();
      solverAwakeRef.current = false;
      gravityMovedSinceWakeRef.current = false;

      instance.rigAdapter.applyCanonicalSnapshotBones(snapshot.bones);
      instance.rigAdapter.applyProportions(restoredProps);

      instance.rootGroup.position.set(
        snapshot.rootPosition[0],
        snapshot.rootPosition[1],
        snapshot.rootPosition[2]
      );
      instance.rootGroup.updateMatrixWorld(true);

      if (
        options?.recomputeGroundIfSnapped &&
        snapshot.groundEnabled &&
        snapshot.groundSnapEnabled
      ) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }

      const activeBoneName = selectedBoneNameRef.current;
      if (
        activeBoneName &&
        isActiveRef.current &&
        instance.rigAdapter.hasJoint(activeBoneName)
      ) {
        const spec = getJointSpec(activeBoneName);
        const currentAngles = instance.rigAdapter.readCanonicalAngles(
          activeBoneName,
          spec
        );
        onSelectBoneChangeRef.current(activeBoneName, currentAngles);
      }

      invalidate();
      return captureSnapshot();
    },
    [
      instance,
      record.id,
      captureSnapshot,
      computeSkinnedMinY,
      recomputeGroundOffset,
      syncHitboxPositions,
      invalidate,
    ]
  );

  const mirrorCurrentPose = useCallback((): PoseSnapshot | null => {
    if (lockedRef.current) return null;

    const current = captureSnapshot();
    const mirrored = mirrorPoseSnapshot(current, instance.restQuaternions);
    // Preserve this figure's staged X offset while mirroring limbs across its own midline.
    mirrored.rootPosition[0] = current.rootPosition[0];
    return applySnapshot(mirrored, { recomputeGroundIfSnapped: true });
  }, [instance, captureSnapshot, applySnapshot]);

  const applyHandGesture = useCallback(
    (side: HandSide, gestureId: HandGestureId): PoseSnapshot | null => {
      if (lockedRef.current || !instance.rigAdapter.hasFingerBones) return null;

      const targets = buildHandGestureBones(side, gestureId);
      const limitsOn = jointLimitsEnabledRef.current;

      for (const [boneName, rawAngles] of Object.entries(targets)) {
        if (!instance.rigAdapter.hasJoint(boneName)) continue;
        const spec = getJointSpec(boneName);
        const clamped = clampJointAngles(rawAngles, spec, limitsOn);
        instance.rigAdapter.applyCanonicalAngles(boneName, clamped, spec.order);
      }

      instance.rootGroup.updateMatrixWorld(true);
      syncHitboxPositions();
      invalidate();
      return captureSnapshot();
    },
    [instance, captureSnapshot, syncHitboxPositions, invalidate]
  );

  const mirrorHandGesture = useCallback(
    (fromSide: HandSide): PoseSnapshot | null => {
      if (lockedRef.current || !instance.rigAdapter.hasFingerBones) return null;

      const limitsOn = jointLimitsEnabledRef.current;
      const srcBoneNames = getHandFingerBoneNames(fromSide);

      for (const srcName of srcBoneNames) {
        const dstName = getMirroredBoneName(srcName);
        if (
          !instance.rigAdapter.hasJoint(srcName) ||
          !instance.rigAdapter.hasJoint(dstName)
        ) {
          continue;
        }

        const srcSpec = getJointSpec(srcName);
        const dstSpec = getJointSpec(dstName);
        const srcDeg = instance.rigAdapter.readCanonicalAngles(
          srcName,
          srcSpec,
          false
        );
        const mirroredRaw: JointAngles = {
          x: srcDeg.x,
          y: -srcDeg.y,
          z: -srcDeg.z,
        };
        const clamped = clampJointAngles(mirroredRaw, dstSpec, limitsOn);
        instance.rigAdapter.applyCanonicalAngles(dstName, clamped, dstSpec.order);
      }

      instance.rootGroup.updateMatrixWorld(true);
      syncHitboxPositions();
      invalidate();
      return captureSnapshot();
    },
    [instance, captureSnapshot, syncHitboxPositions, invalidate]
  );

  const getHandGestureId = useCallback(
    (side: HandSide): HandGestureId | null => {
      if (!instance.rigAdapter.hasFingerBones) return null;
      return detectMatchingHandGesture(side, (boneName) => {
        if (!instance.rigAdapter.hasJoint(boneName)) return null;
        return instance.rigAdapter.readCanonicalAngles(
          boneName,
          getJointSpec(boneName),
          false
        );
      });
    },
    [instance]
  );

  const applyIKSwivel = useCallback(
    (
      handleId: Exclude<IKHandleId, 'pelvis'>,
      swivelDeg: number,
      commitHistory = false
    ): PoseSnapshot | null => {
      if (lockedRef.current) return null;
      const endBone = instance.bonesByName.get(handleId);
      if (!endBone) return null;

      instance.rootGroup.updateMatrixWorld(true);
      const targetWorldPos = new THREE.Vector3();
      endBone.getWorldPosition(targetWorldPos);

      const res = solveLimbIK({
        handleId,
        targetWorldPos,
        rootGroup: instance.rootGroup,
        bonesByName: instance.bonesByName,
        restQuaternions: instance.restQuaternions,
        rigAdapter: instance.rigAdapter,
        jointLimitsEnabled: jointLimitsEnabledRef.current,
        swivelDeg,
      });

      if (!res) return null;
      solverRef.current.zeroBoneVelocity(res.upperBoneName);
      solverRef.current.zeroBoneVelocity(res.lowerBoneName);

      let minY = computeSkinnedMinY();
      if (groundEnabledRef.current && minY < 0) {
        instance.rootGroup.position.y += -minY;
        instance.rootGroup.updateMatrixWorld(true);
        minY = 0;
      }

      if (record.groundSnapEnabled) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(minY));
      }

      const endPos = new THREE.Vector3();
      endBone.getWorldPosition(endPos);
      ikProxyRef.current.position.copy(endPos);
      ikProxyRef.current.updateMatrixWorld(true);
      invalidate();

      const snap = captureSnapshot();
      if (commitHistory) {
        onCommitPoseSnapshotRef.current(record.id, snap);
      }
      return snap;
    },
    [
      instance,
      record.id,
      record.groundSnapEnabled,
      computeSkinnedMinY,
      recomputeGroundOffset,
      syncHitboxPositions,
      captureSnapshot,
      invalidate,
    ]
  );

  const resetIKLimb = useCallback(
    (handleId: IKHandleId): PoseSnapshot | null => {
      if (lockedRef.current) return null;
      if (handleId === 'pelvis') {
        for (const legBone of [
          'thigh_l',
          'calf_l',
          'foot_l',
          'thigh_r',
          'calf_r',
          'foot_r',
        ]) {
          if (instance.rigAdapter.hasJoint(legBone)) {
            const spec = getJointSpec(legBone);
            instance.rigAdapter.applyCanonicalAngles(
              legBone,
              ZERO_JOINT_ANGLES,
              spec.order
            );
            solverRef.current.zeroBoneVelocity(legBone);
          }
        }
        recomputeGroundOffset(0);
      } else {
        const chain = IK_CHAINS[handleId];
        for (const boneName of [chain.upperBone, chain.lowerBone]) {
          if (instance.rigAdapter.hasJoint(boneName)) {
            const spec = getJointSpec(boneName);
            instance.rigAdapter.applyCanonicalAngles(
              boneName,
              ZERO_JOINT_ANGLES,
              spec.order
            );
            solverRef.current.zeroBoneVelocity(boneName);
          }
        }
        if (record.groundSnapEnabled) {
          recomputeGroundOffset(0);
        } else {
          syncHitboxPositions();
          onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
        }
      }

      const endBone = instance.bonesByName.get(handleId);
      if (endBone) {
        instance.rootGroup.updateMatrixWorld(true);
        endBone.getWorldPosition(ikProxyRef.current.position);
        ikProxyRef.current.updateMatrixWorld(true);
      }

      invalidate();
      const snap = captureSnapshot();
      onCommitPoseSnapshotRef.current(record.id, snap);
      return snap;
    },
    [
      instance,
      record.id,
      record.groundSnapEnabled,
      recomputeGroundOffset,
      syncHitboxPositions,
      computeSkinnedMinY,
      captureSnapshot,
      invalidate,
    ]
  );

  const plantFootIK = useCallback(
    (handleId: 'foot_l' | 'foot_r'): PoseSnapshot | null => {
      if (lockedRef.current) return null;
      const footBone = instance.bonesByName.get(handleId);
      if (!footBone) return null;

      instance.rootGroup.updateMatrixWorld(true);
      const curPos = new THREE.Vector3();
      footBone.getWorldPosition(curPos);

      const swivelDeg = ikSwivelByHandleRef.current[handleId] ?? 0;
      const targetPos = new THREE.Vector3(curPos.x, 0.06, curPos.z);

      let res = solveLimbIK({
        handleId,
        targetWorldPos: targetPos,
        rootGroup: instance.rootGroup,
        bonesByName: instance.bonesByName,
        restQuaternions: instance.restQuaternions,
        rigAdapter: instance.rigAdapter,
        jointLimitsEnabled: jointLimitsEnabledRef.current,
        swivelDeg,
      });

      const minY = computeSkinnedMinY();
      if (minY < -0.002) {
        targetPos.y += -minY + 0.002;
        res = solveLimbIK({
          handleId,
          targetWorldPos: targetPos,
          rootGroup: instance.rootGroup,
          bonesByName: instance.bonesByName,
          restQuaternions: instance.restQuaternions,
          rigAdapter: instance.rigAdapter,
          jointLimitsEnabled: jointLimitsEnabledRef.current,
          swivelDeg,
        });
      }

      if (!res) return null;
      solverRef.current.zeroBoneVelocity(res.upperBoneName);
      solverRef.current.zeroBoneVelocity(res.lowerBoneName);

      if (record.groundSnapEnabled) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }

      instance.rootGroup.updateMatrixWorld(true);
      footBone.getWorldPosition(ikProxyRef.current.position);
      ikProxyRef.current.updateMatrixWorld(true);
      invalidate();

      const snap = captureSnapshot();
      onCommitPoseSnapshotRef.current(record.id, snap);
      return snap;
    },
    [
      instance,
      record.id,
      record.groundSnapEnabled,
      computeSkinnedMinY,
      recomputeGroundOffset,
      syncHitboxPositions,
      captureSnapshot,
      invalidate,
    ]
  );

  const syncProportions = useCallback(
    (
      nextProportions: FigureProportions,
      commitHistory = false
    ): PoseSnapshot | null => {
      if (lockedRef.current) return null;
      const clampedProps = clampFigureProportions(nextProportions);
      lastAppliedProportionsRef.current = clampedProps;
      proportionsRef.current = clampedProps;
      if (instance.rootGroup.userData.mortalMeshFigure) {
        instance.rootGroup.userData.mortalMeshFigure.proportions = clampedProps;
      }
      instance.rigAdapter.applyProportions(clampedProps);

      if (record.groundSnapEnabled) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }
      invalidate();

      const snap = captureSnapshot();
      if (commitHistory) {
        onCommitPoseSnapshotRef.current(record.id, snap);
      }
      return snap;
    },
    [
      instance,
      record.id,
      record.groundSnapEnabled,
      recomputeGroundOffset,
      syncHitboxPositions,
      computeSkinnedMinY,
      captureSnapshot,
      invalidate,
    ]
  );

  useEffect(() => {
    onMannequinBridgeChange(record.id, {
      captureSnapshot,
      applySnapshot,
      mirrorCurrentPose,
      applyHandGesture,
      mirrorHandGesture,
      getHandGestureId,
      applyIKSwivel,
      resetIKLimb,
      plantFootIK,
      syncProportions,
    });
    return () => onMannequinBridgeChange(record.id, null);
  }, [
    record.id,
    captureSnapshot,
    applySnapshot,
    mirrorCurrentPose,
    applyHandGesture,
    mirrorHandGesture,
    getHandGestureId,
    applyIKSwivel,
    resetIKLimb,
    plantFootIK,
    syncProportions,
    onMannequinBridgeChange,
  ]);

  useLayoutEffect(() => {
    if (!hasInitializedGroundRef.current) {
      hasInitializedGroundRef.current = true;
      const initSnap = initialSnapshotRef.current;
      if (initSnap) {
        const initProps = clampFigureProportions(
          initSnap.proportions ?? initialProportionsRef.current
        );
        lastAppliedProportionsRef.current = initProps;
        proportionsRef.current = initProps;
        if (instance.rootGroup.userData.mortalMeshFigure) {
          instance.rootGroup.userData.mortalMeshFigure.proportions = initProps;
        }
        instance.rigAdapter.applyCanonicalSnapshotBones(initSnap.bones);
        instance.rigAdapter.applyProportions(initProps);
        const startX = initialPreserveExactPosRef.current
          ? initSnap.rootPosition[0]
          : initialSpawnOffsetRef.current[0];
        const startZ = initialPreserveExactPosRef.current
          ? initSnap.rootPosition[2]
          : initialSpawnOffsetRef.current[2];
        instance.rootGroup.position.set(startX, initSnap.rootPosition[1], startZ);
        instance.rootGroup.updateMatrixWorld(true);
        if (
          !initialPreserveExactPosRef.current &&
          !record.locked &&
          groundEnabledRef.current &&
          groundSnapEnabledRef.current
        ) {
          recomputeGroundOffset(0);
        } else {
          syncHitboxPositions();
          onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
        }
      } else {
        const initProps = clampFigureProportions(initialProportionsRef.current);
        lastAppliedProportionsRef.current = initProps;
        proportionsRef.current = initProps;
        if (instance.rootGroup.userData.mortalMeshFigure) {
          instance.rootGroup.userData.mortalMeshFigure.proportions = initProps;
        }
        const initPresetId = initialPosePresetIdRef.current;
        const preset =
          initPresetId && initPresetId !== 't-pose'
            ? getPosePreset(initPresetId)
            : null;
        if (preset) {
          instance.rigAdapter.resetToTPose();
          const resolvedBones = instance.rigAdapter.resolvePresetBoneAngles(
            preset.bones
          );
          for (const [boneName, rawAngles] of Object.entries(resolvedBones)) {
            if (!instance.rigAdapter.hasJoint(boneName)) continue;
            const spec = getJointSpec(boneName);
            const clamped = clampJointAngles(rawAngles, spec, true);
            instance.rigAdapter.applyCanonicalAngles(
              boneName,
              clamped,
              spec.order
            );
          }
        }
        instance.rigAdapter.applyProportions(initProps);
        recomputeGroundOffset(preset && !preset.groundSnap ? preset.elevationY : 0);
      }

      const initialSnap = captureSnapshot();
      onInitialPoseSnapshotRef.current(record.id, initialSnap);
      return;
    }

    syncHitboxPositions();
  }, [
    instance,
    record.id,
    record.visible,
    record.locked,
    isActive,
    jointsDisplay,
    controlMode,
    computeSkinnedMinY,
    recomputeGroundOffset,
    syncHitboxPositions,
    captureSnapshot,
  ]);

  useEffect(() => {
    const nextProps = clampFigureProportions(record.proportions);
    if (proportionsEqual(nextProps, lastAppliedProportionsRef.current)) return;

    lastAppliedProportionsRef.current = nextProps;
    proportionsRef.current = nextProps;
    if (instance.rootGroup.userData.mortalMeshFigure) {
      instance.rootGroup.userData.mortalMeshFigure.proportions = nextProps;
    }
    instance.rigAdapter.applyProportions(nextProps);

    if (!lockedRef.current && record.groundSnapEnabled) {
      recomputeGroundOffset(0);
    } else {
      syncHitboxPositions();
      onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
    }
    invalidate();
  }, [
    record.proportions,
    record.id,
    record.groundSnapEnabled,
    instance,
    recomputeGroundOffset,
    syncHitboxPositions,
    computeSkinnedMinY,
    invalidate,
  ]);

  useEffect(() => {
    emitHeadRulerMetrics();
  }, [
    isActive,
    showHeadRuler,
    record.visible,
    record.proportions,
    activePreset,
    lensCurvature,
    cameraRestSeq,
    size.width,
    size.height,
    emitHeadRulerMetrics,
  ]);

  useEffect(() => {
    return () => {
      if (lastRulerEmitKeyRef.current !== '') {
        lastRulerEmitKeyRef.current = '';
        onHeadRulerMetricsChangeRef.current(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      setSelectedBoneName(null);
      setHoveredBoneName(null);
      setSelectedIKHandle(null);
      setHoveredIKHandle(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    if (controlMode === 'ik') {
      setSelectedBoneName(null);
      setHoveredBoneName(null);
      onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
    } else {
      setSelectedIKHandle(null);
      setHoveredIKHandle(null);
      onSelectIKHandleChangeRef.current(null);
    }
    invalidate();
  }, [controlMode, isActive, invalidate]);

  useEffect(() => {
    if (!isActive || !selectedPropId) return;
    setSelectedBoneName(null);
    setHoveredBoneName(null);
    setSelectedIKHandle(null);
    setHoveredIKHandle(null);
    onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
    onSelectIKHandleChangeRef.current(null);
    onMoveBodyChange(false);
    invalidate();
  }, [selectedPropId, isActive, onMoveBodyChange, invalidate]);

  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    prevLockedRef.current = record.locked;

    if (record.locked && !wasLocked) {
      solverRef.current.sleepAll();
      solverAwakeRef.current = false;
      gravityMovedSinceWakeRef.current = false;
      setSelectedBoneName(null);
      setHoveredBoneName(null);
      setSelectedIKHandle(null);
      setHoveredIKHandle(null);
      if (isActiveRef.current) {
        onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
        onSelectIKHandleChangeRef.current(null);
        onDraggingChange(false);
        onMoveBodyChange(false);
      }
      invalidate();
    }
  }, [record.locked, onDraggingChange, onMoveBodyChange, invalidate]);

  useEffect(() => {
    document.body.style.cursor = hoveredBoneName
      ? 'pointer'
      : hoveredIKHandle
        ? 'grab'
        : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hoveredBoneName, hoveredIKHandle]);

  useEffect(() => {
    if (!isActive) return;
    if (jointsDisplay === 'hidden') {
      if (selectedBoneName) {
        setSelectedBoneName(null);
        setHoveredBoneName(null);
        onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
      }
      if (selectedIKHandle) {
        setSelectedIKHandle(null);
        setHoveredIKHandle(null);
        onSelectIKHandleChangeRef.current(null);
      }
      invalidate();
      return;
    }

    if (selectedBoneName) {
      const stillVisible =
        controlMode === 'fk' &&
        (jointsDisplay === 'all' ||
          (jointsDisplay === 'core' && isCoreBoneName(selectedBoneName)));
      if (!stillVisible) {
        setSelectedBoneName(null);
        setHoveredBoneName(null);
        onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
        invalidate();
      }
    }
  }, [
    isActive,
    controlMode,
    jointsDisplay,
    selectedBoneName,
    selectedIKHandle,
    invalidate,
  ]);

  useEffect(() => {
    const controls =
      transformRef.current as unknown as DraggingChangedDispatcher | null;
    if (
      !controls ||
      !isActive ||
      record.locked ||
      !record.visible ||
      !moveBodyEnabled
    ) {
      return;
    }

    const handleDraggingChanged = (event: { value: boolean }) => {
      const wasDragging = localDraggingRef.current;
      const dragging = Boolean(event.value);
      localDraggingRef.current = dragging;
      dragGuardRef.current.isDragging = dragging;

      if (!dragging) {
        dragGuardRef.current.lastDragEndTime = performance.now();
        if (wasDragging) {
          onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
        }
      }
      onDraggingChange(dragging);
      invalidate();
    };

    controls.addEventListener('dragging-changed', handleDraggingChanged);
    const detachPointerWarp = attachCurvilinearPointerWarp(
      transformRef.current,
      () => ({
        preset: activePresetRef.current,
        curvature: lensCurvatureRef.current,
      })
    );
    return () => {
      detachPointerWarp();
      controls.removeEventListener('dragging-changed', handleDraggingChanged);
      localDraggingRef.current = false;
      dragGuardRef.current.isDragging = false;
      onDraggingChange(false);
    };
  }, [
    isActive,
    instance,
    record.id,
    record.locked,
    record.visible,
    moveBodyEnabled,
    activePreset,
    dragGuardRef,
    onDraggingChange,
    invalidate,
    captureSnapshot,
  ]);

  useEffect(() => {
    if (localDraggingRef.current || dragGuardRef.current.isDragging) return;

    const clearIfEmitted = () => {
      if (emittedAnchorKeyRef.current !== null) {
        emittedAnchorKeyRef.current = null;
        onContextualAnchorChangeRef.current(null);
      }
    };

    if (!isActive || record.locked || !record.visible) {
      clearIfEmitted();
      return;
    }

    let kind: 'bone' | 'ik' | null = null;
    let id: string | null = null;
    let worldTarget: THREE.Vector3 | null = null;

    instance.rootGroup.updateMatrixWorld(true);

    if (moveBodyEnabled) {
      const pelvis = instance.bonesByName.get('pelvis');
      if (pelvis) {
        kind = 'bone';
        id = 'pelvis';
        pelvis.getWorldPosition(anchorWorldVecRef.current);
        worldTarget = anchorWorldVecRef.current;
      }
    } else if (controlMode === 'fk' && selectedBoneName) {
      const activeBone = instance.bonesByName.get(selectedBoneName);
      if (activeBone) {
        kind = 'bone';
        id = selectedBoneName;
        activeBone.getWorldPosition(anchorWorldVecRef.current);
        worldTarget = anchorWorldVecRef.current;
      }
    } else if (controlMode === 'ik' && selectedIKHandle) {
      kind = 'ik';
      id = selectedIKHandle;
      const handleBone = instance.bonesByName.get(selectedIKHandle);
      if (handleBone) {
        handleBone.getWorldPosition(anchorWorldVecRef.current);
      } else {
        anchorWorldVecRef.current.copy(ikProxyRef.current.position);
      }
      worldTarget = anchorWorldVecRef.current;
    }

    if (!kind || !id || !worldTarget) {
      clearIfEmitted();
      return;
    }

    const proj = projectWorldPointToScreen(
      worldTarget,
      camera,
      size.width,
      size.height,
      activePreset,
      lensCurvature
    );

    const pelvisBone = instance.bonesByName.get('pelvis');
    let figureCenterScreenX = size.width * 0.5;
    if (pelvisBone) {
      pelvisBone.getWorldPosition(figureCenterWorldVecRef.current);
      figureCenterScreenX = projectWorldPointToScreen(
        figureCenterWorldVecRef.current,
        camera,
        size.width,
        size.height,
        activePreset,
        lensCurvature
      ).screenX;
    }

    emittedAnchorKeyRef.current = `${kind}:${id}`;
    onContextualAnchorChangeRef.current({
      kind,
      id,
      mannequinId: record.id,
      screenX: proj.screenX,
      screenY: proj.screenY,
      figureCenterScreenX,
    });
  }, [
    isActive,
    instance,
    record.id,
    record.locked,
    record.visible,
    jointsDisplay,
    controlMode,
    moveBodyEnabled,
    selectedBoneName,
    selectedIKHandle,
    isDraggingIK,
    activePreset,
    lensCurvature,
    cameraRestSeq,
    dragGuardRef,
    camera,
    size.width,
    size.height,
  ]);

  useEffect(() => {
    return () => {
      if (emittedAnchorKeyRef.current !== null) {
        emittedAnchorKeyRef.current = null;
        onContextualAnchorChangeRef.current(null);
      }
    };
  }, []);

  useEffect(() => {
    if (deselectTrigger === lastDeselectTriggerRef.current) return;
    lastDeselectTriggerRef.current = deselectTrigger;
    if (!isActive) return;
    if (
      dragGuardRef.current.isDragging ||
      performance.now() - dragGuardRef.current.lastDragEndTime < 200
    ) {
      return;
    }

    setSelectedBoneName(null);
    setSelectedIKHandle(null);
    onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
    onSelectIKHandleChangeRef.current(null);
    onMoveBodyChange(false);
    invalidate();
  }, [
    deselectTrigger,
    isActive,
    dragGuardRef,
    onMoveBodyChange,
    invalidate,
  ]);

  useEffect(() => {
    if (resetTrigger === lastResetTriggerRef.current) return;
    lastResetTriggerRef.current = resetTrigger;
    if (!isActive || lockedRef.current) return;

    instance.rigAdapter.resetToTPose();

    instance.rootGroup.position.set(
      record.spawnOffset[0],
      1,
      record.spawnOffset[2]
    );
    solverRef.current.sleepAll();
    solverAwakeRef.current = false;
    gravityMovedSinceWakeRef.current = false;
    setSelectedBoneName(null);
    setHoveredBoneName(null);
    setSelectedIKHandle(null);
    setHoveredIKHandle(null);
    onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
    onSelectIKHandleChangeRef.current(null);
    onDraggingChange(false);
    onMoveBodyChange(false);
    recomputeGroundOffset(0);
    onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
  }, [
    resetTrigger,
    isActive,
    instance,
    record.id,
    record.spawnOffset,
    onDraggingChange,
    onMoveBodyChange,
    recomputeGroundOffset,
    captureSnapshot,
  ]);

  useEffect(() => {
    if (!jointAngleCommand) return;
    if (jointAngleCommand.seq === lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = jointAngleCommand.seq;
    if (!isActive || lockedRef.current) return;

    const boneName = jointAngleCommand.boneName;
    if (!instance.rigAdapter.hasJoint(boneName)) return;

    const spec = getJointSpec(boneName);
    const clamped = clampJointAngles(
      jointAngleCommand.angles,
      spec,
      jointLimitsEnabled
    );
    instance.rigAdapter.applyCanonicalAngles(boneName, clamped, spec.order);
    if (instance.rigAdapter.needsProportionSync) {
      instance.rigAdapter.syncProportionScales();
    }
    solverRef.current.zeroBoneVelocity(boneName);

    if (record.groundSnapEnabled) {
      recomputeGroundOffset(0);
    } else {
      syncHitboxPositions();
      onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
    }

    if (jointAngleCommand.commitHistory) {
      onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
    }

    if (gravityEnabled) {
      solverRef.current.wakeDownstream(
        boneName,
        !groundEnabled || computeSkinnedMinY() > 0.03
      );
      solverAwakeRef.current = true;
      invalidate();
    }
  }, [
    jointAngleCommand,
    isActive,
    instance,
    record.id,
    record.groundSnapEnabled,
    jointLimitsEnabled,
    groundEnabled,
    gravityEnabled,
    recomputeGroundOffset,
    syncHitboxPositions,
    computeSkinnedMinY,
    captureSnapshot,
    invalidate,
  ]);

  useEffect(() => {
    const justEnabled = jointLimitsEnabled && !prevLimitsEnabledRef.current;
    prevLimitsEnabledRef.current = jointLimitsEnabled;

    if (!isActive || lockedRef.current) return;

    if (
      justEnabled &&
      selectedBoneName &&
      selectedSpec &&
      instance.rigAdapter.hasJoint(selectedBoneName)
    ) {
      const raw = instance.rigAdapter.readCanonicalAngles(
        selectedBoneName,
        selectedSpec,
        false
      );
      const clamped = clampJointAngles(raw, selectedSpec, true);
      instance.rigAdapter.applyCanonicalAngles(
        selectedBoneName,
        clamped,
        selectedSpec.order
      );
      onBoneAnglesChange({
        x: Math.round(clamped.x),
        y: Math.round(clamped.y),
        z: Math.round(clamped.z),
      });

      if (record.groundSnapEnabled) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }
      return;
    }

    invalidate();
  }, [
    jointLimitsEnabled,
    isActive,
    instance,
    record.id,
    record.groundSnapEnabled,
    selectedBoneName,
    selectedSpec,
    onBoneAnglesChange,
    recomputeGroundOffset,
    syncHitboxPositions,
    computeSkinnedMinY,
    invalidate,
  ]);

  useEffect(() => {
    const wasEnabled = prevGroundEnabledRef.current;
    const justEnabled = groundEnabled && !wasEnabled;
    const justDisabled = !groundEnabled && wasEnabled;
    prevGroundEnabledRef.current = groundEnabled;

    if (record.locked) return;

    if (justEnabled && computeSkinnedMinY() < 0) {
      recomputeGroundOffset(0);
    }

    if (gravityEnabled && justDisabled) {
      solverRef.current.wakeBones(getInitialGravityWakeBones(true));
      solverAwakeRef.current = true;
      invalidate();
    }
  }, [
    groundEnabled,
    gravityEnabled,
    record.locked,
    computeSkinnedMinY,
    recomputeGroundOffset,
    invalidate,
  ]);

  useEffect(() => {
    const justEnabled = record.groundSnapEnabled && !prevGroundSnapRef.current;
    prevGroundSnapRef.current = record.groundSnapEnabled;

    if (record.locked) return;

    if (justEnabled) {
      recomputeGroundOffset(0);
    }
  }, [record.groundSnapEnabled, record.locked, recomputeGroundOffset]);

  useEffect(() => {
    if (dropToFloorTrigger === lastDropTriggerRef.current) return;
    lastDropTriggerRef.current = dropToFloorTrigger;
    if (!isActive || lockedRef.current) return;

    recomputeGroundOffset(0);
    onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
  }, [
    dropToFloorTrigger,
    isActive,
    record.id,
    recomputeGroundOffset,
    captureSnapshot,
  ]);

  useEffect(() => {
    if (!elevationCommand) return;
    if (elevationCommand.seq === lastElevationSeqRef.current) return;
    lastElevationSeqRef.current = elevationCommand.seq;
    if (!isActive || lockedRef.current) return;

    const targetY = groundEnabled
      ? Math.max(0, elevationCommand.y)
      : elevationCommand.y;
    recomputeGroundOffset(targetY);

    if (gravityEnabled && (!groundEnabled || targetY > 0.03)) {
      solverRef.current.wakeBones(getInitialGravityWakeBones(true));
      solverAwakeRef.current = true;
      invalidate();
    }
  }, [
    elevationCommand,
    isActive,
    groundEnabled,
    gravityEnabled,
    recomputeGroundOffset,
    invalidate,
  ]);

  useEffect(() => {
    if (!posePresetCommand) return;
    if (posePresetCommand.seq === lastPosePresetSeqRef.current) return;
    lastPosePresetSeqRef.current = posePresetCommand.seq;
    if (!isActive || lockedRef.current) return;

    const preset = getPosePreset(posePresetCommand.presetId);
    if (!preset) return;

    solverRef.current.sleepAll();
    solverAwakeRef.current = false;
    gravityMovedSinceWakeRef.current = false;

    instance.rigAdapter.resetToTPose();

    const resolvedBones = instance.rigAdapter.resolvePresetBoneAngles(
      preset.bones
    );
    for (const [boneName, rawAngles] of Object.entries(resolvedBones)) {
      if (!instance.rigAdapter.hasJoint(boneName)) continue;

      const spec = getJointSpec(boneName);
      const clamped = clampJointAngles(rawAngles, spec, true);
      instance.rigAdapter.applyCanonicalAngles(boneName, clamped, spec.order);
    }
    if (instance.rigAdapter.needsProportionSync) {
      instance.rigAdapter.syncProportionScales();
    }

    // Preserve current staged X/Z position so multi-figure posing never overlaps Figure 1.
    setSelectedBoneName(null);
    setHoveredBoneName(null);
    setSelectedIKHandle(null);
    setHoveredIKHandle(null);
    onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
    onSelectIKHandleChangeRef.current(null);
    onDraggingChange(false);
    onMoveBodyChange(false);
    recomputeGroundOffset(preset.groundSnap ? 0 : preset.elevationY);
    onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
  }, [
    posePresetCommand,
    isActive,
    instance,
    record.id,
    onDraggingChange,
    onMoveBodyChange,
    recomputeGroundOffset,
    captureSnapshot,
  ]);

  useEffect(() => {
    const wasEnabled = prevGravityEnabledRef.current;
    prevGravityEnabledRef.current = gravityEnabled;

    if (record.locked) {
      solverRef.current.sleepAll();
      solverAwakeRef.current = false;
      gravityMovedSinceWakeRef.current = false;
      return;
    }

    if (gravityEnabled && !wasEnabled) {
      gravityMovedSinceWakeRef.current = false;
      const isOffFloor = !groundEnabled || computeSkinnedMinY() > 0.03;
      solverRef.current.wakeBones(getInitialGravityWakeBones(isOffFloor));
      solverAwakeRef.current = true;
      invalidate();
    } else if (!gravityEnabled && wasEnabled) {
      solverRef.current.sleepAll();
      solverAwakeRef.current = false;
      gravityMovedSinceWakeRef.current = false;
      invalidate();
    }
  }, [gravityEnabled, groundEnabled, record.locked, computeSkinnedMinY, invalidate]);

  useEffect(() => {
    const prevPinned = prevPinnedRef.current;
    prevPinnedRef.current = record.pinnedBones;

    if (record.locked || !gravityEnabled) return;

    const unpinned = prevPinned.filter((name) => !pinnedSet.has(name));
    if (unpinned.length > 0) {
      const isOffFloor = !groundEnabled || computeSkinnedMinY() > 0.03;
      for (const boneName of unpinned) {
        solverRef.current.wakeBones([boneName]);
        solverRef.current.wakeDownstream(boneName, isOffFloor);
      }
      solverAwakeRef.current = true;
      invalidate();
    }
  }, [
    record.pinnedBones,
    record.locked,
    pinnedSet,
    gravityEnabled,
    groundEnabled,
    computeSkinnedMinY,
    invalidate,
  ]);

  useFrame((_, delta) => {
    if (
      isActiveRef.current &&
      showHeadRulerRef.current &&
      recordVisibleRef.current
    ) {
      emitHeadRulerMetrics();
    }
    if (record.locked || !gravityEnabled || !solverAwakeRef.current) return;

    const result = solverRef.current.step({
      rootGroup: instance.rootGroup,
      bonesByName: instance.bonesByName,
      restQuaternions: instance.restQuaternions,
      rigAdapter: instance.rigAdapter,
      selectedBoneName: isActive ? selectedBoneName : null,
      pinnedBones: pinnedSet,
      jointLimitsEnabled,
      groundEnabled,
      dampingPreset,
      dt: delta,
      locked: record.locked,
    });

    if (result.didMove) {
      if (instance.rigAdapter.needsProportionSync) {
        instance.rigAdapter.syncProportionScales();
      }
      gravityMovedSinceWakeRef.current = true;
      if (record.groundSnapEnabled) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }
    }

    if (result.awake) {
      invalidate();
    } else {
      solverAwakeRef.current = false;
      if (gravityMovedSinceWakeRef.current) {
        gravityMovedSinceWakeRef.current = false;
        onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
      }
    }
  });

  const setHitboxRef = useCallback(
    (canonicalName: string, obj: THREE.Object3D | null) => {
      if (obj) {
        hitboxRefs.current.set(canonicalName, obj);
      } else {
        hitboxRefs.current.delete(canonicalName);
      }
    },
    []
  );

  const handleBoneMarkerOver = useCallback(
    (canonicalName: string, event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      setHoveredBoneName(canonicalName);
      invalidate();
    },
    [invalidate]
  );

  const handleBoneMarkerOut = useCallback(
    (canonicalName: string, event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      setHoveredBoneName((prev) => (prev === canonicalName ? null : prev));
      invalidate();
    },
    [invalidate]
  );

  const handleBoneMarkerClick = useCallback(
    (
      entry: { canonicalName: string; bone: THREE.Bone },
      event: { stopPropagation: () => void }
    ) => {
      event.stopPropagation();
      onClearPropSelection();
      onMoveBodyChange(false);
      setSelectedIKHandle(null);
      onSelectIKHandleChangeRef.current(null);
      setSelectedBoneName(entry.canonicalName);
      const spec = getJointSpec(entry.canonicalName);
      const currentAngles = instance.rigAdapter.readCanonicalAngles(
        entry.canonicalName,
        spec
      );
      onSelectBoneChangeRef.current(entry.canonicalName, currentAngles);
      invalidate();
    },
    [instance, onClearPropSelection, onMoveBodyChange, invalidate]
  );

  const handleArcDraggingChange = useCallback(
    (dragging: boolean) => {
      localDraggingRef.current = dragging;
      setIsDraggingFK(dragging);
      onDraggingChange(dragging);
      invalidate();
    },
    [onDraggingChange, invalidate]
  );

  const handleArcAnglesUpdate = useCallback(
    (angles: JointAngles) => {
      const activeBoneName = selectedBoneNameRef.current;
      onBoneAnglesChange(angles);

      if (activeBoneName) {
        solverRef.current.zeroBoneVelocity(activeBoneName);
      }

      // Avoid full ground-snap pivot bouncing mid-drag; only guard floor penetration.
      let minY = computeSkinnedMinY();
      if (groundEnabled && minY < 0) {
        instance.rootGroup.position.y += -minY;
        instance.rootGroup.updateMatrixWorld(true);
        minY = 0;
      }

      syncHitboxPositions();
      onElevationSyncRef.current(record.id, round2(minY));

      if (gravityEnabled && activeBoneName) {
        solverRef.current.wakeDownstream(
          activeBoneName,
          !groundEnabled || minY > 0.03
        );
        solverAwakeRef.current = true;
      }
      invalidate();
    },
    [
      instance,
      record.id,
      groundEnabled,
      gravityEnabled,
      onBoneAnglesChange,
      computeSkinnedMinY,
      syncHitboxPositions,
      invalidate,
    ]
  );

  const handleArcDragCommit = useCallback(() => {
    if (record.groundSnapEnabled) {
      recomputeGroundOffset(0);
    } else {
      syncHitboxPositions();
      onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
    }
    onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
    invalidate();
  }, [
    record.id,
    record.groundSnapEnabled,
    recomputeGroundOffset,
    syncHitboxPositions,
    computeSkinnedMinY,
    captureSnapshot,
    invalidate,
  ]);

  const handleMoveBodyObjectChange = useCallback(() => {
    if (lockedRef.current) return;

    let minY = computeSkinnedMinY();
    if (groundEnabled && minY < 0) {
      instance.rootGroup.position.y += -minY;
      instance.rootGroup.updateMatrixWorld(true);
      minY = 0;
    }

    syncHitboxPositions();
    onElevationSyncRef.current(record.id, round2(minY));

    if (gravityEnabled && (!groundEnabled || minY > 0.03)) {
      solverRef.current.wakeBones(getInitialGravityWakeBones(true));
      solverAwakeRef.current = true;
      invalidate();
    }
  }, [
    instance,
    record.id,
    groundEnabled,
    syncHitboxPositions,
    computeSkinnedMinY,
    gravityEnabled,
    invalidate,
  ]);

  const setIKHandleRef = useCallback(
    (handleId: IKHandleId, group: THREE.Group | null) => {
      if (group) {
        ikHandleRefs.current.set(handleId, group);
      } else {
        ikHandleRefs.current.delete(handleId);
      }
    },
    []
  );

  const handleIKSelect = useCallback(
    (handleId: IKHandleId) => {
      const bone = instance.bonesByName.get(handleId);
      if (!bone) return;
      onClearPropSelection();
      onMoveBodyChange(false);
      setSelectedBoneName(null);
      onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
      instance.rootGroup.updateMatrixWorld(true);
      bone.getWorldPosition(ikProxyRef.current.position);
      ikProxyRef.current.updateMatrixWorld(true);
      setSelectedIKHandle(handleId);
      onSelectIKHandleChangeRef.current(handleId);
      invalidate();
    },
    [instance, onClearPropSelection, onMoveBodyChange, invalidate]
  );

  const handleIKDragStart = useCallback(
    (handleId: IKHandleId, startWorldPos: THREE.Vector3) => {
      if (lockedRef.current) return;
      instance.rootGroup.updateMatrixWorld(true);
      ikDragStartWorldRef.current = startWorldPos.clone();
      ikDragStartRootRef.current = instance.rootGroup.position.clone();
      ikProxyRef.current.position.copy(startWorldPos);
      ikProxyRef.current.updateMatrixWorld(true);

      const footLBone = instance.bonesByName.get('foot_l');
      const footRBone = instance.bonesByName.get('foot_r');
      ikDragAnchoredFootLRef.current = footLBone
        ? footLBone.getWorldPosition(new THREE.Vector3())
        : null;
      ikDragAnchoredFootRRef.current = footRBone
        ? footRBone.getWorldPosition(new THREE.Vector3())
        : null;
      ikDragPoleRef.current = null;

      ikDraggingRef.current = true;
      localDraggingRef.current = true;
      dragGuardRef.current.isDragging = true;
      setIsDraggingIK(true);
      onDraggingChange(true);
      void handleId;
      invalidate();
    },
    [instance, dragGuardRef, onDraggingChange, invalidate]
  );

  const handleIKDragMove = useCallback(
    (handleId: IKHandleId, nextWorldPos: THREE.Vector3, mode: IKDragMode) => {
      if (lockedRef.current) {
        syncHitboxPositions();
        return;
      }

      const startPos = ikDragStartWorldRef.current ?? nextWorldPos;
      const deltaVec = nextWorldPos.clone().sub(startPos);
      const shortName = getIKHandleLabel(handleId).replace(' IK', '').replace(' / Hips', '');
      const fmtCm = (m: number) => `${m >= 0 ? '+' : ''}${Math.round(m * 100)}cm`;

      if (handleId === 'pelvis') {
        const startRoot =
          ikDragStartRootRef.current ?? instance.rootGroup.position.clone();
        const isSquat =
          ikPinFeetRef.current &&
          Boolean(ikDragAnchoredFootLRef.current || ikDragAnchoredFootRRef.current);

        const res = solvePelvisSquatIK({
          startRootPos: startRoot,
          deltaWorld: deltaVec,
          anchoredFootL: ikDragAnchoredFootLRef.current,
          anchoredFootR: ikDragAnchoredFootRRef.current,
          pinFeet: ikPinFeetRef.current,
          swivelFootL: ikSwivelByHandleRef.current.foot_l ?? 0,
          swivelFootR: ikSwivelByHandleRef.current.foot_r ?? 0,
          rootGroup: instance.rootGroup,
          bonesByName: instance.bonesByName,
          restQuaternions: instance.restQuaternions,
          rigAdapter: instance.rigAdapter,
          jointLimitsEnabled,
          groundEnabled,
          computeSkinnedMinY,
        });

        ikProxyRef.current.position.copy(res.pelvisPos);
        ikProxyRef.current.updateMatrixWorld(true);
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(res.minY));

        if (gravityEnabled && (!groundEnabled || res.minY > 0.03)) {
          solverRef.current.wakeBones(getInitialGravityWakeBones(true));
          solverAwakeRef.current = true;
        }

        const label = isSquat
          ? `${shortName} · Squat ${fmtCm(deltaVec.y)}`
          : mode === 'x' || mode === 'y' || mode === 'z'
            ? `${shortName} · ${mode.toUpperCase()} ${fmtCm(deltaVec[mode])}`
            : mode === 'xz'
              ? `${shortName} · Floor ${Math.round(Math.hypot(deltaVec.x, deltaVec.z) * 100)}cm`
              : `${shortName} · Δ${Math.round(deltaVec.length() * 100)}cm`;

        setIkDragFeedback({
          active: true,
          mode,
          label,
          deltaVec,
          isSquat,
        });
        invalidate();
        return;
      }

      const target = nextWorldPos.clone();
      if (groundEnabled && !record.groundSnapEnabled && target.y < 0.03) {
        target.y = 0.03;
      }
      ikProxyRef.current.position.copy(target);
      ikProxyRef.current.updateMatrixWorld(true);

      const swivelDeg = ikSwivelByHandleRef.current[handleId] ?? 0;
      const res = solveLimbIK({
        handleId,
        targetWorldPos: target,
        rootGroup: instance.rootGroup,
        bonesByName: instance.bonesByName,
        restQuaternions: instance.restQuaternions,
        rigAdapter: instance.rigAdapter,
        jointLimitsEnabled,
        swivelDeg,
        poleHintOverride: ikDragPoleRef.current ?? undefined,
      });

      if (res) {
        ikDragPoleRef.current = res.resolvedPole.clone();
        solverRef.current.zeroBoneVelocity(res.upperBoneName);
        solverRef.current.zeroBoneVelocity(res.lowerBoneName);

        // Guard only floor penetration mid-drag to prevent foot/hip bouncing
        let minY = computeSkinnedMinY();
        if (groundEnabled && minY < 0) {
          instance.rootGroup.position.y += -minY;
          instance.rootGroup.updateMatrixWorld(true);
          minY = 0;
        }

        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(minY));

        if (gravityEnabled) {
          solverRef.current.wakeDownstream(
            res.endBoneName,
            !groundEnabled || minY > 0.03
          );
          solverAwakeRef.current = true;
        }

        const clamped = res.isClamped || res.isMaxReach;
        const label = clamped
          ? `${shortName} · Max Reach`
          : mode === 'x' || mode === 'y' || mode === 'z'
            ? `${shortName} · ${mode.toUpperCase()} ${fmtCm(deltaVec[mode])}`
            : mode === 'xz'
              ? `${shortName} · Floor ${Math.round(Math.hypot(deltaVec.x, deltaVec.z) * 100)}cm`
              : `${shortName} · Δ${Math.round(deltaVec.length() * 100)}cm`;

        setIkDragFeedback({
          active: true,
          mode,
          label,
          deltaVec,
          chainPoints: [
            res.upperPos.clone(),
            res.lowerPos.clone(),
            res.achievedPos.clone(),
          ],
          targetPos: target.clone(),
          achievedPos: res.achievedPos.clone(),
          isMaxReach: clamped,
        });
        invalidate();
      } else {
        syncHitboxPositions();
      }
    },
    [
      instance,
      record.id,
      record.groundSnapEnabled,
      jointLimitsEnabled,
      groundEnabled,
      gravityEnabled,
      computeSkinnedMinY,
      syncHitboxPositions,
      invalidate,
    ]
  );

  const handleIKDragEnd = useCallback(
    (handleId: IKHandleId) => {
      const wasDragging = ikDraggingRef.current;
      ikDraggingRef.current = false;
      localDraggingRef.current = false;
      dragGuardRef.current.isDragging = false;
      dragGuardRef.current.lastDragEndTime = performance.now();

      ikDragStartWorldRef.current = null;
      ikDragStartRootRef.current = null;
      ikDragAnchoredFootLRef.current = null;
      ikDragAnchoredFootRRef.current = null;
      ikDragPoleRef.current = null;

      setIsDraggingIK(false);
      setIkDragFeedback(null);

      if (record.groundSnapEnabled && handleId !== 'pelvis') {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }

      const bone = instance.bonesByName.get(handleId);
      if (bone) {
        instance.rootGroup.updateMatrixWorld(true);
        bone.getWorldPosition(ikProxyRef.current.position);
        ikProxyRef.current.updateMatrixWorld(true);
      }

      if (wasDragging) {
        onCommitPoseSnapshotRef.current(record.id, captureSnapshot());
      }
      onDraggingChange(false);
      invalidate();
    },
    [
      instance,
      record.id,
      record.groundSnapEnabled,
      dragGuardRef,
      recomputeGroundOffset,
      syncHitboxPositions,
      computeSkinnedMinY,
      captureSnapshot,
      onDraggingChange,
      invalidate,
    ]
  );

  const hitboxColors = STUDIO_THEMES[studioTheme].hitbox;
  const showInteractive = isActive && !record.locked && record.visible;
  const showIKHandles =
    showInteractive && controlMode === 'ik' && jointsDisplay !== 'hidden';

  return (
    <group>
      <primitive object={ikProxyRef.current} />
      <primitive
        object={instance.rootGroup}
        onClick={(event: {
          stopPropagation: () => void;
          intersections?: Array<{ object: THREE.Object3D }>;
        }) => {
          if (!record.visible) return;
          if (isActive && Array.isArray(event.intersections)) {
            const hitsControl = event.intersections.some((hit) => {
              let obj: THREE.Object3D | null = hit.object;
              while (obj) {
                if (
                  obj.name === 'mortal-mesh-hitboxes' ||
                  obj.name === 'mortal-mesh-ik-handles' ||
                  obj.name === 'mortal-mesh-gizmo'
                ) {
                  return true;
                }
                obj = obj.parent;
              }
              return false;
            });
            if (hitsControl) {
              // Yield to joint pin-rings / IK handles / arc gizmo behind the skin mesh
              return;
            }
          }
          event.stopPropagation();
          if (
            dragGuardRef.current.isDragging ||
            performance.now() - dragGuardRef.current.lastDragEndTime < 200
          ) {
            return;
          }
          onClearPropSelection();
          if (!isActive) {
            onSelectMannequin(record.id);
            invalidate();
          }
        }}
      />

      <ConstructiveOverlay
        ref={constructiveOverlayRef}
        mannequinId={record.id}
        rigAdapter={instance.rigAdapter}
        baseHeadHeight={instance.baseHeadHeight}
        proportions={record.proportions}
        groundY={0}
        visible={record.visible}
        drawing={drawing}
        studioTheme={studioTheme}
      />

      {showInteractive && (
        <>
          <JointRingMarkers
            entries={visibleBones}
            selectedBoneName={selectedBoneName}
            hoveredBoneName={hoveredBoneName}
            pinnedSet={pinnedSet}
            moveBodyEnabled={moveBodyEnabled}
            isDraggingFK={isDraggingFK}
            isCoarsePointer={isCoarsePointer}
            hitboxColors={hitboxColors}
            setHitboxRef={setHitboxRef}
            onBoneOver={handleBoneMarkerOver}
            onBoneOut={handleBoneMarkerOut}
            onBoneClick={handleBoneMarkerClick}
          />

          {showIKHandles && (
            <IKHandleMarkers
              selectedHandle={selectedIKHandle}
              hoveredHandle={hoveredIKHandle}
              moveBodyEnabled={moveBodyEnabled}
              isDraggingIK={isDraggingIK}
              isCoarsePointer={isCoarsePointer}
              hitboxColors={hitboxColors}
              activePreset={activePreset}
              lensCurvature={lensCurvature}
              bonesByName={instance.bonesByName}
              dragGuardRef={dragGuardRef}
              setIKHandleRef={setIKHandleRef}
              onHoverChange={setHoveredIKHandle}
              onSelectHandle={handleIKSelect}
              onDirectDragStart={handleIKDragStart}
              onDirectDragMove={handleIKDragMove}
              onDirectDragEnd={handleIKDragEnd}
            />
          )}

          <group name="mortal-mesh-gizmo">
            {moveBodyEnabled ? (
              <TransformControls
                key={`gizmo-move-body-${record.id}`}
                ref={transformRef}
                object={instance.rootGroup}
                mode="translate"
                space="world"
                size={isCoarsePointer ? 0.92 : 0.75}
                onObjectChange={handleMoveBodyObjectChange}
                onChange={() => invalidate()}
              />
            ) : controlMode === 'ik' && selectedIKHandle ? (
              <IKMoveGizmo
                key={`ik-move-gizmo-${record.id}-${selectedIKHandle}`}
                handleId={selectedIKHandle}
                anchorObj={ikProxyRef.current}
                studioTheme={studioTheme}
                activePreset={activePreset}
                lensCurvature={lensCurvature}
                isCoarsePointer={isCoarsePointer}
                dragGuardRef={dragGuardRef}
                dragFeedback={ikDragFeedback}
                onDragStart={handleIKDragStart}
                onDragMove={handleIKDragMove}
                onDragEnd={handleIKDragEnd}
              />
            ) : (
              controlMode === 'fk' &&
              selectedBoneName &&
              selectedSpec && (
                <JointArcGizmo
                  key={`arc-gizmo-${record.id}-${selectedBoneName}`}
                  rigAdapter={instance.rigAdapter}
                  boneName={selectedBoneName}
                  spec={selectedSpec}
                  rootGroup={instance.rootGroup}
                  jointLimitsEnabled={jointLimitsEnabled}
                  studioTheme={studioTheme}
                  activePreset={activePreset}
                  lensCurvature={lensCurvature}
                  isCoarsePointer={isCoarsePointer}
                  dragGuardRef={dragGuardRef}
                  onDraggingChange={handleArcDraggingChange}
                  onAnglesUpdate={handleArcAnglesUpdate}
                  onDragCommit={handleArcDragCommit}
                />
              )
            )}
          </group>
        </>
      )}
    </group>
  );
}

export function AnatomyModel({
  mannequins,
  activeMannequinId,
  sceneLoadId,
  studioTheme,
  jointsDisplay,
  controlMode,
  jointLimitsEnabled,
  jointAngleCommand,
  groundEnabled,
  elevationCommand,
  dropToFloorTrigger,
  moveBodyEnabled,
  selectedPropId,
  posePresetCommand,
  gravityEnabled,
  dampingPreset,
  resetTrigger,
  deselectTrigger,
  isCoarsePointer,
  activePreset,
  lensCurvature,
  cameraRestSeq,
  ikPinFeet,
  ikSwivelByHandle,
  notanEnabled,
  notanSplit,
  drawing,
  showHeadRuler,
  onSelectMannequin,
  onDraggingChange,
  onSelectBoneChange,
  onSelectIKHandleChange,
  onBoneAnglesChange,
  onElevationSync,
  onMoveBodyChange,
  onClearPropSelection,
  onMannequinBridgeChange,
  onInitialPoseSnapshot,
  onCommitPoseSnapshot,
  onContextualAnchorChange,
  onHeadRulerMetricsChange,
}: AnatomyModelProps) {
  const [templatesByModel, setTemplatesByModel] = useState<
    Partial<Record<MannequinModelId, MannequinTemplate>>
  >({});
  const [loadErrors, setLoadErrors] = useState<
    Partial<Record<MannequinModelId, boolean>>
  >({});
  const dragGuardRef = useRef<DragGuardState>({
    isDragging: false,
    lastDragEndTime: 0,
  });
  const loadingModelsRef = useRef<Set<MannequinModelId>>(new Set());
  const gltfLoaderRef = useRef<{
    loader: GLTFLoader;
    draco: DRACOLoader;
  } | null>(null);
  const isMountedRef = useRef(true);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    isMountedRef.current = true;
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    gltfLoaderRef.current = { loader, draco };

    return () => {
      isMountedRef.current = false;
      draco.dispose();
      gltfLoaderRef.current = null;
      loadingModelsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const loaderBundle = gltfLoaderRef.current;
    if (!loaderBundle) return;

    const neededModels = new Set<MannequinModelId>();
    for (const record of mannequins) {
      neededModels.add(record.modelId);
    }

    for (const modelId of Array.from(neededModels)) {
      if (templatesByModel[modelId] || loadingModelsRef.current.has(modelId)) {
        continue;
      }
      loadingModelsRef.current.add(modelId);
      const modelSpec = MODEL_CATALOG[modelId];

      loaderBundle.loader.load(
        modelSpec.url,
        (gltf) => {
          loadingModelsRef.current.delete(modelId);
          if (!isMountedRef.current) return;

          const calScene = SkeletonUtils.clone(gltf.scene) as THREE.Group;
          if (modelSpec.facingYawOffset !== 0) {
            calScene.rotation.y = modelSpec.facingYawOffset;
          }
          createRigAdapter(modelId, calScene);
          calScene.updateMatrixWorld(true);

          const box = new THREE.Box3().setFromObject(calScene);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          const fitScale = size.y > 0 ? 2.0 / size.y : 1;
          const sceneOffset = new THREE.Vector3(
            -center.x * fitScale,
            -box.min.y * fitScale - 1.0,
            -center.z * fitScale
          );

          setTemplatesByModel((prev) => ({
            ...prev,
            [modelId]: {
              modelId,
              scene: gltf.scene,
              fitScale,
              sceneOffset,
            },
          }));
          setLoadErrors((prev) => {
            if (!prev[modelId]) return prev;
            const next = { ...prev };
            delete next[modelId];
            return next;
          });
          invalidate();
        },
        undefined,
        (error) => {
          loadingModelsRef.current.delete(modelId);
          if (!isMountedRef.current) return;
          console.error(`Failed to load ${modelSpec.url}:`, error);
          setLoadErrors((prev) => ({
            ...prev,
            [modelId]: true,
          }));
          invalidate();
        }
      );
    }
  }, [mannequins, templatesByModel, invalidate]);

  const themeSpec = STUDIO_THEMES[studioTheme];

  return (
    <group>
      {mannequins.map((record) => {
        const template = templatesByModel[record.modelId];
        if (!template) {
          if (!record.visible) return null;
          const modelLabel = MODEL_CATALOG[record.modelId].label.toUpperCase();
          const hasError = Boolean(loadErrors[record.modelId]);
          return (
            <Html
              key={`loading-${record.id}-${record.modelId}`}
              position={[record.spawnOffset[0], 1, record.spawnOffset[2]]}
              center
            >
              <div
                role="status"
                aria-live="polite"
                className={`rounded-xl px-4 py-2 text-xs font-mono font-semibold uppercase tracking-[0.16em] whitespace-nowrap select-none ${themeSpec.ui.loadingBadge}`}
              >
                {hasError
                  ? `FAILED TO LOAD ${modelLabel}`
                  : `LOADING ${modelLabel}...`}
              </div>
            </Html>
          );
        }

        return (
          <MannequinInstance
            key={`${sceneLoadId}-${record.id}-${record.modelId}`}
            template={template}
            record={record}
            isActive={record.id === activeMannequinId}
            dragGuardRef={dragGuardRef}
            studioTheme={studioTheme}
            jointsDisplay={jointsDisplay}
            controlMode={controlMode}
            jointLimitsEnabled={jointLimitsEnabled}
            jointAngleCommand={jointAngleCommand}
            groundEnabled={groundEnabled}
            elevationCommand={elevationCommand}
            dropToFloorTrigger={dropToFloorTrigger}
            moveBodyEnabled={moveBodyEnabled}
            selectedPropId={selectedPropId}
            posePresetCommand={posePresetCommand}
            gravityEnabled={gravityEnabled}
            dampingPreset={dampingPreset}
            resetTrigger={resetTrigger}
            deselectTrigger={deselectTrigger}
            isCoarsePointer={isCoarsePointer}
            activePreset={activePreset}
            lensCurvature={lensCurvature}
            cameraRestSeq={cameraRestSeq}
            ikPinFeet={ikPinFeet}
            ikSwivelByHandle={ikSwivelByHandle}
            notanEnabled={notanEnabled}
            notanSplit={notanSplit}
            drawing={drawing}
            showHeadRuler={showHeadRuler}
            onSelectMannequin={onSelectMannequin}
            onDraggingChange={onDraggingChange}
            onSelectBoneChange={onSelectBoneChange}
            onSelectIKHandleChange={onSelectIKHandleChange}
            onBoneAnglesChange={onBoneAnglesChange}
            onElevationSync={onElevationSync}
            onMoveBodyChange={onMoveBodyChange}
            onClearPropSelection={onClearPropSelection}
            onMannequinBridgeChange={onMannequinBridgeChange}
            onInitialPoseSnapshot={onInitialPoseSnapshot}
            onCommitPoseSnapshot={onCommitPoseSnapshot}
            onContextualAnchorChange={onContextualAnchorChange}
            onHeadRulerMetricsChange={onHeadRulerMetricsChange}
          />
        );
      })}
    </group>
  );
}
