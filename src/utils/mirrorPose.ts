import * as THREE from 'three';
import { POSEABLE_BONE_NAMES } from '@/types/anatomy';
import type { PoseSnapshot, QuaternionTuple } from '@/types/poseIO';

export function getMirroredBoneName(boneName: string): string {
  if (boneName.endsWith('_l')) {
    return `${boneName.slice(0, -2)}_r`;
  }
  if (boneName.endsWith('_r')) {
    return `${boneName.slice(0, -2)}_l`;
  }
  return boneName;
}

/**
 * Mirrors all 52 poseable bones across the body sagittal (YZ) plane.
 * Using verified Quaternius local-axis conjugation (C = diag(-1, 1, 1)),
 * sagittal flexion (+X) stays preserved while lateral tilt (Z) and axial twist (Y)
 * negate relative to each target bone's rest quaternion.
 */
export function mirrorPoseSnapshot(
  snapshot: PoseSnapshot,
  restQuaternions: ReadonlyMap<string, THREE.Quaternion>
): PoseSnapshot {
  const mirroredBones: Record<string, QuaternionTuple> = {};
  const restInv = new THREE.Quaternion();
  const srcQuat = new THREE.Quaternion();
  const deltaSrc = new THREE.Quaternion();
  const deltaDst = new THREE.Quaternion();
  const dstQuat = new THREE.Quaternion();

  for (const targetName of POSEABLE_BONE_NAMES) {
    const sourceName = getMirroredBoneName(targetName);
    const srcTuple = snapshot.bones[sourceName];
    const restSrc = restQuaternions.get(sourceName);
    const restDst = restQuaternions.get(targetName);

    if (srcTuple && restSrc && restDst) {
      srcQuat
        .set(srcTuple[0], srcTuple[1], srcTuple[2], srcTuple[3])
        .normalize();
      restInv.copy(restSrc).invert();
      deltaSrc.multiplyQuaternions(restInv, srcQuat);
      deltaDst
        .set(deltaSrc.x, -deltaSrc.y, -deltaSrc.z, deltaSrc.w)
        .normalize();
      dstQuat.multiplyQuaternions(restDst, deltaDst).normalize();
      mirroredBones[targetName] = [
        dstQuat.x,
        dstQuat.y,
        dstQuat.z,
        dstQuat.w,
      ];
    } else if (restDst) {
      mirroredBones[targetName] = [
        restDst.x,
        restDst.y,
        restDst.z,
        restDst.w,
      ];
    } else {
      mirroredBones[targetName] = [0, 0, 0, 1];
    }
  }

  const mirroredPins = Array.from(
    new Set(snapshot.pinnedBones.map(getMirroredBoneName))
  );

  const mirroredX =
    Math.abs(snapshot.rootPosition[0]) < 1e-6 ? 0 : -snapshot.rootPosition[0];

  return {
    bones: mirroredBones,
    rootPosition: [mirroredX, snapshot.rootPosition[1], snapshot.rootPosition[2]],
    elevationY: snapshot.elevationY,
    groundEnabled: snapshot.groundEnabled,
    groundSnapEnabled: snapshot.groundSnapEnabled,
    pinnedBones: mirroredPins,
  };
}
