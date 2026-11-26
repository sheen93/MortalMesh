'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, Grid } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import { AnatomyModel } from '@/components/AnatomyModel';
import {
  CurvilinearLens,
  type CurvilinearRenderHook,
} from '@/components/CurvilinearLens';
import { PerspectiveGuides } from '@/components/PerspectiveGuides';
import { StudioProps } from '@/components/StudioProps';
import { ViewportGizmo } from '@/components/ViewportGizmo';
import { STUDIO_THEMES, type StudioThemeSpec } from '@/data/studioThemes';
import type { ViewportProfile } from '@/hooks/useViewportProfile';
import {
  CAMERA_PRESETS,
  isFisheyePreset,
  type CameraPreset,
  type ContextualAnchor,
  type DampingPreset,
  type ElevationCommand,
  type IKHandleId,
  type JointAngleCommand,
  type JointAngles,
  type JointsDisplayMode,
  type KeyLightSettings,
  type PoseControlMode,
  type PosePresetCommand,
  type SnapshotBridge,
  type SnapshotOptions,
  type SnapshotResult,
  type StudioThemeId,
} from '@/types/anatomy';
import type { PoseBridge, PoseSnapshot } from '@/types/poseIO';
import {
  getFisheyeOptics,
  getFisheyeReferenceDistance,
} from '@/utils/lensWarp';
import type {
  PropDropCommand,
  PropTransformMode,
  StudioProp,
} from '@/types/props';
import type { MannequinRecord } from '@/types/scene';
import type {
  CameraBookmark,
  CameraBridge,
  CameraViewState,
} from '@/types/sceneIO';
import { formatPoseTimestamp } from '@/utils/poseSerialization';

interface StudioCanvasProps {
  mannequins: readonly MannequinRecord[];
  activeMannequinId: string;
  sceneLoadId: number;
  studioTheme: StudioThemeId;
  activePreset: CameraPreset;
  lensCurvature: number;
  showPerspectiveGuides: boolean;
  snapTrigger: number;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onChangeLensCurvature: (value: number) => void;
  onTogglePerspectiveGuides: (enabled: boolean) => void;
  isDragging: boolean;
  onDraggingChange: (isDragging: boolean) => void;
  jointsDisplay: JointsDisplayMode;
  controlMode: PoseControlMode;
  jointLimitsEnabled: boolean;
  jointAngleCommand: JointAngleCommand | null;
  groundEnabled: boolean;
  elevationCommand: ElevationCommand | null;
  dropToFloorTrigger: number;
  moveBodyEnabled: boolean;
  posePresetCommand: PosePresetCommand | null;
  gravityEnabled: boolean;
  dampingPreset: DampingPreset;
  resetTrigger: number;
  externalDeselectTrigger: number;
  keyLight: KeyLightSettings;
  studioProps: readonly StudioProp[];
  selectedPropId: string | null;
  propTransformMode: PropTransformMode;
  dropPropToFloorCommand: PropDropCommand | null;
  bookmarks: readonly CameraBookmark[];
  viewport: ViewportProfile;
  isHudMinimized?: boolean;
  onCanvasBackgroundTap?: () => void;
  onSelectMannequin: (id: string) => void;
  onSelectBoneChange: (boneName: string | null, angles: JointAngles) => void;
  onSelectIKHandleChange: (handleId: IKHandleId | null) => void;
  onBoneAnglesChange: (angles: JointAngles) => void;
  onElevationSync: (id: string, elevationY: number) => void;
  onMoveBodyChange: (enabled: boolean) => void;
  onSelectProp: (id: string | null) => void;
  onUpdatePropTransform: (
    id: string,
    patch: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  ) => void;
  onAddBookmark: () => void;
  onSelectBookmark: (bookmark: CameraBookmark) => void;
  onDeleteBookmark: (id: string) => void;
  cameraRestSeq: number;
  ikPinFeet: boolean;
  ikSwivelByHandle: Record<Exclude<IKHandleId, 'pelvis'>, number>;
  onMannequinBridgeChange: (id: string, bridge: PoseBridge | null) => void;
  onInitialPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onCommitPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onMannequinAnchorChange: (anchor: ContextualAnchor | null) => void;
  onPropAnchorChange: (anchor: ContextualAnchor | null) => void;
  onCameraRest: () => void;
  onSnapshotBridgeReady: (bridge: SnapshotBridge | null) => void;
  onCameraBridgeReady: (bridge: CameraBridge | null) => void;
}

const KEY_LIGHT_RADIUS = 7;

function formatMatrixNum(value: number): string {
  return Math.abs(value) < 1e-6 ? '0' : value.toFixed(6);
}

const FILL_LIGHT_POS: [number, number, number] = [-5, 4, 3];
const RIM_LIGHT_POS: [number, number, number] = [0, 6, -6];

const StudioLighting = memo(function StudioLighting({
  theme,
  keyLight,
}: {
  theme: StudioThemeSpec;
  keyLight: KeyLightSettings;
}) {
  const { invalidate } = useThree();
  const { lighting } = theme;

  const keyLightTarget = useMemo(() => {
    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, 1, 0);
    return targetObj;
  }, []);

  const keyPosition = useMemo<[number, number, number]>(() => {
    const azRad = THREE.MathUtils.degToRad(keyLight.azimuth);
    const elRad = THREE.MathUtils.degToRad(keyLight.elevation);
    const horiz = KEY_LIGHT_RADIUS * Math.cos(elRad);
    return [
      horiz * Math.sin(azRad),
      1 + KEY_LIGHT_RADIUS * Math.sin(elRad),
      horiz * Math.cos(azRad),
    ];
  }, [keyLight.azimuth, keyLight.elevation]);

  const hemisphereArgs = useMemo<[string, string, number]>(
    () => [
      lighting.hemisphereSky,
      lighting.hemisphereGround,
      lighting.hemisphereIntensity,
    ],
    [
      lighting.hemisphereSky,
      lighting.hemisphereGround,
      lighting.hemisphereIntensity,
    ]
  );

  useEffect(() => {
    keyLightTarget.updateMatrixWorld();
    invalidate();
  }, [
    keyLight.azimuth,
    keyLight.elevation,
    keyLight.intensity,
    theme,
    keyLightTarget,
    invalidate,
  ]);

  return (
    <>
      <ambientLight intensity={lighting.ambient} color="#ffffff" />
      <hemisphereLight args={hemisphereArgs} />
      <primitive object={keyLightTarget} />
      <directionalLight
        position={keyPosition}
        target={keyLightTarget}
        intensity={keyLight.intensity}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.5}
        shadow-camera-bottom={-3.5}
        shadow-camera-near={0.5}
        shadow-camera-far={25}
      />
      <directionalLight
        position={FILL_LIGHT_POS}
        intensity={lighting.fill}
        color="#ffffff"
      />
      <directionalLight
        position={RIM_LIGHT_POS}
        intensity={lighting.rim}
        color="#ffffff"
      />
    </>
  );
});

interface SnapshotExporterProps {
  floorGroupRef: RefObject<THREE.Group>;
  curvilinearRenderRef: MutableRefObject<CurvilinearRenderHook | null>;
  onSnapshotBridgeReady: (bridge: SnapshotBridge | null) => void;
}

function SnapshotExporter({
  floorGroupRef,
  curvilinearRenderRef,
  onSnapshotBridgeReady,
}: SnapshotExporterProps) {
  const { gl, scene, camera, invalidate } = useThree();

  const captureSnapshot = useCallback(
    (options: SnapshotOptions): SnapshotResult | null => {
      const visibilityBackup: Array<{ obj: THREE.Object3D; visible: boolean }> =
        [];
      const seen = new Set<THREE.Object3D>();

      const hideObject = (obj: THREE.Object3D | null | undefined) => {
        if (!obj || seen.has(obj)) return;
        seen.add(obj);
        visibilityBackup.push({ obj, visible: obj.visible });
        obj.visible = false;
      };

      scene.traverse((child) => {
        if (
          child.name === 'mortal-mesh-hitboxes' ||
          child.name === 'mortal-mesh-ik-handles' ||
          child.name === 'mortal-mesh-gizmo' ||
          child.name === 'mortal-mesh-prop-gizmo' ||
          child.type === 'TransformControls'
        ) {
          hideObject(child);
        }
      });

      if (options.transparent) {
        hideObject(floorGroupRef.current);
      }

      const prevBackground = scene.background;
      const prevFog = scene.fog;
      const prevClearAlpha = gl.getClearAlpha();
      const prevPixelRatio = gl.getPixelRatio();
      const targetPixelRatio =
        options.scale === 2
          ? Math.min(Math.max(window.devicePixelRatio * 2, 2), 3)
          : Math.min(window.devicePixelRatio || 1, 2);

      let dataUrl = '';
      let width = gl.domElement.width;
      let height = gl.domElement.height;

      try {
        if (options.transparent) {
          scene.background = null;
          scene.fog = null;
          gl.setClearAlpha(0);
        }

        if (Math.abs(targetPixelRatio - prevPixelRatio) > 1e-3) {
          gl.setPixelRatio(targetPixelRatio);
        }

        if (curvilinearRenderRef.current) {
          curvilinearRenderRef.current(
            gl.domElement.width,
            gl.domElement.height,
            options.transparent
          );
        } else {
          gl.render(scene, camera);
        }
        width = gl.domElement.width;
        height = gl.domElement.height;
        dataUrl = gl.domElement.toDataURL('image/png');
      } finally {
        for (const entry of visibilityBackup) {
          entry.obj.visible = entry.visible;
        }
        scene.background = prevBackground;
        scene.fog = prevFog;
        gl.setClearAlpha(prevClearAlpha);
        if (Math.abs(gl.getPixelRatio() - prevPixelRatio) > 1e-3) {
          gl.setPixelRatio(prevPixelRatio);
        }
        if (curvilinearRenderRef.current) {
          curvilinearRenderRef.current(
            gl.domElement.width,
            gl.domElement.height,
            false
          );
        } else {
          gl.render(scene, camera);
        }
        invalidate();
      }

      if (!dataUrl) return null;

      const prefix = options.transparent
        ? 'mortal-mesh-cutout'
        : 'mortal-mesh-studio';
      const filename = `${prefix}-${formatPoseTimestamp()}.png`;

      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      return { filename, width, height };
    },
    [gl, scene, camera, invalidate, floorGroupRef, curvilinearRenderRef]
  );

  useEffect(() => {
    onSnapshotBridgeReady({ captureSnapshot });
    return () => onSnapshotBridgeReady(null);
  }, [captureSnapshot, onSnapshotBridgeReady]);

  return null;
}

function roundCam3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) || Math.abs(rounded) < 1e-4 ? 0 : rounded;
}

interface CameraRigProps {
  controlsRef: RefObject<ComponentRef<typeof CameraControls>>;
  viewCubeRef: RefObject<HTMLDivElement>;
  invalidateRef: MutableRefObject<(() => void) | null>;
  activePreset: CameraPreset;
  lensCurvature: number;
  snapTrigger: number;
  isDragging: boolean;
  onCameraRest: () => void;
  onCameraBridgeReady: (bridge: CameraBridge | null) => void;
}

function CameraRig({
  controlsRef,
  viewCubeRef,
  invalidateRef,
  activePreset,
  lensCurvature,
  snapTrigger,
  isDragging,
  onCameraRest,
  onCameraBridgeReady,
}: CameraRigProps) {
  const { camera, invalidate } = useThree();
  const hasMountedRef = useRef(false);
  const lastTransformRef = useRef('');
  const activePresetRef = useRef<CameraPreset>(activePreset);
  activePresetRef.current = activePreset;
  const lensCurvatureRef = useRef<number>(lensCurvature);
  lensCurvatureRef.current = lensCurvature;
  const onCameraRestRef = useRef(onCameraRest);
  onCameraRestRef.current = onCameraRest;
  const prevPresetRef = useRef<CameraPreset>(activePreset);
  const prevFisheyeRefDistRef = useRef<number>(
    getFisheyeReferenceDistance(lensCurvature)
  );

  useEffect(() => {
    invalidateRef.current = invalidate;
    return () => {
      invalidateRef.current = null;
    };
  }, [invalidate, invalidateRef]);

  const syncViewCube = useCallback(() => {
    const cubeEl = viewCubeRef.current;
    if (!cubeEl) return;

    const e = camera.matrixWorldInverse.elements;
    const transform = `matrix3d(${formatMatrixNum(e[0])},${formatMatrixNum(-e[1])},${formatMatrixNum(e[2])},0,${formatMatrixNum(-e[4])},${formatMatrixNum(e[5])},${formatMatrixNum(-e[6])},0,${formatMatrixNum(e[8])},${formatMatrixNum(-e[9])},${formatMatrixNum(e[10])},0,0,0,0,1)`;

    if (transform !== lastTransformRef.current) {
      lastTransformRef.current = transform;
      cubeEl.style.transform = transform;
    }
  }, [camera, viewCubeRef]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.touches.one = CameraControlsImpl.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = CameraControlsImpl.ACTION.TOUCH_TRUCK;
  }, [controlsRef]);

  useEffect(() => {
    const bridge: CameraBridge = {
      getView: () => {
        const controls = controlsRef.current;
        if (!controls) return null;
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        controls.getPosition(pos);
        controls.getTarget(tgt);
        return {
          position: [roundCam3(pos.x), roundCam3(pos.y), roundCam3(pos.z)],
          target: [roundCam3(tgt.x), roundCam3(tgt.y), roundCam3(tgt.z)],
        };
      },
      setView: (view: CameraViewState, animate = true) => {
        const controls = controlsRef.current;
        if (!controls) return;
        const allNums = [...view.position, ...view.target];
        if (allNums.some((n) => !Number.isFinite(n))) return;

        void controls.setLookAt(
          view.position[0],
          view.position[1],
          view.position[2],
          view.target[0],
          view.target[1],
          view.target[2],
          animate
        );
        camera.updateMatrixWorld();
        syncViewCube();
        invalidate();
      },
      invalidateView: () => invalidate(),
    };

    onCameraBridgeReady(bridge);
    return () => onCameraBridgeReady(null);
  }, [camera, controlsRef, invalidate, syncViewCube, onCameraBridgeReady]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleRest = () => {
      onCameraRestRef.current();
    };
    controls.addEventListener('rest', handleRest);
    return () => {
      controls.removeEventListener('rest', handleRest);
    };
  }, [controlsRef]);

  useEffect(() => {
    let settleTimer: number | null = null;
    const isFisheye = isFisheyePreset(activePreset);
    const nextRefDist = getFisheyeReferenceDistance(lensCurvature);

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const persp = camera as THREE.PerspectiveCamera;
      const nextFov = isFisheye
        ? getFisheyeOptics(lensCurvature).fov
        : CAMERA_PRESETS[activePreset].fov;
      if (Math.abs(persp.fov - nextFov) > 1e-3) {
        persp.fov = nextFov;
        persp.updateProjectionMatrix();
        invalidate();
      }
    }

    if (
      isFisheye &&
      prevPresetRef.current === 'fisheye' &&
      Math.abs(nextRefDist - prevFisheyeRefDistRef.current) > 1e-4 &&
      controlsRef.current
    ) {
      const controls = controlsRef.current;
      const pos = new THREE.Vector3();
      const tgt = new THREE.Vector3();
      controls.getPosition(pos);
      controls.getTarget(tgt);
      const currDist = pos.distanceTo(tgt);
      const ratio = nextRefDist / prevFisheyeRefDistRef.current;
      const newDist = THREE.MathUtils.clamp(currDist * ratio, 1.0, 15.0);
      const dir = pos.sub(tgt);
      if (dir.lengthSq() < 1e-6) {
        dir.set(0, 0, 1);
      } else {
        dir.normalize();
      }

      void controls.setLookAt(
        tgt.x + dir.x * newDist,
        tgt.y + dir.y * newDist,
        tgt.z + dir.z * newDist,
        tgt.x,
        tgt.y,
        tgt.z,
        false
      );
      camera.updateMatrixWorld();
      syncViewCube();
      invalidate();

      settleTimer = window.setTimeout(() => {
        onCameraRestRef.current();
      }, 140);
    } else if (prevPresetRef.current !== activePreset) {
      settleTimer = window.setTimeout(() => {
        onCameraRestRef.current();
      }, 140);
    }

    prevFisheyeRefDistRef.current = nextRefDist;
    prevPresetRef.current = activePreset;

    return () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
    };
  }, [activePreset, lensCurvature, camera, controlsRef, invalidate, syncViewCube]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const preset = activePresetRef.current;
    const { position, target } = CAMERA_PRESETS[preset];
    const shouldAnimate = hasMountedRef.current;
    hasMountedRef.current = true;

    let nextPosX = position[0];
    let nextPosY = position[1];
    let nextPosZ = position[2];

    if (isFisheyePreset(preset)) {
      const refDist = getFisheyeReferenceDistance(lensCurvatureRef.current);
      prevFisheyeRefDistRef.current = refDist;
      const dir = new THREE.Vector3(
        position[0] - target[0],
        position[1] - target[1],
        position[2] - target[2]
      );
      if (dir.lengthSq() < 1e-6) {
        dir.set(0, 0, 1);
      } else {
        dir.normalize();
      }
      nextPosX = target[0] + dir.x * refDist;
      nextPosY = target[1] + dir.y * refDist;
      nextPosZ = target[2] + dir.z * refDist;
    }

    void controls.setLookAt(
      nextPosX,
      nextPosY,
      nextPosZ,
      target[0],
      target[1],
      target[2],
      shouldAnimate
    );
    camera.updateMatrixWorld();
    syncViewCube();
    invalidate();
  }, [snapTrigger, camera, controlsRef, invalidate, syncViewCube]);

  useFrame(() => {
    syncViewCube();
  });

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      enabled={!isDragging}
      minDistance={isFisheyePreset(activePreset) ? 1.0 : 1.5}
      maxDistance={15}
      smoothTime={0.35}
      onChange={() => syncViewCube()}
    />
  );
}

const FLOOR_GRID_POS: [number, number, number] = [0, 0.001, 0];
const FLOOR_GRID_ARGS: [number, number] = [30, 30];
const FLOOR_SHADOW_POS: [number, number, number] = [0, 0, 0];
const FLOOR_SHADOW_ROT: [number, number, number] = [-Math.PI / 2, 0, 0];
const FLOOR_SHADOW_ARGS: [number, number] = [100, 100];
const ORIGIN_AXIS_POS: [number, number, number] = [0, 0.002, 0];
const ORIGIN_AXIS_X_ARGS: [number, number, number] = [1.2, 0.001, 0.004];
const ORIGIN_AXIS_Z_ARGS: [number, number, number] = [0.004, 0.001, 1.2];

const InfiniteStudioFloor = memo(function InfiniteStudioFloor({
  groupRef,
  theme,
  groundEnabled,
}: {
  groupRef: RefObject<THREE.Group>;
  theme: StudioThemeSpec;
  groundEnabled: boolean;
}) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidate();
  }, [theme, groundEnabled, invalidate]);

  return (
    <group ref={groupRef} name="mortal-mesh-floor">
      {groundEnabled && (
        <>
          <Grid
            position={FLOOR_GRID_POS}
            args={FLOOR_GRID_ARGS}
            infiniteGrid
            fadeDistance={24}
            fadeStrength={2.2}
            cellSize={0.25}
            sectionSize={1.0}
            cellThickness={0.55}
            sectionThickness={1.0}
            cellColor={theme.gridCellColor}
            sectionColor={theme.gridSectionColor}
            side={THREE.DoubleSide}
          />
          <mesh
            position={FLOOR_SHADOW_POS}
            rotation={FLOOR_SHADOW_ROT}
            receiveShadow
          >
            <planeGeometry args={FLOOR_SHADOW_ARGS} />
            <shadowMaterial
              transparent
              opacity={theme.shadowOpacity}
              color="#000000"
            />
          </mesh>
        </>
      )}

      {/* Subtle CAD origin axis marker */}
      <mesh position={ORIGIN_AXIS_POS}>
        <boxGeometry args={ORIGIN_AXIS_X_ARGS} />
        <meshBasicMaterial
          color={
            groundEnabled ? theme.originAxisColor : theme.originAxisMutedColor
          }
          transparent
          opacity={groundEnabled ? 0.55 : 0.25}
        />
      </mesh>
      <mesh position={ORIGIN_AXIS_POS}>
        <boxGeometry args={ORIGIN_AXIS_Z_ARGS} />
        <meshBasicMaterial
          color={
            groundEnabled ? theme.originAxisColor : theme.originAxisMutedColor
          }
          transparent
          opacity={groundEnabled ? 0.55 : 0.25}
        />
      </mesh>
    </group>
  );
});

interface StageReferenceProps {
  mannequins: readonly MannequinRecord[];
  activeMannequinId: string;
  sceneLoadId: number;
  studioTheme: StudioThemeId;
  theme: StudioThemeSpec;
  floorGroupRef: RefObject<THREE.Group>;
  jointsDisplay: JointsDisplayMode;
  controlMode: PoseControlMode;
  jointLimitsEnabled: boolean;
  jointAngleCommand: JointAngleCommand | null;
  groundEnabled: boolean;
  elevationCommand: ElevationCommand | null;
  dropToFloorTrigger: number;
  moveBodyEnabled: boolean;
  posePresetCommand: PosePresetCommand | null;
  gravityEnabled: boolean;
  dampingPreset: DampingPreset;
  resetTrigger: number;
  deselectTrigger: number;
  studioProps: readonly StudioProp[];
  selectedPropId: string | null;
  propTransformMode: PropTransformMode;
  dropPropToFloorCommand: PropDropCommand | null;
  propDragGuardRef: MutableRefObject<{ isDragging: boolean; lastDragEndTime: number }>;
  isCoarsePointer: boolean;
  activePreset: CameraPreset;
  lensCurvature: number;
  cameraRestSeq: number;
  ikPinFeet: boolean;
  ikSwivelByHandle: Record<Exclude<IKHandleId, 'pelvis'>, number>;
  onSelectMannequin: (id: string) => void;
  onDraggingChange: (isDragging: boolean) => void;
  onSelectBoneChange: (boneName: string | null, angles: JointAngles) => void;
  onSelectIKHandleChange: (handleId: IKHandleId | null) => void;
  onBoneAnglesChange: (angles: JointAngles) => void;
  onElevationSync: (id: string, elevationY: number) => void;
  onMoveBodyChange: (enabled: boolean) => void;
  onSelectProp: (id: string | null) => void;
  onUpdatePropTransform: (
    id: string,
    patch: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  ) => void;
  onMannequinBridgeChange: (id: string, bridge: PoseBridge | null) => void;
  onInitialPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onCommitPoseSnapshot: (id: string, snapshot: PoseSnapshot) => void;
  onMannequinAnchorChange: (anchor: ContextualAnchor | null) => void;
  onPropAnchorChange: (anchor: ContextualAnchor | null) => void;
}

const StageReference = memo(function StageReference({
  mannequins,
  activeMannequinId,
  sceneLoadId,
  studioTheme,
  theme,
  floorGroupRef,
  jointsDisplay,
  controlMode,
  jointLimitsEnabled,
  jointAngleCommand,
  groundEnabled,
  elevationCommand,
  dropToFloorTrigger,
  moveBodyEnabled,
  posePresetCommand,
  gravityEnabled,
  dampingPreset,
  resetTrigger,
  deselectTrigger,
  studioProps,
  selectedPropId,
  propTransformMode,
  dropPropToFloorCommand,
  propDragGuardRef,
  isCoarsePointer,
  activePreset,
  lensCurvature,
  cameraRestSeq,
  ikPinFeet,
  ikSwivelByHandle,
  onSelectMannequin,
  onDraggingChange,
  onSelectBoneChange,
  onSelectIKHandleChange,
  onBoneAnglesChange,
  onElevationSync,
  onMoveBodyChange,
  onSelectProp,
  onUpdatePropTransform,
  onMannequinBridgeChange,
  onInitialPoseSnapshot,
  onCommitPoseSnapshot,
  onMannequinAnchorChange,
  onPropAnchorChange,
}: StageReferenceProps) {
  const handleClearPropSelection = useCallback(
    () => onSelectProp(null),
    [onSelectProp]
  );
  const handleSelectPropForward = useCallback(
    (id: string | null) => onSelectProp(id),
    [onSelectProp]
  );

  return (
    <group>
      <AnatomyModel
        mannequins={mannequins}
        activeMannequinId={activeMannequinId}
        sceneLoadId={sceneLoadId}
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
        onSelectMannequin={onSelectMannequin}
        onDraggingChange={onDraggingChange}
        onSelectBoneChange={onSelectBoneChange}
        onSelectIKHandleChange={onSelectIKHandleChange}
        onBoneAnglesChange={onBoneAnglesChange}
        onElevationSync={onElevationSync}
        onMoveBodyChange={onMoveBodyChange}
        onClearPropSelection={handleClearPropSelection}
        onMannequinBridgeChange={onMannequinBridgeChange}
        onInitialPoseSnapshot={onInitialPoseSnapshot}
        onCommitPoseSnapshot={onCommitPoseSnapshot}
        onContextualAnchorChange={onMannequinAnchorChange}
      />

      <StudioProps
        propsList={studioProps}
        selectedPropId={selectedPropId}
        propTransformMode={propTransformMode}
        studioTheme={studioTheme}
        groundEnabled={groundEnabled}
        dropPropToFloorCommand={dropPropToFloorCommand}
        dragGuardRef={propDragGuardRef}
        activePreset={activePreset}
        lensCurvature={lensCurvature}
        cameraRestSeq={cameraRestSeq}
        onSelectProp={handleSelectPropForward}
        onUpdatePropTransform={onUpdatePropTransform}
        onDraggingChange={onDraggingChange}
        onPropAnchorChange={onPropAnchorChange}
      />

      <InfiniteStudioFloor
        groupRef={floorGroupRef}
        theme={theme}
        groundEnabled={groundEnabled}
      />
    </group>
  );
});

export function StudioCanvas({
  mannequins,
  activeMannequinId,
  sceneLoadId,
  studioTheme,
  activePreset,
  lensCurvature,
  showPerspectiveGuides,
  snapTrigger,
  onSelectCameraPreset,
  onChangeLensCurvature,
  onTogglePerspectiveGuides,
  isDragging,
  onDraggingChange,
  jointsDisplay,
  controlMode,
  jointLimitsEnabled,
  jointAngleCommand,
  groundEnabled,
  elevationCommand,
  dropToFloorTrigger,
  moveBodyEnabled,
  posePresetCommand,
  gravityEnabled,
  dampingPreset,
  resetTrigger,
  externalDeselectTrigger,
  keyLight,
  studioProps,
  selectedPropId,
  propTransformMode,
  dropPropToFloorCommand,
  bookmarks,
  viewport,
  isHudMinimized = false,
  onCanvasBackgroundTap,
  onSelectMannequin,
  onSelectBoneChange,
  onSelectIKHandleChange,
  onBoneAnglesChange,
  onElevationSync,
  onMoveBodyChange,
  onSelectProp,
  onUpdatePropTransform,
  onAddBookmark,
  onSelectBookmark,
  onDeleteBookmark,
  cameraRestSeq,
  ikPinFeet,
  ikSwivelByHandle,
  onMannequinBridgeChange,
  onInitialPoseSnapshot,
  onCommitPoseSnapshot,
  onMannequinAnchorChange,
  onPropAnchorChange,
  onCameraRest,
  onSnapshotBridgeReady,
  onCameraBridgeReady,
}: StudioCanvasProps) {
  const [deselectTrigger, setDeselectTrigger] = useState(0);
  const controlsRef = useRef<ComponentRef<typeof CameraControls>>(null);
  const viewCubeRef = useRef<HTMLDivElement>(null);
  const floorGroupRef = useRef<THREE.Group>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const curvilinearRenderRef = useRef<CurvilinearRenderHook | null>(null);
  const propDragGuardRef = useRef({ isDragging: false, lastDragEndTime: 0 });
  const bgTapRef = useRef<{
    activePointers: Set<number>;
    primaryId: number | null;
    startX: number;
    startY: number;
    maxTravel: number;
    multiTouch: boolean;
  }>({
    activePointers: new Set(),
    primaryId: null,
    startX: 0,
    startY: 0,
    maxTravel: 0,
    multiTouch: false,
  });
  const theme = STUDIO_THEMES[studioTheme];
  const canvasBgArgs = useMemo<[string]>(() => [theme.bg], [theme.bg]);
  const canvasFogArgs = useMemo<[string, number, number]>(
    () => [theme.bg, theme.fogNear, theme.fogFar],
    [theme.bg, theme.fogNear, theme.fogFar]
  );

  const handleSelectViewCubeFace = useCallback(
    (direction: [number, number, number]) => {
      const controls = controlsRef.current;
      if (!controls) return;

      const targetVec = new THREE.Vector3();
      controls.getTarget(targetVec);
      const dist = Math.max(1.15, controls.distance);
      const dir = new THREE.Vector3(
        direction[0],
        direction[1],
        direction[2]
      ).normalize();

      void controls.setLookAt(
        targetVec.x + dir.x * dist,
        targetVec.y + dir.y * dist,
        targetVec.z + dir.z * dist,
        targetVec.x,
        targetVec.y,
        targetVec.z,
        true
      );
      invalidateRef.current?.();
    },
    []
  );

  const handleViewCubeOrbitDrag = useCallback((dx: number, dy: number) => {
    const controls = controlsRef.current;
    if (!controls) return;

    void controls.rotate(-dx * 0.011, -dy * 0.011, false);
    invalidateRef.current?.();
  }, []);

  return (
    <div
      className="studio-canvas-shell relative h-full w-full transition-colors duration-200"
      style={{ backgroundColor: theme.bg }}
      onPointerDownCapture={(e) => {
        const tap = bgTapRef.current;
        tap.activePointers.add(e.pointerId);
        if (tap.activePointers.size > 1) {
          tap.multiTouch = true;
        } else {
          tap.primaryId = e.pointerId;
          tap.startX = e.clientX;
          tap.startY = e.clientY;
          tap.maxTravel = 0;
          tap.multiTouch = false;
        }
      }}
      onPointerMoveCapture={(e) => {
        const tap = bgTapRef.current;
        if (e.pointerId === tap.primaryId) {
          const dist = Math.hypot(
            e.clientX - tap.startX,
            e.clientY - tap.startY
          );
          if (dist > tap.maxTravel) {
            tap.maxTravel = dist;
          }
        }
      }}
      onPointerUpCapture={(e) => {
        const tap = bgTapRef.current;
        if (e.pointerId === tap.primaryId) {
          const dist = Math.hypot(
            e.clientX - tap.startX,
            e.clientY - tap.startY
          );
          if (dist > tap.maxTravel) {
            tap.maxTravel = dist;
          }
        }
        tap.activePointers.delete(e.pointerId);
      }}
      onPointerCancelCapture={(e) => {
        bgTapRef.current.activePointers.delete(e.pointerId);
      }}
    >
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 1, 6], fov: 40, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {
          const tap = bgTapRef.current;
          const isCleanTap =
            !isDragging &&
            !propDragGuardRef.current.isDragging &&
            performance.now() - propDragGuardRef.current.lastDragEndTime >=
              220 &&
            !tap.multiTouch &&
            tap.maxTravel < 8;
          setDeselectTrigger((prev) => prev + 1);
          if (
            !propDragGuardRef.current.isDragging &&
            performance.now() - propDragGuardRef.current.lastDragEndTime >= 200
          ) {
            onSelectProp(null);
          }
          if (isCleanTap) {
            onCanvasBackgroundTap?.();
          }
        }}
      >
        <color attach="background" args={canvasBgArgs} />
        <fog attach="fog" args={canvasFogArgs} />
        <StudioLighting theme={theme} keyLight={keyLight} />
        <CameraRig
          controlsRef={controlsRef}
          viewCubeRef={viewCubeRef}
          invalidateRef={invalidateRef}
          activePreset={activePreset}
          lensCurvature={lensCurvature}
          snapTrigger={snapTrigger}
          isDragging={isDragging}
          onCameraRest={onCameraRest}
          onCameraBridgeReady={onCameraBridgeReady}
        />
        <StageReference
          mannequins={mannequins}
          activeMannequinId={activeMannequinId}
          sceneLoadId={sceneLoadId}
          studioTheme={studioTheme}
          theme={theme}
          floorGroupRef={floorGroupRef}
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
          deselectTrigger={deselectTrigger + externalDeselectTrigger}
          studioProps={studioProps}
          selectedPropId={selectedPropId}
          propTransformMode={propTransformMode}
          dropPropToFloorCommand={dropPropToFloorCommand}
          propDragGuardRef={propDragGuardRef}
          isCoarsePointer={viewport.isCoarsePointer}
          activePreset={activePreset}
          lensCurvature={lensCurvature}
          cameraRestSeq={cameraRestSeq}
          ikPinFeet={ikPinFeet}
          ikSwivelByHandle={ikSwivelByHandle}
          onSelectMannequin={onSelectMannequin}
          onDraggingChange={onDraggingChange}
          onSelectBoneChange={onSelectBoneChange}
          onSelectIKHandleChange={onSelectIKHandleChange}
          onBoneAnglesChange={onBoneAnglesChange}
          onElevationSync={onElevationSync}
          onMoveBodyChange={onMoveBodyChange}
          onSelectProp={onSelectProp}
          onUpdatePropTransform={onUpdatePropTransform}
          onMannequinBridgeChange={onMannequinBridgeChange}
          onInitialPoseSnapshot={onInitialPoseSnapshot}
          onCommitPoseSnapshot={onCommitPoseSnapshot}
          onMannequinAnchorChange={onMannequinAnchorChange}
          onPropAnchorChange={onPropAnchorChange}
        />
        {isFisheyePreset(activePreset) && (
          <CurvilinearLens
            preset={activePreset}
            curvature={lensCurvature}
            renderHookRef={curvilinearRenderRef}
          />
        )}
        <SnapshotExporter
          floorGroupRef={floorGroupRef}
          curvilinearRenderRef={curvilinearRenderRef}
          onSnapshotBridgeReady={onSnapshotBridgeReady}
        />
      </Canvas>

      <PerspectiveGuides
        preset={activePreset}
        curvature={lensCurvature}
        visible={showPerspectiveGuides}
        studioTheme={studioTheme}
        width={viewport.width}
        height={viewport.height}
      />

      <ViewportGizmo
        cubeRef={viewCubeRef}
        studioTheme={studioTheme}
        activePreset={activePreset}
        lensCurvature={lensCurvature}
        showPerspectiveGuides={showPerspectiveGuides}
        viewport={viewport}
        isHudMinimized={isHudMinimized}
        bookmarks={bookmarks}
        onSelectCameraPreset={onSelectCameraPreset}
        onChangeLensCurvature={onChangeLensCurvature}
        onTogglePerspectiveGuides={onTogglePerspectiveGuides}
        onSelectFace={handleSelectViewCubeFace}
        onOrbitDrag={handleViewCubeOrbitDrag}
        onAddBookmark={onAddBookmark}
        onSelectBookmark={onSelectBookmark}
        onDeleteBookmark={onDeleteBookmark}
      />
    </div>
  );
}
