'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { StudioThemeHitboxColors } from '@/data/studioThemes';
import {
  IK_HANDLE_ORDER,
  isCurvilinearPreset,
  type CameraPreset,
  type IKHandleId,
} from '@/types/anatomy';
import { screenNdcToSourceNdc } from '@/utils/lensWarp';

export interface IKDragGuard {
  isDragging: boolean;
  lastDragEndTime: number;
}

export type IKDragMode = 'screen' | 'xz' | 'x' | 'y' | 'z';

type OrbitControlsLike = {
  enabled?: boolean;
  cancel?: () => void;
  stop?: () => void;
} | null;

interface IKHandleMarkersProps {
  selectedHandle: IKHandleId | null;
  hoveredHandle: IKHandleId | null;
  moveBodyEnabled: boolean;
  isDraggingIK: boolean;
  isCoarsePointer: boolean;
  hitboxColors: StudioThemeHitboxColors;
  activePreset: CameraPreset;
  lensCurvature: number;
  bonesByName: Map<string, THREE.Bone>;
  dragGuardRef: MutableRefObject<IKDragGuard>;
  setIKHandleRef: (handleId: IKHandleId, group: THREE.Group | null) => void;
  onHoverChange: (handleId: IKHandleId | null) => void;
  onSelectHandle: (handleId: IKHandleId) => void;
  onDirectDragStart: (handleId: IKHandleId, startWorldPos: THREE.Vector3) => void;
  onDirectDragMove: (
    handleId: IKHandleId,
    nextWorldPos: THREE.Vector3,
    mode: IKDragMode
  ) => void;
  onDirectDragEnd: (handleId: IKHandleId) => void;
}

let _sharedIKQuadGeometry: THREE.PlaneGeometry | null = null;
function getSharedIKQuadGeometry(): THREE.PlaneGeometry {
  if (!_sharedIKQuadGeometry) {
    _sharedIKQuadGeometry = new THREE.PlaneGeometry(1, 1);
  }
  return _sharedIKQuadGeometry;
}

const RETICLE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RETICLE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uContrastColor;
  uniform float uOpacity;
  uniform float uShape; // 0 = limb reticle circle+ticks, 1 = pelvis diamond ring
  uniform float uState; // 0 = idle, 1 = hovered, 2 = selected
  varying vec2 vUv;

  float bandMask(float d, float innerR, float outerR, float feather) {
    float a = smoothstep(innerR - feather, innerR + feather, d);
    float b = 1.0 - smoothstep(outerR - feather, outerR + feather, d);
    return a * b;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float feather = 0.055;
    float mainMask = 0.0;
    float haloMask = 0.0;
    float accentMask = 0.0;

    if (uShape > 0.5) {
      // Pelvis L1-norm diamond ring
      float d = abs(p.x) + abs(p.y);
      float innerEdge = uState > 1.5 ? 0.52 : 0.58;
      float outerEdge = 0.78;
      mainMask = bandMask(d, innerEdge, outerEdge, feather * 1.25);
      haloMask = bandMask(d, outerEdge - 0.02, 0.93, feather * 1.25) * 0.48;
      if (uState > 1.5) {
        accentMask = 1.0 - smoothstep(0.18, 0.25, d);
      }
    } else {
      // Limb hollow target circle + 4 cardinal micro-ticks
      float r = length(p);
      float innerEdge = uState > 1.5 ? 0.48 : 0.54;
      float outerEdge = 0.70;
      float ring = bandMask(r, innerEdge, outerEdge, feather);

      float tickWidth = 0.085;
      float hAxis = (1.0 - smoothstep(tickWidth - 0.02, tickWidth + 0.02, abs(p.y))) *
        bandMask(abs(p.x), 0.70, 0.92, feather);
      float vAxis = (1.0 - smoothstep(tickWidth - 0.02, tickWidth + 0.02, abs(p.x))) *
        bandMask(abs(p.y), 0.70, 0.92, feather);
      float ticks = max(hAxis, vAxis) * 0.92;

      mainMask = clamp(ring + ticks, 0.0, 1.0);
      haloMask = bandMask(r, 0.68, 0.84, feather) * 0.42;
      if (uState > 1.5) {
        accentMask = 1.0 - smoothstep(0.17, 0.23, r);
      }
    }

    float colorMask = clamp(mainMask + accentMask, 0.0, 1.0);
    float totalAlpha = clamp((colorMask + haloMask * (1.0 - colorMask)) * uOpacity, 0.0, 1.0);
    if (totalAlpha < 0.01) discard;

    vec3 outColor = mix(
      uContrastColor,
      uColor,
      colorMask / max(colorMask + haloMask * (1.0 - colorMask), 0.001)
    );
    gl_FragColor = vec4(outColor, totalAlpha);
  }
`;

interface SingleIKReticleProps {
  handleId: IKHandleId;
  isSelected: boolean;
  isHovered: boolean;
  dimmedBySelection: boolean;
  dimmedByDrag: boolean;
  isCoarsePointer: boolean;
  hitboxColors: StudioThemeHitboxColors;
  registerQuad: (
    handleId: IKHandleId,
    mesh: THREE.Mesh | null,
    meta: { isSelected: boolean; isHovered: boolean; isPelvis: boolean }
  ) => void;
  setIKHandleRef: (handleId: IKHandleId, group: THREE.Group | null) => void;
  onPointerOver: (handleId: IKHandleId, event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (handleId: IKHandleId, event: ThreeEvent<PointerEvent>) => void;
  onPointerDown: (handleId: IKHandleId, event: ThreeEvent<PointerEvent>) => void;
}

function SingleIKReticle({
  handleId,
  isSelected,
  isHovered,
  dimmedBySelection,
  dimmedByDrag,
  isCoarsePointer,
  hitboxColors,
  registerQuad,
  setIKHandleRef,
  onPointerOver,
  onPointerOut,
  onPointerDown,
}: SingleIKReticleProps) {
  const isPelvis = handleId === 'pelvis';
  const colliderRadius = isCoarsePointer ? 0.095 : 0.062;
  const reticleState = isSelected ? 2 : isHovered ? 1 : 0;
  const colorHex = isSelected
    ? hitboxColors.ringSelectedColor
    : isHovered
      ? hitboxColors.ringHoverColor
      : hitboxColors.ikCoreColor;

  let opacity = isSelected ? 0.96 : isHovered ? 0.92 : 0.72;
  if (dimmedByDrag) {
    opacity = isSelected ? 0.92 : 0.14;
  } else if (dimmedBySelection) {
    opacity *= 0.34;
  }

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(hitboxColors.ikCoreColor) },
          uContrastColor: {
            value: new THREE.Color(hitboxColors.ringContrastColor),
          },
          uOpacity: { value: 0.72 },
          uShape: { value: isPelvis ? 1 : 0 },
          uState: { value: 0 },
        },
        vertexShader: RETICLE_VERTEX_SHADER,
        fragmentShader: RETICLE_FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // Recreated only on handle shape mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPelvis]
  );

  useEffect(() => {
    material.uniforms.uColor.value.set(colorHex);
    material.uniforms.uContrastColor.value.set(hitboxColors.ringContrastColor);
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uState.value = reticleState;
  }, [
    material,
    colorHex,
    hitboxColors.ringContrastColor,
    opacity,
    reticleState,
  ]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <group
      name={`ik-handle-${handleId}`}
      ref={(grp) => setIKHandleRef(handleId, grp)}
    >
      <mesh
        name={`ik-reticle-${handleId}`}
        ref={(mesh) =>
          registerQuad(handleId, mesh, { isSelected, isHovered, isPelvis })
        }
        geometry={getSharedIKQuadGeometry()}
        material={material}
        renderOrder={11}
      />
      <mesh
        name={`ik-collider-${handleId}`}
        renderOrder={12}
        onPointerOver={(e) => onPointerOver(handleId, e)}
        onPointerOut={(e) => onPointerOut(handleId, e)}
        onPointerDown={(e) => onPointerDown(handleId, e)}
        onClick={(e) => e.stopPropagation()}
      >
        <sphereGeometry args={[colliderRadius, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

interface ActiveDirectDrag {
  handleId: IKHandleId;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWorldPos: THREE.Vector3;
  planeNormal: THREE.Vector3;
  grabOffset: THREE.Vector3;
  didDrag: boolean;
}

/**
 * Billboarded GLSL SDF target reticles for 5 IK handles with crisp contrast halos,
 * calm focus dimming, and 1-gesture direct screen-plane handle dragging.
 */
export function IKHandleMarkers({
  selectedHandle,
  hoveredHandle,
  moveBodyEnabled,
  isDraggingIK,
  isCoarsePointer,
  hitboxColors,
  activePreset,
  lensCurvature,
  bonesByName,
  dragGuardRef,
  setIKHandleRef,
  onHoverChange,
  onSelectHandle,
  onDirectDragStart,
  onDirectDragMove,
  onDirectDragEnd,
}: IKHandleMarkersProps) {
  const { camera, gl, size, invalidate, controls } = useThree();
  const controlsRef = useRef<OrbitControlsLike>(null);
  controlsRef.current = controls as OrbitControlsLike;

  const quadMapRef = useRef<
    Map<
      IKHandleId,
      {
        mesh: THREE.Mesh;
        isSelected: boolean;
        isHovered: boolean;
        isPelvis: boolean;
      }
    >
  >(new Map());
  const worldVecRef = useRef(new THREE.Vector3());
  const activeDirectDragRef = useRef<ActiveDirectDrag | null>(null);

  const latestRef = useRef({
    activePreset,
    lensCurvature,
    bonesByName,
    onHoverChange,
    onSelectHandle,
    onDirectDragStart,
    onDirectDragMove,
    onDirectDragEnd,
  });
  latestRef.current = {
    activePreset,
    lensCurvature,
    bonesByName,
    onHoverChange,
    onSelectHandle,
    onDirectDragStart,
    onDirectDragMove,
    onDirectDragEnd,
  };

  const registerQuad = useCallback(
    (
      handleId: IKHandleId,
      mesh: THREE.Mesh | null,
      meta: { isSelected: boolean; isHovered: boolean; isPelvis: boolean }
    ) => {
      if (mesh) {
        quadMapRef.current.set(handleId, { mesh, ...meta });
      } else {
        quadMapRef.current.delete(handleId);
      }
    },
    []
  );

  useFrame(() => {
    const baseFactor = isCoarsePointer ? 0.017 : 0.0135;
    for (const entry of Array.from(quadMapRef.current.values())) {
      entry.mesh.quaternion.copy(camera.quaternion);
      entry.mesh.getWorldPosition(worldVecRef.current);
      const dist = Math.max(0.5, camera.position.distanceTo(worldVecRef.current));
      let diam = THREE.MathUtils.clamp(dist * baseFactor, 0.038, 0.115);
      if (entry.isPelvis) diam *= 1.18;
      if (entry.isSelected) diam *= 1.16;
      else if (entry.isHovered) diam *= 1.08;
      entry.mesh.scale.set(diam, diam, 1);
    }
  });

  const intersectViewPlane = useCallback(
    (
      clientX: number,
      clientY: number,
      anchorPoint: THREE.Vector3,
      planeNormal: THREE.Vector3
    ): THREE.Vector3 | null => {
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

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        planeNormal,
        anchorPoint
      );
      const out = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, out) ? out : null;
    },
    [gl.domElement, size.width, size.height, camera]
  );

  const handlePointerOver = useCallback(
    (handleId: IKHandleId, event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      latestRef.current.onHoverChange(handleId);
      invalidate();
    },
    [invalidate]
  );

  const handlePointerOut = useCallback(
    (handleId: IKHandleId, event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (!activeDirectDragRef.current) {
        latestRef.current.onHoverChange(null);
        invalidate();
      }
      void handleId;
    },
    [invalidate]
  );

  const handlePointerDown = useCallback(
    (handleId: IKHandleId, event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      event.nativeEvent?.stopPropagation?.();

      const bone = latestRef.current.bonesByName.get(handleId);
      const startWorldPos = new THREE.Vector3();
      if (bone) {
        bone.getWorldPosition(startWorldPos);
      } else {
        startWorldPos.copy(event.point);
      }

      const planeNormal = new THREE.Vector3();
      camera.getWorldDirection(planeNormal).normalize();

      const initialHit = intersectViewPlane(
        event.clientX,
        event.clientY,
        startWorldPos,
        planeNormal
      );
      const grabOffset = initialHit
        ? startWorldPos.clone().sub(initialHit)
        : new THREE.Vector3();

      if (controlsRef.current) {
        controlsRef.current.enabled = false;
        controlsRef.current.cancel?.();
        controlsRef.current.stop?.();
      }

      dragGuardRef.current.isDragging = true;

      activeDirectDragRef.current = {
        handleId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWorldPos,
        planeNormal,
        grabOffset,
        didDrag: false,
      };

      try {
        gl.domElement.setPointerCapture?.(event.pointerId);
      } catch {
        // Ignore if pointer capture unavailable
      }
      invalidate();
    },
    [camera, intersectViewPlane, dragGuardRef, gl.domElement, invalidate]
  );

  useEffect(() => {
    const handleMove = (ev: PointerEvent) => {
      const drag = activeDirectDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      if (!drag.didDrag) {
        const travel = Math.hypot(
          ev.clientX - drag.startClientX,
          ev.clientY - drag.startClientY
        );
        if (travel < 4) return;
        drag.didDrag = true;
        latestRef.current.onSelectHandle(drag.handleId);
        latestRef.current.onDirectDragStart(
          drag.handleId,
          drag.startWorldPos.clone()
        );
      }

      const hit = intersectViewPlane(
        ev.clientX,
        ev.clientY,
        drag.startWorldPos,
        drag.planeNormal
      );
      if (!hit) return;

      const nextPos = hit.add(drag.grabOffset);
      latestRef.current.onDirectDragMove(drag.handleId, nextPos, 'screen');
      invalidate();
    };

    const finishDrag = (ev: PointerEvent) => {
      const drag = activeDirectDragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;

      activeDirectDragRef.current = null;
      try {
        if (gl.domElement.hasPointerCapture?.(ev.pointerId)) {
          gl.domElement.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // Ignore capture release errors
      }

      if (controlsRef.current) {
        controlsRef.current.stop?.();
        controlsRef.current.enabled = true;
      }
      dragGuardRef.current.isDragging = false;
      dragGuardRef.current.lastDragEndTime = performance.now();

      if (drag.didDrag) {
        latestRef.current.onDirectDragEnd(drag.handleId);
      } else {
        latestRef.current.onSelectHandle(drag.handleId);
      }
      invalidate();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      if (activeDirectDragRef.current) {
        const hadDrag = activeDirectDragRef.current.didDrag;
        const hId = activeDirectDragRef.current.handleId;
        activeDirectDragRef.current = null;
        if (controlsRef.current) {
          controlsRef.current.stop?.();
          controlsRef.current.enabled = true;
        }
        dragGuardRef.current.isDragging = false;
        dragGuardRef.current.lastDragEndTime = performance.now();
        if (hadDrag) {
          latestRef.current.onDirectDragEnd(hId);
        }
      }
    };
  }, [gl.domElement, dragGuardRef, intersectViewPlane, invalidate]);

  const hasSelection = !moveBodyEnabled && selectedHandle !== null;

  return (
    <group name="mortal-mesh-ik-handles">
      {IK_HANDLE_ORDER.map((handleId) => {
        const isSelected = !moveBodyEnabled && selectedHandle === handleId;
        const isHovered = hoveredHandle === handleId;

        return (
          <SingleIKReticle
            key={handleId}
            handleId={handleId}
            isSelected={isSelected}
            isHovered={isHovered}
            dimmedBySelection={hasSelection && !isSelected}
            dimmedByDrag={isDraggingIK}
            isCoarsePointer={isCoarsePointer}
            hitboxColors={hitboxColors}
            registerQuad={registerQuad}
            setIKHandleRef={setIKHandleRef}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onPointerDown={handlePointerDown}
          />
        );
      })}
    </group>
  );
}
