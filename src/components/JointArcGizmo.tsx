'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { clampJointAngles, type JointSpec } from '@/data/jointLimits';
import { STUDIO_THEMES } from '@/data/studioThemes';
import type { RigAdapter } from '@/rig/rigAdapter';
import {
  isCurvilinearPreset,
  ZERO_JOINT_ANGLES,
  type AxisKey,
  type CameraPreset,
  type JointAngles,
  type StudioThemeId,
} from '@/types/anatomy';
import { screenNdcToSourceNdc, sourceNdcToScreenNdc } from '@/utils/lensWarp';

export interface JointArcDragGuard {
  isDragging: boolean;
  lastDragEndTime: number;
}

interface JointArcGizmoProps {
  rigAdapter: RigAdapter;
  boneName: string;
  spec: JointSpec;
  rootGroup: THREE.Group;
  jointLimitsEnabled: boolean;
  studioTheme: StudioThemeId;
  activePreset: CameraPreset;
  lensCurvature: number;
  isCoarsePointer: boolean;
  dragGuardRef: MutableRefObject<JointArcDragGuard>;
  onDraggingChange: (isDragging: boolean) => void;
  onAnglesUpdate: (angles: JointAngles, spec: JointSpec) => void;
  onDragCommit: (finalAngles: JointAngles) => void;
}

const FINGER_BONE_PATTERN = /^(index|middle|pinky|ring|thumb)_/i;

const AXIS_PLANE_ROTATIONS: Record<AxisKey, THREE.Euler> = {
  x: new THREE.Euler(0, Math.PI / 2, 0),
  y: new THREE.Euler(-Math.PI / 2, 0, 0),
  z: new THREE.Euler(0, 0, 0),
};

const AXIS_LOCAL_NORMALS: Record<AxisKey, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function normalizeRadPi(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Computes the intrinsic Euler world-space rotation frame for a single axis
 * (`'x' | 'y' | 'z'`) given `W_rest_canon` and current angles in `order`.
 * Rotating around that axis's local unit vector modifies ONLY that Euler component.
 */
function computeAxisWorldFrame(
  restWorldQuat: THREE.Quaternion,
  anglesDeg: JointAngles,
  order: THREE.EulerOrder,
  targetAxis: AxisKey,
  out: THREE.Quaternion
): THREE.Quaternion {
  out.copy(restWorldQuat);
  const seq: readonly AxisKey[] =
    order === 'YZX' ? ['y', 'z', 'x'] : ['x', 'y', 'z'];

  const qStep = new THREE.Quaternion();
  const axVec = new THREE.Vector3();

  for (const stepAxis of seq) {
    if (stepAxis === targetAxis) {
      return out;
    }
    axVec.copy(AXIS_LOCAL_NORMALS[stepAxis]);
    qStep.setFromAxisAngle(axVec, THREE.MathUtils.degToRad(anglesDeg[stepAxis]));
    out.multiply(qStep);
  }
  return out;
}

function projectWorldToRingLocalPhi(
  worldDir: THREE.Vector3,
  ringWorldQuat: THREE.Quaternion
): number {
  const localVec = worldDir.clone().applyQuaternion(ringWorldQuat.clone().invert());
  return Math.atan2(localVec.y, localVec.x);
}

interface ActiveDragState {
  axis: AxisKey;
  pointerId: number;
  centerWorld: THREE.Vector3;
  axisWorld: THREE.Vector3;
  ringWorldQuat: THREE.Quaternion;
  useRayPlane: boolean;
  prevRadialDir: THREE.Vector3;
  screenTangentUnit: THREE.Vector2;
  ringScreenRadiusPx: number;
  lastClientX: number;
  lastClientY: number;
  accumulatedRad: number;
  startAngles: JointAngles;
  latestAngles: JointAngles;
  grabPhi: number;
}

/**
 * Custom camera-aware intrinsic-Euler 3-axis arc gizmo replacing stock
 * Three.js TransformControls for FK joint posing. Supports constant screen
 * sizing, Fisheye inverse raycasting, smooth edge-on tangent fallback, single-axis
 * isolation (zero cross-axis Euler flip/drift), and live degree readout.
 */
type ThreeOrbitControlsLike = {
  enabled?: boolean;
  cancel?: () => void;
  stop?: () => void;
} | null;

export function JointArcGizmo({
  rigAdapter,
  boneName,
  spec,
  rootGroup,
  jointLimitsEnabled,
  studioTheme,
  activePreset,
  lensCurvature,
  isCoarsePointer,
  dragGuardRef,
  onDraggingChange,
  onAnglesUpdate,
  onDragCommit,
}: JointArcGizmoProps) {
  const { camera, gl, size, invalidate, controls } = useThree();
  const controlsRef = useRef<ThreeOrbitControlsLike>(null);
  controlsRef.current = controls as ThreeOrbitControlsLike;
  const theme = STUDIO_THEMES[studioTheme];
  const { hitbox: colors, ui } = theme;

  const gizmoRootRef = useRef<THREE.Group>(null);
  const axisGroupRefs = useRef<Record<AxisKey, THREE.Group | null>>({
    x: null,
    y: null,
    z: null,
  });
  const activeDragRef = useRef<ActiveDragState | null>(null);

  const [hoveredAxis, setHoveredAxis] = useState<AxisKey | null>(null);
  const [activeAxis, setActiveAxis] = useState<AxisKey | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    axis: AxisKey;
    currentDeg: number;
    deltaRad: number;
    grabPhi: number;
    minDeg: number;
    maxDeg: number;
    clamped: boolean;
  } | null>(null);

  const latestPropsRef = useRef({
    rigAdapter,
    boneName,
    spec,
    rootGroup,
    jointLimitsEnabled,
    activePreset,
    lensCurvature,
    onDraggingChange,
    onAnglesUpdate,
    onDragCommit,
  });
  latestPropsRef.current = {
    rigAdapter,
    boneName,
    spec,
    rootGroup,
    jointLimitsEnabled,
    activePreset,
    lensCurvature,
    onDraggingChange,
    onAnglesUpdate,
    onDragCommit,
  };

  const isFinger = FINGER_BONE_PATTERN.test(boneName);

  const axisColorMap: Record<AxisKey, string> = {
    x: colors.gizmoX,
    y: colors.gizmoY,
    z: colors.gizmoZ,
  };

  const visibleAxes = useMemo<AxisKey[]>(
    () =>
      (['x', 'y', 'z'] as const).filter((axis) =>
        jointLimitsEnabled
          ? axis === 'x'
            ? spec.showX
            : axis === 'y'
              ? spec.showY
              : spec.showZ
          : true
      ),
    [jointLimitsEnabled, spec]
  );

  // Sync position, constant screen scale, and intrinsic axis orientations on every frame render
  const syncGizmoTransforms = useCallback(() => {
    const gizmoGroup = gizmoRootRef.current;
    const bone = rigAdapter.getBone(boneName);
    if (!gizmoGroup || !bone) return;

    rootGroup.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);
    gizmoGroup.position.copy(worldPos);

    const dist = Math.max(0.45, camera.position.distanceTo(worldPos));
    const factor = isCoarsePointer ? 0.075 : 0.064;
    const rawRadius = isFinger ? dist * factor * 0.48 : dist * factor;
    const clampedRadius = isFinger
      ? THREE.MathUtils.clamp(rawRadius, 0.055, 0.22)
      : THREE.MathUtils.clamp(rawRadius, 0.11, 0.44);
    gizmoGroup.scale.setScalar(clampedRadius);

    const restWorldQuat = rigAdapter.getCanonicalRestWorldQuat(
      boneName,
      new THREE.Quaternion()
    );
    const anglesDeg = rigAdapter.readCanonicalAngles(boneName, spec, false);

    for (const axis of ['x', 'y', 'z'] as const) {
      const grp = axisGroupRefs.current[axis];
      if (!grp) continue;
      computeAxisWorldFrame(
        restWorldQuat,
        anglesDeg,
        spec.order,
        axis,
        grp.quaternion
      );
      grp.updateMatrixWorld(true);
    }
    gizmoGroup.updateMatrixWorld(true);
  }, [rigAdapter, boneName, spec, rootGroup, camera, isCoarsePointer, isFinger]);

  useFrame(() => {
    syncGizmoTransforms();
  });

  useEffect(() => {
    syncGizmoTransforms();
    invalidate();
  }, [syncGizmoTransforms, invalidate]);

  const computeSourceNdcFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const w = Math.max(1, rect.width || size.width);
      const h = Math.max(1, rect.height || size.height);
      const rawNdcX = ((clientX - rect.left) / w) * 2 - 1;
      const rawNdcY = -((clientY - rect.top) / h) * 2 + 1;
      const { activePreset: preset, lensCurvature: curvature } =
        latestPropsRef.current;
      if (!isCurvilinearPreset(preset)) {
        return { x: rawNdcX, y: rawNdcY, w, h, rect };
      }
      const mapped = screenNdcToSourceNdc(
        rawNdcX,
        rawNdcY,
        preset,
        curvature,
        w / h
      );
      return { x: mapped.x, y: mapped.y, w, h, rect };
    },
    [gl.domElement, size.width, size.height]
  );

  const intersectPointerPlane = useCallback(
    (
      clientX: number,
      clientY: number,
      centerWorld: THREE.Vector3,
      axisWorld: THREE.Vector3
    ): THREE.Vector3 | null => {
      const { x, y } = computeSourceNdcFromClient(clientX, clientY);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        axisWorld,
        centerWorld
      );
      const hit = new THREE.Vector3();
      const ok = raycaster.ray.intersectPlane(plane, hit);
      if (!ok) return null;
      const dir = hit.sub(centerWorld);
      if (dir.lengthSq() < 1e-8) return null;
      return dir.normalize();
    },
    [computeSourceNdcFromClient, camera]
  );

  const handleAxisPointerDown = (
    axis: AxisKey,
    event: ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
    event.nativeEvent?.stopPropagation?.();

    const bone = rigAdapter.getBone(boneName);
    const axisGroup = axisGroupRefs.current[axis];
    if (!bone || !axisGroup) return;

    syncGizmoTransforms();

    const centerWorld = new THREE.Vector3();
    bone.getWorldPosition(centerWorld);

    const frameWorldQuat = new THREE.Quaternion();
    axisGroup.getWorldQuaternion(frameWorldQuat);

    const axisWorld = AXIS_LOCAL_NORMALS[axis]
      .clone()
      .applyQuaternion(frameWorldQuat)
      .normalize();

    const ringWorldQuat = frameWorldQuat
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(AXIS_PLANE_ROTATIONS[axis]))
      .normalize();

    const viewDir = centerWorld.clone().sub(camera.position).normalize();
    const facingDot = Math.abs(axisWorld.dot(viewDir));
    const useRayPlane = facingDot > 0.28;

    const hitPoint = event.point.clone();
    const radialStart = hitPoint.clone().sub(centerWorld);
    radialStart.addScaledVector(axisWorld, -radialStart.dot(axisWorld));
    if (radialStart.lengthSq() < 1e-7) {
      radialStart
        .set(1, 0, 0)
        .applyQuaternion(ringWorldQuat);
    } else {
      radialStart.normalize();
    }

    const grabPhi = projectWorldToRingLocalPhi(radialStart, ringWorldQuat);

    // Compute exact screen-space tangent and radius in pixels for fallback / edge-on smoothness
    const gizmoRadiusWorld = gizmoRootRef.current?.scale.x || 0.2;
    const tangentWorld = new THREE.Vector3()
      .crossVectors(axisWorld, radialStart)
      .normalize();

    const projectToScreenPx = (wp: THREE.Vector3) => {
      const p = wp.clone().project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      const w = Math.max(1, rect.width || size.width);
      const h = Math.max(1, rect.height || size.height);
      const mapped = isCurvilinearPreset(activePreset)
        ? sourceNdcToScreenNdc(p.x, p.y, activePreset, lensCurvature, w / h)
        : { x: p.x, y: p.y };
      return new THREE.Vector2(
        (mapped.x * 0.5 + 0.5) * w,
        (-mapped.y * 0.5 + 0.5) * h
      );
    };

    const pCenterPx = projectToScreenPx(centerWorld);
    const pGrabPx = projectToScreenPx(
      centerWorld.clone().addScaledVector(radialStart, gizmoRadiusWorld)
    );
    const pTangPx = projectToScreenPx(
      centerWorld
        .clone()
        .addScaledVector(radialStart, gizmoRadiusWorld)
        .addScaledVector(tangentWorld, gizmoRadiusWorld * 0.25)
    );

    const screenTangentVec = pTangPx.clone().sub(pGrabPx);
    const screenTangentUnit =
      screenTangentVec.lengthSq() > 1e-4
        ? screenTangentVec.normalize()
        : new THREE.Vector2(1, 0);
    const ringScreenRadiusPx = THREE.MathUtils.clamp(
      pGrabPx.distanceTo(pCenterPx),
      38,
      240
    );

    let prevRadialDir = radialStart.clone();
    if (useRayPlane) {
      const planeHit = intersectPointerPlane(
        event.clientX,
        event.clientY,
        centerWorld,
        axisWorld
      );
      if (planeHit) {
        prevRadialDir = planeHit;
      }
    }

    const startAngles = rigAdapter.readCanonicalAngles(boneName, spec, false);

    activeDragRef.current = {
      axis,
      pointerId: event.pointerId,
      centerWorld,
      axisWorld,
      ringWorldQuat,
      useRayPlane,
      prevRadialDir,
      screenTangentUnit,
      ringScreenRadiusPx,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      accumulatedRad: 0,
      startAngles,
      latestAngles: { ...startAngles },
      grabPhi,
    };

    if (controlsRef.current) {
      controlsRef.current.enabled = false;
      controlsRef.current.cancel?.();
      controlsRef.current.stop?.();
    }
    dragGuardRef.current.isDragging = true;
    onDraggingChange(true);
    setActiveAxis(axis);

    const axisSpec = spec.axes[axis];
    const minDeg = jointLimitsEnabled ? axisSpec.min : -180;
    const maxDeg = jointLimitsEnabled ? axisSpec.max : 180;
    const roundedStart = Math.round(startAngles[axis]);

    setDragVisual({
      axis,
      currentDeg: roundedStart,
      deltaRad: 0,
      grabPhi,
      minDeg,
      maxDeg,
      clamped: false,
    });

    try {
      gl.domElement.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }

    invalidate();
  };

  useEffect(() => {
    const handleWindowPointerMove = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      const props = latestPropsRef.current;
      let stepDeltaRad = 0;

      if (drag.useRayPlane) {
        const nextDir = intersectPointerPlane(
          ev.clientX,
          ev.clientY,
          drag.centerWorld,
          drag.axisWorld
        );
        if (nextDir) {
          const crossDot = new THREE.Vector3()
            .crossVectors(drag.prevRadialDir, nextDir)
            .dot(drag.axisWorld);
          const dot = THREE.MathUtils.clamp(
            drag.prevRadialDir.dot(nextDir),
            -1,
            1
          );
          stepDeltaRad = Math.atan2(crossDot, dot);
          // Clamp extreme grazing spikes on single move event
          stepDeltaRad = THREE.MathUtils.clamp(stepDeltaRad, -0.45, 0.45);
          drag.prevRadialDir.copy(nextDir);
        }
      } else {
        const dx = ev.clientX - drag.lastClientX;
        const dy = ev.clientY - drag.lastClientY;
        const projectedPx =
          dx * drag.screenTangentUnit.x + dy * drag.screenTangentUnit.y;
        stepDeltaRad = projectedPx / drag.ringScreenRadiusPx;
      }

      drag.lastClientX = ev.clientX;
      drag.lastClientY = ev.clientY;
      drag.accumulatedRad += stepDeltaRad;

      const deltaDeg = THREE.MathUtils.radToDeg(drag.accumulatedRad);
      const candidate: JointAngles = {
        ...drag.startAngles,
        [drag.axis]: drag.startAngles[drag.axis] + deltaDeg,
      };
      const clamped = clampJointAngles(
        candidate,
        props.spec,
        props.jointLimitsEnabled
      );

      // Keep unwrapped display degree synced cleanly with clamped change
      const clampedVal = clamped[drag.axis];
      const wasClamped = Math.abs(clampedVal - candidate[drag.axis]) > 0.2;
      drag.latestAngles = clamped;

      props.rigAdapter.applyCanonicalAngles(
        props.boneName,
        clamped,
        props.spec.order
      );
      syncGizmoTransforms();

      const roundedAngles: JointAngles = {
        x: Math.round(clamped.x),
        y: Math.round(clamped.y),
        z: Math.round(clamped.z),
      };
      props.onAnglesUpdate(roundedAngles, props.spec);

      const appliedDeltaRad = THREE.MathUtils.degToRad(
        clamped[drag.axis] - drag.startAngles[drag.axis]
      );
      const axisSpec = props.spec.axes[drag.axis];
      setDragVisual({
        axis: drag.axis,
        currentDeg: Math.round(clampedVal),
        deltaRad: appliedDeltaRad,
        grabPhi: drag.grabPhi,
        minDeg: props.jointLimitsEnabled ? axisSpec.min : -180,
        maxDeg: props.jointLimitsEnabled ? axisSpec.max : 180,
        clamped: wasClamped,
      });

      invalidate();
    };

    const endDrag = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      const props = latestPropsRef.current;
      const finalAngles = { ...drag.latestAngles };
      activeDragRef.current = null;

      try {
        if (gl.domElement.hasPointerCapture?.(ev.pointerId)) {
          gl.domElement.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      if (controlsRef.current) {
        controlsRef.current.stop?.();
        controlsRef.current.enabled = true;
      }
      dragGuardRef.current.isDragging = false;
      dragGuardRef.current.lastDragEndTime = performance.now();
      props.onDraggingChange(false);
      setHoveredAxis(null);
      setActiveAxis(null);
      setDragVisual(null);
      props.onDragCommit(finalAngles);
      invalidate();
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (activeDragRef.current) {
        activeDragRef.current = null;
        if (controlsRef.current) {
          controlsRef.current.stop?.();
          controlsRef.current.enabled = true;
        }
        dragGuardRef.current.isDragging = false;
        dragGuardRef.current.lastDragEndTime = performance.now();
        latestPropsRef.current.onDraggingChange(false);
      }
    };
  }, [gl.domElement, dragGuardRef, intersectPointerPlane, syncGizmoTransforms, invalidate]);

  useEffect(() => {
    document.body.style.cursor = activeAxis
      ? 'grabbing'
      : hoveredAxis
        ? 'grab'
        : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [activeAxis, hoveredAxis]);

  // Clear hover if bone changes
  useEffect(() => {
    setHoveredAxis(null);
    setActiveAxis(null);
    setDragVisual(null);
  }, [boneName]);

  const visualTube = isCoarsePointer ? 0.017 : 0.015;
  const hitTube = isCoarsePointer ? 0.13 : 0.095;

  const activeAxisLabel = dragVisual
    ? `${spec.axes[dragVisual.axis].label} ${dragVisual.currentDeg >= 0 ? `+${dragVisual.currentDeg}` : dragVisual.currentDeg}°`
    : null;

  return (
    <group ref={gizmoRootRef} name="mortal-mesh-arc-gizmo">
      {(['x', 'y', 'z'] as const).map((axis) => {
        const isVisibleAxis = visibleAxes.includes(axis);
        const isThisActive = activeAxis === axis;
        const isThisHovered = hoveredAxis === axis && !activeAxis;
        const color = axisColorMap[axis];

        const opacity = activeAxis
          ? isThisActive
            ? 0.96
            : 0.12
          : isThisHovered
            ? 0.98
            : 0.84;

        const scaleMult = isThisActive ? 1.03 : isThisHovered ? 1.02 : 1;

        // Compute swept wedge & valid ROM arc when dragging this axis
        const wedgeStartPhi = dragVisual && isThisActive
          ? normalizeRadPi(dragVisual.grabPhi)
          : 0;
        const wedgeDeltaRad =
          dragVisual && isThisActive
            ? THREE.MathUtils.clamp(
                dragVisual.deltaRad,
                -Math.PI * 1.98,
                Math.PI * 1.98
              )
            : 0;
        const absDelta = Math.abs(wedgeDeltaRad);
        const wedgeThetaStart =
          wedgeDeltaRad >= 0 ? wedgeStartPhi : wedgeStartPhi + wedgeDeltaRad;

        const minRelRad =
          dragVisual && isThisActive
            ? THREE.MathUtils.degToRad(dragVisual.minDeg - dragVisual.currentDeg)
            : 0;
        const maxRelRad =
          dragVisual && isThisActive
            ? THREE.MathUtils.degToRad(dragVisual.maxDeg - dragVisual.currentDeg)
            : 0;
        const romSpanRad = Math.min(
          Math.PI * 1.98,
          Math.max(0.02, maxRelRad - minRelRad)
        );
        const romStartAngle = wedgeStartPhi + wedgeDeltaRad + minRelRad;

        return (
          <group
            key={axis}
            ref={(grp) => {
              axisGroupRefs.current[axis] = grp;
            }}
            visible={isVisibleAxis}
          >
            <group rotation={AXIS_PLANE_ROTATIONS[axis]} scale={scaleMult}>
              {/* Crisp Studio Axis Ring */}
              <mesh renderOrder={14} name={`gizmo-axis-${axis}`}>
                <torusGeometry args={[1, visualTube, 10, 64]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={opacity}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>

              {/* Soft secondary inner rim on active drag */}
              {isThisActive && (
                <mesh renderOrder={13}>
                  <ringGeometry args={[0.93, 0.96, 64]} />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.28}
                    side={THREE.DoubleSide}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
              )}

              {/* Swept angle wedge & live needle during active drag */}
              {isThisActive && dragVisual && (
                <>
                  {absDelta > 0.015 && (
                    <mesh renderOrder={12}>
                      <circleGeometry
                        args={[0.98, 40, wedgeThetaStart, absDelta]}
                      />
                      <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.16}
                        side={THREE.DoubleSide}
                        depthTest={false}
                        depthWrite={false}
                      />
                    </mesh>
                  )}

                  {/* Valid ROM span band */}
                  {jointLimitsEnabled && (
                    <mesh renderOrder={12}>
                      <ringGeometry
                        args={[1.05, 1.09, 48, 1, romStartAngle, romSpanRad]}
                      />
                      <meshBasicMaterial
                        color={colors.ringContrastColor}
                        transparent
                        opacity={0.35}
                        side={THREE.DoubleSide}
                        depthTest={false}
                        depthWrite={false}
                      />
                    </mesh>
                  )}

                  {/* Start angle tick & active radial guide needle */}
                  <mesh
                    position={[
                      Math.cos(wedgeStartPhi) * 0.5,
                      Math.sin(wedgeStartPhi) * 0.5,
                      0,
                    ]}
                    rotation={[0, 0, wedgeStartPhi]}
                    renderOrder={15}
                  >
                    <planeGeometry args={[1, 0.012]} />
                    <meshBasicMaterial
                      color={color}
                      transparent
                      opacity={0.45}
                      side={THREE.DoubleSide}
                      depthTest={false}
                      depthWrite={false}
                    />
                  </mesh>

                  <mesh
                    position={[
                      Math.cos(wedgeStartPhi + wedgeDeltaRad) * 0.52,
                      Math.sin(wedgeStartPhi + wedgeDeltaRad) * 0.52,
                      0,
                    ]}
                    rotation={[0, 0, wedgeStartPhi + wedgeDeltaRad]}
                    renderOrder={16}
                  >
                    <planeGeometry args={[1.04, 0.024]} />
                    <meshBasicMaterial
                      color={color}
                      transparent
                      opacity={0.95}
                      side={THREE.DoubleSide}
                      depthTest={false}
                      depthWrite={false}
                    />
                  </mesh>
                </>
              )}

              {/* Generous invisible hit torus for effortless mouse/touch/S-Pen grabbing */}
              <mesh
                renderOrder={15}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredAxis(axis);
                  invalidate();
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  setHoveredAxis((prev) => (prev === axis ? null : prev));
                  invalidate();
                }}
                onPointerDown={(e) => handleAxisPointerDown(axis, e)}
                onClick={(e) => e.stopPropagation()}
              >
                <torusGeometry args={[1, hitTube, 10, 32]} />
                <meshBasicMaterial
                  transparent
                  opacity={0}
                  depthWrite={false}
                  depthTest={false}
                />
              </mesh>
            </group>
          </group>
        );
      })}

      {/* Live Frosted Degree Readout Pill while actively turning a joint arc */}
      {dragVisual && activeAxisLabel && (
        <Html position={[0, 1.24, 0]} center>
          <div
            data-testid="gizmo-angle-readout"
            className={`pointer-events-none select-none rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap shadow-md backdrop-blur-md ${ui.monoPill}`}
          >
            <span>{activeAxisLabel}</span>
            {dragVisual.clamped && (
              <span className="ml-1 text-[9.5px] opacity-75">ROM</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export { ZERO_JOINT_ANGLES };
