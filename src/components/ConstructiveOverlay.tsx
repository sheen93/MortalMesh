'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RigAdapter } from '@/rig/rigAdapter';
import type { FigureProportions, StudioThemeId } from '@/types/anatomy';
import {
  effectiveShowLandmarks,
  shouldShowConstructiveRig,
  type StudioDrawingConfig,
} from '@/types/drawing';
import {
  computeConstructiveFigureData,
  type BonyLandmarkPoint,
  type ConstructiveFigureData,
  type CrossContourRingData,
  type JointBallData,
  type LimbCylinderData,
  type TaperedPrismData,
} from '@/utils/constructiveGeometry';

export interface ConstructiveOverlayHandle {
  sync: () => void;
}

interface ConstructiveOverlayProps {
  mannequinId: string;
  rigAdapter: RigAdapter;
  baseHeadHeight: number;
  proportions: FigureProportions;
  groundY?: number;
  visible: boolean;
  drawing: StudioDrawingConfig;
  studioTheme: StudioThemeId;
}

const NOOP_RAYCAST = () => {};

const PRISM_TRI_INDICES: ReadonlyArray<number> = [
  1, 0, 4, 1, 4, 5, // front (+Z)
  0, 3, 7, 0, 7, 4, // left (+X)
  3, 2, 6, 3, 6, 7, // back (-Z)
  2, 1, 5, 2, 5, 6, // right (-X)
  5, 4, 7, 5, 7, 6, // top (+Y)
  0, 1, 2, 0, 2, 3, // bottom (-Y)
];

function createFacetedPrismGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(PRISM_TRI_INDICES.length * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geom;
}

function updateFacetedPrismGeometry(
  geom: THREE.BufferGeometry,
  prism: TaperedPrismData
): void {
  const attr = geom.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const corners = prism.corners;
  for (let i = 0; i < PRISM_TRI_INDICES.length; i += 1) {
    const c = corners[PRISM_TRI_INDICES[i]];
    const o = i * 3;
    arr[o] = c.x;
    arr[o + 1] = c.y;
    arr[o + 2] = c.z;
  }
  attr.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
}

const LIMB_SEGMENTS = 12;

function createTaperedLimbGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  // 12 quads around side = 24 triangles + bottom cap (12) + top cap (12) = 48 tris = 144 verts
  const pos = new Float32Array(LIMB_SEGMENTS * 4 * 3 * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geom;
}

function updateTaperedLimbGeometry(
  geom: THREE.BufferGeometry,
  rBottom: number,
  rTop: number,
  height: number
): void {
  const attr = geom.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const hy = height * 0.5;
  let ptr = 0;

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number
  ) => {
    arr[ptr++] = ax;
    arr[ptr++] = ay;
    arr[ptr++] = az;
    arr[ptr++] = bx;
    arr[ptr++] = by;
    arr[ptr++] = bz;
    arr[ptr++] = cx;
    arr[ptr++] = cy;
    arr[ptr++] = cz;
  };

  for (let i = 0; i < LIMB_SEGMENTS; i += 1) {
    const a0 = (i / LIMB_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / LIMB_SEGMENTS) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    const bx0 = c0 * rBottom;
    const bz0 = s0 * rBottom;
    const bx1 = c1 * rBottom;
    const bz1 = s1 * rBottom;

    const tx0 = c0 * rTop;
    const tz0 = s0 * rTop;
    const tx1 = c1 * rTop;
    const tz1 = s1 * rTop;

    // Outward side quad (note CCW when viewed from outside)
    pushTri(bx1, -hy, bz1, bx0, -hy, bz0, tx0, hy, tz0);
    pushTri(bx1, -hy, bz1, tx0, hy, tz0, tx1, hy, tz1);

    // Top cap (+Y)
    pushTri(0, hy, 0, tx1, hy, tz1, tx0, hy, tz0);
    // Bottom cap (-Y)
    pushTri(0, -hy, 0, bx0, -hy, bz0, bx1, -hy, bz1);
  }

  attr.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
}

function appendRingSegments(
  target: number[],
  ring: CrossContourRingData
): void {
  const pts = ring.points;
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    target.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
}

function appendSegment(target: number[], a: THREE.Vector3, b: THREE.Vector3): void {
  target.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

function appendPrismWireframe(target: number[], prism: TaperedPrismData): void {
  for (const [i0, i1] of prism.edges) {
    appendSegment(target, prism.corners[i0], prism.corners[i1]);
  }
  appendSegment(target, prism.frontCenterLine[0], prism.frontCenterLine[1]);
}

function syncDynamicLineSegments(
  geom: THREE.BufferGeometry,
  coords: readonly number[]
): void {
  const attr = geom.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const count = Math.min(coords.length, arr.length);
  for (let i = 0; i < count; i += 1) {
    arr[i] = coords[i];
  }
  for (let i = count; i < arr.length; i += 1) {
    arr[i] = 0;
  }
  attr.needsUpdate = true;
  geom.setDrawRange(0, Math.floor(count / 3));
  geom.computeBoundingSphere();
}

export const ConstructiveOverlay = forwardRef<
  ConstructiveOverlayHandle,
  ConstructiveOverlayProps
>(function ConstructiveOverlay(
  {
    mannequinId,
    rigAdapter,
    baseHeadHeight,
    proportions,
    groundY = 0,
    visible,
    drawing,
    studioTheme,
  },
  ref
) {
  const { invalidate } = useThree();
  const rootGroupRef = useRef<THREE.Group>(null);
  const headSphereRef = useRef<THREE.Mesh>(null);
  const sidePlaneLRef = useRef<THREE.Mesh>(null);
  const sidePlaneRRef = useRef<THREE.Mesh>(null);
  const ribMeshRef = useRef<THREE.Mesh>(null);
  const pelvisMeshRef = useRef<THREE.Mesh>(null);
  const jawMeshRef = useRef<THREE.Mesh>(null);
  const limbMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const ballMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const extremityMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const landmarkMeshRefs = useRef<Array<THREE.Mesh | null>>([]);

  const showRig = visible && shouldShowConstructiveRig(drawing);
  const showSolidVolumes = visible && drawing.constructiveMode !== 'off';
  const showLandmarks = effectiveShowLandmarks(drawing);

  const propsRef = useRef({
    mannequinId,
    rigAdapter,
    baseHeadHeight,
    proportions,
    groundY,
    showRig,
    showSolidVolumes,
    showCrossContours: drawing.showCrossContours,
    showLineOfAction: drawing.showLineOfAction,
    showPlumbLine: drawing.showPlumbLine,
    showLandmarks,
  });
  propsRef.current = {
    mannequinId,
    rigAdapter,
    baseHeadHeight,
    proportions,
    groundY,
    showRig,
    showSolidVolumes,
    showCrossContours: drawing.showCrossContours,
    showLineOfAction: drawing.showLineOfAction,
    showPlumbLine: drawing.showPlumbLine,
    showLandmarks,
  };

  const resources = useMemo(() => {
    const unitSphereGeom = new THREE.SphereGeometry(1, 20, 14);
    const pivotSphereGeom = new THREE.SphereGeometry(1, 14, 10);
    const sidePlaneGeom = new THREE.CylinderGeometry(1, 1, 0.012, 20);
    sidePlaneGeom.rotateZ(Math.PI / 2);

    const landmarkGeom = new THREE.OctahedronGeometry(0.016, 0);

    const ribGeom = createFacetedPrismGeometry();
    const pelvisGeom = createFacetedPrismGeometry();
    const jawGeom = createFacetedPrismGeometry();
    const extremityGeoms = Array.from({ length: 4 }, () =>
      createFacetedPrismGeometry()
    );
    const limbGeoms = Array.from({ length: 8 }, () =>
      createTaperedLimbGeometry()
    );

    // Pre-allocated dynamic line buffers (generous upper capacity, resized via drawRange)
    const maxStructFloats = 4096 * 3;
    const structLineGeom = new THREE.BufferGeometry();
    structLineGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(maxStructFloats), 3)
    );
    structLineGeom.setDrawRange(0, 0);

    const contourLineGeom = new THREE.BufferGeometry();
    contourLineGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(maxStructFloats), 3)
    );
    contourLineGeom.setDrawRange(0, 0);

    const loaLineGeom = new THREE.BufferGeometry();
    loaLineGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(128 * 3), 3)
    );
    loaLineGeom.setDrawRange(0, 0);

    const plumbLineGeom = new THREE.BufferGeometry();
    plumbLineGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(512 * 3), 3)
    );
    plumbLineGeom.setDrawRange(0, 0);

    const massMat = new THREE.MeshStandardMaterial({
      color: '#D5D8DF',
      roughness: 0.72,
      metalness: 0.04,
      flatShading: true,
    });
    const limbMat = new THREE.MeshStandardMaterial({
      color: '#DDE0E6',
      roughness: 0.68,
      metalness: 0.04,
    });
    const pivotMat = new THREE.MeshStandardMaterial({
      color: '#95A2B8',
      roughness: 0.55,
      metalness: 0.08,
    });
    const landmarkMat = new THREE.MeshBasicMaterial({
      color: '#2563EB',
    });

    const structLineMat = new THREE.LineBasicMaterial({
      color: '#2E73B8',
      transparent: true,
      opacity: 0.85,
    });
    const contourLineMat = new THREE.LineBasicMaterial({
      color: '#1E5FA4',
      transparent: true,
      opacity: 0.88,
    });
    const loaLineMat = new THREE.LineBasicMaterial({
      color: '#E05246',
      transparent: true,
      opacity: 0.94,
    });
    const plumbLineMat = new THREE.LineBasicMaterial({
      color: '#2A9672',
      transparent: true,
      opacity: 0.9,
    });

    return {
      unitSphereGeom,
      pivotSphereGeom,
      sidePlaneGeom,
      landmarkGeom,
      ribGeom,
      pelvisGeom,
      jawGeom,
      extremityGeoms,
      limbGeoms,
      structLineGeom,
      contourLineGeom,
      loaLineGeom,
      plumbLineGeom,
      massMat,
      limbMat,
      pivotMat,
      landmarkMat,
      structLineMat,
      contourLineMat,
      loaLineMat,
      plumbLineMat,
    };
  }, []);

  useEffect(() => {
    const {
      massMat,
      limbMat,
      pivotMat,
      structLineMat,
      contourLineMat,
    } = resources;
    if (studioTheme === 'dark') {
      massMat.color.set('#B4BBC6');
      limbMat.color.set('#C5CBD6');
      pivotMat.color.set('#7D95B5');
      structLineMat.color.set('#60A5FA');
      contourLineMat.color.set('#38BDF8');
    } else if (studioTheme === 'light') {
      massMat.color.set('#DCDFE6');
      limbMat.color.set('#E6E8EE');
      pivotMat.color.set('#7C899E');
      structLineMat.color.set('#2563EB');
      contourLineMat.color.set('#1D4ED8');
    } else {
      massMat.color.set('#D5D8DF');
      limbMat.color.set('#DDE0E6');
      pivotMat.color.set('#8796AE');
      structLineMat.color.set('#2E73B8');
      contourLineMat.color.set('#1D4ED8');
    }
    invalidate();
  }, [studioTheme, resources, invalidate]);

  useEffect(() => {
    return () => {
      resources.unitSphereGeom.dispose();
      resources.pivotSphereGeom.dispose();
      resources.sidePlaneGeom.dispose();
      resources.landmarkGeom.dispose();
      resources.ribGeom.dispose();
      resources.pelvisGeom.dispose();
      resources.jawGeom.dispose();
      resources.extremityGeoms.forEach((g) => g.dispose());
      resources.limbGeoms.forEach((g) => g.dispose());
      resources.structLineGeom.dispose();
      resources.contourLineGeom.dispose();
      resources.loaLineGeom.dispose();
      resources.plumbLineGeom.dispose();
      resources.massMat.dispose();
      resources.limbMat.dispose();
      resources.pivotMat.dispose();
      resources.landmarkMat.dispose();
      resources.structLineMat.dispose();
      resources.contourLineMat.dispose();
      resources.loaLineMat.dispose();
      resources.plumbLineMat.dispose();
    };
  }, [resources]);

  const applyDataToScene = useCallback(
    (data: ConstructiveFigureData) => {
      const cfg = propsRef.current;

      if (headSphereRef.current) {
        headSphereRef.current.position.copy(data.loomisHead.craniumCenter);
        headSphereRef.current.quaternion.copy(data.loomisHead.quaternion);
        headSphereRef.current.scale.setScalar(data.loomisHead.craniumRadius);
      }

      const headLeft = new THREE.Vector3(1, 0, 0).applyQuaternion(
        data.loomisHead.quaternion
      );
      if (sidePlaneLRef.current) {
        sidePlaneLRef.current.position
          .copy(data.loomisHead.craniumCenter)
          .addScaledVector(headLeft, data.loomisHead.sideOffset);
        sidePlaneLRef.current.quaternion.copy(data.loomisHead.quaternion);
        sidePlaneLRef.current.scale.set(
          1,
          data.loomisHead.sideRadius,
          data.loomisHead.sideRadius
        );
      }
      if (sidePlaneRRef.current) {
        sidePlaneRRef.current.position
          .copy(data.loomisHead.craniumCenter)
          .addScaledVector(headLeft, -data.loomisHead.sideOffset);
        sidePlaneRRef.current.quaternion.copy(data.loomisHead.quaternion);
        sidePlaneRRef.current.scale.set(
          1,
          data.loomisHead.sideRadius,
          data.loomisHead.sideRadius
        );
      }

      if (ribMeshRef.current) {
        updateFacetedPrismGeometry(resources.ribGeom, data.ribcage);
      }
      if (pelvisMeshRef.current) {
        updateFacetedPrismGeometry(resources.pelvisGeom, data.pelvisMass);
      }
      if (jawMeshRef.current) {
        updateFacetedPrismGeometry(resources.jawGeom, data.loomisHead.jawWedge);
      }

      data.extremities.forEach((ext: TaperedPrismData, i: number) => {
        const mesh = extremityMeshRefs.current[i];
        const geom = resources.extremityGeoms[i];
        if (mesh && geom) {
          updateFacetedPrismGeometry(geom, ext);
        }
      });

      data.limbs.forEach((limb: LimbCylinderData, i: number) => {
        const mesh = limbMeshRefs.current[i];
        const geom = resources.limbGeoms[i];
        if (mesh && geom) {
          mesh.position.copy(limb.midPoint);
          mesh.quaternion.copy(limb.quaternion);
          updateTaperedLimbGeometry(
            geom,
            limb.radiusStart,
            limb.radiusEnd,
            limb.length
          );
        }
      });

      data.jointBalls.forEach((ball: JointBallData, i: number) => {
        const mesh = ballMeshRefs.current[i];
        if (mesh) {
          mesh.position.copy(ball.center);
          mesh.scale.setScalar(ball.radius);
        }
      });

      data.landmarks.forEach((lm: BonyLandmarkPoint, i: number) => {
        const mesh = landmarkMeshRefs.current[i];
        if (mesh) {
          mesh.position.copy(lm.position);
        }
      });

      // Structural wire lines (Loomis rings, Bridgman ribcage/pelvis edges & tilt bars)
      const structCoords: number[] = [];
      appendRingSegments(structCoords, data.loomisHead.browRing);
      appendRingSegments(structCoords, data.loomisHead.meridianRing);
      appendRingSegments(structCoords, data.loomisHead.sideRingL);
      appendRingSegments(structCoords, data.loomisHead.sideRingR);
      appendPrismWireframe(structCoords, data.loomisHead.jawWedge);
      appendPrismWireframe(structCoords, data.ribcage);
      appendPrismWireframe(structCoords, data.pelvisMass);
      appendSegment(
        structCoords,
        data.shoulderTiltBar[0],
        data.shoulderTiltBar[1]
      );
      appendSegment(structCoords, data.hipTiltBar[0], data.hipTiltBar[1]);
      for (const ext of data.extremities) {
        appendPrismWireframe(structCoords, ext);
      }
      syncDynamicLineSegments(resources.structLineGeom, structCoords);

      // Cross-contour limb rings
      const contourCoords: number[] = [];
      if (cfg.showCrossContours) {
        for (const limb of data.limbs) {
          for (const ring of limb.crossContours) {
            appendRingSegments(contourCoords, ring);
          }
        }
      }
      syncDynamicLineSegments(resources.contourLineGeom, contourCoords);

      // Line of Action curve
      const loaCoords: number[] = [];
      if (cfg.showLineOfAction) {
        for (let i = 0; i < data.lineOfAction.length - 1; i += 1) {
          appendSegment(
            loaCoords,
            data.lineOfAction[i],
            data.lineOfAction[i + 1]
          );
        }
      }
      syncDynamicLineSegments(resources.loaLineGeom, loaCoords);

      // Gravity Plumb Line + dashed ticks + floor crosshair
      const plumbCoords: number[] = [];
      if (cfg.showPlumbLine) {
        const [top, bot] = data.plumbLine;
        const dashes = 18;
        for (let i = 0; i < dashes; i += 2) {
          const t0 = i / dashes;
          const t1 = Math.min(1, (i + 1.15) / dashes);
          const a = top.clone().lerp(bot, t0);
          const b = top.clone().lerp(bot, t1);
          appendSegment(plumbCoords, a, b);
        }
        const yFloor = bot.y + 0.004;
        const r = 0.065;
        appendSegment(
          plumbCoords,
          new THREE.Vector3(bot.x - r, yFloor, bot.z),
          new THREE.Vector3(bot.x + r, yFloor, bot.z)
        );
        appendSegment(
          plumbCoords,
          new THREE.Vector3(bot.x, yFloor, bot.z - r),
          new THREE.Vector3(bot.x, yFloor, bot.z + r)
        );
        for (let s = 0; s < 16; s += 1) {
          const a0 = (s / 16) * Math.PI * 2;
          const a1 = ((s + 1) / 16) * Math.PI * 2;
          appendSegment(
            plumbCoords,
            new THREE.Vector3(
              bot.x + Math.cos(a0) * 0.045,
              yFloor,
              bot.z + Math.sin(a0) * 0.045
            ),
            new THREE.Vector3(
              bot.x + Math.cos(a1) * 0.045,
              yFloor,
              bot.z + Math.sin(a1) * 0.045
            )
          );
        }
      }
      syncDynamicLineSegments(resources.plumbLineGeom, plumbCoords);
    },
    [resources]
  );

  const sync = useCallback(() => {
    const cfg = propsRef.current;
    if (!cfg.showRig) return;

    const data = computeConstructiveFigureData({
      mannequinId: cfg.mannequinId,
      rigAdapter: cfg.rigAdapter,
      baseHeadHeight: cfg.baseHeadHeight,
      proportions: cfg.proportions,
      groundY: cfg.groundY,
    });
    applyDataToScene(data);
    invalidate();
  }, [applyDataToScene, invalidate]);

  useImperativeHandle(ref, () => ({ sync }), [sync]);

  useEffect(() => {
    sync();
    invalidate();
  }, [
    showRig,
    showSolidVolumes,
    drawing.showCrossContours,
    drawing.showLineOfAction,
    drawing.showPlumbLine,
    showLandmarks,
    proportions,
    sync,
    invalidate,
  ]);

  if (!showRig) {
    return null;
  }

  return (
    <group
      ref={rootGroupRef}
      name="mortal-mesh-constructive-overlay"
      userData={{ mannequinId }}
    >
      {/* Solid Loomis & Bridgman masses (hidden in wireframe-only drawing presets unless ghost/only is selected) */}
      <group visible={showSolidVolumes}>
        <mesh
          ref={headSphereRef}
          geometry={resources.unitSphereGeom}
          material={resources.massMat}
          raycast={NOOP_RAYCAST}
          castShadow
          receiveShadow
        />
        <mesh
          ref={sidePlaneLRef}
          geometry={resources.sidePlaneGeom}
          material={resources.pivotMat}
          raycast={NOOP_RAYCAST}
        />
        <mesh
          ref={sidePlaneRRef}
          geometry={resources.sidePlaneGeom}
          material={resources.pivotMat}
          raycast={NOOP_RAYCAST}
        />
        <mesh
          ref={jawMeshRef}
          geometry={resources.jawGeom}
          material={resources.massMat}
          raycast={NOOP_RAYCAST}
          castShadow
          receiveShadow
        />
        <mesh
          ref={ribMeshRef}
          geometry={resources.ribGeom}
          material={resources.massMat}
          raycast={NOOP_RAYCAST}
          castShadow
          receiveShadow
        />
        <mesh
          ref={pelvisMeshRef}
          geometry={resources.pelvisGeom}
          material={resources.massMat}
          raycast={NOOP_RAYCAST}
          castShadow
          receiveShadow
        />
        {resources.extremityGeoms.map((geom, i) => (
          <mesh
            key={`ext-mesh-${i}`}
            ref={(el) => {
              extremityMeshRefs.current[i] = el;
            }}
            geometry={geom}
            material={resources.massMat}
            raycast={NOOP_RAYCAST}
            castShadow
            receiveShadow
          />
        ))}
        {resources.limbGeoms.map((geom, i) => (
          <mesh
            key={`limb-mesh-${i}`}
            ref={(el) => {
              limbMeshRefs.current[i] = el;
            }}
            geometry={geom}
            material={resources.limbMat}
            raycast={NOOP_RAYCAST}
            castShadow
            receiveShadow
          />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <mesh
            key={`pivot-ball-${i}`}
            ref={(el) => {
              ballMeshRefs.current[i] = el;
            }}
            geometry={resources.pivotSphereGeom}
            material={resources.pivotMat}
            raycast={NOOP_RAYCAST}
          />
        ))}
      </group>

      {/* Overlay guide lines excluded cleanly from Normal+Depth edge pass */}
      <group userData={{ isConstructiveLine: true }}>
        <lineSegments
          geometry={resources.structLineGeom}
          material={resources.structLineMat}
          raycast={NOOP_RAYCAST}
          userData={{ isConstructiveLine: true }}
          frustumCulled={false}
        />
        <lineSegments
          geometry={resources.contourLineGeom}
          material={resources.contourLineMat}
          raycast={NOOP_RAYCAST}
          userData={{ isConstructiveLine: true }}
          visible={drawing.showCrossContours}
          frustumCulled={false}
        />
        <lineSegments
          geometry={resources.loaLineGeom}
          material={resources.loaLineMat}
          raycast={NOOP_RAYCAST}
          userData={{ isConstructiveLine: true }}
          visible={drawing.showLineOfAction}
          frustumCulled={false}
        />
        <lineSegments
          geometry={resources.plumbLineGeom}
          material={resources.plumbLineMat}
          raycast={NOOP_RAYCAST}
          userData={{ isConstructiveLine: true }}
          visible={drawing.showPlumbLine}
          frustumCulled={false}
        />
        <group visible={showLandmarks} userData={{ isConstructiveLine: true }}>
          {Array.from({ length: 14 }, (_, i) => (
            <mesh
              key={`landmark-pin-${i}`}
              ref={(el) => {
                landmarkMeshRefs.current[i] = el;
              }}
              geometry={resources.landmarkGeom}
              material={resources.landmarkMat}
              raycast={NOOP_RAYCAST}
              userData={{ isConstructiveLine: true }}
            />
          ))}
        </group>
      </group>
    </group>
  );
});
