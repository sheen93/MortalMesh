import * as THREE from 'three';
import { CANONICAL_REST_WORLD_QUATS } from '@/rig/canonicalReference';
import type { RigAdapter } from '@/rig/rigAdapter';
import type { FigureProportions } from '@/types/anatomy';

export interface TaperedPrismData {
  id: string;
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
  widthBottom: number;
  widthTop: number;
  depthBottom: number;
  depthTop: number;
  height: number;
  corners: THREE.Vector3[]; // [0..3] bottom (FR, BR, BL, FL), [4..7] top
  edges: ReadonlyArray<readonly [number, number]>;
  faces: ReadonlyArray<readonly [number, number, number, number]>;
  frontCenterLine: [THREE.Vector3, THREE.Vector3];
}

export interface CrossContourRingData {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  radiusU: number;
  radiusV: number;
  points: THREE.Vector3[];
}

export interface LimbCylinderData {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  midPoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  radiusStart: number; // at `start` (proximal)
  radiusEnd: number; // at `end` (distal)
  crossContours: CrossContourRingData[];
}

export interface JointBallData {
  id: string;
  center: THREE.Vector3;
  radius: number;
}

export interface LoomisHeadData {
  craniumCenter: THREE.Vector3;
  quaternion: THREE.Quaternion;
  craniumRadius: number;
  sideOffset: number;
  sideRadius: number;
  browRing: CrossContourRingData;
  meridianRing: CrossContourRingData;
  sideRingL: CrossContourRingData;
  sideRingR: CrossContourRingData;
  jawWedge: TaperedPrismData;
}

export interface BonyLandmarkPoint {
  id: string;
  label: string;
  position: THREE.Vector3;
}

export interface ConstructiveFigureData {
  mannequinId: string;
  loomisHead: LoomisHeadData;
  ribcage: TaperedPrismData;
  pelvisMass: TaperedPrismData;
  shoulderTiltBar: [THREE.Vector3, THREE.Vector3];
  hipTiltBar: [THREE.Vector3, THREE.Vector3];
  limbs: LimbCylinderData[];
  jointBalls: JointBallData[];
  extremities: TaperedPrismData[];
  lineOfAction: THREE.Vector3[];
  plumbLine: [THREE.Vector3, THREE.Vector3];
  landmarks: BonyLandmarkPoint[];
}

export const PRISM_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

// Outward CCW quads matching corners:
// Bottom: 0 (+x,-y,+z), 1 (-x,-y,+z), 2 (-x,-y,-z), 3 (+x,-y,-z)
// Top:    4 (+x,+y,+z), 5 (-x,+y,+z), 6 (-x,+y,-z), 7 (+x,+y,-z)
export const PRISM_FACES: ReadonlyArray<readonly [number, number, number, number]> =
  [
    [1, 0, 4, 5], // front (+Z)
    [0, 3, 7, 4], // viewer-left / anatomical +X side
    [3, 2, 6, 7], // back (-Z)
    [2, 1, 5, 6], // anatomical -X side
    [5, 4, 7, 6], // top (+Y)
    [0, 1, 2, 3], // bottom (-Y)
  ];

const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const WORLD_Z = new THREE.Vector3(0, 0, 1);

const _restQuatCache = new Map<string, THREE.Quaternion>();

function getCanonicalRestWorldQuat(name: string): THREE.Quaternion {
  let cached = _restQuatCache.get(name);
  if (!cached) {
    const t = CANONICAL_REST_WORLD_QUATS[name];
    cached = t
      ? new THREE.Quaternion(t[0], t[1], t[2], t[3]).normalize()
      : new THREE.Quaternion();
    _restQuatCache.set(name, cached);
  }
  return cached;
}

function getBoneWorldPos(
  rigAdapter: RigAdapter,
  name: string,
  fallback = new THREE.Vector3(0, 1, 0)
): THREE.Vector3 {
  const b = rigAdapter.getBone(name);
  if (!b) return fallback.clone();
  return b.getWorldPosition(new THREE.Vector3());
}

function getBoneDeltaWorldQuat(
  rigAdapter: RigAdapter,
  name: string
): THREE.Quaternion {
  if (!rigAdapter.hasJoint(name)) {
    return new THREE.Quaternion();
  }
  const curr = rigAdapter.getCanonicalCurrentWorldQuat(
    name,
    new THREE.Quaternion()
  );
  const rest = getCanonicalRestWorldQuat(name);
  return curr.multiply(rest.clone().invert()).normalize();
}

function buildRingPoints(
  center: THREE.Vector3,
  uAxis: THREE.Vector3,
  vAxis: THREE.Vector3,
  radiusU: number,
  radiusV: number,
  segments = 24
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a) * radiusU;
    const sa = Math.sin(a) * radiusV;
    pts.push(
      new THREE.Vector3()
        .copy(center)
        .addScaledVector(uAxis, ca)
        .addScaledVector(vAxis, sa)
    );
  }
  return pts;
}

function createRing(
  center: THREE.Vector3,
  uAxis: THREE.Vector3,
  vAxis: THREE.Vector3,
  radiusU: number,
  radiusV: number,
  segments = 24
): CrossContourRingData {
  const u = uAxis.clone().normalize();
  const v = vAxis.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(u, v).normalize();
  return {
    center: center.clone(),
    normal,
    uAxis: u,
    vAxis: v,
    radiusU,
    radiusV,
    points: buildRingPoints(center, u, v, radiusU, radiusV, segments),
  };
}

function buildBasisQuat(
  upDir: THREE.Vector3,
  forwardHint: THREE.Vector3
): THREE.Quaternion {
  const y = upDir.clone();
  if (y.lengthSq() < 1e-8) y.set(0, 1, 0);
  else y.normalize();

  const z = forwardHint.clone().addScaledVector(y, -forwardHint.dot(y));
  if (z.lengthSq() < 1e-6) {
    const fallback = Math.abs(y.y) < 0.9 ? WORLD_Y : WORLD_X;
    z.crossVectors(fallback, y);
  }
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const mat = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

function createTaperedPrismData(
  id: string,
  center: THREE.Vector3,
  quaternion: THREE.Quaternion,
  widthBottom: number,
  widthTop: number,
  depthBottom: number,
  depthTop: number,
  height: number
): TaperedPrismData {
  const hb = widthBottom * 0.5;
  const ht = widthTop * 0.5;
  const db = depthBottom * 0.5;
  const dt = depthTop * 0.5;
  const hy = height * 0.5;

  const localCorners: [number, number, number][] = [
    [hb, -hy, db],
    [-hb, -hy, db],
    [-hb, -hy, -db],
    [hb, -hy, -db],
    [ht, hy, dt],
    [-ht, hy, dt],
    [-ht, hy, -dt],
    [ht, hy, -dt],
  ];

  const corners = localCorners.map(([x, y, z]) =>
    new THREE.Vector3(x, y, z).applyQuaternion(quaternion).add(center)
  );

  const frontBot = new THREE.Vector3(0, -hy, db)
    .applyQuaternion(quaternion)
    .add(center);
  const frontTop = new THREE.Vector3(0, hy, dt)
    .applyQuaternion(quaternion)
    .add(center);

  return {
    id,
    center: center.clone(),
    quaternion: quaternion.clone(),
    widthBottom,
    widthTop,
    depthBottom,
    depthTop,
    height,
    corners,
    edges: PRISM_EDGES,
    faces: PRISM_FACES,
    frontCenterLine: [frontBot, frontTop],
  };
}

function buildLimbSegment(
  id: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  forwardHint: THREE.Vector3
): LimbCylinderData {
  const axis = new THREE.Vector3().subVectors(end, start);
  const len = Math.max(0.04, axis.length());
  const upDir = axis.clone().divideScalar(len);
  const quat = buildBasisQuat(upDir, forwardHint);
  const uAxis = WORLD_X.clone().applyQuaternion(quat).normalize();
  const vAxis = WORLD_Z.clone().applyQuaternion(quat).normalize();
  const midPoint = start.clone().lerp(end, 0.5);

  const crossContours: CrossContourRingData[] = [0.24, 0.5, 0.76].map(
    (t) => {
      const center = start.clone().lerp(end, t);
      const r = THREE.MathUtils.lerp(radiusStart, radiusEnd, t) * 1.035;
      return {
        center,
        normal: upDir.clone(),
        uAxis,
        vAxis,
        radiusU: r,
        radiusV: r,
        points: buildRingPoints(center, uAxis, vAxis, r, r, 20),
      };
    }
  );

  return {
    id,
    start: start.clone(),
    end: end.clone(),
    midPoint,
    quaternion: quat,
    length: len,
    radiusStart,
    radiusEnd,
    crossContours,
  };
}

export function computeConstructiveFigureData({
  mannequinId,
  rigAdapter,
  baseHeadHeight,
  proportions,
  groundY = 0,
}: {
  mannequinId: string;
  rigAdapter: RigAdapter;
  baseHeadHeight: number;
  proportions: FigureProportions;
  groundY?: number;
}): ConstructiveFigureData {
  const pelvisPos = getBoneWorldPos(rigAdapter, 'pelvis');
  const sp1Pos = getBoneWorldPos(rigAdapter, 'spine_01', pelvisPos);
  const sp3Pos = getBoneWorldPos(rigAdapter, 'spine_03', sp1Pos);
  const sp2Pos = rigAdapter.hasJoint('spine_02')
    ? getBoneWorldPos(rigAdapter, 'spine_02')
    : sp1Pos.clone().lerp(sp3Pos, 0.5);
  const neckPos = getBoneWorldPos(rigAdapter, 'neck_01', sp3Pos);
  const headPos = getBoneWorldPos(rigAdapter, 'Head', neckPos);

  const shL = getBoneWorldPos(rigAdapter, 'upperarm_l', neckPos);
  const elL = getBoneWorldPos(rigAdapter, 'lowerarm_l', shL);
  const wrL = getBoneWorldPos(rigAdapter, 'hand_l', elL);
  const mid1L = getBoneWorldPos(
    rigAdapter,
    'middle_01_l',
    wrL.clone().add(new THREE.Vector3(0.08, 0, 0))
  );
  const mid3L = getBoneWorldPos(
    rigAdapter,
    'middle_03_l',
    mid1L.clone().lerp(wrL, -0.8)
  );

  const shR = getBoneWorldPos(rigAdapter, 'upperarm_r', neckPos);
  const elR = getBoneWorldPos(rigAdapter, 'lowerarm_r', shR);
  const wrR = getBoneWorldPos(rigAdapter, 'hand_r', elR);
  const mid1R = getBoneWorldPos(
    rigAdapter,
    'middle_01_r',
    wrR.clone().add(new THREE.Vector3(-0.08, 0, 0))
  );
  const mid3R = getBoneWorldPos(
    rigAdapter,
    'middle_03_r',
    mid1R.clone().lerp(wrR, -0.8)
  );

  const hipL = getBoneWorldPos(rigAdapter, 'thigh_l', pelvisPos);
  const kneeL = getBoneWorldPos(rigAdapter, 'calf_l', hipL);
  const ankleL = getBoneWorldPos(rigAdapter, 'foot_l', kneeL);
  const ballL = getBoneWorldPos(
    rigAdapter,
    'ball_l',
    ankleL.clone().add(new THREE.Vector3(0, -0.04, 0.12))
  );

  const hipR = getBoneWorldPos(rigAdapter, 'thigh_r', pelvisPos);
  const kneeR = getBoneWorldPos(rigAdapter, 'calf_r', hipR);
  const ankleR = getBoneWorldPos(rigAdapter, 'foot_r', kneeR);
  const ballR = getBoneWorldPos(
    rigAdapter,
    'ball_r',
    ankleR.clone().add(new THREE.Vector3(0, -0.04, 0.12))
  );

  // Canonical anatomical delta quaternions
  const qPelvisDelta = getBoneDeltaWorldQuat(rigAdapter, 'pelvis');
  const qSpine3Delta = getBoneDeltaWorldQuat(rigAdapter, 'spine_03');
  const qHeadDelta = getBoneDeltaWorldQuat(rigAdapter, 'Head');

  // 1. Loomis Head
  const headHeight = Math.max(0.14, baseHeadHeight * proportions.headScale);
  const craniumRadius = headHeight * 0.39;
  const sideOffset = craniumRadius * 0.78;
  const sideRadius = craniumRadius * 0.64;

  const headLeft = WORLD_X.clone().applyQuaternion(qHeadDelta).normalize();
  const headUp = WORLD_Y.clone().applyQuaternion(qHeadDelta).normalize();
  const headFwd = WORLD_Z.clone().applyQuaternion(qHeadDelta).normalize();

  const craniumCenter = headPos
    .clone()
    .addScaledVector(headUp, headHeight * 0.44)
    .addScaledVector(headFwd, headHeight * 0.03);

  const browRing = createRing(
    craniumCenter,
    headLeft,
    headFwd,
    craniumRadius * 1.01,
    craniumRadius * 1.01,
    24
  );
  const meridianRing = createRing(
    craniumCenter,
    headFwd,
    headUp,
    craniumRadius * 1.01,
    craniumRadius * 1.01,
    24
  );
  const sideRingL = createRing(
    craniumCenter.clone().addScaledVector(headLeft, sideOffset),
    headFwd,
    headUp,
    sideRadius,
    sideRadius,
    20
  );
  const sideRingR = createRing(
    craniumCenter.clone().addScaledVector(headLeft, -sideOffset),
    headFwd,
    headUp,
    sideRadius,
    sideRadius,
    20
  );

  const jawCenter = craniumCenter
    .clone()
    .addScaledVector(headUp, -headHeight * 0.33)
    .addScaledVector(headFwd, craniumRadius * 0.42);
  const jawWedge = createTaperedPrismData(
    'jaw-wedge',
    jawCenter,
    qHeadDelta,
    craniumRadius * 0.48,
    craniumRadius * 1.24,
    craniumRadius * 0.46,
    craniumRadius * 0.92,
    headHeight * 0.38
  );

  // 2. Bridgman Ribcage & Pelvic Keystone
  const chestBottom = sp2Pos.clone().lerp(sp1Pos, 0.25);
  const chestTop = neckPos.clone();
  const chestUp = new THREE.Vector3().subVectors(chestTop, chestBottom);
  const rawChestHeight = Math.max(0.16, chestUp.length());
  const chestFwdHint = WORLD_Z.clone().applyQuaternion(qSpine3Delta);
  const chestQuat = buildBasisQuat(chestUp, chestFwdHint);
  const chestFwd = WORLD_Z.clone().applyQuaternion(chestQuat).normalize();
  const chestUpDir = WORLD_Y.clone().applyQuaternion(chestQuat).normalize();

  const shoulderSpan = Math.max(0.18, shL.distanceTo(shR));
  const ribCenter = chestBottom
    .clone()
    .lerp(chestTop, 0.5)
    .addScaledVector(chestFwd, shoulderSpan * 0.03);
  const ribcage = createTaperedPrismData(
    'ribcage',
    ribCenter,
    chestQuat,
    shoulderSpan * 0.58,
    shoulderSpan * 0.72,
    shoulderSpan * 0.42,
    shoulderSpan * 0.46,
    rawChestHeight * 0.92
  );

  const pelvisUp = WORLD_Y.clone().applyQuaternion(qPelvisDelta);
  const pelvisFwd = WORLD_Z.clone().applyQuaternion(qPelvisDelta);
  const pelvisLeft = WORLD_X.clone().applyQuaternion(qPelvisDelta);
  const pelvisQuat = buildBasisQuat(pelvisUp, pelvisFwd);
  const hipMid = hipL.clone().lerp(hipR, 0.5);
  const hipSpan = Math.max(0.12, hipL.distanceTo(hipR));
  const pelvisHeight = Math.max(
    0.13,
    Math.min(0.24, pelvisPos.distanceTo(sp1Pos) * 1.38)
  );
  const pelvisCenter = hipMid
    .clone()
    .lerp(pelvisPos, 0.45)
    .addScaledVector(pelvisUp, pelvisHeight * 0.12);
  const pelvisMass = createTaperedPrismData(
    'pelvis-mass',
    pelvisCenter,
    pelvisQuat,
    hipSpan * 1.02,
    hipSpan * 1.46,
    hipSpan * 0.84,
    hipSpan * 0.96,
    pelvisHeight
  );

  // 3. Limbs, Cross-Contours & Joint Pivot Balls
  const uArmFwdL = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'upperarm_l')
  );
  const lArmFwdL = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'lowerarm_l')
  );
  const uArmFwdR = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'upperarm_r')
  );
  const lArmFwdR = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'lowerarm_r')
  );
  const thighFwdL = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'thigh_l')
  );
  const calfFwdL = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'calf_l')
  );
  const thighFwdR = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'thigh_r')
  );
  const calfFwdR = WORLD_Z.clone().applyQuaternion(
    getBoneDeltaWorldQuat(rigAdapter, 'calf_r')
  );

  const upperArmLenL = shL.distanceTo(elL);
  const lowerArmLenL = elL.distanceTo(wrL);
  const upperArmLenR = shR.distanceTo(elR);
  const lowerArmLenR = elR.distanceTo(wrR);
  const thighLenL = hipL.distanceTo(kneeL);
  const calfLenL = kneeL.distanceTo(ankleL);
  const thighLenR = hipR.distanceTo(kneeR);
  const calfLenR = kneeR.distanceTo(ankleR);

  const rUA_L = THREE.MathUtils.clamp(upperArmLenL * 0.165, 0.036, 0.062);
  const rEl_L = rUA_L * 0.82;
  const rWr_L = THREE.MathUtils.clamp(lowerArmLenL * 0.115, 0.024, 0.04);

  const rUA_R = THREE.MathUtils.clamp(upperArmLenR * 0.165, 0.036, 0.062);
  const rEl_R = rUA_R * 0.82;
  const rWr_R = THREE.MathUtils.clamp(lowerArmLenR * 0.115, 0.024, 0.04);

  const rTh_L = THREE.MathUtils.clamp(thighLenL * 0.185, 0.058, 0.095);
  const rKn_L = rTh_L * 0.72;
  const rAn_L = THREE.MathUtils.clamp(calfLenL * 0.095, 0.032, 0.05);

  const rTh_R = THREE.MathUtils.clamp(thighLenR * 0.185, 0.058, 0.095);
  const rKn_R = rTh_R * 0.72;
  const rAn_R = THREE.MathUtils.clamp(calfLenR * 0.095, 0.032, 0.05);

  const limbs: LimbCylinderData[] = [
    buildLimbSegment('upperarm_l', shL, elL, rUA_L, rEl_L, uArmFwdL),
    buildLimbSegment('lowerarm_l', elL, wrL, rEl_L * 0.96, rWr_L, lArmFwdL),
    buildLimbSegment('upperarm_r', shR, elR, rUA_R, rEl_R, uArmFwdR),
    buildLimbSegment('lowerarm_r', elR, wrR, rEl_R * 0.96, rWr_R, lArmFwdR),
    buildLimbSegment('thigh_l', hipL, kneeL, rTh_L, rKn_L, thighFwdL),
    buildLimbSegment('calf_l', kneeL, ankleL, rKn_L * 0.96, rAn_L, calfFwdL),
    buildLimbSegment('thigh_r', hipR, kneeR, rTh_R, rKn_R, thighFwdR),
    buildLimbSegment('calf_r', kneeR, ankleR, rKn_R * 0.96, rAn_R, calfFwdR),
  ];

  const jointBalls: JointBallData[] = [
    { id: 'ball-sh-l', center: shL.clone(), radius: rUA_L * 0.88 },
    { id: 'ball-el-l', center: elL.clone(), radius: rEl_L * 0.86 },
    { id: 'ball-wr-l', center: wrL.clone(), radius: rWr_L * 0.82 },
    { id: 'ball-sh-r', center: shR.clone(), radius: rUA_R * 0.88 },
    { id: 'ball-el-r', center: elR.clone(), radius: rEl_R * 0.86 },
    { id: 'ball-wr-r', center: wrR.clone(), radius: rWr_R * 0.82 },
    { id: 'ball-hip-l', center: hipL.clone(), radius: rTh_L * 0.76 },
    { id: 'ball-kn-l', center: kneeL.clone(), radius: rKn_L * 0.84 },
    { id: 'ball-an-l', center: ankleL.clone(), radius: rAn_L * 0.85 },
    { id: 'ball-hip-r', center: hipR.clone(), radius: rTh_R * 0.76 },
    { id: 'ball-kn-r', center: kneeR.clone(), radius: rKn_R * 0.84 },
    { id: 'ball-an-r', center: ankleR.clone(), radius: rAn_R * 0.85 },
  ];

  // Hand mittens & foot wedges
  const buildHandWedge = (
    id: string,
    side: 'l' | 'r',
    wrist: THREE.Vector3,
    mid1: THREE.Vector3,
    mid3: THREE.Vector3
  ): TaperedPrismData => {
    const handDelta = getBoneDeltaWorldQuat(rigAdapter, `hand_${side}`);
    const dir = mid3.clone().sub(wrist);
    const len = THREE.MathUtils.clamp(dir.length() * 1.08, 0.12, 0.22);
    const palmUp =
      dir.lengthSq() > 1e-6
        ? dir.normalize()
        : (side === 'l' ? WORLD_X : WORLD_X.clone().negate()).applyQuaternion(
            handDelta
          );
    const palmNormal = WORLD_Z.clone().applyQuaternion(handDelta);
    const qHand = buildBasisQuat(palmUp, palmNormal);
    const center = wrist.clone().addScaledVector(palmUp, len * 0.48);
    void mid1;
    return createTaperedPrismData(
      id,
      center,
      qHand,
      0.068,
      0.048,
      0.028,
      0.016,
      len
    );
  };

  const buildFootWedge = (
    id: string,
    side: 'l' | 'r',
    ankle: THREE.Vector3,
    ball: THREE.Vector3
  ): TaperedPrismData => {
    const footDelta = getBoneDeltaWorldQuat(rigAdapter, `foot_${side}`);
    const toToe = ball.clone().sub(ankle);
    const footLen = THREE.MathUtils.clamp(toToe.length() * 1.48, 0.16, 0.28);
    const forward =
      toToe.lengthSq() > 1e-6
        ? toToe.normalize()
        : WORLD_Z.clone().applyQuaternion(footDelta);
    const footUp = WORLD_Y.clone().applyQuaternion(footDelta);
    const qFoot = buildBasisQuat(forward, footUp);
    const center = ankle
      .clone()
      .addScaledVector(forward, footLen * 0.36)
      .addScaledVector(footUp, -0.025);
    return createTaperedPrismData(
      id,
      center,
      qFoot,
      0.072,
      0.062,
      0.062,
      0.028,
      footLen
    );
  };

  const extremities: TaperedPrismData[] = [
    buildHandWedge('hand-wedge-l', 'l', wrL, mid1L, mid3L),
    buildHandWedge('hand-wedge-r', 'r', wrR, mid1R, mid3R),
    buildFootWedge('foot-wedge-l', 'l', ankleL, ballL),
    buildFootWedge('foot-wedge-r', 'r', ankleR, ballR),
  ];

  // 4. Line of Action + Gravity Plumb Line
  const plumbTop = neckPos
    .clone()
    .lerp(sp3Pos, 0.35)
    .addScaledVector(chestFwd, 0.045);
  const plumbBottom = new THREE.Vector3(plumbTop.x, groundY, plumbTop.z);

  const distFootL =
    Math.hypot(ankleL.x - plumbTop.x, ankleL.z - plumbTop.z) +
    Math.max(0, ankleL.y - groundY) * 1.5;
  const distFootR =
    Math.hypot(ankleR.x - plumbTop.x, ankleR.z - plumbTop.z) +
    Math.max(0, ankleR.y - groundY) * 1.5;
  const useLeftLeg = distFootL <= distFootR;
  const loaHip = useLeftLeg ? hipL : hipR;
  const loaKnee = useLeftLeg ? kneeL : kneeR;
  const loaAnkle = useLeftLeg ? ankleL : ankleR;

  const headCrown = craniumCenter
    .clone()
    .addScaledVector(headUp, craniumRadius * 1.05);
  const loaCurve = new THREE.CatmullRomCurve3(
    [
      headCrown,
      craniumCenter.clone(),
      neckPos.clone(),
      sp3Pos.clone(),
      sp2Pos.clone(),
      sp1Pos.clone(),
      pelvisPos.clone().lerp(loaHip, 0.35),
      loaKnee.clone(),
      loaAnkle.clone(),
    ],
    false,
    'catmullrom',
    0.45
  );
  const lineOfAction = loaCurve.getPoints(28);

  // 5. 8 Master Artist Bony Landmarks (14 named points)
  const shDir = new THREE.Vector3()
    .subVectors(shL, shR)
    .normalize();
  const c7Pos = neckPos.clone().addScaledVector(chestFwd, -0.055);
  const landmarks: BonyLandmarkPoint[] = [
    { id: 'c7', label: 'C7', position: c7Pos },
    { id: 'sternum', label: 'Sternum', position: plumbTop.clone() },
    {
      id: 'acromion_l',
      label: 'Acromion L',
      position: shL
        .clone()
        .addScaledVector(chestUpDir, 0.032)
        .addScaledVector(shDir, 0.025),
    },
    {
      id: 'acromion_r',
      label: 'Acromion R',
      position: shR
        .clone()
        .addScaledVector(chestUpDir, 0.032)
        .addScaledVector(shDir, -0.025),
    },
    { id: 'asis_l', label: 'ASIS L', position: pelvisMass.corners[4].clone() },
    { id: 'asis_r', label: 'ASIS R', position: pelvisMass.corners[5].clone() },
    {
      id: 'trochanter_l',
      label: 'Trochanter L',
      position: hipL.clone().addScaledVector(pelvisLeft, 0.068),
    },
    {
      id: 'trochanter_r',
      label: 'Trochanter R',
      position: hipR.clone().addScaledVector(pelvisLeft, -0.068),
    },
    {
      id: 'olecranon_l',
      label: 'Olecranon L',
      position: elL.clone().addScaledVector(uArmFwdL, -0.028),
    },
    {
      id: 'olecranon_r',
      label: 'Olecranon R',
      position: elR.clone().addScaledVector(uArmFwdR, -0.028),
    },
    {
      id: 'patella_l',
      label: 'Patella L',
      position: kneeL.clone().addScaledVector(thighFwdL, 0.044),
    },
    {
      id: 'patella_r',
      label: 'Patella R',
      position: kneeR.clone().addScaledVector(thighFwdR, 0.044),
    },
    {
      id: 'malleolus_l',
      label: 'Malleolus L',
      position: ankleL.clone().addScaledVector(pelvisLeft, 0.032),
    },
    {
      id: 'malleolus_r',
      label: 'Malleolus R',
      position: ankleR.clone().addScaledVector(pelvisLeft, -0.032),
    },
  ];

  return {
    mannequinId,
    loomisHead: {
      craniumCenter,
      quaternion: qHeadDelta.clone(),
      craniumRadius,
      sideOffset,
      sideRadius,
      browRing,
      meridianRing,
      sideRingL,
      sideRingR,
      jawWedge,
    },
    ribcage,
    pelvisMass,
    shoulderTiltBar: [
      shL.clone().addScaledVector(chestUpDir, 0.02),
      shR.clone().addScaledVector(chestUpDir, 0.02),
    ],
    hipTiltBar: [hipL.clone(), hipR.clone()],
    limbs,
    jointBalls,
    extremities,
    lineOfAction,
    plumbLine: [plumbTop, plumbBottom],
    landmarks,
  };
}
