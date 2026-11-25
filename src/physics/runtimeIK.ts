import * as THREE from 'three';
import { clampJointAngles, getJointSpec } from '@/data/jointLimits';
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
  restQuaternions: Map<string, THREE.Quaternion>;
  jointLimitsEnabled: boolean;
}

export interface SolveLimbIKResult {
  upperBoneName: string;
  lowerBoneName: string;
  endBoneName: string;
  upperAngles: JointAngles;
  lowerAngles: JointAngles;
  achievedPos: THREE.Vector3;
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

function quatToIKAngles(
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

  if (jointLimitsEnabled && bestAngErr > 0.07) {
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

    let cur: JointAngles = {
      x: Math.round(best.x),
      y: Math.round(best.y),
      z: Math.round(best.z),
    };
    cur = clampJointAngles(cur, spec, true);
    let curErr = evalErr(cur.x, cur.y, cur.z);

    for (const [radius, step] of [
      [12, 4],
      [3, 1],
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
          for (let val = lo; val <= hi; val += step) {
            const nx = axis === 'x' ? val : cur.x;
            const ny = axis === 'y' ? val : cur.y;
            const nz = axis === 'z' ? val : cur.z;
            const err = evalErr(nx, ny, nz);
            if (err + 1e-5 < curErr) {
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

  // Blend gently with current anatomical bend plane to prevent popping mid-drag
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
      if (curBendDeg > 10 && curPerp.length() > 0.015) {
        curPerp.normalize();
        if (curPerp.dot(naturalPole) > 0) {
          naturalPole = naturalPole
            .clone()
            .multiplyScalar(0.65)
            .addScaledVector(curPerp, 0.35)
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
  jointLimitsEnabled,
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

  const poleHint = computeNaturalPoleHint(
    chain,
    bonesByName,
    upperPos,
    lowerPos,
    endPos
  );

  const specUpper = getJointSpec(chain.upperBone);
  const specLower = getJointSpec(chain.lowerBone);
  const prevLowerAngles = readBoneDelta(lowerBone, restLower, specLower.order);
  const preservedTwistY = specLower.showY ? prevLowerAngles.y : 0;

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

  let pPerp = projPerp(poleHint, dHat);
  if (pPerp.length() < 1e-4) {
    const fallbackAxis =
      Math.abs(dHat.z) < 0.8
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(1, 0, 0);
    pPerp = projPerp(fallbackAxis, dHat);
  }
  pPerp.normalize();

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
  applyBoneDeltaAngles(lowerBone, restLower, baseLowerAngles, specLower.order);
  rootGroup.updateMatrixWorld(true);

  upperBone.parent.getWorldQuaternion(_wq);
  const zeroUpperWQ = _wq.clone().multiply(restUpper);
  const upperDeltaQuat = zeroUpperWQ.clone().invert().multiply(desiredWQ).normalize();
  const upperAngles = quatToIKAngles(
    chain.upperBone,
    upperDeltaQuat,
    jointLimitsEnabled
  );

  applyBoneDeltaAngles(upperBone, restUpper, upperAngles, specUpper.order);

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
    applyBoneDeltaAngles(lowerBone, restLower, candidate, specLower.order);
    rootGroup.updateMatrixWorld(true);
    return getBoneWorldPos(endBone).distanceToSquared(T);
  };

  let bestErrSq = testLower(bestBx);

  // Micro-refine hinge bend when upper ROM clamping shifts the optimal flexion slightly
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
    for (let bx = fineLo; bx <= fineHi; bx += 1) {
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
  applyBoneDeltaAngles(lowerBone, restLower, finalLowerAngles, specLower.order);
  rootGroup.updateMatrixWorld(true);

  return {
    upperBoneName: chain.upperBone,
    lowerBoneName: chain.lowerBone,
    endBoneName: chain.endBone,
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
    achievedPos: getBoneWorldPos(endBone),
  };
}
