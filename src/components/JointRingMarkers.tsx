'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { StudioThemeHitboxColors } from '@/data/studioThemes';

export interface JointMarkerEntry {
  canonicalName: string;
  bone: THREE.Bone;
}

interface JointRingMarkersProps {
  entries: readonly JointMarkerEntry[];
  selectedBoneName: string | null;
  hoveredBoneName: string | null;
  pinnedSet: ReadonlySet<string>;
  moveBodyEnabled: boolean;
  isDraggingFK: boolean;
  isCoarsePointer: boolean;
  hitboxColors: StudioThemeHitboxColors;
  setHitboxRef: (canonicalName: string, obj: THREE.Object3D | null) => void;
  onBoneOver: (canonicalName: string, event: { stopPropagation: () => void }) => void;
  onBoneOut: (canonicalName: string, event: { stopPropagation: () => void }) => void;
  onBoneClick: (
    entry: JointMarkerEntry,
    event: { stopPropagation: () => void }
  ) => void;
}

const FINGER_BONE_PATTERN = /^(index|middle|pinky|ring|thumb)_/i;

let _sharedQuadGeometry: THREE.PlaneGeometry | null = null;
function getSharedQuadGeometry(): THREE.PlaneGeometry {
  if (!_sharedQuadGeometry) {
    _sharedQuadGeometry = new THREE.PlaneGeometry(1, 1);
  }
  return _sharedQuadGeometry;
}

const RING_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uContrastColor;
  uniform float uOpacity;
  uniform float uState; // 0 = idle, 1 = hovered, 2 = selected, 3 = pinned
  varying vec2 vUv;

  float ringBand(float r, float innerR, float outerR, float feather) {
    float inside = smoothstep(innerR - feather, innerR + feather, r);
    float outside = 1.0 - smoothstep(outerR - feather, outerR + feather, r);
    return inside * outside;
  }

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float feather = 0.055;

    // Main outer hollow precision ring (transparent core lets anatomy show through)
    float innerEdge = uState > 1.5 ? 0.54 : 0.60;
    float outerEdge = 0.84;
    float mainMask = ringBand(r, innerEdge, outerEdge, feather);

    // Delicate contrasting outer hairline for legibility on dark/light/bone surfaces
    float haloMask = ringBand(r, 0.82, 0.96, feather) * 0.42;

    // Optional center precision accent for Selected (pinpoint dot) or Pinned (double ring)
    float accentMask = 0.0;
    if (abs(uState - 2.0) < 0.25) {
      accentMask = 1.0 - smoothstep(0.20, 0.26, r);
    } else if (abs(uState - 3.0) < 0.25) {
      accentMask = ringBand(r, 0.30, 0.44, feather) * 0.88;
    }

    float colorMask = clamp(mainMask + accentMask, 0.0, 1.0);
    float totalAlpha = clamp((colorMask + haloMask * (1.0 - colorMask)) * uOpacity, 0.0, 1.0);
    if (totalAlpha < 0.01) discard;

    vec3 outColor = mix(uContrastColor, uColor, colorMask / max(colorMask + haloMask * (1.0 - colorMask), 0.001));
    gl_FragColor = vec4(outColor, totalAlpha);
  }
`;

interface SingleJointMarkerProps {
  entry: JointMarkerEntry;
  isSelected: boolean;
  isHovered: boolean;
  isPinned: boolean;
  dimmed: boolean;
  hiddenByDrag: boolean;
  isCoarsePointer: boolean;
  hitboxColors: StudioThemeHitboxColors;
  registerBillboard: (name: string, mesh: THREE.Mesh | null) => void;
  setHitboxRef: (canonicalName: string, obj: THREE.Object3D | null) => void;
  onOver: (event: { stopPropagation: () => void }) => void;
  onOut: (event: { stopPropagation: () => void }) => void;
  onClick: (event: { stopPropagation: () => void }) => void;
}

function SingleJointMarker({
  entry,
  isSelected,
  isHovered,
  isPinned,
  dimmed,
  hiddenByDrag,
  isCoarsePointer,
  hitboxColors,
  registerBillboard,
  setHitboxRef,
  onOver,
  onOut,
  onClick,
}: SingleJointMarkerProps) {
  const isFinger = FINGER_BONE_PATTERN.test(entry.canonicalName);

  const ringState = isSelected ? 2 : isPinned ? 3 : isHovered ? 1 : 0;
  const colorHex = isSelected
    ? hitboxColors.ringSelectedColor
    : isPinned
      ? hitboxColors.ringPinnedColor
      : isHovered
        ? hitboxColors.ringHoverColor
        : hitboxColors.ringIdleColor;

  let opacity = isSelected
    ? 0.96
    : isPinned
      ? 0.86
      : isHovered
        ? 0.92
        : hitboxColors.ringIdleOpacity;
  if (hiddenByDrag) {
    opacity = 0;
  } else if (dimmed) {
    opacity *= 0.24;
  }

  const baseDiameter = isFinger ? 0.014 : 0.027;
  const visualDiameter = isSelected
    ? baseDiameter * 1.24
    : isHovered || isPinned
      ? baseDiameter * 1.14
      : baseDiameter;

  const colliderRadius = isCoarsePointer
    ? isFinger
      ? 0.032
      : 0.058
    : isFinger
      ? 0.02
      : 0.042;

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(hitboxColors.ringIdleColor) },
          uContrastColor: {
            value: new THREE.Color(hitboxColors.ringContrastColor),
          },
          uOpacity: { value: hitboxColors.ringIdleOpacity },
          uState: { value: 0 },
        },
        vertexShader: RING_VERTEX_SHADER,
        fragmentShader: RING_FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // Recreated cleanly only on mount; uniforms updated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    material.uniforms.uColor.value.set(colorHex);
    material.uniforms.uContrastColor.value.set(hitboxColors.ringContrastColor);
    material.uniforms.uOpacity.value = opacity;
    material.uniforms.uState.value = ringState;
  }, [
    material,
    colorHex,
    hitboxColors.ringContrastColor,
    opacity,
    ringState,
  ]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  return (
    <group
      ref={(obj) => setHitboxRef(entry.canonicalName, obj)}
    >
      <mesh
        ref={(mesh) => registerBillboard(entry.canonicalName, mesh)}
        geometry={getSharedQuadGeometry()}
        material={material}
        scale={[visualDiameter, visualDiameter, 1]}
        renderOrder={10}
      />
      <mesh
        renderOrder={9}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
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

/**
 * Renders unobtrusive GLSL SDF hollow pin-rings at poseable joints instead of
 * solid spheres, leaving silhouette and muscular landmarks clearly visible.
 */
export function JointRingMarkers({
  entries,
  selectedBoneName,
  hoveredBoneName,
  pinnedSet,
  moveBodyEnabled,
  isDraggingFK,
  isCoarsePointer,
  hitboxColors,
  setHitboxRef,
  onBoneOver,
  onBoneOut,
  onBoneClick,
}: JointRingMarkersProps) {
  const billboardRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  const registerBillboard = (name: string, mesh: THREE.Mesh | null) => {
    if (mesh) {
      billboardRefs.current.set(name, mesh);
    } else {
      billboardRefs.current.delete(name);
    }
  };

  useFrame(({ camera }) => {
    for (const mesh of Array.from(billboardRefs.current.values())) {
      mesh.quaternion.copy(camera.quaternion);
    }
  });

  const hasSelection = !moveBodyEnabled && selectedBoneName !== null;

  return (
    <group name="mortal-mesh-hitboxes">
      {entries.map((entry) => {
        const isSelected =
          !moveBodyEnabled && selectedBoneName === entry.canonicalName;
        const isHovered = hoveredBoneName === entry.canonicalName;
        const isPinned = pinnedSet.has(entry.canonicalName);

        return (
          <SingleJointMarker
            key={entry.canonicalName}
            entry={entry}
            isSelected={isSelected}
            isHovered={isHovered}
            isPinned={isPinned}
            dimmed={hasSelection && !isSelected}
            hiddenByDrag={isDraggingFK && !isSelected}
            isCoarsePointer={isCoarsePointer}
            hitboxColors={hitboxColors}
            registerBillboard={registerBillboard}
            setHitboxRef={setHitboxRef}
            onOver={(e) => onBoneOver(entry.canonicalName, e)}
            onOut={(e) => onBoneOut(entry.canonicalName, e)}
            onClick={(e) => onBoneClick(entry, e)}
          />
        );
      })}
    </group>
  );
}
