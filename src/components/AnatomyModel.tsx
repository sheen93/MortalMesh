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
  getJointHitboxRadius,
  IK_HANDLE_ORDER,
  isCoreBoneName,
  isPoseableBoneName,
  ZERO_JOINT_ANGLES,
  type DampingPreset,
  type ElevationCommand,
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
  clampJointAngles,
  getJointSpec,
  type JointSpec,
} from '@/data/jointLimits';
import { getPosePreset } from '@/data/poses';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  getInitialGravityWakeBones,
  JointSpaceGravitySolver,
} from '@/physics/gravitySolver';
import { solveLimbIK } from '@/physics/runtimeIK';
import { mirrorPoseSnapshot } from '@/utils/mirrorPose';

interface MannequinTemplate {
  scene: THREE.Group;
  fitScale: number;
  sceneOffset: THREE.Vector3;
  classicMainColor: THREE.Color | null;
  classicMainRoughness: number;
  classicJointsColor: THREE.Color | null;
  classicJointsRoughness: number;
}

interface ClonedInstanceData {
  rootGroup: THREE.Group;
  scene: THREE.Group;
  skinnedMeshes: THREE.SkinnedMesh[];
  bones: THREE.Bone[];
  bonesByName: Map<string, THREE.Bone>;
  restQuaternions: Map<string, THREE.Quaternion>;
  mainMaterials: THREE.MeshStandardMaterial[];
  jointMaterials: THREE.MeshStandardMaterial[];
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

function readBoneDeltaDegrees(
  bone: THREE.Bone,
  restQuat: THREE.Quaternion,
  spec: JointSpec,
  roundToInt = true
): JointAngles {
  const deltaQuat = restQuat.clone().invert().multiply(bone.quaternion);
  const euler = new THREE.Euler(0, 0, 0, spec.order).setFromQuaternion(
    deltaQuat,
    spec.order
  );
  const x = THREE.MathUtils.radToDeg(euler.x);
  const y = THREE.MathUtils.radToDeg(euler.y);
  const z = THREE.MathUtils.radToDeg(euler.z);

  if (!roundToInt) {
    return { x, y, z };
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    z: Math.round(z),
  };
}

function cloneMaterialSafely(
  mat: THREE.Material,
  clonedMaterials: THREE.Material[],
  mainMaterials: THREE.MeshStandardMaterial[],
  jointMaterials: THREE.MeshStandardMaterial[]
): THREE.Material {
  const cloned = mat.clone();
  clonedMaterials.push(cloned);
  if (cloned instanceof THREE.MeshStandardMaterial) {
    if (cloned.name === 'M_Main') {
      mainMaterials.push(cloned);
    } else if (cloned.name === 'M_Joints') {
      jointMaterials.push(cloned);
    }
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
}: MannequinInstanceProps) {
  const [selectedBone, setSelectedBone] = useState<THREE.Bone | null>(null);
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
  const isActiveRef = useRef(isActive);
  const selectedBoneRef = useRef<THREE.Bone | null>(selectedBone);
  const selectedIKHandleRef = useRef<IKHandleId | null>(selectedIKHandle);

  const onSelectBoneChangeRef = useRef(onSelectBoneChange);
  const onSelectIKHandleChangeRef = useRef(onSelectIKHandleChange);
  const onElevationSyncRef = useRef(onElevationSync);
  const onInitialPoseSnapshotRef = useRef(onInitialPoseSnapshot);
  const onCommitPoseSnapshotRef = useRef(onCommitPoseSnapshot);

  const solverRef = useRef(new JointSpaceGravitySolver());
  const solverAwakeRef = useRef(false);
  const gravityMovedSinceWakeRef = useRef(false);
  const tempWorldPosRef = useRef(new THREE.Vector3());
  const tempBoxRef = useRef(new THREE.Box3());

  groundEnabledRef.current = groundEnabled;
  groundSnapEnabledRef.current = record.groundSnapEnabled;
  pinnedBonesRef.current = record.pinnedBones;
  lockedRef.current = record.locked;
  isActiveRef.current = isActive;
  selectedBoneRef.current = selectedBone;
  selectedIKHandleRef.current = selectedIKHandle;
  onSelectBoneChangeRef.current = onSelectBoneChange;
  onSelectIKHandleChangeRef.current = onSelectIKHandleChange;
  onElevationSyncRef.current = onElevationSync;
  onInitialPoseSnapshotRef.current = onInitialPoseSnapshot;
  onCommitPoseSnapshotRef.current = onCommitPoseSnapshot;

  const { invalidate } = useThree();

  const instance = useMemo<ClonedInstanceData>(() => {
    const clonedScene = SkeletonUtils.clone(template.scene) as THREE.Group;
    clonedScene.scale.setScalar(template.fitScale);
    clonedScene.position.copy(template.sceneOffset);

    const rootGroup = new THREE.Group();
    rootGroup.name = `MannequinRoot_${initialIdRef.current}`;
    rootGroup.position.set(
      initialSpawnOffsetRef.current[0],
      1,
      initialSpawnOffsetRef.current[2]
    );
    rootGroup.add(clonedScene);
    rootGroup.updateMatrixWorld(true);

    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const bones: THREE.Bone[] = [];
    const bonesByName = new Map<string, THREE.Bone>();
    const restQuaternions = new Map<string, THREE.Quaternion>();
    const mainMaterials: THREE.MeshStandardMaterial[] = [];
    const jointMaterials: THREE.MeshStandardMaterial[] = [];
    const clonedMaterials: THREE.Material[] = [];

    clonedScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const skinnedMesh = child as THREE.SkinnedMesh;
      const isMesh = Boolean(mesh.isMesh);
      const isSkinnedMesh = Boolean(skinnedMesh.isSkinnedMesh);
      const isBone = Boolean((child as THREE.Bone).isBone);

      if (isMesh || isSkinnedMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) =>
            cloneMaterialSafely(
              m,
              clonedMaterials,
              mainMaterials,
              jointMaterials
            )
          );
        } else if (mesh.material) {
          mesh.material = cloneMaterialSafely(
            mesh.material,
            clonedMaterials,
            mainMaterials,
            jointMaterials
          );
        }
      }

      if (isSkinnedMesh) {
        // Prevent posed limbs from disappearing when moving outside the rest bounding sphere.
        skinnedMesh.frustumCulled = false;
        skinnedMeshes.push(skinnedMesh);
      }

      if (isBone && isPoseableBoneName(child.name)) {
        const bone = child as THREE.Bone;
        bones.push(bone);
        bonesByName.set(bone.name, bone);
        restQuaternions.set(bone.name, bone.quaternion.clone());
      }
    });

    return {
      rootGroup,
      scene: clonedScene,
      skinnedMeshes,
      bones,
      bonesByName,
      restQuaternions,
      mainMaterials,
      jointMaterials,
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
    for (const mat of instance.mainMaterials) {
      if (spec.mainColor) {
        mat.color.set(spec.mainColor);
      } else if (template.classicMainColor) {
        mat.color.copy(template.classicMainColor);
      }
      mat.roughness = spec.mainColor
        ? spec.roughness
        : template.classicMainRoughness;
    }
    for (const mat of instance.jointMaterials) {
      if (spec.jointsColor) {
        mat.color.set(spec.jointsColor);
      } else if (template.classicJointsColor) {
        mat.color.copy(template.classicJointsColor);
      }
      mat.roughness = spec.jointsColor
        ? spec.roughness
        : template.classicJointsRoughness;
    }
    invalidate();
  }, [record.finish, instance, template, invalidate]);

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
      return instance.bones.filter((bone) => isCoreBoneName(bone.name));
    }
    return instance.bones;
  }, [
    instance,
    isActive,
    record.locked,
    record.visible,
    controlMode,
    jointsDisplay,
  ]);

  const selectedSpec = useMemo(
    () => (selectedBone ? getJointSpec(selectedBone.name) : null),
    [selectedBone]
  );

  const syncHitboxPositions = useCallback(() => {
    instance.rootGroup.updateMatrixWorld(true);
    const tempVec = tempWorldPosRef.current;

    for (const bone of instance.bones) {
      const hitboxObj = hitboxRefs.current.get(bone.name);
      if (hitboxObj) {
        bone.getWorldPosition(tempVec);
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
    const bones: Record<string, QuaternionTuple> = {};
    for (const bone of instance.bones) {
      bones[bone.name] = [
        bone.quaternion.x,
        bone.quaternion.y,
        bone.quaternion.z,
        bone.quaternion.w,
      ];
    }

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

      for (const bone of instance.bones) {
        const tuple = snapshot.bones[bone.name];
        if (tuple) {
          bone.quaternion
            .set(tuple[0], tuple[1], tuple[2], tuple[3])
            .normalize();
        } else {
          const restQuat = instance.restQuaternions.get(bone.name);
          if (restQuat) {
            bone.quaternion.copy(restQuat);
          }
        }
      }

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

      const activeBone = selectedBoneRef.current;
      if (activeBone && isActiveRef.current) {
        const restQuat = instance.restQuaternions.get(activeBone.name);
        const spec = getJointSpec(activeBone.name);
        const currentAngles = restQuat
          ? readBoneDeltaDegrees(activeBone, restQuat, spec)
          : ZERO_JOINT_ANGLES;
        onSelectBoneChangeRef.current(activeBone.name, currentAngles);
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

  useEffect(() => {
    onMannequinBridgeChange(record.id, {
      captureSnapshot,
      applySnapshot,
      mirrorCurrentPose,
    });
    return () => onMannequinBridgeChange(record.id, null);
  }, [
    record.id,
    captureSnapshot,
    applySnapshot,
    mirrorCurrentPose,
    onMannequinBridgeChange,
  ]);

  useLayoutEffect(() => {
    if (!hasInitializedGroundRef.current) {
      hasInitializedGroundRef.current = true;
      const initSnap = initialSnapshotRef.current;
      if (initSnap) {
        for (const bone of instance.bones) {
          const tuple = initSnap.bones[bone.name];
          if (tuple) {
            bone.quaternion
              .set(tuple[0], tuple[1], tuple[2], tuple[3])
              .normalize();
          }
        }
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
      setSelectedBone(null);
      setHoveredBoneName(null);
      setSelectedIKHandle(null);
      setHoveredIKHandle(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    if (controlMode === 'ik') {
      setSelectedBone(null);
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
    setSelectedBone(null);
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
      setSelectedBone(null);
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
      if (selectedBone) {
        setSelectedBone(null);
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

    if (selectedBone) {
      const stillVisible =
        controlMode === 'fk' &&
        (jointsDisplay === 'all' ||
          (jointsDisplay === 'core' && isCoreBoneName(selectedBone.name)));
      if (!stillVisible) {
        setSelectedBone(null);
        setHoveredBoneName(null);
        onSelectBoneChangeRef.current(null, ZERO_JOINT_ANGLES);
        invalidate();
      }
    }
  }, [
    isActive,
    controlMode,
    jointsDisplay,
    selectedBone,
    selectedIKHandle,
    invalidate,
  ]);

  useEffect(() => {
    const controls =
      transformRef.current as unknown as DraggingChangedDispatcher | null;
    const hasIKGizmo =
      controlMode === 'ik' && selectedIKHandle !== null && !moveBodyEnabled;
    const hasFKGizmo =
      controlMode === 'fk' && selectedBone !== null && !moveBodyEnabled;
    if (
      !controls ||
      !isActive ||
      record.locked ||
      !record.visible ||
      (!hasIKGizmo && !hasFKGizmo && !moveBodyEnabled)
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
    return () => {
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
    selectedBone,
    selectedIKHandle,
    moveBodyEnabled,
    dragGuardRef,
    onDraggingChange,
    invalidate,
    captureSnapshot,
  ]);

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

    setSelectedBone(null);
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

    for (const bone of instance.bones) {
      const restQuat = instance.restQuaternions.get(bone.name);
      if (restQuat) {
        bone.quaternion.copy(restQuat);
      }
    }

    instance.rootGroup.position.set(
      record.spawnOffset[0],
      1,
      record.spawnOffset[2]
    );
    solverRef.current.sleepAll();
    solverAwakeRef.current = false;
    gravityMovedSinceWakeRef.current = false;
    setSelectedBone(null);
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

    const bone = instance.bonesByName.get(jointAngleCommand.boneName);
    const restQuat = instance.restQuaternions.get(jointAngleCommand.boneName);
    if (!bone || !restQuat) return;

    const spec = getJointSpec(bone.name);
    const clamped = clampJointAngles(
      jointAngleCommand.angles,
      spec,
      jointLimitsEnabled
    );
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(clamped.x),
      THREE.MathUtils.degToRad(clamped.y),
      THREE.MathUtils.degToRad(clamped.z),
      spec.order
    );
    const deltaQuat = new THREE.Quaternion().setFromEuler(euler);
    bone.quaternion.copy(restQuat).multiply(deltaQuat).normalize();
    solverRef.current.zeroBoneVelocity(bone.name);

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
        bone.name,
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

    if (justEnabled && selectedBone && selectedSpec) {
      const restQuat = instance.restQuaternions.get(selectedBone.name);
      if (restQuat) {
        const raw = readBoneDeltaDegrees(
          selectedBone,
          restQuat,
          selectedSpec,
          false
        );
        const clamped = clampJointAngles(raw, selectedSpec, true);
        const euler = new THREE.Euler(
          THREE.MathUtils.degToRad(clamped.x),
          THREE.MathUtils.degToRad(clamped.y),
          THREE.MathUtils.degToRad(clamped.z),
          selectedSpec.order
        );
        const deltaQuat = new THREE.Quaternion().setFromEuler(euler);
        selectedBone.quaternion.copy(restQuat).multiply(deltaQuat).normalize();
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
    }

    invalidate();
  }, [
    jointLimitsEnabled,
    isActive,
    instance,
    record.id,
    record.groundSnapEnabled,
    selectedBone,
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

    for (const bone of instance.bones) {
      const restQuat = instance.restQuaternions.get(bone.name);
      if (restQuat) {
        bone.quaternion.copy(restQuat);
      }
    }

    for (const [boneName, rawAngles] of Object.entries(preset.bones)) {
      const bone = instance.bonesByName.get(boneName);
      const restQuat = instance.restQuaternions.get(boneName);
      if (!bone || !restQuat) continue;

      const spec = getJointSpec(boneName);
      const clamped = clampJointAngles(rawAngles, spec, true);
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(clamped.x),
        THREE.MathUtils.degToRad(clamped.y),
        THREE.MathUtils.degToRad(clamped.z),
        spec.order
      );
      const deltaQuat = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(restQuat).multiply(deltaQuat).normalize();
    }

    // Preserve current staged X/Z position so multi-figure posing never overlaps Figure 1.
    setSelectedBone(null);
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
      selectedBoneName: isActive ? selectedBone?.name ?? null : null,
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

  const handleTransformObjectChange = useCallback(() => {
    if (lockedRef.current || !selectedBone || !selectedSpec) {
      syncHitboxPositions();
      return;
    }

    const restQuat = instance.restQuaternions.get(selectedBone.name);
    if (!restQuat) {
      syncHitboxPositions();
      return;
    }

    const rawDeg = readBoneDeltaDegrees(
      selectedBone,
      restQuat,
      selectedSpec,
      false
    );
    const clamped = clampJointAngles(rawDeg, selectedSpec, jointLimitsEnabled);

    if (jointLimitsEnabled) {
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(clamped.x),
        THREE.MathUtils.degToRad(clamped.y),
        THREE.MathUtils.degToRad(clamped.z),
        selectedSpec.order
      );
      const clampedDeltaQuat = new THREE.Quaternion().setFromEuler(euler);
      selectedBone.quaternion
        .copy(restQuat)
        .multiply(clampedDeltaQuat)
        .normalize();
    }

    onBoneAnglesChange({
      x: Math.round(clamped.x),
      y: Math.round(clamped.y),
      z: Math.round(clamped.z),
    });

    solverRef.current.zeroBoneVelocity(selectedBone.name);

    if (record.groundSnapEnabled) {
      recomputeGroundOffset(0);
    } else {
      syncHitboxPositions();
      onElevationSyncRef.current(record.id, round2(computeSkinnedMinY()));
    }

    if (gravityEnabled) {
      solverRef.current.wakeDownstream(
        selectedBone.name,
        !groundEnabled || computeSkinnedMinY() > 0.03
      );
      solverAwakeRef.current = true;
      invalidate();
    }
  }, [
    instance,
    record.id,
    record.groundSnapEnabled,
    selectedBone,
    selectedSpec,
    jointLimitsEnabled,
    groundEnabled,
    gravityEnabled,
    onBoneAnglesChange,
    recomputeGroundOffset,
    syncHitboxPositions,
    computeSkinnedMinY,
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
        onClick={(event: { stopPropagation: () => void }) => {
          if (!record.visible) return;
          if (
            dragGuardRef.current.isDragging ||
            performance.now() - dragGuardRef.current.lastDragEndTime < 200
          ) {
            return;
          }
          onClearPropSelection();
          if (!isActive) {
            event.stopPropagation();
            onSelectMannequin(record.id);
            invalidate();
          }
        }}
      />

      {showInteractive && (
        <>
          <group name="mortal-mesh-hitboxes">
            {visibleBones.map((bone) => {
              const isSelected =
                !moveBodyEnabled && selectedBone?.name === bone.name;
              const isHovered = hoveredBoneName === bone.name;
              const isPinned = pinnedSet.has(bone.name);
              const radius = getJointHitboxRadius(bone.name);
              const scale = isSelected
                ? 1.25
                : isHovered || isPinned
                  ? 1.15
                  : 1;
              const color = isSelected
                ? hitboxColors.selectedColor
                : isPinned
                  ? hitboxColors.pinnedColor
                  : isHovered
                    ? hitboxColors.hoverColor
                    : hitboxColors.idleColor;
              const opacity = isSelected
                ? hitboxColors.selectedOpacity
                : isHovered
                  ? hitboxColors.hoverOpacity
                  : isPinned
                    ? hitboxColors.pinnedOpacity
                    : hitboxColors.idleOpacity;

              const handleBoneOver = (event: { stopPropagation: () => void }) => {
                event.stopPropagation();
                setHoveredBoneName(bone.name);
                invalidate();
              };
              const handleBoneOut = (event: { stopPropagation: () => void }) => {
                event.stopPropagation();
                setHoveredBoneName((prev) =>
                  prev === bone.name ? null : prev
                );
                invalidate();
              };
              const handleBoneClick = (event: { stopPropagation: () => void }) => {
                event.stopPropagation();
                onClearPropSelection();
                onMoveBodyChange(false);
                setSelectedIKHandle(null);
                onSelectIKHandleChangeRef.current(null);
                setSelectedBone(bone);
                const restQuat = instance.restQuaternions.get(bone.name);
                const spec = getJointSpec(bone.name);
                const currentAngles = restQuat
                  ? readBoneDeltaDegrees(bone, restQuat, spec)
                  : ZERO_JOINT_ANGLES;
                onSelectBoneChangeRef.current(bone.name, currentAngles);
                invalidate();
              };

              if (isCoarsePointer) {
                const colliderRadius =
                  radius < 0.02 ? radius * 2.4 : radius * 2.1;
                return (
                  <group
                    key={bone.name}
                    ref={(obj) => {
                      if (obj) {
                        hitboxRefs.current.set(bone.name, obj);
                      } else {
                        hitboxRefs.current.delete(bone.name);
                      }
                    }}
                  >
                    <mesh scale={scale} renderOrder={10}>
                      <sphereGeometry args={[radius, 12, 12]} />
                      <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={opacity}
                        depthTest={false}
                      />
                    </mesh>
                    <mesh
                      renderOrder={9}
                      onPointerOver={handleBoneOver}
                      onPointerOut={handleBoneOut}
                      onClick={handleBoneClick}
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
              }

              return (
                <mesh
                  key={bone.name}
                  ref={(mesh) => {
                    if (mesh) {
                      hitboxRefs.current.set(bone.name, mesh);
                    } else {
                      hitboxRefs.current.delete(bone.name);
                    }
                  }}
                  scale={scale}
                  renderOrder={10}
                  onPointerOver={handleBoneOver}
                  onPointerOut={handleBoneOut}
                  onClick={handleBoneClick}
                >
                  <sphereGeometry args={[radius, 12, 12]} />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={opacity}
                    depthTest={false}
                  />
                </mesh>
              );
            })}
          </group>

          {showIKHandles && (
            <group name="mortal-mesh-ik-handles">
              {IK_HANDLE_ORDER.map((handleId) => {
                const isSelected =
                  !moveBodyEnabled && selectedIKHandle === handleId;
                const isHovered = hoveredIKHandle === handleId;
                const isPelvis = handleId === 'pelvis';
                const diamondRadius = isPelvis ? 0.044 : 0.034;
                const ringRadius = isPelvis ? 0.062 : 0.05;
                const colliderRadius = isCoarsePointer ? 0.095 : 0.056;
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
                        opacity={isSelected ? 0.96 : isHovered ? 0.92 : 0.74}
                        depthTest={false}
                      />
                    </mesh>
                    <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={11}>
                      <torusGeometry args={[ringRadius, 0.0055, 8, 24]} />
                      <meshBasicMaterial
                        color={hitboxColors.ikRingColor}
                        transparent
                        opacity={isSelected ? 0.95 : isHovered ? 0.85 : 0.54}
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
                        setSelectedBone(null);
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
              selectedBone &&
              selectedSpec && (
                <TransformControls
                  key={`gizmo-rotate-bone-${record.id}`}
                  ref={transformRef}
                  object={selectedBone}
                  mode="rotate"
                  space="local"
                  showX={jointLimitsEnabled ? selectedSpec.showX : true}
                  showY={jointLimitsEnabled ? selectedSpec.showY : true}
                  showZ={jointLimitsEnabled ? selectedSpec.showZ : true}
                  size={
                    getJointHitboxRadius(selectedBone.name) < 0.02
                      ? isCoarsePointer
                        ? 0.42
                        : 0.28
                      : isCoarsePointer
                        ? 0.72
                        : 0.55
                  }
                  onObjectChange={handleTransformObjectChange}
                  onChange={() => invalidate()}
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
}: AnatomyModelProps) {
  const [template, setTemplate] = useState<MannequinTemplate | null>(null);
  const [loadError, setLoadError] = useState(false);
  const dragGuardRef = useRef<DragGuardState>({
    isDragging: false,
    lastDragEndTime: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    gltfLoader.load(
      '/models/anatomy.glb',
      (gltf) => {
        if (!isMounted) {
          dracoLoader.dispose();
          return;
        }

        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
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

        let classicMainColor: THREE.Color | null = null;
        let classicMainRoughness = 0.5;
        let classicJointsColor: THREE.Color | null = null;
        let classicJointsRoughness = 0.5;

        gltf.scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!(mesh.isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh)) {
            return;
          }
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const mat of mats) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              if (mat.name === 'M_Main' && !classicMainColor) {
                classicMainColor = mat.color.clone();
                classicMainRoughness = mat.roughness;
              } else if (mat.name === 'M_Joints' && !classicJointsColor) {
                classicJointsColor = mat.color.clone();
                classicJointsRoughness = mat.roughness;
              }
            }
          }
        });

        setTemplate({
          scene: gltf.scene,
          fitScale,
          sceneOffset,
          classicMainColor,
          classicMainRoughness,
          classicJointsColor,
          classicJointsRoughness,
        });
        dracoLoader.dispose();
      },
      undefined,
      (error) => {
        if (isMounted) {
          console.error('Failed to load /models/anatomy.glb:', error);
          setLoadError(true);
        }
        dracoLoader.dispose();
      }
    );

    return () => {
      isMounted = false;
      dracoLoader.dispose();
    };
  }, []);

  if (!template) {
    const themeSpec = STUDIO_THEMES[studioTheme];
    return (
      <Html position={[0, 1, 0]} center>
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl px-4 py-2 text-xs font-mono font-semibold uppercase tracking-[0.16em] whitespace-nowrap select-none ${themeSpec.ui.loadingBadge}`}
        >
          {loadError ? 'FAILED TO LOAD MANNEQUIN' : 'LOADING MANNEQUIN...'}
        </div>
      </Html>
    );
  }

  return (
    <group>
      {mannequins.map((record) => (
        <MannequinInstance
          key={`${sceneLoadId}-${record.id}`}
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
        />
      ))}
    </group>
  );
}
