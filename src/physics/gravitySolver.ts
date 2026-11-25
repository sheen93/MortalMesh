import * as THREE from 'three';
import { getJointSpec } from '@/data/jointLimits';
import { isCoreBoneName, type DampingPreset } from '@/types/anatomy';

export const BODY_MASS_KG = 75;
export const GRAVITY_ACCEL = 9.81;
export const MIN_INERTIA = 0.015;
export const SLEEP_SPEED_THRESHOLD = 0.005;
export const SLEEP_DELTA_THRESHOLD = 0.0001;
const SLEEP_CONFIRM_FRAMES = 4;
const MAX_FRAME_DT = 1 / 60;
const SUBSTEPS = 2;

export const DAMPING_MULTIPLIERS: Record<DampingPreset, number> = {
  soft: 0.5,
  natural: 1.0,
  heavy: 1.85,
};

export interface SegmentPhysicsSpec {
  massFraction: number;
  length: number;
  comRatio: number;
  children: readonly string[];
}

export const SEGMENT_PHYSICS: Record<string, SegmentPhysicsSpec> = {
  pelvis: {
    massFraction: 0.13,
    length: 0.15,
    comRatio: 0.48,
    children: ['spine_01', 'thigh_l', 'thigh_r'],
  },
  spine_01: {
    massFraction: 0.13,
    length: 0.14,
    comRatio: 0.48,
    children: ['spine_02'],
  },
  spine_02: {
    massFraction: 0.1,
    length: 0.16,
    comRatio: 0.48,
    children: ['spine_03'],
  },
  spine_03: {
    massFraction: 0.113,
    length: 0.19,
    comRatio: 0.48,
    children: ['neck_01', 'clavicle_l', 'clavicle_r'],
  },
  neck_01: {
    massFraction: 0.016,
    length: 0.09,
    comRatio: 0.48,
    children: ['Head'],
  },
  Head: {
    massFraction: 0.065,
    length: 0.22,
    comRatio: 0.48,
    children: [],
  },
  clavicle_l: {
    massFraction: 0.012,
    length: 0.24,
    comRatio: 0.48,
    children: ['upperarm_l'],
  },
  upperarm_l: {
    massFraction: 0.028,
    length: 0.3,
    comRatio: 0.45,
    children: ['lowerarm_l'],
  },
  lowerarm_l: {
    massFraction: 0.016,
    length: 0.3,
    comRatio: 0.45,
    children: ['hand_l'],
  },
  hand_l: {
    massFraction: 0.006,
    length: 0.18,
    comRatio: 0.45,
    children: [],
  },
  clavicle_r: {
    massFraction: 0.012,
    length: 0.24,
    comRatio: 0.48,
    children: ['upperarm_r'],
  },
  upperarm_r: {
    massFraction: 0.028,
    length: 0.3,
    comRatio: 0.45,
    children: ['lowerarm_r'],
  },
  lowerarm_r: {
    massFraction: 0.016,
    length: 0.3,
    comRatio: 0.45,
    children: ['hand_r'],
  },
  hand_r: {
    massFraction: 0.006,
    length: 0.18,
    comRatio: 0.45,
    children: [],
  },
  thigh_l: {
    massFraction: 0.1,
    length: 0.44,
    comRatio: 0.44,
    children: ['calf_l'],
  },
  calf_l: {
    massFraction: 0.0465,
    length: 0.47,
    comRatio: 0.44,
    children: ['foot_l'],
  },
  foot_l: {
    massFraction: 0.0125,
    length: 0.19,
    comRatio: 0.48,
    children: ['ball_l'],
  },
  ball_l: {
    massFraction: 0.002,
    length: 0.09,
    comRatio: 0.48,
    children: [],
  },
  thigh_r: {
    massFraction: 0.1,
    length: 0.44,
    comRatio: 0.44,
    children: ['calf_r'],
  },
  calf_r: {
    massFraction: 0.0465,
    length: 0.47,
    comRatio: 0.44,
    children: ['foot_r'],
  },
  foot_r: {
    massFraction: 0.0125,
    length: 0.19,
    comRatio: 0.48,
    children: ['ball_r'],
  },
  ball_r: {
    massFraction: 0.002,
    length: 0.09,
    comRatio: 0.48,
    children: [],
  },
};

export const CORE_TOP_DOWN_ORDER: readonly string[] = [
  'pelvis',
  'spine_01',
  'spine_02',
  'spine_03',
  'neck_01',
  'Head',
  'clavicle_l',
  'upperarm_l',
  'lowerarm_l',
  'hand_l',
  'clavicle_r',
  'upperarm_r',
  'lowerarm_r',
  'hand_r',
  'thigh_l',
  'calf_l',
  'foot_l',
  'ball_l',
  'thigh_r',
  'calf_r',
  'foot_r',
  'ball_r',
];

function collectSubtree(boneName: string, out: string[]): void {
  out.push(boneName);
  const spec = SEGMENT_PHYSICS[boneName];
  if (!spec) return;
  for (const child of spec.children) {
    collectSubtree(child, out);
  }
}

const SUBTREE_CACHE: Record<string, readonly string[]> = Object.fromEntries(
  Object.keys(SEGMENT_PHYSICS).map((name) => {
    const list: string[] = [];
    collectSubtree(name, list);
    return [name, list];
  })
);

const ARM_WAKE_CHAIN = [
  'upperarm_l',
  'lowerarm_l',
  'hand_l',
  'upperarm_r',
  'lowerarm_r',
  'hand_r',
] as const;

const LEG_WAKE_CHAIN = [
  'thigh_l',
  'calf_l',
  'foot_l',
  'ball_l',
  'thigh_r',
  'calf_r',
  'foot_r',
  'ball_r',
] as const;

export function getInitialGravityWakeBones(isOffFloor: boolean): string[] {
  return isOffFloor
    ? [...ARM_WAKE_CHAIN, ...LEG_WAKE_CHAIN]
    : [...ARM_WAKE_CHAIN];
}

export function getDownstreamReactingBones(
  parentBoneName: string,
  isOffFloor: boolean
): string[] {
  if (!isCoreBoneName(parentBoneName)) {
    return [];
  }

  if (parentBoneName === 'pelvis') {
    const list: string[] = ['neck_01', 'Head', ...ARM_WAKE_CHAIN];
    if (isOffFloor) {
      list.push(...LEG_WAKE_CHAIN);
    }
    return list;
  }

  if (
    parentBoneName === 'spine_01' ||
    parentBoneName === 'spine_02' ||
    parentBoneName === 'spine_03'
  ) {
    const full = SUBTREE_CACHE[parentBoneName] ?? [];
    return full.filter(
      (name) =>
        name !== parentBoneName &&
        name !== 'clavicle_l' &&
        name !== 'clavicle_r'
    );
  }

  const full = SUBTREE_CACHE[parentBoneName] ?? [];
  return full.filter((name) => name !== parentBoneName);
}

interface AngularVelocity {
  x: number;
  y: number;
  z: number;
}

export interface GravityStepParams {
  rootGroup: THREE.Group;
  bonesByName: Map<string, THREE.Bone>;
  restQuaternions: Map<string, THREE.Quaternion>;
  selectedBoneName: string | null;
  pinnedBones: ReadonlySet<string>;
  jointLimitsEnabled: boolean;
  groundEnabled: boolean;
  dampingPreset: DampingPreset;
  dt: number;
  locked?: boolean;
}

export interface GravityStepResult {
  awake: boolean;
  didMove: boolean;
}

export class JointSpaceGravitySolver {
  private readonly activeBones = new Set<string>();
  private readonly velocities = new Map<string, AngularVelocity>();
  private quietFrames = 0;

  // Reusable math scratch instances to avoid GC pressure inside useFrame
  private readonly pJoint = new THREE.Vector3();
  private readonly pCom = new THREE.Vector3();
  private readonly segPos = new THREE.Vector3();
  private readonly segDir = new THREE.Vector3();
  private readonly segQuat = new THREE.Quaternion();
  private readonly lever = new THREE.Vector3();
  private readonly gravForce = new THREE.Vector3();
  private readonly torqueW = new THREE.Vector3();

  private readonly deltaQuat = new THREE.Quaternion();
  private readonly invRestQuat = new THREE.Quaternion();
  private readonly parentWQ = new THREE.Quaternion();
  private readonly qRestW = new THREE.Quaternion();
  private readonly qWork = new THREE.Quaternion();
  private readonly qAxis = new THREE.Quaternion();
  private readonly prevBoneQuat = new THREE.Quaternion();
  private readonly deltaEuler = new THREE.Euler(0, 0, 0, 'XYZ');

  private readonly unitX = new THREE.Vector3(1, 0, 0);
  private readonly unitY = new THREE.Vector3(0, 1, 0);
  private readonly unitZ = new THREE.Vector3(0, 0, 1);
  private readonly axisX = new THREE.Vector3();
  private readonly axisY = new THREE.Vector3();
  private readonly axisZ = new THREE.Vector3();

  wakeBones(boneNames: readonly string[]): void {
    let added = false;
    for (const name of boneNames) {
      if (SEGMENT_PHYSICS[name]) {
        this.activeBones.add(name);
        if (!this.velocities.has(name)) {
          this.velocities.set(name, { x: 0, y: 0, z: 0 });
        }
        added = true;
      }
    }
    if (added) {
      this.quietFrames = 0;
    }
  }

  wakeDownstream(parentBoneName: string, isOffFloor: boolean): void {
    const chain = getDownstreamReactingBones(parentBoneName, isOffFloor);
    if (chain.length > 0) {
      this.wakeBones(chain);
    }
  }

  zeroBoneVelocity(boneName: string): void {
    const vel = this.velocities.get(boneName);
    if (vel) {
      vel.x = 0;
      vel.y = 0;
      vel.z = 0;
    }
  }

  sleepAll(): void {
    this.activeBones.clear();
    this.velocities.clear();
    this.quietFrames = 0;
  }

  hasActiveBones(): boolean {
    return this.activeBones.size > 0;
  }

  private getOrCreateVelocity(boneName: string): AngularVelocity {
    let vel = this.velocities.get(boneName);
    if (!vel) {
      vel = { x: 0, y: 0, z: 0 };
      this.velocities.set(boneName, vel);
    }
    return vel;
  }

  private computeSubtreeMinY(
    subtree: readonly string[],
    bonesByName: Map<string, THREE.Bone>
  ): number {
    let minY = Infinity;
    for (const segName of subtree) {
      const segSpec = SEGMENT_PHYSICS[segName];
      const segBone = bonesByName.get(segName);
      if (!segSpec || !segBone) continue;

      segBone.getWorldPosition(this.segPos);
      if (this.segPos.y < minY) minY = this.segPos.y;

      segBone.getWorldQuaternion(this.segQuat);
      this.segDir.copy(this.unitY).applyQuaternion(this.segQuat);
      const tipY = this.segPos.y + this.segDir.y * segSpec.length;
      if (tipY < minY) minY = tipY;
    }
    return Number.isFinite(minY) ? minY : 0;
  }

  step(params: GravityStepParams): GravityStepResult {
    if (params.locked) {
      this.sleepAll();
      return { awake: false, didMove: false };
    }

    if (this.activeBones.size === 0) {
      return { awake: false, didMove: false };
    }

    const {
      rootGroup,
      bonesByName,
      restQuaternions,
      selectedBoneName,
      pinnedBones,
      jointLimitsEnabled,
      groundEnabled,
      dampingPreset,
      dt,
    } = params;

    const clampedDt = Math.min(Math.max(dt, 0.001), MAX_FRAME_DT);
    const h = clampedDt / SUBSTEPS;
    const dampingMult = DAMPING_MULTIPLIERS[dampingPreset];

    let maxSpeed = 0;
    let maxDeltaAngle = 0;
    let didMove = false;

    for (let substep = 0; substep < SUBSTEPS; substep++) {
      rootGroup.updateMatrixWorld(true);

      for (const boneName of CORE_TOP_DOWN_ORDER) {
        if (!this.activeBones.has(boneName)) continue;
        if (boneName === selectedBoneName || pinnedBones.has(boneName)) {
          this.zeroBoneVelocity(boneName);
          continue;
        }

        const bone = bonesByName.get(boneName);
        const restQuat = restQuaternions.get(boneName);
        const subtree = SUBTREE_CACHE[boneName];
        if (!bone || !restQuat || !subtree || !bone.parent) continue;

        bone.getWorldPosition(this.pJoint);

        let subtreeMass = 0;
        this.pCom.set(0, 0, 0);
        let effectiveInertia = MIN_INERTIA;

        for (const segName of subtree) {
          const segSpec = SEGMENT_PHYSICS[segName];
          const segBone = bonesByName.get(segName);
          if (!segSpec || !segBone) continue;

          const m = BODY_MASS_KG * segSpec.massFraction;
          const L = segSpec.length;

          segBone.getWorldPosition(this.segPos);
          segBone.getWorldQuaternion(this.segQuat);
          this.segDir.copy(this.unitY).applyQuaternion(this.segQuat);
          this.segPos.addScaledVector(this.segDir, L * segSpec.comRatio);

          subtreeMass += m;
          this.pCom.addScaledVector(this.segPos, m);
          const distSq = this.segPos.distanceToSquared(this.pJoint);
          effectiveInertia += (1 / 3) * m * L * L + m * distSq;
        }

        if (subtreeMass <= 0 || !Number.isFinite(effectiveInertia)) continue;

        this.pCom.divideScalar(subtreeMass);
        this.lever.copy(this.pCom).sub(this.pJoint);
        this.gravForce.set(0, -subtreeMass * GRAVITY_ACCEL, 0);
        this.torqueW.crossVectors(this.lever, this.gravForce);

        const jointSpec = getJointSpec(boneName);
        this.invRestQuat.copy(restQuat).invert();
        this.deltaQuat.multiplyQuaternions(this.invRestQuat, bone.quaternion);
        this.deltaEuler.setFromQuaternion(this.deltaQuat, jointSpec.order);

        bone.parent.getWorldQuaternion(this.parentWQ);
        this.qRestW.multiplyQuaternions(this.parentWQ, restQuat);

        if (jointSpec.order === 'YZX') {
          this.axisY.copy(this.unitY).applyQuaternion(this.qRestW);

          this.qAxis.setFromAxisAngle(this.unitY, this.deltaEuler.y);
          this.qWork.multiplyQuaternions(this.qRestW, this.qAxis);
          this.axisZ.copy(this.unitZ).applyQuaternion(this.qWork);

          this.qAxis.setFromAxisAngle(this.unitZ, this.deltaEuler.z);
          this.qWork.multiply(this.qAxis);
          this.axisX.copy(this.unitX).applyQuaternion(this.qWork);
        } else {
          this.axisX.copy(this.unitX).applyQuaternion(this.qRestW);

          this.qAxis.setFromAxisAngle(this.unitX, this.deltaEuler.x);
          this.qWork.multiplyQuaternions(this.qRestW, this.qAxis);
          this.axisY.copy(this.unitY).applyQuaternion(this.qWork);

          this.qAxis.setFromAxisAngle(this.unitY, this.deltaEuler.y);
          this.qWork.multiply(this.qAxis);
          this.axisZ.copy(this.unitZ).applyQuaternion(this.qWork);
        }

        const vel = this.getOrCreateVelocity(boneName);
        const leverLen = this.lever.length();
        const cDamp =
          dampingMult *
          2.0 *
          0.85 *
          Math.sqrt(
            effectiveInertia *
              Math.max(subtreeMass * GRAVITY_ACCEL * leverLen, 0.2)
          );

        const prevX = this.deltaEuler.x;
        const prevY = this.deltaEuler.y;
        const prevZ = this.deltaEuler.z;

        const nextX = this.integrateAxis(
          'x',
          prevX,
          vel,
          this.torqueW.dot(this.axisX),
          cDamp,
          effectiveInertia,
          h,
          jointLimitsEnabled ? jointSpec.showX : true,
          jointLimitsEnabled ? jointSpec.axes.x.min : -180,
          jointLimitsEnabled ? jointSpec.axes.x.max : 180
        );
        const nextY = this.integrateAxis(
          'y',
          prevY,
          vel,
          this.torqueW.dot(this.axisY),
          cDamp,
          effectiveInertia,
          h,
          jointLimitsEnabled ? jointSpec.showY : true,
          jointLimitsEnabled ? jointSpec.axes.y.min : -180,
          jointLimitsEnabled ? jointSpec.axes.y.max : 180
        );
        const nextZ = this.integrateAxis(
          'z',
          prevZ,
          vel,
          this.torqueW.dot(this.axisZ),
          cDamp,
          effectiveInertia,
          h,
          jointLimitsEnabled ? jointSpec.showZ : true,
          jointLimitsEnabled ? jointSpec.axes.z.min : -180,
          jointLimitsEnabled ? jointSpec.axes.z.max : 180
        );

        const dMax = Math.max(
          Math.abs(nextX - prevX),
          Math.abs(nextY - prevY),
          Math.abs(nextZ - prevZ)
        );

        const sMax = Math.max(
          Math.abs(vel.x),
          Math.abs(vel.y),
          Math.abs(vel.z)
        );

        if (dMax > 1e-6) {
          this.prevBoneQuat.copy(bone.quaternion);
          const beforeMinY = groundEnabled
            ? this.computeSubtreeMinY(subtree, bonesByName)
            : 0;

          this.deltaEuler.set(nextX, nextY, nextZ, jointSpec.order);
          this.deltaQuat.setFromEuler(this.deltaEuler);
          bone.quaternion.copy(restQuat).multiply(this.deltaQuat).normalize();
          bone.updateMatrixWorld(true);

          if (groundEnabled) {
            const afterMinY = this.computeSubtreeMinY(subtree, bonesByName);
            if (afterMinY < 0.005 && afterMinY < beforeMinY) {
              bone.quaternion.copy(this.prevBoneQuat);
              bone.updateMatrixWorld(true);
              this.zeroBoneVelocity(boneName);
              continue;
            }
          }

          if (dMax > maxDeltaAngle) maxDeltaAngle = dMax;
          if (sMax > maxSpeed) maxSpeed = sMax;
          didMove = true;
        } else {
          if (sMax > maxSpeed) maxSpeed = sMax;
        }
      }
    }

    if (
      maxSpeed < SLEEP_SPEED_THRESHOLD &&
      maxDeltaAngle < SLEEP_DELTA_THRESHOLD
    ) {
      this.quietFrames += 1;
      if (this.quietFrames >= SLEEP_CONFIRM_FRAMES) {
        this.sleepAll();
        return { awake: false, didMove };
      }
    } else {
      this.quietFrames = 0;
    }

    return { awake: true, didMove };
  }

  private integrateAxis(
    axis: keyof AngularVelocity,
    angleRad: number,
    vel: AngularVelocity,
    torque: number,
    cDamp: number,
    inertia: number,
    h: number,
    enabled: boolean,
    minDeg: number,
    maxDeg: number
  ): number {
    if (!enabled) {
      vel[axis] = 0;
      return 0;
    }

    const alpha = (torque - cDamp * vel[axis]) / inertia;
    if (!Number.isFinite(alpha)) {
      vel[axis] = 0;
      return angleRad;
    }

    let nextVel = vel[axis] + alpha * h;
    let nextAngle = angleRad + nextVel * h;

    const minRad = THREE.MathUtils.degToRad(minDeg);
    const maxRad = THREE.MathUtils.degToRad(maxDeg);

    if (nextAngle <= minRad) {
      nextAngle = minRad;
      if (nextVel < 0) nextVel = 0;
    } else if (nextAngle >= maxRad) {
      nextAngle = maxRad;
      if (nextVel > 0) nextVel = 0;
    }

    vel[axis] = nextVel;
    return nextAngle;
  }
}
