'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { STUDIO_THEMES } from '@/data/studioThemes';
import {
  isCurvilinearPreset,
  type AxisKey,
  type CameraPreset,
  type IKHandleId,
  type StudioThemeId,
} from '@/types/anatomy';
import { screenNdcToSourceNdc } from '@/utils/lensWarp';
import type { IKDragGuard, IKDragMode } from '@/components/IKHandleMarkers';

export interface IKDragFeedback {
  active: boolean;
  mode: IKDragMode;
  label: string;
  deltaVec: THREE.Vector3;
  chainPoints?: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  targetPos?: THREE.Vector3;
  achievedPos?: THREE.Vector3;
  isMaxReach?: boolean;
  isSquat?: boolean;
}

type OrbitControlsLike = {
  enabled?: boolean;
  cancel?: () => void;
  stop?: () => void;
} | null;

interface IKMoveGizmoProps {
  handleId: IKHandleId;
  anchorObj: THREE.Object3D;
  studioTheme: StudioThemeId;
  activePreset: CameraPreset;
  lensCurvature: number;
  isCoarsePointer: boolean;
  dragGuardRef: MutableRefObject<IKDragGuard>;
  dragFeedback: IKDragFeedback | null;
  onDragStart: (handleId: IKHandleId, startWorldPos: THREE.Vector3) => void;
  onDragMove: (
    handleId: IKHandleId,
    nextWorldPos: THREE.Vector3,
    mode: IKDragMode
  ) => void;
  onDragEnd: (handleId: IKHandleId) => void;
}

const AXIS_VECTORS: Record<AxisKey, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const AXIS_EULERS: Record<AxisKey, [number, number, number]> = {
  x: [0, 0, -Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

function SegmentBeam({
  start,
  end,
  color,
  opacity,
  radius = 0.0055,
  renderOrder = 13,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  opacity: number;
  radius?: number;
  renderOrder?: number;
}) {
  const { mid, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const q = new THREE.Quaternion();
    if (length > 1e-5) {
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
    return { mid: midpoint, quat: q, len: Math.max(0.001, length) };
  }, [start, end]);

  if (len <= 0.005) return null;

  return (
    <mesh position={mid} quaternion={quat} renderOrder={renderOrder}>
      <cylinderGeometry args={[radius, radius, len, 8]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

interface ActiveGizmoDrag {
  mode: IKDragMode;
  pointerId: number;
  startWorldPos: THREE.Vector3;
  planeNormal: THREE.Vector3;
  grabHit: THREE.Vector3;
  axisDir: THREE.Vector3 | null;
  screenAxisPxPerMeter: THREE.Vector2 | null;
  startClientX: number;
  startClientY: number;
  worldPerPixel: number;
}

const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {};

/**
 * Custom studio 3-axis + XZ floor-plane + screen-plane translation gizmo for IK handles.
 * Matches Mortal Mesh's muted CAD aesthetic, works seamlessly under Fisheye warp,
 * and shows live chain / max-reach / squat feedback overlays.
 */
export function IKMoveGizmo({
  handleId,
  anchorObj,
  studioTheme,
  activePreset,
  lensCurvature,
  isCoarsePointer,
  dragGuardRef,
  dragFeedback,
  onDragStart,
  onDragMove,
  onDragEnd,
}: IKMoveGizmoProps) {
  const { camera, gl, size, invalidate, controls } = useThree();
  const controlsRef = useRef<OrbitControlsLike>(null);
  controlsRef.current = controls as OrbitControlsLike;

  const gizmoRootRef = useRef<THREE.Group>(null);
  const centerBillboardRef = useRef<THREE.Group>(null);
  const ghostRingRef = useRef<THREE.Mesh>(null);
  const xzPadGroupRef = useRef<THREE.Group>(null);
  const xzHitMeshRef = useRef<THREE.Mesh>(null);
  const axisGroupRefs = useRef<Record<AxisKey, THREE.Group | null>>({
    x: null,
    y: null,
    z: null,
  });
  const axisHitMeshRefs = useRef<Record<AxisKey, THREE.Mesh | null>>({
    x: null,
    y: null,
    z: null,
  });
  const activeDragRef = useRef<ActiveGizmoDrag | null>(null);

  const [hoveredMode, setHoveredMode] = useState<IKDragMode | null>(null);
  const [activeMode, setActiveMode] = useState<IKDragMode | null>(null);

  const theme = STUDIO_THEMES[studioTheme];
  const { hitbox: colors, ui } = theme;

  const axisColorMap: Record<AxisKey, string> = {
    x: colors.gizmoX,
    y: colors.gizmoY,
    z: colors.gizmoZ,
  };

  const latestRef = useRef({
    handleId,
    activePreset,
    lensCurvature,
    onDragStart,
    onDragMove,
    onDragEnd,
  });
  latestRef.current = {
    handleId,
    activePreset,
    lensCurvature,
    onDragStart,
    onDragMove,
    onDragEnd,
  };

  const syncGizmoPose = useCallback(() => {
    const gizmoGroup = gizmoRootRef.current;
    if (!gizmoGroup) return;

    gizmoGroup.position.copy(anchorObj.position);
    const dist = Math.max(0.45, camera.position.distanceTo(anchorObj.position));
    const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
      ? (camera as THREE.PerspectiveCamera).fov
      : 40;
    const fovComp = THREE.MathUtils.clamp(
      Math.tan(THREE.MathUtils.degToRad(fov * 0.5)) /
        Math.tan(THREE.MathUtils.degToRad(20)),
      0.85,
      1.65
    );
    const factor = isCoarsePointer ? 0.088 : 0.072;
    const s = THREE.MathUtils.clamp(dist * factor * fovComp, 0.16, 0.56);
    gizmoGroup.scale.setScalar(s);

    if (centerBillboardRef.current) {
      centerBillboardRef.current.quaternion.copy(camera.quaternion);
    }
    if (ghostRingRef.current) {
      ghostRingRef.current.quaternion.copy(camera.quaternion);
    }

    // Hide/disable axes pointing straight at camera so center screen-plane drag is never blocked
    // (Note: Three.js Raycaster ignores `visible = false`, so scale down AND swap raycast.)
    const viewDir = anchorObj.position.clone().sub(camera.position).normalize();
    const curActive = activeDragRef.current?.mode ?? null;
    for (const axis of ['x', 'y', 'z'] as const) {
      const dot = Math.abs(AXIS_VECTORS[axis].dot(viewDir));
      const keepVisible = dot <= 0.87 || curActive === axis;
      const grp = axisGroupRefs.current[axis];
      const hitMesh = axisHitMeshRefs.current[axis];
      if (grp) grp.visible = keepVisible;
      if (hitMesh) {
        hitMesh.visible = keepVisible;
        hitMesh.scale.setScalar(keepVisible ? 1 : 0.0001);
        hitMesh.raycast = keepVisible
          ? THREE.Mesh.prototype.raycast
          : NOOP_RAYCAST;
      }
    }

    // Hide XZ floor pad when camera looks nearly horizontal/edge-on so its +Z edge never intercepts center drags
    const showXZ = Math.abs(viewDir.y) > 0.22 || curActive === 'xz';
    if (xzPadGroupRef.current) xzPadGroupRef.current.visible = showXZ;
    if (xzHitMeshRef.current) {
      xzHitMeshRef.current.visible = showXZ;
      xzHitMeshRef.current.scale.setScalar(showXZ ? 1 : 0.0001);
      xzHitMeshRef.current.raycast = showXZ
        ? THREE.Mesh.prototype.raycast
        : NOOP_RAYCAST;
    }

    gizmoGroup.updateMatrixWorld(true);
  }, [anchorObj, camera, isCoarsePointer]);

  useFrame(() => {
    syncGizmoPose();
  });

  useEffect(() => {
    syncGizmoPose();
    invalidate();
  }, [syncGizmoPose, handleId, invalidate]);

  const computeSourceNdc = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const w = Math.max(1, rect.width || size.width);
      const h = Math.max(1, rect.height || size.height);
      let ndcX = ((clientX - rect.left) / w) * 2 - 1;
      let ndcY = -((clientY - rect.top) / h) * 2 + 1;
      const { activePreset: preset, lensCurvature: curvature } = latestRef.current;
      if (isCurvilinearPreset(preset)) {
        const mapped = screenNdcToSourceNdc(ndcX, ndcY, preset, curvature, w / h);
        ndcX = mapped.x;
        ndcY = mapped.y;
      }
      return { x: ndcX, y: ndcY, w, h };
    },
    [gl.domElement, size.width, size.height]
  );

  const intersectPlane = useCallback(
    (
      clientX: number,
      clientY: number,
      point: THREE.Vector3,
      normal: THREE.Vector3
    ): THREE.Vector3 | null => {
      const { x, y } = computeSourceNdc(clientX, clientY);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
      const out = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, out) ? out : null;
    },
    [computeSourceNdc, camera]
  );

  const beginDrag = (
    mode: IKDragMode,
    event: ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
    event.nativeEvent?.stopPropagation?.();

    syncGizmoPose();
    const startWorldPos = anchorObj.position.clone();
    const viewDir = startWorldPos.clone().sub(camera.position).normalize();
    const rect = gl.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width || size.width);
    const h = Math.max(1, rect.height || size.height);
    const dist = Math.max(0.45, camera.position.distanceTo(startWorldPos));
    const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
      ? (camera as THREE.PerspectiveCamera).fov
      : 40;
    const worldPerPixel =
      (2 * dist * Math.tan(THREE.MathUtils.degToRad(fov * 0.5))) / h;

    let planeNormal = viewDir.clone().negate().normalize();
    let axisDir: THREE.Vector3 | null = null;
    let screenAxisPxPerMeter: THREE.Vector2 | null = null;

    if (mode === 'xz') {
      planeNormal = new THREE.Vector3(0, 1, 0);
      const rayCheck = intersectPlane(
        event.clientX,
        event.clientY,
        startWorldPos,
        planeNormal
      );
      if (!rayCheck || Math.abs(viewDir.y) < 0.14) {
        // Grazing angle fallback: keep xz drag reliable
        planeNormal = viewDir.clone().negate().normalize();
        axisDir = new THREE.Vector3(1, 0, 1); // sentinel evaluated specially
      }
    } else if (mode === 'x' || mode === 'y' || mode === 'z') {
      axisDir = AXIS_VECTORS[mode].clone();
      const perp = viewDir.clone().addScaledVector(axisDir, -viewDir.dot(axisDir));
      if (perp.length() > 0.22) {
        planeNormal = perp.normalize();
      } else {
        // Looking nearly straight down axis: fallback to screen-space projected axis vector
        const p0 = startWorldPos.clone().project(camera);
        const p1 = startWorldPos.clone().add(axisDir).project(camera);
        screenAxisPxPerMeter = new THREE.Vector2(
          ((p1.x - p0.x) * w) / 2,
          (-(p1.y - p0.y) * h) / 2
        );
      }
    }

    const grabHit =
      intersectPlane(event.clientX, event.clientY, startWorldPos, planeNormal) ??
      startWorldPos.clone();

    if (controlsRef.current) {
      controlsRef.current.enabled = false;
      controlsRef.current.cancel?.();
      controlsRef.current.stop?.();
    }
    dragGuardRef.current.isDragging = true;

    activeDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startWorldPos,
      planeNormal,
      grabHit,
      axisDir,
      screenAxisPxPerMeter,
      startClientX: event.clientX,
      startClientY: event.clientY,
      worldPerPixel,
    };

    setActiveMode(mode);
    onDragStart(handleId, startWorldPos.clone());

    try {
      gl.domElement.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
    invalidate();
  };

  useEffect(() => {
    const handleMove = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      const { handleId: curId, onDragMove: emitMove } = latestRef.current;
      let nextPos = drag.startWorldPos.clone();

      if (drag.mode === 'x' || drag.mode === 'y' || drag.mode === 'z') {
        const axis = drag.axisDir!;
        if (drag.screenAxisPxPerMeter && drag.screenAxisPxPerMeter.lengthSq() > 4) {
          const dx = ev.clientX - drag.startClientX;
          const dy = ev.clientY - drag.startClientY;
          const lenSq = drag.screenAxisPxPerMeter.lengthSq();
          const meters =
            (dx * drag.screenAxisPxPerMeter.x + dy * drag.screenAxisPxPerMeter.y) /
            lenSq;
          nextPos.addScaledVector(axis, meters);
        } else {
          const hit = intersectPlane(
            ev.clientX,
            ev.clientY,
            drag.startWorldPos,
            drag.planeNormal
          );
          if (hit) {
            const scalar = hit.sub(drag.grabHit).dot(axis);
            nextPos.addScaledVector(axis, scalar);
          }
        }
      } else if (drag.mode === 'xz') {
        if (drag.axisDir) {
          const hit = intersectPlane(
            ev.clientX,
            ev.clientY,
            drag.startWorldPos,
            drag.planeNormal
          );
          if (hit) {
            const delta = hit.sub(drag.grabHit);
            delta.y = 0;
            nextPos.add(delta);
          }
        } else {
          const hit = intersectPlane(
            ev.clientX,
            ev.clientY,
            drag.startWorldPos,
            drag.planeNormal
          );
          if (hit) {
            const delta = hit.sub(drag.grabHit);
            delta.y = 0;
            nextPos.add(delta);
          } else {
            const dx = ev.clientX - drag.startClientX;
            const dy = ev.clientY - drag.startClientY;
            const camRight = new THREE.Vector3(1, 0, 0)
              .applyQuaternion(camera.quaternion)
              .setY(0)
              .normalize();
            const camFwd = new THREE.Vector3(0, 0, -1)
              .applyQuaternion(camera.quaternion)
              .setY(0)
              .normalize();
            nextPos.addScaledVector(camRight, dx * drag.worldPerPixel);
            nextPos.addScaledVector(camFwd, -dy * drag.worldPerPixel);
          }
        }
      } else {
        const hit = intersectPlane(
          ev.clientX,
          ev.clientY,
          drag.startWorldPos,
          drag.planeNormal
        );
        if (hit) {
          nextPos.add(hit.sub(drag.grabHit));
        }
      }

      emitMove(curId, nextPos, drag.mode);
      invalidate();
    };

    const finishDrag = (ev: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

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
      setActiveMode(null);
      setHoveredMode(null);
      latestRef.current.onDragEnd(latestRef.current.handleId);
      invalidate();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      if (activeDragRef.current) {
        activeDragRef.current = null;
        if (controlsRef.current) {
          controlsRef.current.stop?.();
          controlsRef.current.enabled = true;
        }
        dragGuardRef.current.isDragging = false;
        dragGuardRef.current.lastDragEndTime = performance.now();
        latestRef.current.onDragEnd(latestRef.current.handleId);
      }
    };
  }, [gl.domElement, dragGuardRef, intersectPlane, camera, invalidate]);

  useEffect(() => {
    document.body.style.cursor = activeMode
      ? 'grabbing'
      : hoveredMode
        ? 'grab'
        : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [activeMode, hoveredMode]);

  useEffect(() => {
    setHoveredMode(null);
    setActiveMode(null);
  }, [handleId]);

  const axisHitRadius = isCoarsePointer ? 0.22 : 0.15;
  const centerHitRadius = isCoarsePointer ? 0.28 : 0.24;

  const hoverBind = (mode: IKDragMode) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHoveredMode(mode);
      invalidate();
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHoveredMode((prev) => (prev === mode ? null : prev));
      invalidate();
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => beginDrag(mode, e),
    onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
  });

  const getModeOpacity = (mode: IKDragMode, baseIdle = 0.86) => {
    if (activeMode) {
      return activeMode === mode ? 0.98 : 0.16;
    }
    return hoveredMode === mode ? 0.98 : baseIdle;
  };

  const showTether =
    dragFeedback?.active &&
    dragFeedback.targetPos &&
    dragFeedback.achievedPos &&
    dragFeedback.targetPos.distanceTo(dragFeedback.achievedPos) > 0.025;

  return (
    <group name="mortal-mesh-ik-gizmo-root">
      <group ref={gizmoRootRef} name="mortal-mesh-ik-gizmo">
        {/* 3 Clean Studio Translation Axis Rails (+X, +Y, +Z) */}
        {(['x', 'y', 'z'] as const).map((axis) => {
          const color = axisColorMap[axis];
          const opacity = getModeOpacity(axis, 0.88);
          const isFocus = activeMode === axis || (!activeMode && hoveredMode === axis);
          const shaftRadius = isFocus ? 0.026 : 0.022;

          return (
            <group
              key={axis}
              ref={(grp) => {
                axisGroupRefs.current[axis] = grp;
              }}
              rotation={AXIS_EULERS[axis]}
              name={`ik-axis-${axis}`}
            >
              <mesh position={[0, 0.54, 0]} renderOrder={14}>
                <cylinderGeometry args={[shaftRadius, shaftRadius, 0.6, 10]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={opacity}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, 0.94, 0]} renderOrder={14}>
                <coneGeometry args={[isFocus ? 0.074 : 0.066, 0.21, 14]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={opacity}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
              <mesh
                ref={(mesh) => {
                  axisHitMeshRefs.current[axis] = mesh;
                }}
                position={[0, 0.72, 0]}
                renderOrder={15}
                name={`ik-axis-hit-${axis}`}
                {...hoverBind(axis)}
              >
                <cylinderGeometry args={[axisHitRadius, axisHitRadius, 0.72, 10]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          );
        })}

        {/* Horizontal Floor-Glide Arc Pad (+X / +Z quadrant, shown when angled above horizon) */}
        <group
          ref={xzPadGroupRef}
          rotation={[-Math.PI / 2, 0, 0]}
          name="ik-xz-pad"
        >
          <mesh renderOrder={13}>
            <ringGeometry
              args={[0.38, 0.5, 24, 1, -Math.PI / 2 + 0.22, Math.PI / 2 - 0.44]}
            />
            <meshBasicMaterial
              color={colors.ringSelectedColor}
              transparent
              opacity={getModeOpacity('xz', 0.24)}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={xzHitMeshRef}
            renderOrder={15}
            name="ik-xz-hit"
            {...hoverBind('xz')}
          >
            <ringGeometry
              args={[0.34, 0.54, 16, 1, -Math.PI / 2 + 0.18, Math.PI / 2 - 0.36]}
            />
            <meshBasicMaterial
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>

        {/* Center Screen-Plane Free Drag Ring */}
        <group ref={centerBillboardRef} name="ik-screen-center">
          <mesh renderOrder={14}>
            <ringGeometry args={[0.198, 0.222, 48]} />
            <meshBasicMaterial
              color={colors.ringSelectedColor}
              transparent
              opacity={getModeOpacity('screen', 0.58)}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh renderOrder={13}>
            <ringGeometry args={[0.222, 0.236, 48]} />
            <meshBasicMaterial
              color={colors.ringContrastColor}
              transparent
              opacity={getModeOpacity('screen', 0.58) * 0.45}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh renderOrder={16} name="ik-screen-hit" {...hoverBind('screen')}>
            <sphereGeometry args={[centerHitRadius, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>

        {/* Live Frosted Readout Pill while Dragging */}
        {dragFeedback?.active && (
          <Html position={[0, 1.24, 0]} center>
            <div
              data-testid="ik-gizmo-readout"
              className={`pointer-events-none select-none rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap shadow-md backdrop-blur-md ${ui.monoPill}`}
            >
              <span>{dragFeedback.label}</span>
              {dragFeedback.isMaxReach && (
                <span className="ml-1.5 text-[9.5px] opacity-80">REACH</span>
              )}
            </div>
          </Html>
        )}
      </group>

      {/* World-space 2-Bone Limb Chain Guide & Elastic Reach Tether */}
      {dragFeedback?.active && dragFeedback.chainPoints && (
        <group name="ik-chain-guide">
          <SegmentBeam
            start={dragFeedback.chainPoints[0]}
            end={dragFeedback.chainPoints[1]}
            color={colors.ikChainColor}
            opacity={0.38}
            radius={0.005}
          />
          <SegmentBeam
            start={dragFeedback.chainPoints[1]}
            end={dragFeedback.chainPoints[2]}
            color={colors.ikChainColor}
            opacity={0.45}
            radius={0.005}
          />
          <mesh position={dragFeedback.chainPoints[1]} renderOrder={13}>
            <octahedronGeometry args={[0.014, 0]} />
            <meshBasicMaterial
              color={colors.ikChainColor}
              transparent
              opacity={0.55}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {showTether && dragFeedback?.targetPos && dragFeedback.achievedPos && (
        <group name="ik-reach-tether">
          <SegmentBeam
            start={dragFeedback.achievedPos}
            end={dragFeedback.targetPos}
            color={colors.gizmoX}
            opacity={0.62}
            radius={0.004}
          />
          <mesh
            ref={ghostRingRef}
            position={dragFeedback.targetPos}
            renderOrder={13}
          >
            <ringGeometry args={[0.018, 0.025, 24]} />
            <meshBasicMaterial
              color={colors.gizmoX}
              transparent
              opacity={0.75}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
