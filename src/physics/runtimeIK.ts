import * as THREE from 'three';
import { clampJointAngles, getJointSpec } from '@/data/jointLimits';
import type { RigAdapter } from '@/rig/rigAdapter';
import type { IKHandleId, JointAngles } from '@/types/anatomy';

export interface IKChainSpec {
  upperBone: string;
  lowerBone: string;
  endBone: string;
  side: 'l' | 'r';
  limb: 'arm' | 'leg';
}

export const IK_CHAINS: Record<Exclude<IKHandleId, 'pelvis'>, IKChainSpec> = {
  hand_l: {
    upperBone: 'upperarm_l',
    lowerBone: 'lowerarm_l',
    endBone: 'hand_l',
    side: 'l',
    limb: 'arm',
  },
  hand_r: {
    upperBone: 'upperarm_r',
    lowerBone: 'lowerarm_r',
    endBone: 'hand_r',
    side: 'r',
    limb: 'arm',
  },
  foot_l: {
    upperBone: 'thigh_l',
    lowerBone: 'calf_l',
    endBone: 'foot_l',
    side: 'l',
    limb: 'leg',
  },
  foot_r: {
    upperBone: 'thigh_r',
    lowerBone: 'calf_r',
    endBone: 'foot_r',
    side: 'r',
    limb: 'leg',
  },
};

export function getIKHandleBoneName(id: IKHandleId): string {
  return id;
}

export function getIKHandleLabel(id: IKHandleId): string {
  switch (id) {
    case 'hand_l':
      return 'Left Hand IK';
    case 'hand_r':
      return 'Right Hand IK';
    case 'foot_l':
      return 'Left Foot IK';
    case 'foot_r':
      return 'Right Foot IK';
    case 'pelvis':
      return 'Pelvis / Hips IK';
  }
}

export interface SolveLimbIKParams {
  handleId: Exclude<IKHandleId, 'pelvis'>;
  targetWorldPos: THREE.Vector3;
  rootGroup: THREE.Group;
  bonesByName: Map<string, THREE.Bone>;
  restQuaternions: ReadonlyMap<string, THREE.Quaternion>;
  rigAdapter?: RigAdapter;
  jointLimitsEnabled: boolean;
  swivelDeg?: number;
  poleHintOverride?: THREE.Vector3;
  poleDirectionWorld?: THREE.Vector3;
}

export interface SolveLimbIKResult {
  upperBoneName: string;
  lowerBoneName: string;
  endBoneName: string;
  upperPos: THREE.Vector3;
  lowerPos: THREE.Vector3;
  upperAngles: JointAngles;
  lowerAngles: JointAngles;
  achievedPos: THREE.Vector3;
  reachRatio: number;
  isMaxReach: boolean;
  isClamped: boolean;
  resolvedPole: THREE.Vector3;
}

export interface SolvePelvisSquatIKParams {
  startRootPos: THREE.Vector3;
  deltaWorld: THREE.Vector3;
  anchoredFootL: THREE.Vector3 | null;
  anchoredFootR: THREE.Vector3 | null;
  pinFeet: boolean;
  swivelFootL?: number;
  swivelFootR?: number;
  rootGroup: THREE.Group;
  bonesByName: Map<string, THREE.Bone>;
  restQuaternions: ReadonlyMap<string, THREE.Quaternion>;
  rigAdapter?: RigAdapter;
  jointLimitsEnabled: boolean;
  groundEnabled: boolean;
  computeSkinnedMinY: () => number;
}

export interface SolvePelvisSquatIKResult {
  minY: number;
  pelvisPos: THREE.Vector3;
  footLResult: SolveLimbIKResult | null;
  footRResult: SolveLimbIKResult | null;
}

const _wp = new THREE.Vector3();
const _wq = new THREE.Quaternion();

function getBoneWorldPos(bone: THREE.Bone): THREE.Vector3 {
  bone.getWorldPosition(_wp);
  return _wp.clone();
}

function projPerp(vec: THREE.Vector3, axisUnit: THREE.Vector3): THREE.Vector3 {
  return vec.clone().addScaledVector(axisUnit, -vec.dot(axisUnit));
}

function safeNorm(
  vec: THREE.Vector3,
  fallback = new THREE.Vector3(0, 0, 1)
): THREE.Vector3 {
  const len = vec.length();
  if (len < 1e-6) return fallback.clone();
  return vec.clone().divideScalar(len);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function wrap180(deg: number): number {
  let d = (((deg + 180) % 360) + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

function applyBoneDeltaAngles(
  bone: THREE.Bone,
  restQuat: THREE.Quaternion,
  angles: JointAngles,
  order: THREE.EulerOrder
): void {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(angles.x),
    THREE.MathUtils.degToRad(angles.y),
    THREE.MathUtils.degToRad(angles.z),
    order
  );
  const deltaQuat = new THREE.Quaternion().setFromEuler(euler);
  bone.quaternion.copy(restQuat).multiply(deltaQuat).normalize();
}

function readBoneDelta(
  bone: THREE.Bone,
  restQuat: THREE.Quaternion,
  order: THREE.EulerOrder
): JointAngles {
  const delta = restQuat.clone().invert().multiply(bone.quaternion);
  const euler = new THREE.Euler(0, 0, 0, order).setFromQuaternion(delta, order);
  return {
    x: THREE.MathUtils.radToDeg(euler.x),
    y: THREE.MathUtils.radToDeg(euler.y),
    z: THREE.MathUtils.radToDeg(euler.z),
  };
}

export function quatToIKAngles(
  boneName: string,
  deltaQuat: THREE.Quaternion,
  jointLimitsEnabled: boolean
): JointAngles {
  const spec = getJointSpec(boneName);
  const euler = new THREE.Euler(0, 0, 0, spec.order).setFromQuaternion(
    deltaQuat,
    spec.order
  );
  const x0 = THREE.MathUtils.radToDeg(euler.x);
  const y0 = THREE.MathUtils.radToDeg(euler.y);
  const z0 = THREE.MathUtils.radToDeg(euler.z);

  const candidates: JointAngles[] = [
    clampJointAngles({ x: x0, y: y0, z: z0 }, spec, jointLimitsEnabled),
  ];

  if (spec.order === 'XYZ') {
    candidates.push(
      clampJointAngles(
        {
          x: wrap180(x0 + 180),
          y: wrap180(180 - y0),
          z: wrap180(z0 + 180),
        },
        spec,
        jointLimitsEnabled
      )
    );
  }

  let best = candidates[0];
  let bestAngErr = Infinity;
  const qCand = new THREE.Quaternion();
  const eCand = new THREE.Euler(0, 0, 0, spec.order);

  for (const cand of candidates) {
    eCand.set(
      THREE.MathUtils.degToRad(cand.x),
      THREE.MathUtils.degToRad(cand.y),
      THREE.MathUtils.degToRad(cand.z),
      spec.order
    );
    qCand.setFromEuler(eCand);
    const err = qCand.angleTo(deltaQuat);
    if (err < bestAngErr) {
      bestAngErr = err;
      best = cand;
    }
  }

  if (jointLimitsEnabled && bestAngErr > 0.04) {
    const evalErr = (x: number, y: number, z: number): number => {
      eCand.set(
        THREE.MathUtils.degToRad(x),
        THREE.MathUtils.degToRad(y),
        THREE.MathUtils.degToRad(z),
        spec.order
      );
      qCand.setFromEuler(eCand);
      return qCand.angleTo(deltaQuat);
    };

    let cur: JointAngles = clampJointAngles(best, spec, true);
    let curErr = evalErr(cur.x, cur.y, cur.z);

    for (const [radius, step] of [
      [8, 2],
      [2, 0.5],
    ] as const) {
      let improved = true;
      let iter = 0;
      while (improved && iter < 2) {
        improved = false;
        iter += 1;
        for (const axis of ['x', 'y', 'z'] as const) {
          const lim = spec.axes[axis];
          const enabledAxis =
            axis === 'x' ? spec.showX : axis === 'y' ? spec.showY : spec.showZ;
          if (!enabledAxis && lim.min === 0 && lim.max === 0) continue;

          const lo = Math.max(lim.min, cur[axis] - radius);
          const hi = Math.min(lim.max, cur[axis] + radius);
          for (let val = lo; val <= hi + 1e-6; val += step) {
            const clampedVal = Math.min(hi, val);
            const nx = axis === 'x' ? clampedVal : cur.x;
            const ny = axis === 'y' ? clampedVal : cur.y;
            const nz = axis === 'z' ? clampedVal : cur.z;
            const err = evalErr(nx, ny, nz);
            if (err + 1e-6 < curErr) {
              curErr = err;
              cur = { x: nx, y: ny, z: nz };
              improved = true;
            }
          }
        }
      }
    }
    best = cur;
  }

  return best;
}

function computeNaturalPoleHint(
  chain: IKChainSpec,
  bonesByName: Map<string, THREE.Bone>,
  upperPos: THREE.Vector3,
  lowerPos: THREE.Vector3,
  endPos: THREE.Vector3
): THREE.Vector3 {
  const sideSign = chain.side === 'l' ? 1 : -1;
  let naturalPole: THREE.Vector3;

  if (chain.limb === 'arm') {
    const uL = bonesByName.get('upperarm_l');
    const uR = bonesByName.get('upperarm_r');
    const sp1 = bonesByName.get('spine_01');
    const sp3 = bonesByName.get('spine_03');

    const shoulderLeft =
      uL && uR
        ? safeNorm(getBoneWorldPos(uL).sub(getBoneWorldPos(uR)), new THREE.Vector3(1, 0, 0))
        : new THREE.Vector3(1, 0, 0);
    const chestUp =
      sp1 && sp3
        ? safeNorm(getBoneWorldPos(sp3).sub(getBoneWorldPos(sp1)), new THREE.Vector3(0, 1, 0))
        : new THREE.Vector3(0, 1, 0);
    const chestFwd = safeNorm(
      new THREE.Vector3().crossVectors(shoulderLeft, chestUp),
      new THREE.Vector3(0, 0, 1)
    );

    naturalPole = shoulderLeft
      .clone()
      .multiplyScalar(0.45 * sideSign)
      .addScaledVector(chestFwd, -0.75)
      .addScaledVector(chestUp, -0.35)
      .normalize();
  } else {
    const thL = bonesByName.get('thigh_l');
    const thR = bonesByName.get('thigh_r');
    const pelv = bonesByName.get('pelvis');
    const sp1 = bonesByName.get('spine_01');

    const hipLeft =
      thL && thR
        ? safeNorm(getBoneWorldPos(thL).sub(getBoneWorldPos(thR)), new THREE.Vector3(1, 0, 0))
        : new THREE.Vector3(1, 0, 0);
    const pelvisUp =
      pelv && sp1
        ? safeNorm(getBoneWorldPos(sp1).sub(getBoneWorldPos(pelv)), new THREE.Vector3(0, 1, 0))
        : new THREE.Vector3(0, 1, 0);
    const hipFwd = safeNorm(
      new THREE.Vector3().crossVectors(hipLeft, pelvisUp),
      new THREE.Vector3(0, 0, 1)
    );

    naturalPole = hipFwd
      .clone()
      .multiplyScalar(0.92)
      .addScaledVector(hipLeft, 0.18 * sideSign)
      .normalize();
  }

  // Blend smoothly with current anatomical bend plane (Hermite taper prevents popping)
  const curSE = endPos.clone().sub(upperPos);
  if (curSE.lengthSq() > 1e-4) {
    const dir1 = lowerPos.clone().sub(upperPos);
    const dir2 = endPos.clone().sub(lowerPos);
    if (dir1.lengthSq() > 1e-5 && dir2.lengthSq() > 1e-5) {
      dir1.normalize();
      dir2.normalize();
      const curBendDeg = THREE.MathUtils.radToDeg(
        Math.acos(THREE.MathUtils.clamp(dir1.dot(dir2), -1, 1))
      );
      const curPerp = projPerp(
        lowerPos.clone().sub(upperPos),
        curSE.clone().normalize()
      );
      if (curPerp.length() > 0.01) {
        curPerp.normalize();
        const blend =
          smoothstep(6, 22, curBendDeg) *
          smoothstep(0.05, 0.35, curPerp.dot(naturalPole)) *
          0.3;
        if (blend > 0.001) {
          naturalPole = naturalPole
            .clone()
            .multiplyScalar(1 - blend)
            .addScaledVector(curPerp, blend)
            .normalize();
        }
      }
    }
  }

  return naturalPole;
}

export function solveLimbIK({
  handleId,
  targetWorldPos,
  rootGroup,
  bonesByName,
  restQuaternions,
  rigAdapter,
  jointLimitsEnabled,
  swivelDeg = 0,
  poleHintOverride,
  poleDirectionWorld,
}: SolveLimbIKParams): SolveLimbIKResult | null {
  const chain = IK_CHAINS[handleId];
  const upperBone = bonesByName.get(chain.upperBone);
  const lowerBone = bonesByName.get(chain.lowerBone);
  const endBone = bonesByName.get(chain.endBone);
  const restUpper = restQuaternions.get(chain.upperBone);
  const restLower = restQuaternions.get(chain.lowerBone);

  if (
    !upperBone ||
    !lowerBone ||
    !endBone ||
    !restUpper ||
    !restLower ||
    !upperBone.parent
  ) {
    return null;
  }

  rootGroup.updateMatrixWorld(true);

  const upperPos = getBoneWorldPos(upperBone);
  const lowerPos = getBoneWorldPos(lowerBone);
  const endPos = getBoneWorldPos(endBone);

  const L1 = upperPos.distanceTo(lowerPos);
  const L2 = lowerPos.distanceTo(endPos);
  if (L1 < 1e-4 || L2 < 1e-4) return null;

  const naturalPole = computeNaturalPoleHint(
    chain,
    bonesByName,
    upperPos,
    lowerPos,
    endPos
  );
  const basePole =
    poleDirectionWorld && poleDirectionWorld.lengthSq() > 1e-6
      ? safeNorm(poleDirectionWorld, naturalPole)
      : poleHintOverride && poleHintOverride.lengthSq() > 1e-6
        ? safeNorm(
            poleHintOverride
              .clone()
              .normalize()
              .multiplyScalar(0.8)
              .addScaledVector(naturalPole, 0.2),
            naturalPole
          )
        : naturalPole;

  const specUpper = getJointSpec(chain.upperBone);
  const specLower = getJointSpec(chain.lowerBone);
  const prevLowerAngles = rigAdapter
    ? rigAdapter.readCanonicalAngles(chain.lowerBone, specLower, false)
    : readBoneDelta(lowerBone, restLower, specLower.order);
  const preservedTwistY = specLower.showY ? prevLowerAngles.y : 0;

  const applyJoint = (
    name: string,
    bone: THREE.Bone,
    restQ: THREE.Quaternion,
    angles: JointAngles,
    order: THREE.EulerOrder
  ) => {
    if (rigAdapter) {
      rigAdapter.applyCanonicalAngles(name, angles, order);
    } else {
      applyBoneDeltaAngles(bone, restQ, angles, order);
    }
  };

  const T = targetWorldPos.clone();
  const D = T.clone().sub(upperPos);
  const rawDist = D.length();
  const minDist = Math.abs(L1 - L2) + 0.01;
  const maxDist = L1 + L2 - 0.002;
  const d = THREE.MathUtils.clamp(rawDist, minDist, maxDist);
  const dHat = safeNorm(D, new THREE.Vector3(0, -1, 0));

  const cosA = THREE.MathUtils.clamp(
    (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d),
    -0.9999,
    0.9999
  );
  const a = L1 * cosA;
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

  let pPerp = projPerp(basePole, dHat);
  if (pPerp.length() < 1e-4) {
    const fallbackAxis =
      Math.abs(dHat.z) < 0.8
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(1, 0, 0);
    pPerp = projPerp(fallbackAxis, dHat);
  }
  pPerp.normalize();

  const resolvedPole = pPerp.clone();
  if (Math.abs(swivelDeg) > 0.05) {
    const sideSign = chain.side === 'l' ? 1 : -1;
    const swivelSign = chain.limb === 'arm' ? sideSign : -sideSign;
    pPerp.applyAxisAngle(dHat, THREE.MathUtils.degToRad(swivelDeg * swivelSign));
    pPerp = projPerp(pPerp, dHat);
    if (pPerp.lengthSq() > 1e-6) {
      pPerp.normalize();
    } else {
      pPerp.copy(resolvedPole);
    }
  }

  const M = upperPos.clone().addScaledVector(dHat, a).addScaledVector(pPerp, h);

  // Verified GLB local limb basis: +Y along upper limb, +Z opposite pole (+X flexion), +X = Y x Z
  const colY = safeNorm(M.clone().sub(upperPos));
  const colZ = safeNorm(projPerp(pPerp.clone().negate(), colY));
  const colX = safeNorm(new THREE.Vector3().crossVectors(colY, colZ));
  colZ.copy(new THREE.Vector3().crossVectors(colX, colY)).normalize();

  const rotMat = new THREE.Matrix4().makeBasis(colX, colY, colZ);
  const desiredWQ = new THREE.Quaternion().setFromRotationMatrix(rotMat);

  // Zero hinge bend while orienting upper segment
  const baseLowerAngles = clampJointAngles(
    { x: 0, y: preservedTwistY, z: 0 },
    specLower,
    jointLimitsEnabled
  );
  applyJoint(chain.lowerBone, lowerBone, restLower, baseLowerAngles, specLower.order);
  rootGroup.updateMatrixWorld(true);

  const zeroUpperWQ = rigAdapter
    ? rigAdapter.getCanonicalRestWorldQuat(chain.upperBone, new THREE.Quaternion())
    : (() => {
        upperBone.parent!.getWorldQuaternion(_wq);
        return _wq.clone().multiply(restUpper);
      })();
  const upperDeltaQuat = zeroUpperWQ.clone().invert().multiply(desiredWQ).normalize();
  const upperAngles = quatToIKAngles(
    chain.upperBone,
    upperDeltaQuat,
    jointLimitsEnabled
  );

  applyJoint(chain.upperBone, upperBone, restUpper, upperAngles, specUpper.order);

  // Analytical law-of-cosines flexion angle for lower segment
  const cosB = THREE.MathUtils.clamp(
    (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2),
    -0.9999,
    0.9999
  );
  const analyticalBend = 180 - THREE.MathUtils.radToDeg(Math.acos(cosB));
  const minBx = jointLimitsEnabled ? Math.max(0, specLower.axes.x.min) : 0;
  const maxBx = jointLimitsEnabled ? specLower.axes.x.max : 165;
  let bestBx = THREE.MathUtils.clamp(analyticalBend, minBx, maxBx);

  const testLower = (bx: number) => {
    const candidate = clampJointAngles(
      { x: bx, y: preservedTwistY, z: 0 },
      specLower,
      jointLimitsEnabled
    );
    applyJoint(chain.lowerBone, lowerBone, restLower, candidate, specLower.order);
    rootGroup.updateMatrixWorld(true);
    return getBoneWorldPos(endBone).distanceToSquared(T);
  };

  let bestErrSq = testLower(bestBx);

  // Smooth refinement when upper ROM clamping shifts optimal flexion
  if (bestErrSq > 0.0001) {
    const coarseLo = Math.max(minBx, bestBx - 16);
    const coarseHi = Math.min(maxBx, bestBx + 16);
    for (let bx = coarseLo; bx <= coarseHi; bx += 4) {
      const errSq = testLower(bx);
      if (errSq < bestErrSq) {
        bestErrSq = errSq;
        bestBx = bx;
      }
    }
    const fineLo = Math.max(minBx, bestBx - 3);
    const fineHi = Math.min(maxBx, bestBx + 3);
    for (let bx = fineLo; bx <= fineHi; bx += 0.5) {
      const errSq = testLower(bx);
      if (errSq < bestErrSq) {
        bestErrSq = errSq;
        bestBx = bx;
      }
    }
  }

  const finalLowerAngles = clampJointAngles(
    { x: bestBx, y: preservedTwistY, z: 0 },
    specLower,
    jointLimitsEnabled
  );
  applyJoint(chain.lowerBone, lowerBone, restLower, finalLowerAngles, specLower.order);
  if (rigAdapter?.needsProportionSync) {
    rigAdapter.syncProportionScales();
  }
  rootGroup.updateMatrixWorld(true);

  const achievedPos = getBoneWorldPos(endBone);
  const reachRatio = maxDist > 1e-4 ? rawDist / maxDist : 1;

  return {
    upperBoneName: chain.upperBone,
    lowerBoneName: chain.lowerBone,
    endBoneName: chain.endBone,
    upperPos: getBoneWorldPos(upperBone),
    lowerPos: getBoneWorldPos(lowerBone),
    upperAngles: {
      x: Math.round(upperAngles.x),
      y: Math.round(upperAngles.y),
      z: Math.round(upperAngles.z),
    },
    lowerAngles: {
      x: Math.round(finalLowerAngles.x),
      y: Math.round(finalLowerAngles.y),
      z: Math.round(finalLowerAngles.z),
    },
    achievedPos,
    reachRatio,
    isMaxReach: rawDist >= maxDist - 0.004,
    isClamped: achievedPos.distanceTo(targetWorldPos) > 0.018,
    resolvedPole,
  };
}

/**
 * Translates the figure pelvis while optionally keeping left/right feet
 * planted at their world anchors via dual leg IK (squat, crouch, hip sway).
 */
export function solvePelvisSquatIK({
  startRootPos,
  deltaWorld,
  anchoredFootL,
  anchoredFootR,
  pinFeet,
  swivelFootL = 0,
  swivelFootR = 0,
  rootGroup,
  bonesByName,
  restQuaternions,
  rigAdapter,
  jointLimitsEnabled,
  groundEnabled,
  computeSkinnedMinY,
}: SolvePelvisSquatIKParams): SolvePelvisSquatIKResult {
  rootGroup.position.copy(startRootPos).add(deltaWorld);
  rootGroup.updateMatrixWorld(true);

  const solveFeet = () => {
    let footLResult: SolveLimbIKResult | null = null;
    let footRResult: SolveLimbIKResult | null = null;
    if (pinFeet) {
      let pelvisPitch = 0;
      if (rigAdapter?.hasJoint('pelvis')) {
        const pelvSpec = getJointSpec('pelvis');
        pelvisPitch = rigAdapter.readCanonicalAngles('pelvis', pelvSpec, false).x;
      }
      const levelFoot = (footName: 'foot_l' | 'foot_r', res: SolveLimbIKResult | null) => {
        if (!res || !rigAdapter?.hasJoint(footName)) return;
        const fSpec = getJointSpec(footName);
        const curFoot = rigAdapter.readCanonicalAngles(footName, fSpec, false);
        const levelX = -(pelvisPitch + res.upperAngles.x + res.lowerAngles.x);
        const nextFoot = clampJointAngles(
          { x: levelX, y: curFoot.y, z: curFoot.z },
          fSpec,
          jointLimitsEnabled
        );
        rigAdapter.applyCanonicalAngles(footName, nextFoot, fSpec.order);
        if (rigAdapter.needsProportionSync) {
          rigAdapter.syncProportionScales();
        }
      };

      if (anchoredFootL) {
        footLResult = solveLimbIK({
          handleId: 'foot_l',
          targetWorldPos: anchoredFootL,
          rootGroup,
          bonesByName,
          restQuaternions,
          rigAdapter,
          jointLimitsEnabled,
          swivelDeg: swivelFootL,
        });
        levelFoot('foot_l', footLResult);
      }
      if (anchoredFootR) {
        footRResult = solveLimbIK({
          handleId: 'foot_r',
          targetWorldPos: anchoredFootR,
          rootGroup,
          bonesByName,
          restQuaternions,
          rigAdapter,
          jointLimitsEnabled,
          swivelDeg: swivelFootR,
        });
        levelFoot('foot_r', footRResult);
      }
      rootGroup.updateMatrixWorld(true);
    }
    return { footLResult, footRResult };
  };

  let { footLResult, footRResult } = solveFeet();
  let minY = computeSkinnedMinY();
  if (groundEnabled && minY < 0) {
    rootGroup.position.y += -minY;
    rootGroup.updateMatrixWorld(true);
    const reSolved = solveFeet();
    footLResult = reSolved.footLResult;
    footRResult = reSolved.footRResult;
    minY = computeSkinnedMinY();
  }

  const pelvis = bonesByName.get('pelvis');
  const pelvisPos = pelvis
    ? getBoneWorldPos(pelvis)
    : rootGroup.position.clone();

  return {
    minY,
    pelvisPos,
    footLResult,
    footRResult,
  };
}
