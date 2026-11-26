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
  type HandGestureId,
  type HandSide,
  type IKHandleId,
  type JointAngleCommand,
  type JointAngles,
  type JointsDisplayMode,
  type PoseControlMode,
  type PosePresetCommand,
  type StudioThemeId,
} from '@/types/anatomy';
import type { PoseBridge, PoseSnapshot, QuaternionTuple } from '@/types/poseIO';
import { MANNEQUIN_FINISHES, type MannequinRecord } from '@/types/scene';
import {
  buildHandGestureBones,
  detectMatchingHandGesture,
  getHandFingerBoneNames,
} from '@/data/handGestures';
import { clampJointAngles, getJointSpec } from '@/data/jointLimits';
import { MODEL_CATALOG, type MannequinModelId } from '@/data/modelCatalog';
import { getPosePreset } from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  getInitialGravityWakeBones,
  JointSpaceGravitySolver,
} from '@/physics/gravitySolver';
import { solveLimbIK } from '@/physics/runtimeIK';
import { createRigAdapter, type RigAdapter } from '@/rig/rigAdapter';
import {
  attachCurvilinearPointerWarp,
  projectWorldPointToScreen,
} from '@/utils/lensWarp';
import {
  getMirroredBoneName,
  mirrorPoseSnapshot,
} from '@/utils/mirrorPose';

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
  const initialPreserveExactPosRef = useRef(
    Boolean(record.preserveExactRootPosition)
  );
  const hitboxRefs = useRef<Map<string, THREE.Object3D>>(new Map());
  const ikHandleRefs = useRef<Map<IKHandleId, THREE.Group>>(new Map());
  const ikProxyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const transformRef = useRef<ComponentRef<typeof TransformControls>>(null);
  const localDraggingRef = useRef(false);
  const ikDraggingRef = useRef(false);
  const [isDraggingFK, setIsDraggingFK] = useState(false);
  const ikDragStartProxyRef = useRef<THREE.Vector3 | null>(null);
  const ikDragStartRootRef = useRef<THREE.Vector3 | null>(null);

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
  const pinnedBonesRef = useRef<readonly string[]>(record.pinnedBones);
  const lockedRef = useRef(record.locked);
  const jointLimitsEnabledRef = useRef(jointLimitsEnabled);
  const isActiveRef = useRef(isActive);
  const selectedBoneNameRef = useRef<string | null>(selectedBoneName);
  const selectedIKHandleRef = useRef<IKHandleId | null>(selectedIKHandle);
  const activePresetRef = useRef<CameraPreset>(activePreset);
  const lensCurvatureRef = useRef<number>(lensCurvature);

  const onSelectBoneChangeRef = useRef(onSelectBoneChange);
  const onSelectIKHandleChangeRef = useRef(onSelectIKHandleChange);
  const onElevationSyncRef = useRef(onElevationSync);
  const onInitialPoseSnapshotRef = useRef(onInitialPoseSnapshot);
  const onCommitPoseSnapshotRef = useRef(onCommitPoseSnapshot);
  const onContextualAnchorChangeRef = useRef(onContextualAnchorChange);

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
  pinnedBonesRef.current = record.pinnedBones;
  lockedRef.current = record.locked;
  jointLimitsEnabledRef.current = jointLimitsEnabled;
  isActiveRef.current = isActive;
  selectedBoneNameRef.current = selectedBoneName;
  selectedIKHandleRef.current = selectedIKHandle;
  activePresetRef.current = activePreset;
  lensCurvatureRef.current = lensCurvature;
  onSelectBoneChangeRef.current = onSelectBoneChange;
  onSelectIKHandleChangeRef.current = onSelectIKHandleChange;
  onElevationSyncRef.current = onElevationSync;
  onInitialPoseSnapshotRef.current = onInitialPoseSnapshot;
  onCommitPoseSnapshotRef.current = onCommitPoseSnapshot;
  onContextualAnchorChangeRef.current = onContextualAnchorChange;

  const { camera, size, invalidate } = useThree();

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
    };
  }, [template]);

  useEffect(() => {
    return () => {
      for (const material of instance.clonedMaterials) {
        material.dispose();
      }
    };
  }, [instance]);

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

    invalidate();
  }, [instance, invalidate]);

  const computeSkinnedMinY = useCallback((): number => {
    if (instance.skinnedMeshes.length === 0) return 0;

    instance.rootGroup.updateMatrixWorld(true);
    const meshBox = tempBoxRef.current;
    let minY = Infinity;

    for (const skinnedMesh of instance.skinnedMeshes) {
      skinnedMesh.computeBoundingBox();
      if (!skinnedMesh.boundingBox) continue;
      meshBox
        .copy(skinnedMesh.boundingBox)
        .applyMatrix4(skinnedMesh.matrixWorld);
      if (meshBox.min.y < minY) {
        minY = meshBox.min.y;
      }
    }

    return Number.isFinite(minY) ? minY : 0;
  }, [instance]);

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

      solverRef.current.sleepAll();
      solverAwakeRef.current = false;
      gravityMovedSinceWakeRef.current = false;

      instance.rigAdapter.applyCanonicalSnapshotBones(snapshot.bones);

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

  useEffect(() => {
    onMannequinBridgeChange(record.id, {
      captureSnapshot,
      applySnapshot,
      mirrorCurrentPose,
      applyHandGesture,
      mirrorHandGesture,
      getHandGestureId,
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
    onMannequinBridgeChange,
  ]);

  useLayoutEffect(() => {
    if (!hasInitializedGroundRef.current) {
      hasInitializedGroundRef.current = true;
      const initSnap = initialSnapshotRef.current;
      if (initSnap) {
        instance.rigAdapter.applyCanonicalSnapshotBones(initSnap.bones);
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
        recomputeGroundOffset(0);
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
    document.body.style.cursor =
      hoveredBoneName || hoveredIKHandle ? 'pointer' : 'auto';
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
    const hasIKGizmo =
      controlMode === 'ik' && selectedIKHandle !== null && !moveBodyEnabled;
    if (
      !controls ||
      !isActive ||
      record.locked ||
      !record.visible ||
      (!hasIKGizmo && !moveBodyEnabled)
    ) {
      return;
    }

    const handleDraggingChanged = (event: { value: boolean }) => {
      const wasDragging = localDraggingRef.current;
      const dragging = Boolean(event.value);
      localDraggingRef.current = dragging;
      dragGuardRef.current.isDragging = dragging;
      ikDraggingRef.current = dragging && hasIKGizmo;

      if (dragging && hasIKGizmo) {
        ikDragStartProxyRef.current = ikProxyRef.current.position.clone();
        ikDragStartRootRef.current = instance.rootGroup.position.clone();
      }

      if (!dragging) {
        dragGuardRef.current.lastDragEndTime = performance.now();
        ikDragStartProxyRef.current = null;
        ikDragStartRootRef.current = null;
        if (hasIKGizmo && selectedIKHandle) {
          const bone = instance.bonesByName.get(selectedIKHandle);
          if (bone) {
            instance.rootGroup.updateMatrixWorld(true);
            bone.getWorldPosition(ikProxyRef.current.position);
            ikProxyRef.current.updateMatrixWorld(true);
          }
        }
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
      ikDraggingRef.current = false;
      ikDragStartProxyRef.current = null;
      ikDragStartRootRef.current = null;
      dragGuardRef.current.isDragging = false;
      onDraggingChange(false);
    };
  }, [
    isActive,
    instance,
    record.id,
    record.locked,
    record.visible,
    controlMode,
    selectedIKHandle,
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

  const handleIKObjectChange = useCallback(() => {
    if (lockedRef.current || !selectedIKHandle) {
      syncHitboxPositions();
      return;
    }

    if (selectedIKHandle === 'pelvis') {
      const startProxy = ikDragStartProxyRef.current;
      const startRoot = ikDragStartRootRef.current;
      if (startProxy && startRoot) {
        const delta = ikProxyRef.current.position.clone().sub(startProxy);
        instance.rootGroup.position.copy(startRoot).add(delta);
        instance.rootGroup.updateMatrixWorld(true);
      }

      let minY = computeSkinnedMinY();
      if (groundEnabled && minY < 0) {
        instance.rootGroup.position.y += -minY;
        ikProxyRef.current.position.y += -minY;
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
      return;
    }

    const target = ikProxyRef.current.position.clone();
    if (groundEnabled && !record.groundSnapEnabled && target.y < 0.04) {
      target.y = 0.04;
      ikProxyRef.current.position.y = 0.04;
    }

    const res = solveLimbIK({
      handleId: selectedIKHandle,
      targetWorldPos: target,
      rootGroup: instance.rootGroup,
      bonesByName: instance.bonesByName,
      restQuaternions: instance.restQuaternions,
      rigAdapter: instance.rigAdapter,
      jointLimitsEnabled,
    });

    if (res) {
      solverRef.current.zeroBoneVelocity(res.upperBoneName);
      solverRef.current.zeroBoneVelocity(res.lowerBoneName);

      if (record.groundSnapEnabled) {
        recomputeGroundOffset(0);
      } else {
        syncHitboxPositions();
        onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
      }

      if (gravityEnabled) {
        solverRef.current.wakeDownstream(
          res.endBoneName,
          !groundEnabled || computeSkinnedMinY() > 0.03
        );
        solverAwakeRef.current = true;
      }
      invalidate();
    } else {
      syncHitboxPositions();
    }
  }, [
    instance,
    record.id,
    record.groundSnapEnabled,
    selectedIKHandle,
    jointLimitsEnabled,
    groundEnabled,
    gravityEnabled,
    computeSkinnedMinY,
    recomputeGroundOffset,
    syncHitboxPositions,
    invalidate,
  ]);

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
            <group name="mortal-mesh-ik-handles">
              {IK_HANDLE_ORDER.map((handleId) => {
                const isSelected =
                  !moveBodyEnabled && selectedIKHandle === handleId;
                const isHovered = hoveredIKHandle === handleId;
                const isPelvis = handleId === 'pelvis';
                const diamondRadius = isPelvis ? 0.028 : 0.022;
                const ringRadius = isPelvis ? 0.046 : 0.038;
                const colliderRadius = isCoarsePointer ? 0.088 : 0.056;
                const scale = isSelected ? 1.24 : isHovered ? 1.12 : 1;

                return (
                  <group
                    key={handleId}
                    ref={(group) => {
                      if (group) {
                        ikHandleRefs.current.set(handleId, group);
                      } else {
                        ikHandleRefs.current.delete(handleId);
                      }
                    }}
                    scale={scale}
                  >
                    <mesh renderOrder={11}>
                      <octahedronGeometry args={[diamondRadius, 0]} />
                      <meshBasicMaterial
                        color={
                          isSelected
                            ? hitboxColors.ikSelectedColor
                            : hitboxColors.ikCoreColor
                        }
                        transparent
                        opacity={isSelected ? 0.92 : isHovered ? 0.85 : 0.65}
                        depthTest={false}
                      />
                    </mesh>
                    <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={11}>
                      <torusGeometry args={[ringRadius, 0.004, 8, 28]} />
                      <meshBasicMaterial
                        color={hitboxColors.ikRingColor}
                        transparent
                        opacity={isSelected ? 0.92 : isHovered ? 0.82 : 0.48}
                        depthTest={false}
                      />
                    </mesh>
                    <mesh
                      renderOrder={12}
                      onPointerOver={(event) => {
                        event.stopPropagation();
                        setHoveredIKHandle(handleId);
                        invalidate();
                      }}
                      onPointerOut={(event) => {
                        event.stopPropagation();
                        setHoveredIKHandle((prev) =>
                          prev === handleId ? null : prev
                        );
                        invalidate();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
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
                      }}
                    >
                      <sphereGeometry args={[colliderRadius, 10, 10]} />
                      <meshBasicMaterial
                        transparent
                        opacity={0}
                        depthWrite={false}
                      />
                    </mesh>
                  </group>
                );
              })}
            </group>
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
              <TransformControls
                key={`gizmo-ik-${record.id}-${selectedIKHandle}`}
                ref={transformRef}
                object={ikProxyRef.current}
                mode="translate"
                space="world"
                size={isCoarsePointer ? 0.82 : 0.62}
                onObjectChange={handleIKObjectChange}
                onChange={() => invalidate()}
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
          />
        );
      })}
    </group>
  );
}
