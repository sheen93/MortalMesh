import * as THREE from 'three';
import {
  buildHandGestureBones,
  HAND_GESTURES,
} from '@/data/handGestures';
import {
  clampJointAngles,
  getJointSpec,
} from '@/data/jointLimits';
import {
  quatToIKAngles,
  solveLimbIK,
} from '@/physics/runtimeIK';
import { CANONICAL_REST_LOCAL_QUATS } from '@/rig/canonicalReference';
import {
  POSEABLE_BONE_NAMES,
  type HandGestureId,
  type HandSide,
  type JointAngles,
} from '@/types/anatomy';
import type { PoseSnapshot, QuaternionTuple } from '@/types/poseIO';
import type { CameraViewState } from '@/types/sceneIO';
import type {
  DetectedHand,
  DetectedPerson,
  NormalizedLandmark2D,
  WorldLandmark3D,
} from '@/ai/visionEngine';

export interface CameraViewEstimate {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  targetY: number;
  label: 'Front' | '3/4 Left' | '3/4 Right' | 'Left Profile' | 'Right Profile' | 'Back';
}

export interface RetargetOptions {
  includeHandGestures?: boolean;
  normalizeFacingYaw?: boolean;
  groundEnabled?: boolean;
  groundSnapEnabled?: boolean;
}

export interface RetargetResult {
  snapshot: PoseSnapshot;
  leftHandGesture: HandGestureId;
  rightHandGesture: HandGestureId;
  cameraEstimate: CameraViewEstimate;
  upperBodyOnly: boolean;
}

// Core anatomical hierarchy and exact rest translations from public/models/anatomy.glb
const CORE_BONE_TREE: ReadonlyArray<{
  name: string;
  parent: string;
  translation: [number, number, number];
  rotation?: QuaternionTuple;
}> = [
  {
    name: 'root',
    parent: 'Armature',
    translation: [0, 0, 0],
    rotation: [-0.7071068, 0, 0, 0.7071068],
  },
  { name: 'pelvis', parent: 'root', translation: [0, 0.0501, 0.9167] },
  { name: 'spine_01', parent: 'pelvis', translation: [0, 0.138176, 0] },
  { name: 'spine_02', parent: 'spine_01', translation: [0, 0.124035, 0] },
  { name: 'spine_03', parent: 'spine_02', translation: [0, 0.141272, 0] },
  { name: 'neck_01', parent: 'spine_03', translation: [0, 0.172891, 0] },
  { name: 'Head', parent: 'neck_01', translation: [0, 0.082587, 0] },
  {
    name: 'clavicle_l',
    parent: 'spine_03',
    translation: [0.0188, 0.140554, 0.080895],
  },
  {
    name: 'upperarm_l',
    parent: 'clavicle_l',
    translation: [-0.030072, 0.218582, -0.016968],
  },
  { name: 'lowerarm_l', parent: 'upperarm_l', translation: [0, 0.27444, 0] },
  { name: 'hand_l', parent: 'lowerarm_l', translation: [0, 0.272641, 0] },
  {
    name: 'clavicle_r',
    parent: 'spine_03',
    translation: [-0.0188, 0.140554, 0.080895],
  },
  {
    name: 'upperarm_r',
    parent: 'clavicle_r',
    translation: [0.030072, 0.218582, -0.016968],
  },
  { name: 'lowerarm_r', parent: 'upperarm_r', translation: [0, 0.27444, 0] },
  { name: 'hand_r', parent: 'lowerarm_r', translation: [0, 0.272641, 0] },
  {
    name: 'thigh_l',
    parent: 'pelvis',
    translation: [0.089, 0.027771, 0.046024],
  },
  { name: 'calf_l', parent: 'thigh_l', translation: [0, 0.40031, 0] },
  { name: 'foot_l', parent: 'calf_l', translation: [0, 0.42948, 0] },
  { name: 'ball_l', parent: 'foot_l', translation: [0, 0.173301, 0] },
  {
    name: 'thigh_r',
    parent: 'pelvis',
    translation: [-0.089, 0.027771, 0.046024],
  },
  { name: 'calf_r', parent: 'thigh_r', translation: [0, 0.40031, 0] },
  { name: 'foot_r', parent: 'calf_r', translation: [0, 0.42948, 0] },
  { name: 'ball_r', parent: 'foot_r', translation: [0, 0.173301, 0] },
];

const FINGER_GROUPS = ['index', 'middle', 'ring', 'pinky', 'thumb'] as const;

const L_UPPERARM = 0.27444;
const L_FOREARM = 0.272641;
const L_THIGH = 0.40031;
const L_SHIN = 0.42948;

interface VirtualCanonicalRig {
  rootGroup: THREE.Group;
  bonesByName: Map<string, THREE.Bone>;
  restQuats: Map<string, THREE.Quaternion>;
  restWorldQuats: Map<string, THREE.Quaternion>;
}

let cachedVirtualRig: VirtualCanonicalRig | null = null;

function createVirtualCanonicalRig(): VirtualCanonicalRig {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'Armature';
  const nodesByName = new Map<string, THREE.Object3D>();
  nodesByName.set('Armature', rootGroup);

  const bonesByName = new Map<string, THREE.Bone>();
  const restQuats = new Map<string, THREE.Quaternion>();
  const restWorldQuats = new Map<string, THREE.Quaternion>();

  for (const spec of CORE_BONE_TREE) {
    const parent = nodesByName.get(spec.parent) ?? rootGroup;
    const node = spec.name === 'root' ? new THREE.Object3D() : new THREE.Bone();
    node.name = spec.name;
    node.position.set(spec.translation[0], spec.translation[1], spec.translation[2]);
    const rot =
      spec.rotation ?? CANONICAL_REST_LOCAL_QUATS[spec.name] ?? [0, 0, 0, 1];
    node.quaternion.set(rot[0], rot[1], rot[2], rot[3]).normalize();
    parent.add(node);
    nodesByName.set(spec.name, node);

    if (node instanceof THREE.Bone && spec.name in CANONICAL_REST_LOCAL_QUATS) {
      bonesByName.set(spec.name, node);
      restQuats.set(spec.name, node.quaternion.clone());
    }
  }

  for (const side of ['l', 'r'] as const) {
    const handNode = bonesByName.get(`hand_${side}`);
    if (!handNode) continue;
    for (const finger of FINGER_GROUPS) {
      let parentNode: THREE.Object3D = handNode;
      for (const seg of ['01', '02', '03'] as const) {
        const boneName = `${finger}_${seg}_${side}`;
        const bone = new THREE.Bone();
        bone.name = boneName;
        const rot = CANONICAL_REST_LOCAL_QUATS[boneName] ?? [0, 0, 0, 1];
        bone.quaternion.set(rot[0], rot[1], rot[2], rot[3]).normalize();
        parentNode.add(bone);
        bonesByName.set(boneName, bone);
        restQuats.set(boneName, bone.quaternion.clone());
        parentNode = bone;
      }
    }
  }

  rootGroup.updateMatrixWorld(true);
  bonesByName.forEach((bone, name) => {
    const wq = new THREE.Quaternion();
    bone.getWorldQuaternion(wq);
    restWorldQuats.set(name, wq);
  });

  return {
    rootGroup,
    bonesByName,
    restQuats,
    restWorldQuats,
  };
}

function getVirtualCanonicalRig(): VirtualCanonicalRig {
  if (!cachedVirtualRig) {
    cachedVirtualRig = createVirtualCanonicalRig();
  }
  const rig = cachedVirtualRig;
  rig.rootGroup.position.set(0, 0, 0);
  rig.rootGroup.rotation.set(0, 0, 0);
  rig.rootGroup.scale.set(1, 1, 1);
  rig.bonesByName.forEach((bone, name) => {
    const rq = rig.restQuats.get(name);
    if (rq) bone.quaternion.copy(rq);
  });
  rig.rootGroup.updateMatrixWorld(true);
  return rig;
}

/**
 * Converts MediaPipe 3D metric world landmarks (+X image-right, +Y down, +Z away)
 * into Mortal Mesh studio coordinates (+Y up, +Z toward viewer, +X anatomical left).
 */
export function mpToStudio(lm: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(lm.x, -lm.y, -lm.z);
}

function safeNorm(
  v: THREE.Vector3,
  fallback = new THREE.Vector3(0, 0, 1)
): THREE.Vector3 {
  const len = v.length();
  if (!Number.isFinite(len) || len < 1e-6) return fallback.clone();
  return v.clone().divideScalar(len);
}

function projPerp(vec: THREE.Vector3, axisUnit: THREE.Vector3): THREE.Vector3 {
  return vec.clone().addScaledVector(axisUnit, -vec.dot(axisUnit));
}

function getBoneWorldPos(
  rig: VirtualCanonicalRig,
  boneName: string
): THREE.Vector3 {
  rig.rootGroup.updateMatrixWorld(true);
  const bone = rig.bonesByName.get(boneName);
  const out = new THREE.Vector3();
  if (bone) bone.getWorldPosition(out);
  return out;
}

function getBoneWorldQuat(
  rig: VirtualCanonicalRig,
  boneName: string
): THREE.Quaternion {
  rig.rootGroup.updateMatrixWorld(true);
  const bone = rig.bonesByName.get(boneName);
  const out = new THREE.Quaternion();
  if (bone) bone.getWorldQuaternion(out);
  return out;
}

function applyCanonicalBoneAngles(
  rig: VirtualCanonicalRig,
  boneName: string,
  angles: JointAngles,
  clamp = true
): JointAngles {
  const spec = getJointSpec(boneName);
  const finalAngles = clamp ? clampJointAngles(angles, spec, true) : angles;
  const bone = rig.bonesByName.get(boneName);
  const rq = rig.restQuats.get(boneName);
  if (!bone || !rq) return finalAngles;

  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(finalAngles.x),
    THREE.MathUtils.degToRad(finalAngles.y),
    THREE.MathUtils.degToRad(finalAngles.z),
    spec.order
  );
  const deltaQuat = new THREE.Quaternion().setFromEuler(euler);
  bone.quaternion.copy(rq).multiply(deltaQuat).normalize();
  rig.rootGroup.updateMatrixWorld(true);
  return finalAngles;
}

function alignBoneToWorldDelta(
  rig: VirtualCanonicalRig,
  boneName: string,
  targetWorldQuat: THREE.Quaternion
): JointAngles {
  rig.rootGroup.updateMatrixWorld(true);
  const bone = rig.bonesByName.get(boneName);
  const rq = rig.restQuats.get(boneName);
  if (!bone || !rq || !bone.parent) return { x: 0, y: 0, z: 0 };

  const parentWQ = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWQ);
  const zeroWQ = parentWQ.clone().multiply(rq);
  const deltaQuat = zeroWQ.clone().invert().multiply(targetWorldQuat).normalize();
  const clamped = quatToIKAngles(boneName, deltaQuat, true);
  return applyCanonicalBoneAngles(rig, boneName, clamped, true);
}

function makeBasisDeltaQuat(
  xAxis: THREE.Vector3,
  yAxis: THREE.Vector3,
  zAxis: THREE.Vector3
): THREE.Quaternion {
  const colY = safeNorm(yAxis, new THREE.Vector3(0, 1, 0));
  let colX = projPerp(xAxis, colY);
  if (colX.lengthSq() < 1e-6) {
    colX = projPerp(new THREE.Vector3(1, 0, 0), colY);
  }
  colX.normalize();
  let colZ = new THREE.Vector3().crossVectors(colX, colY);
  if (colZ.dot(zAxis) < 0) {
    // Preserve handedness without reflection if input z hints opposite sign
    colZ = projPerp(zAxis, colY);
  }
  if (colZ.lengthSq() < 1e-6) {
    colZ = new THREE.Vector3().crossVectors(colX, colY);
  }
  colZ.normalize();
  colX.crossVectors(colY, colZ).normalize();
  const mat = new THREE.Matrix4().makeBasis(colX, colY, colZ);
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

function landmarkVis(
  lm: { visibility?: number } | undefined,
  fallback = 0.8
): number {
  if (!lm) return 0;
  return lm.visibility ?? fallback;
}

function classifyCameraLabel(azimuthDeg: number): CameraViewEstimate['label'] {
  const wrapped = (((azimuthDeg + 180) % 360) + 360) % 360 - 180;
  const absAz = Math.abs(wrapped);
  if (absAz <= 22) return 'Front';
  if (absAz >= 152) return 'Back';
  if (absAz <= 68) return wrapped < 0 ? '3/4 Left' : '3/4 Right';
  return wrapped < 0 ? 'Left Profile' : 'Right Profile';
}

export function estimateCameraFromWorldPoints(
  pts: THREE.Vector3[],
  upperBodyOnly: boolean
): {
  facingYawRad: number;
  estimate: CameraViewEstimate;
} {
  const lHip = pts[23];
  const rHip = pts[24];
  const lSh = pts[11];
  const rSh = pts[12];
  const nose = pts[0];

  const midHip = lHip.clone().add(rHip).multiplyScalar(0.5);
  const midSh = lSh.clone().add(rSh).multiplyScalar(0.5);
  const spineUp = safeNorm(midSh.clone().sub(midHip), new THREE.Vector3(0, 1, 0));

  const hipAxis = safeNorm(lHip.clone().sub(rHip), new THREE.Vector3(1, 0, 0));
  const shAxis = safeNorm(lSh.clone().sub(rSh), hipAxis);

  const hipFwd = hipAxis.clone().cross(spineUp);
  const shFwd = shAxis.clone().cross(spineUp);
  const torsoForward = safeNorm(
    hipFwd.multiplyScalar(0.55).addScaledVector(shFwd, 0.45),
    new THREE.Vector3(0, 0, 1)
  );

  // Use nose depth as tiebreaker only when shoulders/hips nearly sideways
  const planarLen = Math.hypot(torsoForward.x, torsoForward.z);
  const facingYawRad =
    planarLen > 0.2 ? Math.atan2(torsoForward.x, torsoForward.z) : 0;

  // Estimate gentle camera pitch from nose vs mid-ear/shoulder horizon
  const noseVec = nose.clone().sub(midSh);
  const elevRaw = Math.atan2(0.16 - Math.max(-0.2, Math.min(0.25, noseVec.y)), Math.max(0.18, noseVec.z + 0.35));
  const elevationDeg = THREE.MathUtils.clamp(
    THREE.MathUtils.radToDeg(elevRaw) * 0.35 + 6,
    -14,
    24
  );

  // Camera sits at -facingYaw around +Y so projected figure matches photo silhouette
  const azimuthDeg = -THREE.MathUtils.radToDeg(facingYawRad);
  return {
    facingYawRad,
    estimate: {
      azimuthDeg: Math.round(azimuthDeg),
      elevationDeg: Math.round(elevationDeg),
      distance: upperBodyOnly ? 2.6 : 6.0,
      targetY: upperBodyOnly ? 1.25 : 0.98,
      label: classifyCameraLabel(azimuthDeg),
    },
  };
}

export function buildMatchedCameraView(
  estimate: CameraViewEstimate,
  rootPosition: [number, number, number] = [0, 0, 0]
): CameraViewState {
  const azRad = THREE.MathUtils.degToRad(estimate.azimuthDeg);
  const elRad = THREE.MathUtils.degToRad(estimate.elevationDeg);
  const horiz = estimate.distance * Math.cos(elRad);
  const target: [number, number, number] = [
    rootPosition[0],
    rootPosition[1] + estimate.targetY,
    rootPosition[2],
  ];
  const position: [number, number, number] = [
    target[0] + horiz * Math.sin(azRad),
    target[1] + estimate.distance * Math.sin(elRad),
    target[2] + horiz * Math.cos(azRad),
  ];
  return { position, target };
}

function handPt(
  hand: DetectedHand,
  idx: number,
  useWorld: boolean
): THREE.Vector3 {
  const src = useWorld && hand.worldLandmarks.length >= 21
    ? hand.worldLandmarks[idx]
    : hand.landmarks[idx];
  return mpToStudio(src);
}

function computeFingerCurl(
  pts: THREE.Vector3[],
  mcpIdx: number,
  pipIdx: number,
  dipIdx: number,
  tipIdx: number,
  wrist: THREE.Vector3
): { curl: number; dir: THREE.Vector3 } {
  const v1 = safeNorm(pts[pipIdx].clone().sub(pts[mcpIdx]));
  const v2 = safeNorm(pts[dipIdx].clone().sub(pts[pipIdx]));
  const v3 = safeNorm(pts[tipIdx].clone().sub(pts[dipIdx]));

  const ang1 = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1));
  const ang2 = Math.acos(THREE.MathUtils.clamp(v2.dot(v3), -1, 1));
  const bendNorm = THREE.MathUtils.clamp((ang1 + ang2) / 2.6, 0, 1);

  const dMcp = pts[mcpIdx].distanceTo(wrist);
  const dTip = pts[tipIdx].distanceTo(wrist);
  const ratioNorm =
    dMcp > 1e-4 ? THREE.MathUtils.clamp(1 - (dTip - dMcp * 0.75) / (dMcp * 1.15), 0, 1) : 0.5;

  const curl = THREE.MathUtils.clamp(bendNorm * 0.65 + ratioNorm * 0.35, 0, 1);
  return {
    curl,
    dir: safeNorm(pts[tipIdx].clone().sub(pts[mcpIdx])),
  };
}

/**
 * Classifies 21 detected hand landmarks into the closest calibrated gesture
 * from src/data/handGestures.ts.
 */
export function matchHandLandmarksToGesture(hand: DetectedHand): HandGestureId {
  const useWorld = hand.worldLandmarks.length >= 21;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 21; i += 1) {
    pts.push(handPt(hand, i, useWorld));
  }

  const wrist = pts[0];
  const palmSize = Math.max(0.03, pts[9].distanceTo(wrist));

  const idx = computeFingerCurl(pts, 5, 6, 7, 8, wrist);
  const mid = computeFingerCurl(pts, 9, 10, 11, 12, wrist);
  const rng = computeFingerCurl(pts, 13, 14, 15, 16, wrist);
  const pnk = computeFingerCurl(pts, 17, 18, 19, 20, wrist);

  // Thumb curvature + opposition away from index MCP & palm center
  const t1 = safeNorm(pts[2].clone().sub(pts[1]));
  const t2 = safeNorm(pts[3].clone().sub(pts[2]));
  const t3 = safeNorm(pts[4].clone().sub(pts[3]));
  const thumbBend =
    (Math.acos(THREE.MathUtils.clamp(t1.dot(t2), -1, 1)) +
      Math.acos(THREE.MathUtils.clamp(t2.dot(t3), -1, 1))) /
    1.8;
  const thumbToIndexMcp = pts[4].distanceTo(pts[5]) / palmSize;
  const thumbExtended = thumbBend < 0.55 && thumbToIndexMcp > 0.62;
  const pinchDist = pts[4].distanceTo(pts[8]) / palmSize;

  const isExt = (c: number) => c < 0.34;
  const isCurled = (c: number) => c > 0.54;

  if (pinchDist < 0.36 && !isCurled(mid.curl) && !isCurled(rng.curl)) {
    return 'pinch';
  }

  const idxExt = isExt(idx.curl);
  const midExt = isExt(mid.curl);
  const rngExt = isExt(rng.curl);
  const pnkExt = isExt(pnk.curl);

  const idxCurl = isCurled(idx.curl);
  const midCurl = isCurled(mid.curl);
  const rngCurl = isCurled(rng.curl);
  const pnkCurl = isCurled(pnk.curl);

  if (idxExt && midCurl && rngCurl && pnkCurl) return 'point';
  if (idxExt && midExt && rngCurl && pnkCurl) return 'peace';
  if (idxExt && midCurl && rngCurl && pnkExt) return 'rock';
  if (idxCurl && midExt && rngCurl && pnkCurl) return 'middle-finger';

  const avgFourCurl = (idx.curl + mid.curl + rng.curl + pnk.curl) * 0.25;
  if (idxCurl && midCurl && rngCurl && pnkCurl) {
    return thumbExtended ? 'thumbs-up' : 'fist';
  }

  if (idxExt && midExt && rngExt && pnkExt) {
    const spread12 = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(idx.dir.dot(mid.dir), -1, 1))
    );
    const spread23 = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(mid.dir.dot(rng.dir), -1, 1))
    );
    const spread34 = THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(rng.dir.dot(pnk.dir), -1, 1))
    );
    const maxAdjacentSpread = Math.max(spread12, spread23, spread34);
    return maxAdjacentSpread > 14 ? 'spread' : 'open';
  }

  if (avgFourCurl > 0.56) {
    return 'hold';
  }
  if (avgFourCurl > 0.41) {
    return 'grab';
  }

  return 'relaxed';
}

function solveArmWristOrientation(
  rig: VirtualCanonicalRig,
  side: HandSide,
  person: DetectedPerson,
  pts: THREE.Vector3[],
  rotateMatYaw: THREE.Quaternion | null
): void {
  const forearm = `lowerarm_${side}`;
  const handBoneName = `hand_${side}`;
  const specFore = getJointSpec(forearm);
  const specHand = getJointSpec(handBoneName);

  const matchedHand = side === 'l' ? person.leftHand : person.rightHand;
  let targetFinger: THREE.Vector3 | null = null;
  let targetPalm: THREE.Vector3 | null = null;

  if (matchedHand && matchedHand.landmarks.length >= 21) {
    const useWorld = matchedHand.worldLandmarks.length >= 21;
    const w = handPt(matchedHand, 0, useWorld);
    const idxMcp = handPt(matchedHand, 5, useWorld);
    const midMcp = handPt(matchedHand, 9, useWorld);
    const pnkMcp = handPt(matchedHand, 17, useWorld);
    if (rotateMatYaw) {
      w.applyQuaternion(rotateMatYaw);
      idxMcp.applyQuaternion(rotateMatYaw);
      midMcp.applyQuaternion(rotateMatYaw);
      pnkMcp.applyQuaternion(rotateMatYaw);
    }
    targetFinger = safeNorm(midMcp.clone().sub(w));
    const vIdx = idxMcp.clone().sub(w);
    const vPnk = pnkMcp.clone().sub(w);
    targetPalm =
      side === 'l'
        ? safeNorm(vPnk.cross(vIdx))
        : safeNorm(vIdx.cross(vPnk));
  } else {
    const wIdx = side === 'l' ? 15 : 16;
    const pIdx = side === 'l' ? 17 : 18;
    const iIdx = side === 'l' ? 19 : 20;
    const lmkW = person.landmarks[wIdx];
    const lmkP = person.landmarks[pIdx];
    const lmkI = person.landmarks[iIdx];
    if (
      landmarkVis(lmkW, 0) >= 0.3 &&
      landmarkVis(lmkP, 0) >= 0.3 &&
      landmarkVis(lmkI, 0) >= 0.3
    ) {
      const w = pts[wIdx];
      const p = pts[pIdx];
      const i = pts[iIdx];
      const midF = p.clone().add(i).multiplyScalar(0.5);
      targetFinger = safeNorm(midF.sub(w));
      const vIdx = i.clone().sub(w);
      const vPnk = p.clone().sub(w);
      targetPalm =
        side === 'l'
          ? safeNorm(vPnk.cross(vIdx))
          : safeNorm(vIdx.cross(vPnk));
    }
  }

  if (!targetFinger) return;

  const foreBone = rig.bonesByName.get(forearm);
  const foreRest = rig.restQuats.get(forearm);
  let currentForeX = 0;
  if (foreBone && foreRest) {
    const curDelta = foreRest.clone().invert().multiply(foreBone.quaternion);
    const e = new THREE.Euler(0, 0, 0, specFore.order).setFromQuaternion(
      curDelta,
      specFore.order
    );
    currentForeX = THREE.MathUtils.radToDeg(e.x);
  }

  const palmLocal = new THREE.Vector3(side === 'l' ? 1 : -1, 0, 0);
  const fingerLocal = new THREE.Vector3(0, 1, 0);

  const scoreCandidate = (fy: number, hx: number, hz: number): number => {
    applyCanonicalBoneAngles(rig, forearm, { x: currentForeX, y: fy, z: 0 }, true);
    applyCanonicalBoneAngles(rig, handBoneName, { x: hx, y: 0, z: hz }, true);
    const hq = getBoneWorldQuat(rig, handBoneName);
    let score = 0;
    if (targetPalm) {
      score += palmLocal.clone().applyQuaternion(hq).dot(targetPalm) * 2.4;
    }
    if (targetFinger) {
      score += fingerLocal.clone().applyQuaternion(hq).dot(targetFinger) * 2.0;
    }
    score -= 0.0015 * (Math.abs(hx) + Math.abs(hz)) + 0.0005 * Math.abs(fy);
    return score;
  };

  let best = { fy: 0, hx: 0, hz: 0, score: -Infinity };
  for (let fy = specFore.axes.y.min; fy <= specFore.axes.y.max; fy += 24) {
    for (let hx = specHand.axes.x.min; hx <= specHand.axes.x.max; hx += 20) {
      for (let hz = specHand.axes.z.min; hz <= specHand.axes.z.max; hz += 24) {
        const sc = scoreCandidate(fy, hx, hz);
        if (sc > best.score) best = { fy, hx, hz, score: sc };
      }
    }
  }

  for (const step of [6, 2] as const) {
    const r = step === 6 ? 20 : 6;
    const c = { ...best };
    for (
      let fy = Math.max(specFore.axes.y.min, c.fy - r);
      fy <= Math.min(specFore.axes.y.max, c.fy + r);
      fy += step
    ) {
      for (
        let hx = Math.max(specHand.axes.x.min, c.hx - r);
        hx <= Math.min(specHand.axes.x.max, c.hx + r);
        hx += step
      ) {
        for (
          let hz = Math.max(specHand.axes.z.min, c.hz - r);
          hz <= Math.min(specHand.axes.z.max, c.hz + r);
          hz += step
        ) {
          const sc = scoreCandidate(fy, hx, hz);
          if (sc > best.score) best = { fy, hx, hz, score: sc };
        }
      }
    }
  }

  applyCanonicalBoneAngles(rig, forearm, { x: currentForeX, y: best.fy, z: 0 }, true);
  applyCanonicalBoneAngles(rig, handBoneName, { x: best.hx, y: 0, z: best.hz }, true);
}

function solveFootOrientation(
  rig: VirtualCanonicalRig,
  side: HandSide,
  person: DetectedPerson,
  pts: THREE.Vector3[],
  pelvisFrameUp: THREE.Vector3
): void {
  const footName = `foot_${side}`;
  const calfName = `calf_${side}`;
  const heelIdx = side === 'l' ? 29 : 30;
  const toeIdx = side === 'l' ? 31 : 32;
  const ankleIdx = side === 'l' ? 27 : 28;
  const kneeIdx = side === 'l' ? 25 : 26;

  const visOk =
    landmarkVis(person.landmarks[heelIdx], 0) >= 0.3 &&
    landmarkVis(person.landmarks[toeIdx], 0) >= 0.3 &&
    landmarkVis(person.landmarks[ankleIdx], 0) >= 0.3;

  if (!visOk) {
    // Keep level flat foot when ankle/toe landmarks are occluded
    const specThigh = getJointSpec(`thigh_${side}`);
    const specCalf = getJointSpec(calfName);
    const thighB = rig.bonesByName.get(`thigh_${side}`);
    const calfB = rig.bonesByName.get(calfName);
    const rqT = rig.restQuats.get(`thigh_${side}`);
    const rqC = rig.restQuats.get(calfName);
    if (thighB && calfB && rqT && rqC) {
      const eT = new THREE.Euler(0, 0, 0, specThigh.order).setFromQuaternion(
        rqT.clone().invert().multiply(thighB.quaternion),
        specThigh.order
      );
      const eC = new THREE.Euler(0, 0, 0, specCalf.order).setFromQuaternion(
        rqC.clone().invert().multiply(calfB.quaternion),
        specCalf.order
      );
      const levelX = -(THREE.MathUtils.radToDeg(eT.x) + THREE.MathUtils.radToDeg(eC.x));
      applyCanonicalBoneAngles(rig, footName, { x: levelX, y: 0, z: 0 }, true);
    }
    return;
  }

  const shinDir = safeNorm(pts[ankleIdx].clone().sub(pts[kneeIdx]), pelvisFrameUp.clone().negate());
  const footForward = safeNorm(pts[toeIdx].clone().sub(pts[heelIdx]), new THREE.Vector3(0, 0, 1));
  // Measure plantarflexion (+x, obtuse shin->toe >90°) vs dorsiflexion (-x, acute <90°)
  const cosAngle = THREE.MathUtils.clamp(shinDir.dot(footForward), -0.95, 0.95);
  const footPitchDeg = THREE.MathUtils.radToDeg(Math.acos(cosAngle)) - 90;
  // Wait: shin points DOWN (-Y) and footForward points FORWARD (+Z):
  // T-Pose/flat stand: (-Y)·(+Z) = 0 -> acos(0) = 90 -> footPitchDeg = 0°!
  // Dorsiflexion (toes up +Y): (-Y)·(+Z,+Y) < 0 -> acos > 90 -> angle > 90.
  // In anatomy.glb calf->foot: foot.x < 0 is dorsiflexion (toes up), foot.x > 0 is plantarflexion (toes down)!
  // Let's invert sign so obtuse (-Y · (+Z,+Y) < 0) yields negative X (dorsiflexion)!
  const signedFootPitchDeg = 90 - THREE.MathUtils.radToDeg(Math.acos(cosAngle));

  // Measure horizontal foot yaw turn-out relative to +Z
  const horiz = new THREE.Vector3(footForward.x, 0, footForward.z);
  let footYawDeg = 0;
  if (horiz.lengthSq() > 0.04) {
    horiz.normalize();
    footYawDeg = THREE.MathUtils.radToDeg(Math.atan2(horiz.x, horiz.z)) * 0.25;
  }

  applyCanonicalBoneAngles(
    rig,
    footName,
    { x: signedFootPitchDeg, y: footYawDeg, z: 0 },
    true
  );
}

/**
 * Reconstructs a complete anatomically valid 52-bone PoseSnapshot and estimated
 * camera angle from MediaPipe's 33 3D body landmarks + detected 21-point hands.
 */
export function retargetDetectedPersonToPose(
  person: DetectedPerson,
  options: RetargetOptions = {}
): RetargetResult {
  const includeHandGestures = options.includeHandGestures ?? true;
  const normalizeFacingYaw = options.normalizeFacingYaw ?? false;
  const groundEnabled = options.groundEnabled ?? true;
  const groundSnapEnabled = options.groundSnapEnabled ?? true;

  const rig = getVirtualCanonicalRig();
  const rawPts = person.worldLandmarks.map(mpToStudio);
  if (rawPts.length < 33) {
    throw new Error('Detected person missing complete 33 world landmarks');
  }

  const { facingYawRad, estimate } = estimateCameraFromWorldPoints(
    rawPts,
    person.upperBodyOnly
  );

  const yawNormQuat = normalizeFacingYaw
    ? new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -facingYawRad
      )
    : null;

  const pts = yawNormQuat
    ? rawPts.map((p) => p.clone().applyQuaternion(yawNormQuat))
    : rawPts;

  const worldUp = new THREE.Vector3(0, 1, 0);
  const midHip = pts[23].clone().add(pts[24]).multiplyScalar(0.5);
  const midSh = pts[11].clone().add(pts[12]).multiplyScalar(0.5);
  const spineUp = safeNorm(midSh.clone().sub(midHip), worldUp);
  const hipAxis = safeNorm(pts[23].clone().sub(pts[24]), new THREE.Vector3(1, 0, 0));
  const shAxis = safeNorm(pts[11].clone().sub(pts[12]), hipAxis);

  // 1. Pelvis orientation (split sagittal/lateral lean: pelvis carries 45%, spine 55%)
  const pelvisUp = safeNorm(
    worldUp.clone().multiplyScalar(0.55).addScaledVector(spineUp, 0.45),
    worldUp
  );
  const pelvisFwd = hipAxis.clone().cross(pelvisUp);
  const pelvisDeltaMatQ = makeBasisDeltaQuat(hipAxis, pelvisUp, pelvisFwd);
  const pelvisRestWQ = rig.restWorldQuats.get('pelvis') ?? new THREE.Quaternion();
  const desiredPelvisWQ = pelvisDeltaMatQ.clone().multiply(pelvisRestWQ);
  alignBoneToWorldDelta(rig, 'pelvis', desiredPelvisWQ);

  // 2. Spine distribution (spine_01, spine_02, spine_03)
  const chestFwd = shAxis.clone().cross(spineUp);
  const chestDeltaMatQ = makeBasisDeltaQuat(shAxis, spineUp, chestFwd);
  const spineRelDeltaQ = pelvisDeltaMatQ
    .clone()
    .invert()
    .multiply(chestDeltaMatQ)
    .normalize();
  const totalSpineAngles = quatToIKAngles('spine_02', spineRelDeltaQ, false);
  const clampedTotalSpine = {
    x: THREE.MathUtils.clamp(totalSpineAngles.x, -45, 55),
    y: THREE.MathUtils.clamp(totalSpineAngles.y, -60, 60),
    z: THREE.MathUtils.clamp(totalSpineAngles.z, -40, 40),
  };
  applyCanonicalBoneAngles(rig, 'spine_01', {
    x: clampedTotalSpine.x * 0.34,
    y: clampedTotalSpine.y * 0.34,
    z: clampedTotalSpine.z * 0.34,
  });
  applyCanonicalBoneAngles(rig, 'spine_02', {
    x: clampedTotalSpine.x * 0.34,
    y: clampedTotalSpine.y * 0.34,
    z: clampedTotalSpine.z * 0.34,
  });
  applyCanonicalBoneAngles(rig, 'spine_03', {
    x: clampedTotalSpine.x * 0.32,
    y: clampedTotalSpine.y * 0.32,
    z: clampedTotalSpine.z * 0.32,
  });

  // 3. Neck & Head orientation
  const headVisOk =
    landmarkVis(person.landmarks[0], 0) >= 0.3 &&
    landmarkVis(person.landmarks[7], 0) >= 0.25 &&
    landmarkVis(person.landmarks[8], 0) >= 0.25;

  if (headVisOk) {
    const midEar = pts[7].clone().add(pts[8]).multiplyScalar(0.5);
    // Mid-eye/nose blended forward sightline sits ~level when gazing straight ahead (+Z)
    const rawLook =
      landmarkVis(person.landmarks[2], 0) >= 0.25 &&
      landmarkVis(person.landmarks[5], 0) >= 0.25
        ? pts[2]
            .clone()
            .add(pts[5])
            .multiplyScalar(0.25)
            .addScaledVector(pts[0], 0.5)
        : pts[0].clone().add(new THREE.Vector3(0, 0.02, 0));
    const headLeftX = safeNorm(pts[7].clone().sub(pts[8]), shAxis);
    const lookDelta = rawLook.clone().sub(midEar);
    // Human eyes/nose sit slightly above/below ear canal; remove resting ~6° upward eye offset
    lookDelta.y -= lookDelta.length() * 0.06;
    const headFwdZ = safeNorm(projPerp(lookDelta, headLeftX), chestFwd);
    const headUpY = safeNorm(headFwdZ.clone().cross(headLeftX), spineUp);
    const headDeltaMatQ = makeBasisDeltaQuat(headLeftX, headUpY, headFwdZ);
    const relHeadDelta = chestDeltaMatQ
      .clone()
      .invert()
      .multiply(headDeltaMatQ)
      .normalize();
    const headRelAngles = quatToIKAngles('neck_01', relHeadDelta, false);
    applyCanonicalBoneAngles(rig, 'neck_01', {
      x: headRelAngles.x * 0.45,
      y: headRelAngles.y * 0.45,
      z: headRelAngles.z * 0.45,
    });
    applyCanonicalBoneAngles(rig, 'Head', {
      x: headRelAngles.x * 0.55,
      y: headRelAngles.y * 0.55,
      z: headRelAngles.z * 0.55,
    });
  }

  // 4. Clavicles subtle overhead elevation / downward relax
  for (const side of ['l', 'r'] as const) {
    const sIdx = side === 'l' ? 11 : 12;
    const eIdx = side === 'l' ? 13 : 14;
    if (
      landmarkVis(person.landmarks[sIdx], 0) >= 0.25 &&
      landmarkVis(person.landmarks[eIdx], 0) >= 0.25
    ) {
      const upperVec = safeNorm(pts[eIdx].clone().sub(pts[sIdx]));
      const elevY = upperVec.dot(spineUp);
      const clavX =
        elevY > 0.25
          ? THREE.MathUtils.clamp((elevY - 0.25) * 32, 0, 24)
          : elevY < -0.55
            ? -4
            : 0;
      applyCanonicalBoneAngles(rig, `clavicle_${side}`, {
        x: clavX,
        y: 0,
        z: 0,
      });
    }
  }

  // 5. Arms solved via analytical 2-bone IK + detected 3D elbow pole hints
  for (const side of ['l', 'r'] as const) {
    const sIdx = side === 'l' ? 11 : 12;
    const eIdx = side === 'l' ? 13 : 14;
    const wIdx = side === 'l' ? 15 : 16;
    const armVisible =
      landmarkVis(person.landmarks[sIdx], 0) >= 0.25 &&
      landmarkVis(person.landmarks[eIdx], 0) >= 0.25 &&
      landmarkVis(person.landmarks[wIdx], 0) >= 0.25;

    if (!armVisible) continue;

    const uDir = safeNorm(pts[eIdx].clone().sub(pts[sIdx]));
    const lDir = safeNorm(pts[wIdx].clone().sub(pts[eIdx]));
    const upperPos = getBoneWorldPos(rig, `upperarm_${side}`);
    const targetPos = upperPos
      .clone()
      .addScaledVector(uDir, L_UPPERARM)
      .addScaledVector(lDir, L_FOREARM);

    const midChord = upperPos.clone().add(targetPos).multiplyScalar(0.5);
    const elbowExpected = upperPos.clone().addScaledVector(uDir, L_UPPERARM);
    const poleVec = elbowExpected.sub(midChord);
    const poleDirectionWorld =
      poleVec.length() > 0.015 ? poleVec.normalize() : undefined;

    solveLimbIK({
      handleId: side === 'l' ? 'hand_l' : 'hand_r',
      targetWorldPos: targetPos,
      rootGroup: rig.rootGroup,
      bonesByName: rig.bonesByName,
      restQuaternions: rig.restQuats,
      jointLimitsEnabled: true,
      swivelDeg: 0,
      poleDirectionWorld,
    });
  }

  // 6. Legs solved via 2-bone IK (with cropped half-body natural standing fallback)
  const neutralStanceLegs: Record<'l' | 'r', Record<string, JointAngles>> = {
    l: {
      thigh_l: { x: -11, y: -4, z: -4 },
      calf_l: { x: 14, y: 0, z: 0 },
      foot_l: { x: -5, y: -1, z: 1 },
    },
    r: {
      thigh_r: { x: -5, y: 12, z: 1 },
      calf_r: { x: 6, y: 0, z: 0 },
      foot_r: { x: -3, y: 2, z: -2 },
    },
  };

  for (const side of ['l', 'r'] as const) {
    const hIdx = side === 'l' ? 23 : 24;
    const kIdx = side === 'l' ? 25 : 26;
    const aIdx = side === 'l' ? 27 : 28;
    const legVisible =
      !person.upperBodyOnly &&
      landmarkVis(person.landmarks[hIdx], 0) >= 0.35 &&
      landmarkVis(person.landmarks[kIdx], 0) >= 0.35 &&
      landmarkVis(person.landmarks[aIdx], 0) >= 0.35;

    if (!legVisible) {
      for (const [bName, ang] of Object.entries(neutralStanceLegs[side])) {
        applyCanonicalBoneAngles(rig, bName, ang, true);
      }
      continue;
    }

    const uDir = safeNorm(pts[kIdx].clone().sub(pts[hIdx]), new THREE.Vector3(0, -1, 0));
    const lDir = safeNorm(pts[aIdx].clone().sub(pts[kIdx]), new THREE.Vector3(0, -1, 0));
    const hipPos = getBoneWorldPos(rig, `thigh_${side}`);
    const targetPos = hipPos
      .clone()
      .addScaledVector(uDir, L_THIGH)
      .addScaledVector(lDir, L_SHIN);

    const midChord = hipPos.clone().add(targetPos).multiplyScalar(0.5);
    const kneeExpected = hipPos.clone().addScaledVector(uDir, L_THIGH);
    const poleVec = kneeExpected.sub(midChord);
    const poleDirectionWorld =
      poleVec.length() > 0.018 ? poleVec.normalize() : undefined;

    solveLimbIK({
      handleId: side === 'l' ? 'foot_l' : 'foot_r',
      targetWorldPos: targetPos,
      rootGroup: rig.rootGroup,
      bonesByName: rig.bonesByName,
      restQuaternions: rig.restQuats,
      jointLimitsEnabled: true,
      swivelDeg: 0,
      poleDirectionWorld,
    });

    solveFootOrientation(rig, side, person, pts, spineUp);
  }

  // 7. Wrists & 21-point Hand Gestures
  solveArmWristOrientation(rig, 'l', person, pts, yawNormQuat);
  solveArmWristOrientation(rig, 'r', person, pts, yawNormQuat);

  let leftHandGesture: HandGestureId = 'relaxed';
  let rightHandGesture: HandGestureId = 'relaxed';

  if (includeHandGestures && person.leftHand) {
    leftHandGesture = matchHandLandmarksToGesture(person.leftHand);
  }
  if (includeHandGestures && person.rightHand) {
    rightHandGesture = matchHandLandmarksToGesture(person.rightHand);
  }

  for (const [bName, ang] of Object.entries(
    buildHandGestureBones('l', leftHandGesture)
  )) {
    applyCanonicalBoneAngles(rig, bName, ang, true);
  }
  for (const [bName, ang] of Object.entries(
    buildHandGestureBones('r', rightHandGesture)
  )) {
    applyCanonicalBoneAngles(rig, bName, ang, true);
  }

  // 8. Export verified 52-bone PoseSnapshot
  rig.rootGroup.updateMatrixWorld(true);
  const bones: Record<string, QuaternionTuple> = {};
  for (const boneName of POSEABLE_BONE_NAMES) {
    const bone = rig.bonesByName.get(boneName);
    if (!bone) continue;
    const q = bone.quaternion.clone().normalize();
    const tuple: QuaternionTuple = [
      Number.isFinite(q.x) ? q.x : 0,
      Number.isFinite(q.y) ? q.y : 0,
      Number.isFinite(q.z) ? q.z : 0,
      Number.isFinite(q.w) ? q.w : 1,
    ];
    bones[boneName] = tuple;
  }

  return {
    snapshot: {
      bones,
      rootPosition: [0, 0, 0],
      elevationY: 0,
      groundEnabled,
      groundSnapEnabled,
      pinnedBones: [],
    },
    leftHandGesture,
    rightHandGesture,
    cameraEstimate: estimate,
    upperBodyOnly: person.upperBodyOnly,
  };
}

export function getHandGestureDisplayLabel(id: HandGestureId): string {
  const found = HAND_GESTURES.find((g) => g.id === id);
  return found ? found.shortLabel : 'Relaxed';
}

export function computePersonBBoxCenter2D(landmarks: NormalizedLandmark2D[]): {
  x: number;
  y: number;
} {
  if (!landmarks.length) return { x: 0.5, y: 0.5 };
  let sumX = 0;
  let sumY = 0;
  for (const lm of landmarks) {
    sumX += lm.x;
    sumY += lm.y;
  }
  return {
    x: sumX / landmarks.length,
    y: sumY / landmarks.length,
  };
}
