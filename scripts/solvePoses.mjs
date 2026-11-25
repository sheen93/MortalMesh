import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as THREE from 'three';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const originalResolve = require('module')._resolveFilename;

require('module')._resolveFilename = function patchedResolve(
  request,
  parent,
  ...rest
) {
  if (request.startsWith('@/')) {
    const resolved = path.join(process.cwd(), 'src', request.slice(2));
    return originalResolve.call(this, resolved, parent, ...rest);
  }
  return originalResolve.call(this, request, parent, ...rest);
};

require.extensions['.ts'] = function compileTs(moduleRef, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  return moduleRef._compile(transpiled.outputText, filename);
};

const { getJointSpec, clampJointAngles } = require('@/data/jointLimits');

// ---------------------------------------------------------------------------
// Load GLB skeleton hierarchy directly from public/models/anatomy.glb
// ---------------------------------------------------------------------------
const glbBuf = fs.readFileSync(
  path.join(process.cwd(), 'public/models/anatomy.glb')
);
const jsonLen = glbBuf.readUInt32LE(12);
const gltf = JSON.parse(glbBuf.slice(20, 20 + jsonLen).toString('utf8'));

const objs = gltf.nodes.map((node, index) => {
  const obj = new THREE.Object3D();
  obj.name = node.name || `node_${index}`;
  if (node.translation) obj.position.fromArray(node.translation);
  if (node.rotation) obj.quaternion.fromArray(node.rotation);
  if (node.scale) obj.scale.fromArray(node.scale);
  return obj;
});

gltf.nodes.forEach((node, index) => {
  if (node.children) {
    for (const childIndex of node.children) {
      objs[index].add(objs[childIndex]);
    }
  }
});

const rootGroup = new THREE.Group();
for (const idx of gltf.scenes[gltf.scene || 0].nodes) {
  rootGroup.add(objs[idx]);
}
rootGroup.updateMatrixWorld(true);

const byName = new Map();
const restQ = new Map();
const restWorldQ = new Map();
const restWorldPos = new Map();

rootGroup.traverse((obj) => {
  byName.set(obj.name, obj);
  restQ.set(obj.name, obj.quaternion.clone());
  const wq = new THREE.Quaternion();
  const wp = new THREE.Vector3();
  obj.getWorldQuaternion(wq);
  obj.getWorldPosition(wp);
  restWorldQ.set(obj.name, wq);
  restWorldPos.set(obj.name, wp);
});

const pelvisRestY = restWorldPos.get('pelvis').y;
const L_UPPERARM = restWorldPos
  .get('upperarm_l')
  .distanceTo(restWorldPos.get('lowerarm_l'));
const L_FOREARM = restWorldPos
  .get('lowerarm_l')
  .distanceTo(restWorldPos.get('hand_l'));
const L_THIGH = restWorldPos
  .get('thigh_l')
  .distanceTo(restWorldPos.get('calf_l'));
const L_SHIN = restWorldPos
  .get('calf_l')
  .distanceTo(restWorldPos.get('foot_l'));

// Skin contact constants measured directly from anatomy.glb vertices:
// Ankle center sits at Y=0.102 when foot sole touches Y=0.
const ANKLE_FLAT_Y = 0.102;
const BALL_FLOOR_Y = 0.022;
const KNEE_FLOOR_Y = 0.056;
const PALM_FLOOR_Y = 0.036;
const FIST_FLOOR_Y = 0.048;
const PELVIS_FLOOR_Y = 0.082;

function wp(boneName) {
  rootGroup.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  byName.get(boneName).getWorldPosition(v);
  return v;
}

function wq(boneName) {
  rootGroup.updateMatrixWorld(true);
  const q = new THREE.Quaternion();
  byName.get(boneName).getWorldQuaternion(q);
  return q;
}

function projPerp(vec, axisUnit) {
  return vec.clone().addScaledVector(axisUnit, -vec.dot(axisUnit));
}

function safeNorm(vec, fallback = new THREE.Vector3(0, 0, 1)) {
  const len = vec.length();
  if (len < 1e-6) return fallback.clone();
  return vec.clone().divideScalar(len);
}

function wrap180(deg) {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

function quatToClampedEulerDeg(boneName, deltaQuat) {
  const spec = getJointSpec(boneName);
  const euler = new THREE.Euler(0, 0, 0, spec.order).setFromQuaternion(
    deltaQuat,
    spec.order
  );
  const x0 = THREE.MathUtils.radToDeg(euler.x);
  const y0 = THREE.MathUtils.radToDeg(euler.y);
  const z0 = THREE.MathUtils.radToDeg(euler.z);

  const candidates = [
    clampJointAngles(
      { x: Math.round(x0), y: Math.round(y0), z: Math.round(z0) },
      spec,
      true
    ),
  ];

  // For XYZ / YZX intrinsic Eulers, check the flipped alternate Euler branch
  if (spec.order === 'XYZ') {
    candidates.push(
      clampJointAngles(
        {
          x: Math.round(wrap180(x0 + 180)),
          y: Math.round(wrap180(180 - y0)),
          z: Math.round(wrap180(z0 + 180)),
        },
        spec,
        true
      )
    );
  }

  let best = candidates[0];
  let bestAngErr = Infinity;
  for (const cand of candidates) {
    const qCand = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(cand.x),
        THREE.MathUtils.degToRad(cand.y),
        THREE.MathUtils.degToRad(cand.z),
        spec.order
      )
    );
    const err = qCand.angleTo(deltaQuat);
    if (err < bestAngErr) {
      bestAngErr = err;
      best = cand;
    }
  }

  // If gimbal/boundary clamping introduced >4 deg quaternion error, refine inside legal ROM bounds
  if (bestAngErr > 0.07) {
    const rx = spec.axes.x;
    const ry = spec.axes.y;
    const rz = spec.axes.z;
    const evalErr = (x, y, z) => {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(x),
          THREE.MathUtils.degToRad(y),
          THREE.MathUtils.degToRad(z),
          spec.order
        )
      );
      return q.angleTo(deltaQuat);
    };

    let cur = { ...best };
    let curErr = bestAngErr;
    for (const [radius, step] of [
      [24, 6],
      [6, 1],
    ]) {
      let improved = true;
      let iter = 0;
      while (improved && iter < 4) {
        improved = false;
        iter++;
        for (const axis of ['x', 'y', 'z']) {
          const lim = spec.axes[axis];
          if (!spec[`show${axis.toUpperCase()}`] && lim.min === 0 && lim.max === 0) {
            continue;
          }
          const lo = Math.max(lim.min, cur[axis] - radius);
          const hi = Math.min(lim.max, cur[axis] + radius);
          for (let val = lo; val <= hi; val += step) {
            const nx = axis === 'x' ? val : cur.x;
            const ny = axis === 'y' ? val : cur.y;
            const nz = axis === 'z' ? val : cur.z;
            const e = evalErr(nx, ny, nz);
            if (e + 1e-6 < curErr) {
              curErr = e;
              cur = { x: nx, y: ny, z: nz };
              improved = true;
            }
          }
        }
        // Check diagonal X+Z step too for near-gimbal XYZ cases
        if (spec.order === 'XYZ') {
          for (let dx = -radius; dx <= radius; dx += step) {
            for (let dz = -radius; dz <= radius; dz += step) {
              const nx = THREE.MathUtils.clamp(cur.x + dx, rx.min, rx.max);
              const nz = THREE.MathUtils.clamp(cur.z + dz, rz.min, rz.max);
              const e = evalErr(nx, cur.y, nz);
              if (e + 1e-6 < curErr) {
                curErr = e;
                cur = { x: nx, y: cur.y, z: nz };
                improved = true;
              }
            }
          }
          // unused ry guard
          void ry;
        }
      }
    }
    best = clampJointAngles(cur, spec, true);
  }

  return best;
}

// ---------------------------------------------------------------------------
// Active Pose Context
// ---------------------------------------------------------------------------
class PoseBuilder {
  constructor() {
    this.bones = {};
    rootGroup.position.set(0, 0, 0);
    for (const [name, q] of restQ.entries()) {
      byName.get(name).quaternion.copy(q);
    }
    rootGroup.updateMatrixWorld(true);
  }

  setRootPelvisHeight(pelvisWorldY) {
    rootGroup.position.set(0, pelvisWorldY - pelvisRestY, 0);
    rootGroup.updateMatrixWorld(true);
  }

  setBone(boneName, angles) {
    const spec = getJointSpec(boneName);
    const clamped = clampJointAngles(
      {
        x: Math.round(angles.x ?? 0),
        y: Math.round(angles.y ?? 0),
        z: Math.round(angles.z ?? 0),
      },
      spec,
      true
    );
    const bone = byName.get(boneName);
    const rq = restQ.get(boneName);
    if (!bone || !rq) {
      throw new Error(`Unknown bone "${boneName}"`);
    }
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(clamped.x),
      THREE.MathUtils.degToRad(clamped.y),
      THREE.MathUtils.degToRad(clamped.z),
      spec.order
    );
    const delta = new THREE.Quaternion().setFromEuler(euler);
    bone.quaternion.copy(rq).multiply(delta).normalize();
    rootGroup.updateMatrixWorld(true);

    if (clamped.x !== 0 || clamped.y !== 0 || clamped.z !== 0) {
      this.bones[boneName] = { x: clamped.x, y: clamped.y, z: clamped.z };
    } else {
      delete this.bones[boneName];
    }
    return clamped;
  }

  alignBoneWorld(boneName, targetWorldQuat) {
    rootGroup.updateMatrixWorld(true);
    const bone = byName.get(boneName);
    const rq = restQ.get(boneName);
    const parentWQ = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWQ);
    const zeroWQ = parentWQ.clone().multiply(rq);
    const deltaQuat = zeroWQ.clone().invert().multiply(targetWorldQuat).normalize();
    const clamped = quatToClampedEulerDeg(boneName, deltaQuat);
    return this.setBone(boneName, clamped);
  }

  setPelvisOrientation(worldRotEulerDeg, order = 'YXZ') {
    const rot = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(worldRotEulerDeg.x ?? 0),
        THREE.MathUtils.degToRad(worldRotEulerDeg.y ?? 0),
        THREE.MathUtils.degToRad(worldRotEulerDeg.z ?? 0),
        order
      )
    );
    const targetWQ = rot.multiply(restWorldQ.get('pelvis'));
    this.alignBoneWorld('pelvis', targetWQ);
  }

  setSpine(xDeg, yDeg = 0, zDeg = 0, weights = [0.34, 0.34, 0.32]) {
    this.setBone('spine_01', {
      x: xDeg * weights[0],
      y: yDeg * weights[0],
      z: zDeg * weights[0],
    });
    this.setBone('spine_02', {
      x: xDeg * weights[1],
      y: yDeg * weights[1],
      z: zDeg * weights[1],
    });
    this.setBone('spine_03', {
      x: xDeg * weights[2],
      y: yDeg * weights[2],
      z: zDeg * weights[2],
    });
  }

  setHead(neckDeg, headDeg) {
    if (neckDeg) this.setBone('neck_01', neckDeg);
    if (headDeg) this.setBone('Head', headDeg);
  }

  // Solves upper limb + hinge flexion using law of cosines and local bone basis
  // Verified GLB local basis for all 4 limbs (upperarm_l/r, thigh_l/r):
  //   local +Y = A -> B (along proximal segment)
  //   local +Z = direction B -> C bends when B.x > 0 (away from midpoint pole)
  //   local +X = Y x Z
  solveTwoBoneIK(boneA, boneB, boneC, L1, L2, targetPos, poleHint, minBendDeg = 3) {
    rootGroup.updateMatrixWorld(true);
    const S = wp(boneA);
    const T = targetPos.clone();
    const D = T.clone().sub(S);
    const rawDist = D.length();
    const minDist = Math.abs(L1 - L2) + 0.008;
    const minBendRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(minBendDeg, 2, 135));
    // Cap reach d if caller specifically requests a minimum flexion angle (keeps triangle consistent between boneA and boneB)
    const maxDistForBend = Math.sqrt(
      Math.max(minDist * minDist, L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(minBendRad))
    );
    const maxDist = Math.min(L1 + L2 - 0.0015, maxDistForBend);
    const d = Math.min(Math.max(rawDist, minDist), maxDist);
    const dHat = safeNorm(D, new THREE.Vector3(0, -1, 0));

    // Clamp cosA strictly inside [-1, 1]
    const cosA = THREE.MathUtils.clamp(
      (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d),
      -0.9999,
      0.9999
    );
    const a = L1 * cosA;
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

    // Orthogonalize pole direction perpendicular to dHat
    let pPerp = projPerp(poleHint, dHat);
    if (pPerp.length() < 1e-4) {
      const alt = Math.abs(dHat.z) < 0.8
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(1, 0, 0);
      pPerp = projPerp(alt, dHat);
    }
    pPerp.normalize();

    const M = S.clone().addScaledVector(dHat, a).addScaledVector(pPerp, h);

    // Desired upper bone world basis:
    const colY = safeNorm(M.clone().sub(S));
    const colZ = safeNorm(projPerp(pPerp.clone().negate(), colY));
    const colX = safeNorm(new THREE.Vector3().crossVectors(colY, colZ));
    colZ.copy(new THREE.Vector3().crossVectors(colX, colY)).normalize();

    const rotMat = new THREE.Matrix4().makeBasis(colX, colY, colZ);
    const desiredWQ = new THREE.Quaternion().setFromRotationMatrix(rotMat);

    // Zero child B first while solving A
    this.setBone(boneB, { x: 0, y: 0, z: 0 });
    this.alignBoneWorld(boneA, desiredWQ);

    // Always match exact triangle flexion B.x across full legal range minimizing |wp(C) - targetPos|
    const specB = getJointSpec(boneB);
    const minBx = Math.max(0, specB.axes.x.min);
    const maxBx = specB.axes.x.max;
    const desiredEnd = S.clone().addScaledVector(dHat, d);
    let bestBx = minBx;
    let bestErr = Infinity;

    for (let bx = minBx; bx <= maxBx; bx += 4) {
      this.setBone(boneB, { x: bx, y: 0, z: 0 });
      const err = wp(boneC).distanceTo(desiredEnd);
      if (err < bestErr) {
        bestErr = err;
        bestBx = bx;
      }
    }
    const lo = Math.max(minBx, bestBx - 5);
    const hi = Math.min(maxBx, bestBx + 5);
    for (let bx = lo; bx <= hi; bx += 1) {
      this.setBone(boneB, { x: bx, y: 0, z: 0 });
      const err = wp(boneC).distanceTo(desiredEnd);
      if (err < bestErr) {
        bestErr = err;
        bestBx = bx;
      }
    }
    this.setBone(boneB, { x: bestBx, y: 0, z: 0 });
    const actualErr = wp(boneC).distanceTo(T);
    return { err: actualErr, S, M, posC: wp(boneC) };
  }

  solveHandOrientation(side, opts = {}) {
    const forearm = `lowerarm_${side}`;
    const hand = `hand_${side}`;
    const specFore = getJointSpec(forearm);
    const specHand = getJointSpec(hand);
    const currentForeX = this.bones[forearm]?.x ?? 0;

    if (opts.direct) {
      this.setBone(forearm, {
        x: currentForeX,
        y: opts.direct.forearmY ?? 0,
        z: 0,
      });
      this.setBone(hand, {
        x: opts.direct.handX ?? 0,
        y: 0,
        z: opts.direct.handZ ?? 0,
      });
      return;
    }

    const palmLocal = new THREE.Vector3(side === 'l' ? 1 : -1, 0, 0);
    const fingerLocal = new THREE.Vector3(0, 1, 0);
    const thumbLocal = new THREE.Vector3(0, 0, 1);

    const targetPalm = opts.palmNormal
      ? safeNorm(opts.palmNormal)
      : null;
    const targetFinger = opts.fingerDir
      ? safeNorm(opts.fingerDir)
      : null;
    const targetThumb = opts.thumbDir
      ? safeNorm(opts.thumbDir)
      : null;

    const scoreCandidate = (fy, hx, hz) => {
      this.setBone(forearm, { x: currentForeX, y: fy, z: 0 });
      this.setBone(hand, { x: hx, y: 0, z: hz });
      const hq = wq(hand);
      let s = 0;
      if (targetPalm) {
        const pw = palmLocal.clone().applyQuaternion(hq);
        s += pw.dot(targetPalm) * 3.0;
      }
      if (targetFinger) {
        const fw = fingerLocal.clone().applyQuaternion(hq);
        s += fw.dot(targetFinger) * 2.0;
      }
      if (targetThumb) {
        const tw = thumbLocal.clone().applyQuaternion(hq);
        s += tw.dot(targetThumb) * 1.2;
      }
      // Subtle preference for neutral wrist angles when equally good
      s -= 0.0012 * (Math.abs(hx) + Math.abs(hz)) + 0.0003 * Math.abs(fy);
      return s;
    };

    const yMin = specFore.axes.y.min;
    const yMax = specFore.axes.y.max;
    const xMin = specHand.axes.x.min;
    const xMax = specHand.axes.x.max;
    const zMin = specHand.axes.z.min;
    const zMax = specHand.axes.z.max;

    let best = { fy: 0, hx: 0, hz: 0, score: -Infinity };
    for (let fy = yMin; fy <= yMax; fy += 20) {
      for (let hx = xMin; hx <= xMax; hx += 20) {
        for (let hz = zMin; hz <= zMax; hz += 20) {
          const sc = scoreCandidate(fy, hx, hz);
          if (sc > best.score) best = { fy, hx, hz, score: sc };
        }
      }
    }

    // Refine at 5 deg then 1 deg
    for (const step of [5, 1]) {
      const r = step === 5 ? 18 : 5;
      const c = { ...best };
      for (
        let fy = Math.max(yMin, c.fy - r);
        fy <= Math.min(yMax, c.fy + r);
        fy += step
      ) {
        for (
          let hx = Math.max(xMin, c.hx - r);
          hx <= Math.min(xMax, c.hx + r);
          hx += step
        ) {
          for (
            let hz = Math.max(zMin, c.hz - r);
            hz <= Math.min(zMax, c.hz + r);
            hz += step
          ) {
            const sc = scoreCandidate(fy, hx, hz);
            if (sc > best.score) best = { fy, hx, hz, score: sc };
          }
        }
      }
    }

    this.setBone(forearm, { x: currentForeX, y: best.fy, z: 0 });
    this.setBone(hand, { x: best.hx, y: 0, z: best.hz });
  }

  setFingers(side, style = 'relaxed', custom = {}) {
    const thumbSign = side === 'l' ? 1 : -1;
    const spreadSign = side === 'l' ? 1 : -1;

    const presets = {
      fist: {
        [`index_01_${side}`]: { x: 82, y: 0, z: 0 },
        [`index_02_${side}`]: { x: 94, y: 0, z: 0 },
        [`index_03_${side}`]: { x: 76, y: 0, z: 0 },
        [`middle_01_${side}`]: { x: 85, y: 0, z: 0 },
        [`middle_02_${side}`]: { x: 96, y: 0, z: 0 },
        [`middle_03_${side}`]: { x: 78, y: 0, z: 0 },
        [`ring_01_${side}`]: { x: 86, y: 0, z: 0 },
        [`ring_02_${side}`]: { x: 96, y: 0, z: 0 },
        [`ring_03_${side}`]: { x: 78, y: 0, z: 0 },
        [`pinky_01_${side}`]: { x: 84, y: 0, z: 0 },
        [`pinky_02_${side}`]: { x: 94, y: 0, z: 0 },
        [`pinky_03_${side}`]: { x: 74, y: 0, z: 0 },
        [`thumb_01_${side}`]: { x: 38, y: 0, z: thumbSign * 42 },
        [`thumb_02_${side}`]: { x: 0, y: 0, z: thumbSign * 54 },
        [`thumb_03_${side}`]: { x: 0, y: 0, z: thumbSign * 38 },
      },
      open: {
        [`index_01_${side}`]: { x: -4, y: 0, z: spreadSign * 8 },
        [`index_02_${side}`]: { x: 4, y: 0, z: 0 },
        [`index_03_${side}`]: { x: 2, y: 0, z: 0 },
        [`middle_01_${side}`]: { x: -4, y: 0, z: 0 },
        [`middle_02_${side}`]: { x: 4, y: 0, z: 0 },
        [`middle_03_${side}`]: { x: 2, y: 0, z: 0 },
        [`ring_01_${side}`]: { x: -2, y: 0, z: -spreadSign * 6 },
        [`ring_02_${side}`]: { x: 6, y: 0, z: 0 },
        [`ring_03_${side}`]: { x: 4, y: 0, z: 0 },
        [`pinky_01_${side}`]: { x: 0, y: 0, z: -spreadSign * 12 },
        [`pinky_02_${side}`]: { x: 8, y: 0, z: 0 },
        [`pinky_03_${side}`]: { x: 6, y: 0, z: 0 },
        [`thumb_01_${side}`]: { x: -12, y: 0, z: -thumbSign * 12 },
        [`thumb_02_${side}`]: { x: 0, y: 0, z: thumbSign * 6 },
        [`thumb_03_${side}`]: { x: 0, y: 0, z: thumbSign * 4 },
      },
      flat: {
        // Perfectly flat fingers for handstand/sprinter floor contact or prayer
        [`index_01_${side}`]: { x: 0, y: 0, z: spreadSign * 5 },
        [`index_02_${side}`]: { x: 0, y: 0, z: 0 },
        [`index_03_${side}`]: { x: 0, y: 0, z: 0 },
        [`middle_01_${side}`]: { x: 0, y: 0, z: 0 },
        [`middle_02_${side}`]: { x: 0, y: 0, z: 0 },
        [`middle_03_${side}`]: { x: 0, y: 0, z: 0 },
        [`ring_01_${side}`]: { x: 0, y: 0, z: -spreadSign * 4 },
        [`ring_02_${side}`]: { x: 0, y: 0, z: 0 },
        [`ring_03_${side}`]: { x: 0, y: 0, z: 0 },
        [`pinky_01_${side}`]: { x: 0, y: 0, z: -spreadSign * 8 },
        [`pinky_02_${side}`]: { x: 0, y: 0, z: 0 },
        [`pinky_03_${side}`]: { x: 0, y: 0, z: 0 },
        [`thumb_01_${side}`]: { x: -10, y: 0, z: -thumbSign * 10 },
        [`thumb_02_${side}`]: { x: 0, y: 0, z: 0 },
        [`thumb_03_${side}`]: { x: 0, y: 0, z: 0 },
      },
      grip: {
        [`index_01_${side}`]: { x: 58, y: 0, z: 0 },
        [`index_02_${side}`]: { x: 68, y: 0, z: 0 },
        [`index_03_${side}`]: { x: 48, y: 0, z: 0 },
        [`middle_01_${side}`]: { x: 62, y: 0, z: 0 },
        [`middle_02_${side}`]: { x: 72, y: 0, z: 0 },
        [`middle_03_${side}`]: { x: 52, y: 0, z: 0 },
        [`ring_01_${side}`]: { x: 65, y: 0, z: 0 },
        [`ring_02_${side}`]: { x: 75, y: 0, z: 0 },
        [`ring_03_${side}`]: { x: 55, y: 0, z: 0 },
        [`pinky_01_${side}`]: { x: 66, y: 0, z: 0 },
        [`pinky_02_${side}`]: { x: 74, y: 0, z: 0 },
        [`pinky_03_${side}`]: { x: 52, y: 0, z: 0 },
        [`thumb_01_${side}`]: { x: 30, y: 0, z: thumbSign * 34 },
        [`thumb_02_${side}`]: { x: 0, y: 0, z: thumbSign * 42 },
        [`thumb_03_${side}`]: { x: 0, y: 0, z: thumbSign * 28 },
      },
      graceful: {
        [`index_01_${side}`]: { x: 8, y: 0, z: spreadSign * 4 },
        [`index_02_${side}`]: { x: 10, y: 0, z: 0 },
        [`index_03_${side}`]: { x: 8, y: 0, z: 0 },
        [`middle_01_${side}`]: { x: 16, y: 0, z: 0 },
        [`middle_02_${side}`]: { x: 20, y: 0, z: 0 },
        [`middle_03_${side}`]: { x: 14, y: 0, z: 0 },
        [`ring_01_${side}`]: { x: 24, y: 0, z: -spreadSign * 4 },
        [`ring_02_${side}`]: { x: 28, y: 0, z: 0 },
        [`ring_03_${side}`]: { x: 18, y: 0, z: 0 },
        [`pinky_01_${side}`]: { x: 20, y: 0, z: -spreadSign * 8 },
        [`pinky_02_${side}`]: { x: 24, y: 0, z: 0 },
        [`pinky_03_${side}`]: { x: 16, y: 0, z: 0 },
        [`thumb_01_${side}`]: { x: 6, y: 0, z: -thumbSign * 8 },
        [`thumb_02_${side}`]: { x: 0, y: 0, z: thumbSign * 8 },
        [`thumb_03_${side}`]: { x: 0, y: 0, z: thumbSign * 6 },
      },
      relaxed: {
        [`index_01_${side}`]: { x: 18, y: 0, z: 0 },
        [`index_02_${side}`]: { x: 26, y: 0, z: 0 },
        [`index_03_${side}`]: { x: 18, y: 0, z: 0 },
        [`middle_01_${side}`]: { x: 22, y: 0, z: 0 },
        [`middle_02_${side}`]: { x: 30, y: 0, z: 0 },
        [`middle_03_${side}`]: { x: 22, y: 0, z: 0 },
        [`ring_01_${side}`]: { x: 26, y: 0, z: 0 },
        [`ring_02_${side}`]: { x: 34, y: 0, z: 0 },
        [`ring_03_${side}`]: { x: 24, y: 0, z: 0 },
        [`pinky_01_${side}`]: { x: 30, y: 0, z: 0 },
        [`pinky_02_${side}`]: { x: 38, y: 0, z: 0 },
        [`pinky_03_${side}`]: { x: 26, y: 0, z: 0 },
        [`thumb_01_${side}`]: { x: 12, y: 0, z: thumbSign * 16 },
        [`thumb_02_${side}`]: { x: 0, y: 0, z: thumbSign * 18 },
        [`thumb_03_${side}`]: { x: 0, y: 0, z: thumbSign * 12 },
      },
    };

    const selected = { ...(presets[style] ?? presets.relaxed), ...custom };
    for (const [bName, val] of Object.entries(selected)) {
      this.setBone(bName, val);
    }
  }

  solveArmTo(side, targetWristPos, elbowPoleDir, opts = {}) {
    if (opts.clavicle) {
      this.setBone(`clavicle_${side}`, opts.clavicle);
    }
    const res = this.solveTwoBoneIK(
      `upperarm_${side}`,
      `lowerarm_${side}`,
      `hand_${side}`,
      L_UPPERARM,
      L_FOREARM,
      targetWristPos,
      elbowPoleDir,
      opts.minElbowDeg ?? 6
    );
    if (process.env.DIAG_IK && res.err > 0.04) {
      console.log(
        `  [ARM MISS] ${side} err=${res.err.toFixed(3)} tgt=${targetWristPos.toArray().map((n) => n.toFixed(2))} got=${res.posC.toArray().map((n) => n.toFixed(2))} ua=${JSON.stringify(this.bones['upperarm_' + side])} la=${JSON.stringify(this.bones['lowerarm_' + side])}`
      );
    }
    this.solveHandOrientation(side, opts.hand ?? opts);
    this.setFingers(side, opts.fingers ?? 'relaxed', opts.fingerCustom);
    return res;
  }

  solveFoot(side, footSpec = { mode: 'flat', yawDeg: 0 }) {
    const footName = `foot_${side}`;
    const ballName = `ball_${side}`;
    const mode = footSpec.mode ?? 'flat';

    if (mode === 'pointed') {
      this.setBone(footName, {
        x: footSpec.pitchDeg ?? 58,
        y: footSpec.yawOffset ?? 0,
        z: footSpec.rollDeg ?? 0,
      });
      this.setBone(ballName, { x: footSpec.ballDeg ?? -20, y: 0, z: 0 });
      return;
    }

    if (mode === 'flexed') {
      this.setBone(footName, {
        x: footSpec.pitchDeg ?? -28,
        y: footSpec.yawOffset ?? 0,
        z: footSpec.rollDeg ?? 0,
      });
      this.setBone(ballName, { x: footSpec.ballDeg ?? 10, y: 0, z: 0 });
      return;
    }

    // Desired flat foot forward direction in world XZ
    const yawRad = THREE.MathUtils.degToRad(footSpec.yawDeg ?? 0);
    const rotY = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yawRad
    );
    const targetFlatWQ = rotY.multiply(restWorldQ.get(footName));
    this.alignBoneWorld(footName, targetFlatWQ);

    if (mode === 'ball') {
      const pitchDeg = footSpec.pitchDeg ?? 38;
      const clampedFoot = this.bones[footName] ?? { x: 0, y: 0, z: 0 };
      const specF = getJointSpec(footName);
      const newFx = THREE.MathUtils.clamp(
        clampedFoot.x + pitchDeg,
        specF.axes.x.min,
        specF.axes.x.max
      );
      this.setBone(footName, { x: newFx, y: clampedFoot.y, z: clampedFoot.z });
      // Counter-bend toes UP (+X on ball) so toes sit flat on the floor
      this.setBone(ballName, { x: footSpec.ballDeg ?? pitchDeg, y: 0, z: 0 });
    } else {
      this.setBone(ballName, { x: footSpec.ballDeg ?? 0, y: 0, z: 0 });
    }
  }

  solveLegTo(side, targetAnklePos, kneePoleDir, opts = {}) {
    const res = this.solveTwoBoneIK(
      `thigh_${side}`,
      `calf_${side}`,
      `foot_${side}`,
      L_THIGH,
      L_SHIN,
      targetAnklePos,
      kneePoleDir,
      opts.minKneeDeg ?? 4
    );
    if (process.env.DIAG_IK && res.err > 0.04) {
      console.log(
        `  [LEG MISS] ${side} err=${res.err.toFixed(3)} tgt=${targetAnklePos.toArray().map((n) => n.toFixed(2))} got=${res.posC.toArray().map((n) => n.toFixed(2))} th=${JSON.stringify(this.bones['thigh_' + side])} cf=${JSON.stringify(this.bones['calf_' + side])}`
      );
    }
    this.solveFoot(side, opts.foot ?? { mode: 'flat', yawDeg: side === 'l' ? 6 : -6 });
    return res;
  }
}

function v(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

// ---------------------------------------------------------------------------
// All 50 Sculpted Pose Recipes (exact existing IDs, names, categories, descriptions)
// Coordinate convention:
//   +X = Model Left, -X = Model Right, +Y = Up (0 = floor), +Z = Forward
// ---------------------------------------------------------------------------
const POSE_RECIPES = [
  // =========================================================================
  // FOUNDATION (5)
  // =========================================================================
  {
    id: 't-pose',
    name: 'T-Pose',
    category: 'foundation',
    tags: ['bind', 'rest', 'orthographic', 'proportion'],
    description: 'Neutral anatomical bind pose grounded cleanly at the origin',
    build: () => {},
  },
  {
    id: 'a-pose',
    name: 'A-Pose',
    category: 'foundation',
    tags: ['rig', 'character', 'relaxed', 'standing'],
    description: 'Relaxed standing posture with lowered arms and balanced stance',
    build: (p) => {
      p.setRootPelvisHeight(0.915);
      p.solveLegTo('l', v(0.115, ANKLE_FLAT_Y, -0.02), v(0.12, 0, 1), {
        foot: { mode: 'flat', yawDeg: 7 },
      });
      p.solveLegTo('r', v(-0.115, ANKLE_FLAT_Y, -0.02), v(-0.12, 0, 1), {
        foot: { mode: 'flat', yawDeg: -7 },
      });
      p.solveArmTo('l', v(0.45, 0.99, 0.06), v(0.3, -0.4, -1), {
        clavicle: { x: -4, y: 0, z: 0 },
        palmNormal: v(-0.85, -0.4, 0.2),
        fingerDir: v(0.45, -0.88, 0.1),
        minElbowDeg: 10,
      });
      p.solveArmTo('r', v(-0.45, 0.99, 0.06), v(-0.3, -0.4, -1), {
        clavicle: { x: -4, y: 0, z: 0 },
        palmNormal: v(0.85, -0.4, 0.2),
        fingerDir: v(-0.45, -0.88, 0.1),
        minElbowDeg: 10,
      });
    },
  },
  {
    id: 'vitruvian-man',
    name: 'Vitruvian Man',
    category: 'foundation',
    tags: ['da vinci', 'renaissance', 'symmetry', 'circle', 'square'],
    description: 'Symmetric star proportion study echoing Leonardo da Vinci canon',
    build: (p) => {
      p.setRootPelvisHeight(0.86);
      p.setSpine(-4, 0, 0);
      p.solveLegTo('l', v(0.34, ANKLE_FLAT_Y, -0.02), v(0.35, 0, 1), {
        foot: { mode: 'flat', yawDeg: 18 },
        minKneeDeg: 3,
      });
      p.solveLegTo('r', v(-0.34, ANKLE_FLAT_Y, -0.02), v(-0.35, 0, 1), {
        foot: { mode: 'flat', yawDeg: -18 },
        minKneeDeg: 3,
      });
      p.solveArmTo('l', v(0.67, 1.57, -0.02), v(0, -0.3, -1), {
        clavicle: { x: 8, y: 0, z: 0 },
        palmNormal: v(0, 0, 1),
        fingerDir: v(0.95, 0.35, 0),
        fingers: 'open',
        minElbowDeg: 4,
      });
      p.solveArmTo('r', v(-0.67, 1.57, -0.02), v(0, -0.3, -1), {
        clavicle: { x: 8, y: 0, z: 0 },
        palmNormal: v(0, 0, 1),
        fingerDir: v(-0.95, 0.35, 0),
        fingers: 'open',
        minElbowDeg: 4,
      });
    },
  },
  {
    id: 'neutral-standing',
    name: 'Neutral Standing',
    category: 'foundation',
    tags: ['idle', 'casual', 'natural', 'portrait'],
    description: 'Natural everyday stance with gentle spinal S-curve and ease',
    build: (p) => {
      p.setRootPelvisHeight(0.91);
      p.setPelvisOrientation({ x: 2, y: 4, z: -2 });
      p.setSpine(-3, -3, 2);
      p.setHead({ x: 4, y: 2, z: 0 }, { x: -2, y: 3, z: 0 });
      p.solveLegTo('l', v(0.11, ANKLE_FLAT_Y, -0.02), v(0.14, 0, 1), {
        foot: { mode: 'flat', yawDeg: 8 },
        minKneeDeg: 5,
      });
      p.solveLegTo('r', v(-0.11, ANKLE_FLAT_Y, -0.03), v(-0.14, 0, 1), {
        foot: { mode: 'flat', yawDeg: -8 },
        minKneeDeg: 4,
      });
      p.solveArmTo('l', v(0.245, 0.90, 0.04), v(0.25, -0.2, -1), {
        clavicle: { x: -5, y: 0, z: -3 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0, -1, 0.15),
        minElbowDeg: 10,
      });
      p.solveArmTo('r', v(-0.245, 0.90, 0.04), v(-0.25, -0.2, -1), {
        clavicle: { x: -5, y: 0, z: 3 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(0, -1, 0.15),
        minElbowDeg: 10,
      });
    },
  },
  {
    id: 'attention-stance',
    name: 'Attention Stance',
    category: 'foundation',
    tags: ['military', 'soldier', 'parade', 'upright'],
    description: 'Tall aligned posture with chest lifted and arms braced cleanly',
    build: (p) => {
      p.setRootPelvisHeight(0.92);
      p.setPelvisOrientation({ x: -2, y: 0, z: 0 });
      p.setSpine(-6, 0, 0);
      p.setHead({ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
      p.solveLegTo('l', v(0.088, ANKLE_FLAT_Y, -0.04), v(0.05, 0, 1), {
        foot: { mode: 'flat', yawDeg: 8 },
        minKneeDeg: 3,
      });
      p.solveLegTo('r', v(-0.088, ANKLE_FLAT_Y, -0.04), v(-0.05, 0, 1), {
        foot: { mode: 'flat', yawDeg: -8 },
        minKneeDeg: 3,
      });
      p.solveArmTo('l', v(0.20, 0.90, 0.01), v(0.15, -0.2, -1), {
        clavicle: { x: -8, y: 0, z: 4 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0, -1, 0),
        fingers: 'open',
        minElbowDeg: 6,
      });
      p.solveArmTo('r', v(-0.20, 0.90, 0.01), v(-0.15, -0.2, -1), {
        clavicle: { x: -8, y: 0, z: -4 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(0, -1, 0),
        fingers: 'open',
        minElbowDeg: 6,
      });
    },
  },

  // =========================================================================
  // CLASSICAL & FINE ART (10)
  // =========================================================================
  {
    id: 'contrapposto',
    name: 'Contrapposto (David)',
    category: 'classical',
    tags: ['michelangelo', 'david', 'weight-shift', 'statue', 'sculpture'],
    description: 'Classic weight-shift stance with opposing hip drop and shoulder counter-tilt',
    build: (p) => {
      // Weight over Right leg (-X), Left hip dropped (+X lower), shoulders tilted opposite
      p.setRootPelvisHeight(0.89);
      p.setPelvisOrientation({ x: 3, y: 12, z: -8 });
      p.setSpine(-4, -14, 12);
      p.setHead({ x: 3, y: 18, z: -4 }, { x: 4, y: 16, z: 4 });
      // Engaged weight-bearing right leg under pelvis/COM
      p.solveLegTo('r', v(-0.06, ANKLE_FLAT_Y, -0.02), v(-0.04, 0, 1), {
        foot: { mode: 'flat', yawDeg: -6 },
        minKneeDeg: 4,
      });
      // Relaxed flexed left leg shifted slightly forward & out
      p.solveLegTo('l', v(0.17, ANKLE_FLAT_Y + 0.03, 0.12), v(0.18, 0, 1), {
        foot: { mode: 'ball', yawDeg: 18, pitchDeg: 18, ballDeg: 18 },
        minKneeDeg: 18,
      });
      // Left arm hanging in graceful ease
      p.solveArmTo('l', v(0.28, 0.95, 0.06), v(0.3, -0.2, -1), {
        clavicle: { x: -6, y: 0, z: 2 },
        palmNormal: v(-0.85, 0, 0.5),
        fingerDir: v(-0.1, -1, 0.1),
        fingers: 'graceful',
        minElbowDeg: 14,
      });
      // Right hand raised near collarbone holding David sling strap
      p.solveArmTo('r', v(-0.18, 1.38, 0.14), v(-0.8, -0.4, -0.3), {
        clavicle: { x: 8, y: 0, z: 2 },
        palmNormal: v(0.6, -0.5, -0.6),
        fingerDir: v(0.4, 0.7, -0.4),
        fingers: 'grip',
        minElbowDeg: 105,
      });
    },
  },
  {
    id: 'the-thinker',
    name: 'The Thinker (Rodin)',
    category: 'classical',
    tags: ['rodin', 'thinker', 'seated', 'contemplation', 'sculpture'],
    description: 'Hunched seated contemplation with right elbow braced onto the knee supporting the chin',
    build: (p) => {
      p.setRootPelvisHeight(0.50);
      p.setPelvisOrientation({ x: 16, y: 0, z: 0 });
      p.setSpine(52, -8, 0);
      p.setHead({ x: 18, y: 6, z: 0 }, { x: 12, y: 0, z: 0 });
      p.solveLegTo('l', v(0.13, ANKLE_FLAT_Y, 0.24), v(0.22, 0.3, 1), {
        foot: { mode: 'flat', yawDeg: 10 },
      });
      p.solveLegTo('r', v(-0.13, ANKLE_FLAT_Y, 0.27), v(-0.22, 0.3, 1), {
        foot: { mode: 'flat', yawDeg: -10 },
      });
      const kneeL = wp('calf_l');
      const chinTarget = wp('Head').add(v(-0.02, -0.055, 0.115));
      p.solveArmTo('r', chinTarget, v(kneeL.x - 0.04, kneeL.y - 0.18, kneeL.z + 0.1), {
        clavicle: { x: 10, y: 0, z: 12 },
        palmNormal: v(-0.4, -0.7, -0.5),
        fingerDir: v(0.3, -0.5, 0.7),
        fingers: 'relaxed',
      });
      p.solveArmTo(
        'l',
        v(kneeL.x + 0.03, kneeL.y + 0.04, kneeL.z - 0.06),
        v(0.8, 0, -0.4),
        {
          clavicle: { x: -4, y: 0, z: -8 },
          palmNormal: v(-0.5, -0.8, 0.2),
          fingerDir: v(0.2, -0.9, 0.3),
          fingers: 'relaxed',
        }
      );
    },
  },
  {
    id: 'discobolus',
    name: 'Discobolus (Discus Thrower)',
    category: 'classical',
    tags: ['myron', 'discus', 'greek', 'athlete', 'torsion', 'sculpture'],
    description: 'Extreme classical torsion winding the back arm behind the hip prior to release',
    build: (p) => {
      p.setRootPelvisHeight(0.68);
      p.setPelvisOrientation({ x: 26, y: -32, z: -12 });
      p.setSpine(34, -46, -12);
      p.setHead({ x: 8, y: -36, z: 8 }, { x: 6, y: -32, z: 8 });
      p.solveLegTo('r', v(-0.08, ANKLE_FLAT_Y, 0.10), v(-0.18, 0.3, 1), {
        foot: { mode: 'flat', yawDeg: -22 },
      });
      p.solveLegTo('l', v(0.18, ANKLE_FLAT_Y + 0.06, -0.26), v(0.3, 0.2, 1), {
        foot: { mode: 'ball', yawDeg: -10, pitchDeg: 40, ballDeg: 32 },
      });
      const kneeR = wp('calf_r');
      p.solveArmTo(
        'l',
        v(kneeR.x + 0.04, kneeR.y + 0.05, kneeR.z + 0.07),
        v(0.7, -0.2, 0.6),
        {
          clavicle: { x: 0, y: 0, z: -14 },
          palmNormal: v(-0.4, -0.6, -0.6),
          fingerDir: v(-0.5, -0.7, 0.2),
          fingers: 'relaxed',
        }
      );
      const shR = wp('upperarm_r');
      p.solveArmTo(
        'r',
        shR.clone().add(v(-0.42, 0.24, -0.28)),
        v(-0.4, 0.6, -0.7),
        {
          clavicle: { x: 10, y: 0, z: -10 },
          palmNormal: v(0.5, -0.3, -0.8),
          fingerDir: v(-0.3, 0.4, -0.8),
          fingers: 'grip',
        }
      );
    },
  },
  {
    id: 'venus-pudica',
    name: 'Venus Pudica',
    category: 'classical',
    tags: ['venus', 'botticelli', 'classical', 'graceful', 'modest'],
    description: 'Graceful modest classical stance with soft shoulder turn and crossed shielding forearms',
    build: (p) => {
      p.setRootPelvisHeight(0.895);
      p.setPelvisOrientation({ x: 3, y: -10, z: 7 });
      p.setSpine(-4, 12, -10);
      p.setHead({ x: 8, y: -20, z: 10 }, { x: 8, y: -15, z: 10 });
      p.solveLegTo('l', v(0.06, ANKLE_FLAT_Y, -0.02), v(0.05, 0, 1), {
        foot: { mode: 'flat', yawDeg: 8 },
      });
      p.solveLegTo('r', v(-0.14, ANKLE_FLAT_Y + 0.02, 0.11), v(-0.1, 0, 1), {
        foot: { mode: 'ball', yawDeg: -14, pitchDeg: 14, ballDeg: 14 },
      });
      const chest = wp('spine_03');
      const pelvis = wp('pelvis');
      p.solveArmTo(
        'r',
        v(chest.x + 0.08, chest.y - 0.03, chest.z + 0.21),
        v(-0.85, -0.5, -0.2),
        {
          clavicle: { x: -4, y: 0, z: 12 },
          palmNormal: v(0.1, -0.2, -0.98),
          fingerDir: v(0.85, 0.3, 0.2),
          fingers: 'graceful',
        }
      );
      p.solveArmTo(
        'l',
        v(pelvis.x + 0.02, pelvis.y - 0.01, pelvis.z + 0.19),
        v(0.85, -0.4, -0.3),
        {
          clavicle: { x: -12, y: 0, z: -10 },
          palmNormal: v(0, -0.2, -0.98),
          fingerDir: v(-0.8, -0.5, 0.2),
          fingers: 'graceful',
        }
      );
    },
  },
  {
    id: 'adlocutio',
    name: 'Adlocutio (Orator)',
    category: 'classical',
    tags: ['augustus', 'prima porta', 'roman', 'orator', 'commander'],
    description: 'Augustus Prima Porta commanding oratorical stance with raised proclaiming right arm',
    build: (p) => {
      p.setRootPelvisHeight(0.895);
      p.setPelvisOrientation({ x: -2, y: 12, z: -4 });
      p.setSpine(-8, -8, 4);
      p.setHead({ x: -4, y: -12, z: 0 }, { x: -4, y: -12, z: 0 });
      p.solveLegTo('l', v(0.10, ANKLE_FLAT_Y, 0.08), v(0.1, 0, 1), {
        foot: { mode: 'flat', yawDeg: 10 },
      });
      p.solveLegTo('r', v(-0.15, ANKLE_FLAT_Y + 0.03, -0.14), v(-0.18, 0, 1), {
        foot: { mode: 'ball', yawDeg: -16, pitchDeg: 20, ballDeg: 18 },
      });
      p.solveArmTo('r', v(-0.24, 1.70, 0.42), v(-0.4, -0.7, -0.5), {
        clavicle: { x: 14, y: 0, z: 8 },
        palmNormal: v(0.3, -0.5, 0.8),
        fingerDir: v(-0.2, 0.85, 0.45),
        fingers: 'open',
      });
      p.solveArmTo('l', v(0.24, 0.96, 0.16), v(0.7, -0.2, -0.6), {
        clavicle: { x: -6, y: 0, z: -6 },
        palmNormal: v(-0.9, -0.3, 0.2),
        fingerDir: v(0, -0.85, 0.5),
        fingers: 'relaxed',
      });
    },
  },
  {
    id: 'atlas-bearing-sky',
    name: 'Atlas Bearing Sky',
    category: 'classical',
    tags: ['atlas', 'titan', 'burden', 'squat', 'strength', 'mythology'],
    description: 'Strained Titan squat bracing elbows and palms upward beneath celestial load',
    build: (p) => {
      p.setRootPelvisHeight(0.60);
      p.setPelvisOrientation({ x: 16, y: 0, z: 0 });
      p.setSpine(16, 0, 0);
      p.setHead({ x: -16, y: 0, z: 0 }, { x: -10, y: 0, z: 0 });
      p.solveLegTo('l', v(0.24, ANKLE_FLAT_Y, 0.06), v(0.42, 0.2, 1), {
        foot: { mode: 'flat', yawDeg: 20 },
      });
      p.solveLegTo('r', v(-0.24, ANKLE_FLAT_Y, 0.06), v(-0.42, 0.2, 1), {
        foot: { mode: 'flat', yawDeg: -20 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo(
        'l',
        shL.clone().add(v(0.14, 0.22, 0.12)),
        v(0.85, -0.55, -0.2),
        {
          clavicle: { x: 14, y: 0, z: 4 },
          palmNormal: v(0, 1, 0),
          fingerDir: v(0, 0, 1),
          fingers: 'open',
        }
      );
      p.solveArmTo(
        'r',
        shR.clone().add(v(-0.14, 0.22, 0.12)),
        v(-0.85, -0.55, -0.2),
        {
          clavicle: { x: 14, y: 0, z: -4 },
          palmNormal: v(0, 1, 0),
          fingerDir: v(0, 0, 1),
          fingers: 'open',
        }
      );
    },
  },
  {
    id: 'creation-of-adam',
    name: 'Creation of Adam Reach',
    category: 'classical',
    tags: ['michelangelo', 'sistine', 'reclining', 'reach', 'finger'],
    description: 'Sistine Chapel languid reclining reach extending the forearm and trailing fingers',
    build: (p) => {
      p.setRootPelvisHeight(0.18);
      p.setPelvisOrientation({ x: -52, y: -14, z: -10 });
      p.setSpine(22, -10, 10);
      p.setHead({ x: 12, y: 26, z: -6 }, { x: 8, y: 18, z: -4 });
      const shR = wp('upperarm_r');
      // Plant propped right forearm & hand cleanly out beside hip rather than tucked underneath pelvis!
      p.solveArmTo('r', v(shR.x - 0.14, 0.05, shR.z + 0.14), v(-0.9, -0.4, -0.3), {
        clavicle: { x: 6, y: 0, z: -6 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-0.4, 0, 0.9),
        fingers: 'relaxed',
      });
      p.solveLegTo('r', v(-0.16, 0.14, 0.70), v(-0.2, 0.7, 0.3), {
        foot: { mode: 'pointed', pitchDeg: 45 },
      });
      p.solveLegTo('l', v(0.22, ANKLE_FLAT_Y, 0.48), v(0.32, 0.9, 0.2), {
        foot: { mode: 'flat', yawDeg: 14 },
      });
      const shL = wp('upperarm_l');
      p.solveArmTo('l', shL.clone().add(v(0.44, 0.14, 0.24)), v(0.3, -0.5, -0.4), {
        clavicle: { x: 8, y: 0, z: -8 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.9, 0.1, 0.4),
        fingers: 'graceful',
        fingerCustom: {
          index_01_l: { x: 4, y: 0, z: 0 },
          index_02_l: { x: 4, y: 0, z: 0 },
          index_03_l: { x: 4, y: 0, z: 0 },
        },
      });
      if (p.bones.hand_l) {
        p.setBone('hand_l', { x: -10, y: 0, z: 22 });
      }
    },
  },
  {
    id: 'laocoon-twist',
    name: 'Laocoön Serpentine Twist',
    category: 'classical',
    tags: ['laocoon', 'baroque', 'hellenistic', 'agony', 'twist'],
    description: 'Dramatic Baroque diagonal writhe arching the ribcage away while wrenching both arms',
    build: (p) => {
      p.setRootPelvisHeight(0.84);
      p.setPelvisOrientation({ x: 8, y: -18, z: -12 });
      p.setSpine(-28, 34, 24);
      p.setHead({ x: -24, y: 20, z: 18 }, { x: -22, y: 15, z: 16 });
      p.solveLegTo('l', v(0.24, ANKLE_FLAT_Y, 0.14), v(0.3, 0, 1), {
        foot: { mode: 'flat', yawDeg: 16 },
      });
      p.solveLegTo('r', v(-0.26, ANKLE_FLAT_Y, -0.10), v(-0.28, 0, 1), {
        foot: { mode: 'flat', yawDeg: -22 },
      });
      const shR = wp('upperarm_r');
      const shL = wp('upperarm_l');
      p.solveArmTo('r', shR.clone().add(v(-0.10, 0.42, 0.12)), v(-0.7, 0.2, -0.7), {
        clavicle: { x: 24, y: 0, z: 0 },
        palmNormal: v(0.6, 0.5, 0.6),
        fingerDir: v(-0.3, 0.8, 0.5),
        fingers: 'grip',
      });
      p.solveArmTo('l', shL.clone().add(v(0.20, -0.40, -0.10)), v(0.7, 0.3, -0.6), {
        clavicle: { x: -10, y: 0, z: 6 },
        palmNormal: v(-0.4, -0.4, 0.8),
        fingerDir: v(-0.1, -0.9, 0.4),
        fingers: 'grip',
      });
    },
  },
  {
    id: 'odalisque-reclining',
    name: 'Odalisque Reclining',
    category: 'classical',
    tags: ['ingres', 'reclining', 'lounging', 'side', 'portrait'],
    description: 'Side-resting figure propped gracefully on one bent arm with long crossed leg line',
    build: (p) => {
      // pelvis.z = +76 tilts head to -X (left side of frame) and legs extending along +X!
      p.setRootPelvisHeight(0.15);
      p.setPelvisOrientation({ x: 8, y: -12, z: 76 });
      p.setSpine(-8, 12, -32);
      p.setHead({ x: 6, y: -14, z: -18 }, { x: 6, y: -10, z: -14 });
      const shR = wp('upperarm_r');
      p.solveArmTo('r', v(shR.x - 0.14, 0.07, shR.z + 0.26), v(-0.7, -0.8, -0.2), {
        clavicle: { x: 10, y: 0, z: 6 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-0.3, 0, 0.95),
        fingers: 'graceful',
      });
      const pelv = wp('pelvis');
      p.solveArmTo('l', pelv.clone().add(v(0.26, 0.18, 0.12)), v(0.3, 0.8, -0.5), {
        clavicle: { x: -6, y: 0, z: -4 },
        palmNormal: v(-0.3, -0.9, 0.3),
        fingerDir: v(0.8, -0.4, 0.4),
        fingers: 'graceful',
      });
      p.solveLegTo('r', pelv.clone().add(v(0.76, -0.04, 0.02)), v(0.3, 0.4, 1), {
        foot: { mode: 'pointed', pitchDeg: 50 },
      });
      p.solveLegTo('l', pelv.clone().add(v(0.70, 0.00, 0.20)), v(0.3, 0.8, 0.6), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
    },
  },
  {
    id: 'kneeling-supplicant',
    name: 'Kneeling Supplicant',
    category: 'classical',
    tags: ['kneeling', 'prayer', 'devotion', 'renaissance', 'study'],
    description: 'Upright one-knee / twin-knee devotional kneel with palms pressed toward the chest',
    build: (p) => {
      p.setRootPelvisHeight(0.46);
      p.setPelvisOrientation({ x: 8, y: 0, z: 0 });
      p.setSpine(-4, 0, 0);
      p.setHead({ x: 12, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
      p.solveLegTo('l', v(0.11, 0.19, -0.38), v(0.08, -0.9, 1), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      p.solveLegTo('r', v(-0.11, 0.19, -0.38), v(-0.08, -0.9, 1), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      const chest = wp('spine_03');
      p.solveArmTo('l', v(0.03, chest.y - 0.10, chest.z + 0.26), v(0.85, -0.4, -0.2), {
        clavicle: { x: -4, y: 0, z: -14 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0, 0.94, 0.34),
        fingers: 'flat',
      });
      p.solveArmTo('r', v(-0.03, chest.y - 0.10, chest.z + 0.26), v(-0.85, -0.4, -0.2), {
        clavicle: { x: -4, y: 0, z: 14 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(0, 0.94, 0.34),
        fingers: 'flat',
      });
    },
  },

  // =========================================================================
  // ACTION & COMIC HERO (10)
  // =========================================================================
  {
    id: 'superhero-landing',
    name: 'Three-Point Superhero Landing',
    category: 'action',
    tags: ['hero', 'superhero', 'landing', 'impact', 'comic'],
    description: 'Iconic comic-book knee-down impact landing with right fist planted toward the floor',
    build: (p) => {
      p.setRootPelvisHeight(0.32);
      p.setPelvisOrientation({ x: 24, y: -18, z: 4 });
      p.setSpine(58, -24, 14);
      p.setHead({ x: -24, y: 26, z: 0 }, { x: -22, y: 14, z: 0 });
      p.solveLegTo('l', v(0.18, ANKLE_FLAT_Y, 0.28), v(0.22, 0.4, 1), {
        foot: { mode: 'flat', yawDeg: 16 },
      });
      p.solveLegTo('r', v(-0.14, 0.14, -0.36), v(-0.14, -0.35, 1), {
        foot: { mode: 'ball', yawDeg: -8, pitchDeg: 45, ballDeg: 30 },
      });
      p.solveArmTo('r', v(-0.22, FIST_FLOOR_Y + 0.01, 0.28), v(-0.4, 0.4, -0.8), {
        clavicle: { x: -20, y: 0, z: 16 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.2, 0, 1),
        fingers: 'fist',
      });
      const shL = wp('upperarm_l');
      p.solveArmTo('l', shL.clone().add(v(0.28, -0.02, -0.26)), v(0.7, 0.2, -0.7), {
        clavicle: { x: 14, y: 0, z: 12 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.5, 0.3, -0.8),
        fingers: 'fist',
      });
    },
  },
  {
    id: 'rooftop-spider-perch',
    name: 'Rooftop Spider-Perch',
    category: 'action',
    tags: ['spider', 'perch', 'crouch', 'stealth', 'gargoyle'],
    description: 'Deep coiled rooftop perch with wide knees and fingertips poised low between feet',
    build: (p) => {
      // Deep gargoyle squat: wide splayed knees, ankles apart (>0.28m), fingertips pressing floor between/ahead of feet
      p.setRootPelvisHeight(0.28);
      p.setPelvisOrientation({ x: 34, y: 0, z: 0 });
      p.setSpine(38, 0, 0);
      p.setHead({ x: -34, y: 0, z: 0 }, { x: -24, y: 0, z: 0 });
      p.solveLegTo('l', v(0.18, ANKLE_FLAT_Y + 0.02, 0.04), v(0.72, 0.45, 0.65), {
        foot: { mode: 'ball', yawDeg: 28, pitchDeg: 22, ballDeg: 20 },
        minKneeDeg: 126,
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y + 0.02, 0.04), v(-0.72, 0.45, 0.65), {
        foot: { mode: 'ball', yawDeg: -28, pitchDeg: 22, ballDeg: 20 },
        minKneeDeg: 126,
      });
      // Poised wide spider fingertips planted right at floor in front/between splayed knees!
      p.solveArmTo('l', v(0.15, PALM_FLOOR_Y + 0.03, 0.40), v(0.8, 0.5, -0.3), {
        clavicle: { x: -6, y: 0, z: -14 },
        palmNormal: v(0, -1, 0.2),
        fingerDir: v(0.2, -0.2, 0.96),
        fingers: 'open',
        minElbowDeg: 26,
      });
      p.solveArmTo('r', v(-0.15, PALM_FLOOR_Y + 0.03, 0.40), v(-0.8, 0.5, -0.3), {
        clavicle: { x: -6, y: 0, z: 14 },
        palmNormal: v(0, -1, 0.2),
        fingerDir: v(-0.2, -0.2, 0.96),
        fingers: 'open',
        minElbowDeg: 26,
      });
    },
  },
  {
    id: 'mid-air-jump',
    name: 'Mid-Air Hero Jump',
    category: 'action',
    tags: ['jump', 'leap', 'aerial', 'parkour', 'dynamic'],
    description: 'Dynamic aerial leap with tucked knee and trailing reaching arm above floor',
    groundSnap: false,
    elevationY: 0.46,
    build: (p) => {
      p.setRootPelvisHeight(1.0);
      p.setPelvisOrientation({ x: 14, y: 20, z: -6 });
      p.setSpine(-12, -16, 4);
      p.setHead({ x: -10, y: 6, z: 0 }, { x: -8, y: 6, z: 0 });
      p.solveLegTo('l', v(0.14, 0.66, 0.24), v(0.18, 0.4, 1), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      p.solveLegTo('r', v(-0.14, 0.34, -0.44), v(-0.16, 0, 1), {
        foot: { mode: 'pointed', pitchDeg: 58 },
      });
      const shR = wp('upperarm_r');
      const shL = wp('upperarm_l');
      p.solveArmTo('r', shR.clone().add(v(-0.08, 0.44, 0.18)), v(-0.6, -0.2, 0.6), {
        clavicle: { x: 22, y: 0, z: 4 },
        palmNormal: v(0.8, 0, 0.5),
        fingerDir: v(0, 1, 0.2),
        fingers: 'fist',
      });
      p.solveArmTo('l', shL.clone().add(v(0.18, -0.34, -0.28)), v(0.6, 0.2, -0.7), {
        clavicle: { x: -6, y: 0, z: 10 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.5, -0.3, -0.8),
        fingers: 'open',
      });
    },
  },
  {
    id: 'superman-flight',
    name: 'Superman Flight',
    category: 'action',
    tags: ['fly', 'flight', 'superman', 'aerial', 'cape'],
    description: 'Horizontal high-speed heroic flight punching one fist forward overhead',
    groundSnap: false,
    elevationY: 0.78,
    build: (p) => {
      p.setPelvisOrientation({ x: 82, y: -26, z: 0 });
      p.setSpine(-28, -8, 4);
      p.setHead({ x: -32, y: 12, z: 0 }, { x: -24, y: 8, z: 0 });
      const tailDir = wp('Head').sub(wp('pelvis')).normalize();
      const pelv = wp('pelvis');
      const downBack = tailDir.clone().negate();
      p.solveLegTo('r', pelv.clone().add(v(0.20, -0.26, -0.72)), v(-0.2, -0.6, -0.6), {
        foot: { mode: 'pointed', pitchDeg: 60 },
      });
      p.solveLegTo('l', pelv.clone().add(v(0.28, -0.44, -0.52)), v(0.2, -0.9, -0.2), {
        foot: { mode: 'pointed', pitchDeg: 58 },
      });
      const shR = wp('upperarm_r');
      p.solveArmTo('r', shR.clone().add(v(-0.18, 0.24, 0.44)), v(-0.5, 0.5, 0.1), {
        clavicle: { x: 24, y: 0, z: 4 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-0.3, 0.3, 0.9),
        fingers: 'fist',
      });
      p.solveArmTo('l', pelv.clone().add(v(0.18, 0.10, -0.06)), v(0.7, 0.6, -0.2), {
        clavicle: { x: -6, y: 0, z: 12 },
        palmNormal: v(-1, 0, 0),
        fingerDir: downBack,
        fingers: 'fist',
      });
    },
  },
  {
    id: 'power-levitation',
    name: 'Power Levitation',
    category: 'action',
    tags: ['hover', 'levitate', 'villain', 'hero', 'aerial'],
    description: 'Upright hovering levitation with swept-back cape shoulders and bent trailing knee',
    groundSnap: false,
    elevationY: 0.42,
    build: (p) => {
      p.setRootPelvisHeight(1.0);
      p.setPelvisOrientation({ x: -8, y: 8, z: 0 });
      p.setSpine(-14, -6, 0);
      p.setHead({ x: 14, y: -4, z: 0 }, { x: 8, y: -4, z: 0 });
      p.solveLegTo('l', v(0.14, 0.26, -0.10), v(0.16, 0, 1), {
        foot: { mode: 'pointed', pitchDeg: 55 },
      });
      p.solveLegTo('r', v(-0.13, 0.40, -0.24), v(-0.16, 0.2, 1), {
        foot: { mode: 'pointed', pitchDeg: 58 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(0.26, -0.34, 0.16)), v(0.6, 0.2, -0.7), {
        clavicle: { x: 4, y: 0, z: 8 },
        palmNormal: v(0.1, -0.3, 0.94),
        fingerDir: v(0.7, -0.7, 0.2),
        fingers: 'open',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.26, -0.34, 0.16)), v(-0.6, 0.2, -0.7), {
        clavicle: { x: 4, y: 0, z: -8 },
        palmNormal: v(-0.1, -0.3, 0.94),
        fingerDir: v(-0.7, -0.7, 0.2),
        fingers: 'open',
      });
    },
  },
  {
    id: 'action-lunge',
    name: 'Action Lunge',
    category: 'action',
    tags: ['lunge', 'charge', 'combat', 'dash', 'dynamic'],
    description: 'Dynamic forward lunge with torso counter-twist and braced striking arms',
    build: (p) => {
      p.setRootPelvisHeight(0.68);
      p.setPelvisOrientation({ x: 14, y: 20, z: 0 });
      p.setSpine(20, -28, 0);
      p.setHead({ x: -16, y: 12, z: 0 }, { x: -10, y: 6, z: 0 });
      p.solveLegTo('l', v(0.14, ANKLE_FLAT_Y, 0.30), v(0.16, 0.2, 1), {
        foot: { mode: 'flat', yawDeg: 10 },
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y + 0.04, -0.42), v(-0.18, 0, 1), {
        foot: { mode: 'ball', yawDeg: -10, pitchDeg: 40, ballDeg: 35 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(-0.08, -0.08, 0.46)), v(0.7, -0.4, -0.3), {
        clavicle: { x: 4, y: 0, z: -12 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-0.1, 0, 1),
        fingers: 'fist',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.14, -0.22, -0.22)), v(-0.6, 0.2, -0.7), {
        clavicle: { x: 4, y: 0, z: -10 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(-0.1, -0.3, 0.9),
        fingers: 'fist',
      });
    },
  },
  {
    id: 'sprint-mid-stride',
    name: 'Sprint Mid-Stride',
    category: 'action',
    tags: ['run', 'sprint', 'athletics', 'stride', 'speed'],
    description: 'Explosive sprint stride with high knee drive and crisp contralateral arm swing',
    build: (p) => {
      p.setRootPelvisHeight(0.74);
      p.setPelvisOrientation({ x: 18, y: -14, z: 4 });
      p.setSpine(22, 20, -4);
      p.setHead({ x: -20, y: -6, z: 0 }, { x: -12, y: 0, z: 0 });
      p.solveLegTo('l', v(0.11, ANKLE_FLAT_Y + 0.05, -0.46), v(0.1, 0, 1), {
        foot: { mode: 'ball', yawDeg: 0, pitchDeg: 42, ballDeg: 34 },
      });
      p.solveLegTo('r', v(-0.11, 0.46, 0.16), v(-0.12, 0.2, 1), {
        foot: { mode: 'flexed', pitchDeg: -22 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(0.04, -0.10, 0.36)), v(0.3, -0.5, -0.8), {
        clavicle: { x: 8, y: 0, z: -8 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(-0.1, 0.85, 0.5),
        fingers: 'open',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.08, -0.26, -0.22)), v(-0.4, 0.5, -0.7), {
        clavicle: { x: -4, y: 0, z: -10 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(0, -0.2, 0.96),
        fingers: 'open',
      });
    },
  },
  {
    id: 'matrix-dodge',
    name: 'Backward Matrix Dodge',
    category: 'action',
    tags: ['matrix', 'dodge', 'bullet', 'backbend', 'limbo'],
    description: 'Deep cinematic hyper-extended backbend dodging horizontally above bent braced knees',
    build: (p) => {
      p.setRootPelvisHeight(0.66);
      p.setPelvisOrientation({ x: -34, y: 0, z: 0 });
      p.setSpine(-48, 0, 0);
      p.setHead({ x: 32, y: 0, z: 0 }, { x: 26, y: 0, z: 0 });
      p.solveLegTo('l', v(0.22, ANKLE_FLAT_Y, 0.04), v(0.22, 0.15, 1), {
        foot: { mode: 'flat', yawDeg: 14 },
      });
      p.solveLegTo('r', v(-0.22, ANKLE_FLAT_Y, 0.04), v(-0.22, 0.15, 1), {
        foot: { mode: 'flat', yawDeg: -14 },
      });
      const chest = wp('spine_03');
      p.solveArmTo('l', v(0.46, chest.y + 0.14, chest.z + 0.08), v(0.5, -0.6, -0.4), {
        clavicle: { x: 4, y: 0, z: 4 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.6, 0.4, 0.6),
        fingers: 'open',
      });
      p.solveArmTo('r', v(-0.46, chest.y + 0.14, chest.z + 0.08), v(-0.5, -0.6, -0.4), {
        clavicle: { x: 4, y: 0, z: -4 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-0.6, 0.4, 0.6),
        fingers: 'open',
      });
    },
  },
  {
    id: 'skydiving-freefall',
    name: 'Skydiving Freefall',
    category: 'action',
    tags: ['skydive', 'freefall', 'arch', 'aerial', 'falling'],
    description: 'Belly-to-earth arched freefall posture with spread stabilizing arms and bent shins',
    groundSnap: false,
    elevationY: 0.72,
    build: (p) => {
      p.setPelvisOrientation({ x: 84, y: -22, z: 0 });
      p.setSpine(-32, 0, 0);
      p.setHead({ x: -34, y: 6, z: 0 }, { x: -24, y: 6, z: 0 });
      const pelv = wp('pelvis');
      p.solveLegTo('l', pelv.clone().add(v(0.22, 0.18, -0.54)), v(0.3, -1, 0), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      p.solveLegTo('r', pelv.clone().add(v(-0.16, 0.18, -0.58)), v(-0.3, -1, 0), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(0.28, 0.16, 0.22)), v(0.6, -0.5, -0.5), {
        clavicle: { x: 10, y: 0, z: 10 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.2, 0.2, 0.96),
        fingers: 'open',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.28, 0.16, 0.20)), v(-0.6, -0.5, -0.5), {
        clavicle: { x: 10, y: 0, z: -10 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-0.2, 0.2, 0.96),
        fingers: 'open',
      });
    },
  },
  {
    id: 'heroic-power-stance',
    name: 'Heroic Power Stance',
    category: 'action',
    tags: ['akimbo', 'hands-on-hips', 'power', 'confident', 'hero'],
    description: 'Wide grounded comic power stance with fists anchored on the hips and lifted chest',
    build: (p) => {
      p.setRootPelvisHeight(0.89);
      p.setPelvisOrientation({ x: -3, y: 0, z: 0 });
      p.setSpine(-10, 0, 0);
      p.setHead({ x: -4, y: 0, z: 0 }, { x: -4, y: 0, z: 0 });
      p.solveLegTo('l', v(0.22, ANKLE_FLAT_Y, 0.02), v(0.24, 0, 1), {
        foot: { mode: 'flat', yawDeg: 14 },
      });
      p.solveLegTo('r', v(-0.22, ANKLE_FLAT_Y, 0.02), v(-0.24, 0, 1), {
        foot: { mode: 'flat', yawDeg: -14 },
      });
      const pelv = wp('pelvis');
      p.solveArmTo('l', v(pelv.x + 0.175, pelv.y + 0.08, pelv.z + 0.06), v(1, 0, -0.35), {
        clavicle: { x: -4, y: 0, z: 4 },
        palmNormal: v(-1, -0.2, 0),
        fingerDir: v(-0.2, -0.8, 0.5),
        fingers: 'fist',
      });
      p.solveArmTo('r', v(pelv.x - 0.175, pelv.y + 0.08, pelv.z + 0.06), v(-1, 0, -0.35), {
        clavicle: { x: -4, y: 0, z: -4 },
        palmNormal: v(1, -0.2, 0),
        fingerDir: v(0.2, -0.8, 0.5),
        fingers: 'fist',
      });
    },
  },

  // =========================================================================
  // MARTIAL ARTS & COMBAT (8)
  // =========================================================================
  {
    id: 'orthodox-boxing-guard',
    name: 'Orthodox Boxing Guard',
    category: 'combat',
    tags: ['boxing', 'guard', 'fighter', 'punch', 'peekaboo'],
    description: 'Tight chin-tucked boxing peekaboo guard with lead shoulder and staggered stance',
    build: (p) => {
      p.setRootPelvisHeight(0.84);
      p.setPelvisOrientation({ x: 8, y: -36, z: 0 });
      p.setSpine(14, -14, 0);
      p.setHead({ x: 6, y: 28, z: 4 }, { x: 4, y: 18, z: 2 });
      p.solveLegTo('l', v(0.14, ANKLE_FLAT_Y, 0.24), v(0.14, 0.1, 1), {
        foot: { mode: 'flat', yawDeg: -16 },
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y + 0.03, -0.24), v(-0.24, 0.1, 1), {
        foot: { mode: 'ball', yawDeg: -38, pitchDeg: 24, ballDeg: 22 },
      });
      const head = wp('Head');
      // Keep fists slightly below eye-line so face peers clearly over the boxing guard!
      p.solveArmTo('l', v(head.x + 0.12, head.y - 0.10, head.z + 0.34), v(0.4, -0.9, -0.25), {
        clavicle: { x: 8, y: 0, z: -12 },
        palmNormal: v(-0.8, 0, -0.5),
        fingerDir: v(-0.1, 0.9, 0.3),
        fingers: 'fist',
      });
      p.solveArmTo('r', v(head.x - 0.13, head.y - 0.09, head.z + 0.16), v(-0.5, -0.9, -0.25), {
        clavicle: { x: 6, y: 0, z: 10 },
        palmNormal: v(0.8, 0, -0.5),
        fingerDir: v(0.1, 0.95, 0.2),
        fingers: 'fist',
      });
    },
  },
  {
    id: 'crane-kick-balance',
    name: 'Crane Kick Balance',
    category: 'combat',
    tags: ['karate', 'crane', 'kick', 'kung-fu', 'balance'],
    description: 'Single-leg crane chamber balance with outstretched wing-raised wrists',
    build: (p) => {
      p.setRootPelvisHeight(0.89);
      p.setPelvisOrientation({ x: 2, y: 8, z: -4 });
      p.setSpine(-4, -8, 4);
      p.setHead({ x: 2, y: -2, z: 0 }, { x: 2, y: -2, z: 0 });
      p.solveLegTo('r', v(-0.04, ANKLE_FLAT_Y, 0.0), v(-0.04, 0, 1), {
        foot: { mode: 'flat', yawDeg: -8 },
      });
      p.solveLegTo('l', v(0.14, 0.56, 0.18), v(0.22, 0.2, 1), {
        foot: { mode: 'flexed', pitchDeg: -22 },
      });
      p.solveArmTo('l', v(0.52, 1.80, 0.12), v(0.5, -0.4, -0.7), {
        clavicle: { x: 16, y: 0, z: 0 },
        direct: { forearmY: 0, handX: 0, handZ: 72 },
        fingers: 'open',
      });
      p.solveArmTo('r', v(-0.52, 1.80, 0.12), v(-0.5, -0.4, -0.7), {
        clavicle: { x: 16, y: 0, z: 0 },
        direct: { forearmY: 0, handX: 0, handZ: -72 },
        fingers: 'open',
      });
    },
  },
  {
    id: 'high-roundhouse-kick',
    name: 'High Roundhouse Kick',
    category: 'combat',
    tags: ['kick', 'taekwondo', 'martial-arts', 'high-kick', 'strike'],
    description: 'Extended horizontal side/roundhouse kick supported cleanly on a pivoted standing leg',
    build: (p) => {
      p.setRootPelvisHeight(0.84);
      p.setPelvisOrientation({ x: -12, y: 38, z: -42 });
      p.setSpine(6, -12, -16);
      p.setHead({ x: 8, y: -26, z: 22 }, { x: 6, y: -14, z: 16 });
      p.solveLegTo('l', v(0.05, ANKLE_FLAT_Y, 0.02), v(-0.2, 0, 1), {
        foot: { mode: 'flat', yawDeg: 75 },
      });
      const hipR = wp('thigh_r');
      p.solveLegTo(
        'r',
        v(hipR.x - 0.48, hipR.y + 0.34, hipR.z + 0.48),
        v(-0.3, 0.9, 0.2),
        {
          foot: { mode: 'pointed', pitchDeg: 50 },
        }
      );
      const chest = wp('spine_03');
      p.solveArmTo('l', v(chest.x + 0.18, chest.y + 0.06, chest.z + 0.25), v(0.7, -0.7, -0.2), {
        clavicle: { x: 6, y: 0, z: -8 },
        palmNormal: v(-0.8, 0, -0.5),
        fingerDir: v(-0.2, 0.9, 0.3),
        fingers: 'fist',
      });
      p.solveArmTo('r', v(chest.x - 0.16, chest.y + 0.04, chest.z + 0.25), v(-0.7, -0.7, -0.2), {
        clavicle: { x: 6, y: 0, z: 8 },
        palmNormal: v(0.8, 0, -0.5),
        fingerDir: v(0.2, 0.9, 0.3),
        fingers: 'fist',
      });
    },
  },
  {
    id: 'jeet-kune-do-guard',
    name: 'Jeet Kune Do Guard',
    category: 'combat',
    tags: ['bruce-lee', 'jkd', 'kung-fu', 'kungfu', 'stance'],
    description: 'Side-on intercepting stance with extended lead hand and coiled rear striking arm',
    build: (p) => {
      p.setRootPelvisHeight(0.80);
      p.setPelvisOrientation({ x: 8, y: 24, z: 0 });
      p.setSpine(10, -24, -4);
      p.setHead({ x: 6, y: 8, z: 4 }, { x: 4, y: 6, z: 2 });
      p.solveLegTo('l', v(0.18, ANKLE_FLAT_Y, 0.28), v(0.15, 0, 1), {
        foot: { mode: 'flat', yawDeg: 18 },
      });
      p.solveLegTo('r', v(-0.22, ANKLE_FLAT_Y + 0.03, -0.26), v(-0.4, 0, 0.8), {
        foot: { mode: 'ball', yawDeg: 8, pitchDeg: 22, ballDeg: 20 },
      });
      const chest = wp('spine_03');
      const shL = wp('upperarm_l');
      // Extend lead intercepting hand crisply diagonal-forward left, rear fist coiled tight at ribs!
      p.solveArmTo('l', shL.clone().add(v(0.28, -0.02, 0.44)), v(0.4, -0.85, -0.2), {
        clavicle: { x: 8, y: 0, z: -8 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0.35, 0.25, 0.90),
        fingers: 'open',
      });
      p.solveArmTo('r', v(chest.x - 0.14, chest.y - 0.02, chest.z + 0.20), v(-0.5, -0.9, -0.2), {
        clavicle: { x: 4, y: 0, z: 10 },
        palmNormal: v(0.8, 0, -0.5),
        fingerDir: v(0, 0.85, 0.4),
        fingers: 'fist',
      });
    },
  },
  {
    id: 'two-handed-sword-guard',
    name: 'Two-Handed Sword Guard',
    category: 'combat',
    tags: ['sword', 'katana', 'samurai', 'knight', 'chudan'],
    description: 'Centered two-handed middle guard gripping an imaginary hilt forward of the torso',
    build: (p) => {
      p.setRootPelvisHeight(0.84);
      p.setPelvisOrientation({ x: 8, y: -22, z: 0 });
      p.setSpine(10, 6, 0);
      p.setHead({ x: 0, y: 12, z: 0 }, { x: 0, y: 6, z: 0 });
      p.solveLegTo('l', v(0.14, ANKLE_FLAT_Y, 0.24), v(0.16, 0, 1), {
        foot: { mode: 'flat', yawDeg: 4 },
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y + 0.03, -0.24), v(-0.3, 0, 1), {
        foot: { mode: 'ball', yawDeg: -36, pitchDeg: 18, ballDeg: 16 },
      });
      const chest = wp('spine_03');
      p.solveArmTo('r', v(0.00, chest.y - 0.10, chest.z + 0.38), v(-0.7, -0.7, -0.2), {
        clavicle: { x: 0, y: 0, z: 14 },
        palmNormal: v(0.95, 0, -0.3),
        fingerDir: v(-0.2, 0.3, 0.94),
        fingers: 'grip',
      });
      p.solveArmTo('l', v(0.00, chest.y - 0.18, chest.z + 0.38), v(0.7, -0.7, -0.2), {
        clavicle: { x: 0, y: 0, z: -14 },
        palmNormal: v(-0.95, 0, -0.3),
        fingerDir: v(0.2, 0.3, 0.94),
        fingers: 'grip',
      });
    },
  },
  {
    id: 'archer-full-draw',
    name: 'Archer Full Draw',
    category: 'combat',
    tags: ['archery', 'bow', 'arrow', 'aim', 'ranger'],
    description: 'Extended left bow-arm sightline paired with right drawing elbow anchored past the cheek',
    build: (p) => {
      // Turn stance +52 deg so left bow arm extends cleanly sideways across viewer's screen (+X/+Z)!
      p.setRootPelvisHeight(0.895);
      p.setPelvisOrientation({ x: 0, y: 42, z: 0 });
      p.setSpine(2, 14, 0);
      p.setHead({ x: 2, y: 24, z: 0 }, { x: 2, y: 18, z: 0 });
      p.solveLegTo('l', v(0.22, ANKLE_FLAT_Y, 0.14), v(0.4, 0, 0.9), {
        foot: { mode: 'flat', yawDeg: 68 },
      });
      p.solveLegTo('r', v(-0.22, ANKLE_FLAT_Y, -0.14), v(-0.2, 0, 1), {
        foot: { mode: 'flat', yawDeg: 18 },
      });
      const head = wp('Head');
      const shL = wp('upperarm_l');
      // Straight left bow arm extending along +X (viewer's right) diagonal sightline
      p.solveArmTo('l', shL.clone().add(v(0.48, 0.02, 0.22)), v(0.1, -0.9, -0.3), {
        clavicle: { x: 4, y: 0, z: -4 },
        palmNormal: v(-0.4, 0, -0.9),
        fingerDir: v(0.9, 0, 0.4),
        fingers: 'grip',
      });
      // Right drawing hand pulled back cleanly past right cheek with elbow out behind!
      p.solveArmTo(
        'r',
        v(head.x - 0.08, head.y - 0.03, head.z + 0.12),
        v(-0.8, 0.25, -0.5),
        {
          clavicle: { x: 8, y: 0, z: -8 },
          palmNormal: v(-0.3, -0.2, 0.9),
          fingerDir: v(0.9, 0.2, 0.35),
          fingers: 'grip',
        }
      );
    },
  },
  {
    id: 'rising-uppercut',
    name: 'Rising Uppercut',
    category: 'combat',
    tags: ['punch', 'uppercut', 'knockout', 'boxing', 'strike'],
    description: 'Upward driving corkscrew uppercut twisting hips and shoulders into a rising right fist',
    build: (p) => {
      p.setRootPelvisHeight(0.84);
      p.setPelvisOrientation({ x: 8, y: 26, z: -6 });
      p.setSpine(-4, 24, 10);
      p.setHead({ x: -8, y: -34, z: 4 }, { x: -4, y: -14, z: 0 });
      p.solveLegTo('l', v(0.14, ANKLE_FLAT_Y, 0.22), v(0.14, 0.1, 1), {
        foot: { mode: 'flat', yawDeg: 12 },
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y + 0.03, -0.24), v(-0.18, 0.1, 1), {
        foot: { mode: 'ball', yawDeg: 24, pitchDeg: 26, ballDeg: 24 },
      });
      const head = wp('Head');
      // Place rising uppercut fist boldly forward-side clear of face silhouette!
      p.solveArmTo('r', v(head.x - 0.06, head.y + 0.14, head.z + 0.36), v(-0.2, -0.95, -0.2), {
        clavicle: { x: 16, y: 0, z: 12 },
        palmNormal: v(-0.3, 0.3, -0.9),
        fingerDir: v(0, 1, 0),
        fingers: 'fist',
      });
      p.solveArmTo('l', v(head.x + 0.18, head.y - 0.08, head.z + 0.18), v(0.7, -0.7, -0.2), {
        clavicle: { x: 6, y: 0, z: -8 },
        palmNormal: v(-0.8, 0, -0.5),
        fingerDir: v(-0.1, 0.9, 0.3),
        fingers: 'fist',
      });
    },
  },
  {
    id: 'low-spear-thrust',
    name: 'Low Spear Thrust',
    category: 'combat',
    tags: ['spear', 'lunge', 'polearm', 'warrior', 'thrust'],
    description: 'Deep martial low-horse lunge driving both arms along a fierce forward thrust line',
    build: (p) => {
      p.setRootPelvisHeight(0.60);
      p.setPelvisOrientation({ x: 18, y: -36, z: 0 });
      p.setSpine(26, -12, 0);
      p.setHead({ x: -24, y: 34, z: 6 }, { x: -16, y: 14, z: 0 });
      p.solveLegTo('l', v(0.18, ANKLE_FLAT_Y, 0.32), v(0.22, 0.3, 1), {
        foot: { mode: 'flat', yawDeg: 8 },
      });
      p.solveLegTo('r', v(-0.24, ANKLE_FLAT_Y, -0.40), v(-0.4, 0, 0.8), {
        foot: { mode: 'flat', yawDeg: -52 },
      });
      const pelv = wp('pelvis');
      p.solveArmTo('l', v(0.06, 0.84, 0.56), v(0.6, -0.7, -0.2), {
        clavicle: { x: -4, y: 0, z: -12 },
        palmNormal: v(0.8, -0.5, 0),
        fingerDir: v(-0.2, 0.2, 0.96),
        fingers: 'grip',
      });
      p.solveArmTo('r', v(pelv.x - 0.18, pelv.y + 0.08, pelv.z + 0.06), v(-0.8, 0.2, -0.5), {
        clavicle: { x: 4, y: 0, z: -8 },
        palmNormal: v(0.8, 0.5, 0),
        fingerDir: v(-0.2, 0.2, 0.96),
        fingers: 'grip',
      });
    },
  },

  // =========================================================================
  // DANCE & ATHLETICS (8)
  // =========================================================================
  {
    id: 'ballet-arabesque',
    name: 'Ballet Arabesque',
    category: 'dance',
    tags: ['ballet', 'arabesque', 'dance', 'grace', 'balance'],
    description: 'Elevated classical arabesque line extending rear leg high behind while reaching forward',
    build: (p) => {
      // Turned +42 deg so soaring rear arabesque line & stretched front arm show dramatically in profile!
      p.setRootPelvisHeight(0.895);
      p.setPelvisOrientation({ x: 34, y: 42, z: 0 });
      p.setSpine(-28, -6, 0);
      p.setHead({ x: -12, y: 6, z: 0 }, { x: -8, y: 4, z: 0 });
      const pelvQ = wq('pelvis');
      const pelvFwd = v(0, 0, 1).applyQuaternion(pelvQ).setY(0).normalize();
      const pelvLeft = v(1, 0, 0).applyQuaternion(pelvQ).setY(0).normalize();
      p.solveLegTo('r', v(-0.04, ANKLE_FLAT_Y, 0.04), pelvFwd, {
        foot: { mode: 'flat', yawDeg: 32 },
      });
      const hipL = wp('thigh_l');
      p.solveLegTo(
        'l',
        hipL.clone().addScaledVector(pelvFwd, -0.76).add(v(0, 0.08, 0)),
        pelvFwd.clone().multiplyScalar(0.25).add(v(0, -0.95, 0)),
        {
          foot: { mode: 'pointed', pitchDeg: 60 },
        }
      );
      const shR = wp('upperarm_r');
      const shL = wp('upperarm_l');
      p.solveArmTo(
        'r',
        shR.clone().addScaledVector(pelvFwd, 0.46).addScaledVector(pelvLeft, -0.08).add(v(0, 0.12, 0)),
        pelvLeft.clone().multiplyScalar(-0.3).add(v(0, -0.9, 0)),
        {
          clavicle: { x: 8, y: 0, z: 8 },
          palmNormal: v(0, -1, 0),
          fingerDir: pelvFwd,
          fingers: 'graceful',
        }
      );
      p.solveArmTo(
        'l',
        shL.clone().addScaledVector(pelvLeft, 0.36).addScaledVector(pelvFwd, -0.24).add(v(0, -0.04, 0)),
        pelvLeft.clone().multiplyScalar(0.4).addScaledVector(pelvFwd, -0.3).add(v(0, -0.85, 0)),
        {
          clavicle: { x: 6, y: 0, z: 8 },
          palmNormal: v(0, -1, 0),
          fingerDir: pelvLeft.clone().addScaledVector(pelvFwd, -0.6).normalize(),
          fingers: 'graceful',
        }
      );
    },
  },
  {
    id: 'ballet-grand-jete',
    name: 'Ballet Grand Jeté',
    category: 'dance',
    tags: ['ballet', 'leap', 'split', 'jump', 'aerial'],
    description: 'Suspended grand jeté split leap with graceful arched spine and swept port de bras',
    groundSnap: false,
    elevationY: 0.56,
    build: (p) => {
      // Turn -58 deg sideways across screen so BOTH legs open in a crisp straight 150-deg ballet split!
      p.setRootPelvisHeight(1.0);
      p.setPelvisOrientation({ x: 8, y: -58, z: 0 });
      p.setSpine(-18, 14, 0);
      p.setHead({ x: -10, y: 18, z: 0 }, { x: -8, y: 12, z: 0 });
      const pelv = wp('pelvis');
      const fwdXZ = v(0, 0, 1).applyQuaternion(wq('pelvis')).setY(0).normalize();
      const leftXZ = v(1, 0, 0).applyQuaternion(wq('pelvis')).setY(0).normalize();
      const hipL = wp('thigh_l');
      const hipR = wp('thigh_r');
      p.solveLegTo(
        'l',
        hipL.clone().addScaledVector(fwdXZ, 0.78).add(v(0, -0.16, 0)),
        fwdXZ.clone().multiplyScalar(0.8).add(v(0, 0.6, 0)),
        {
          foot: { mode: 'pointed', pitchDeg: 60 },
        }
      );
      p.solveLegTo(
        'r',
        hipR.clone().addScaledVector(fwdXZ, -0.78).add(v(0, -0.18, 0)),
        fwdXZ.clone().multiplyScalar(0.3).add(v(0, -0.95, 0)),
        {
          foot: { mode: 'pointed', pitchDeg: 60 },
        }
      );
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo(
        'l',
        shL.clone().addScaledVector(fwdXZ, 0.34).addScaledVector(leftXZ, 0.16).add(v(0, 0.28, 0)),
        leftXZ.clone().multiplyScalar(0.4).add(v(0, -0.85, 0)),
        {
          clavicle: { x: 18, y: 0, z: 0 },
          palmNormal: v(0, -1, 0),
          fingerDir: fwdXZ,
          fingers: 'graceful',
        }
      );
      p.solveArmTo(
        'r',
        shR.clone().addScaledVector(leftXZ, -0.36).addScaledVector(fwdXZ, -0.22).add(v(0, 0.04, 0)),
        leftXZ.clone().multiplyScalar(-0.4).addScaledVector(fwdXZ, -0.3).add(v(0, -0.85, 0)),
        {
          clavicle: { x: 8, y: 0, z: -8 },
          palmNormal: v(0, -1, 0),
          fingerDir: leftXZ.clone().negate().addScaledVector(fwdXZ, -0.6).normalize(),
          fingers: 'graceful',
        }
      );
      void pelv;
    },
  },
  {
    id: 'yoga-tree-pose',
    name: 'Yoga Tree Pose',
    category: 'dance',
    tags: ['yoga', 'vrksasana', 'balance', 'stretch', 'mindfulness'],
    description: 'Vrksasana single-leg balance with raised arms overhead and open turned-out knee',
    build: (p) => {
      p.setRootPelvisHeight(0.91);
      p.setPelvisOrientation({ x: -2, y: 0, z: 0 });
      p.setSpine(-4, 0, 0);
      p.setHead({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      p.solveLegTo('r', v(-0.02, ANKLE_FLAT_Y, 0.0), v(-0.02, 0, 1), {
        foot: { mode: 'flat', yawDeg: -4 },
      });
      p.solveLegTo('l', v(0.08, 0.50, 0.02), v(0.95, 0.1, 0.2), {
        foot: { mode: 'pointed', pitchDeg: 52, rollDeg: 14 },
      });
      const head = wp('Head');
      p.solveArmTo('l', v(0.03, head.y + 0.34, 0.04), v(0.85, 0.2, -0.2), {
        clavicle: { x: 22, y: 0, z: 0 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0, 1, 0),
        fingers: 'flat',
      });
      p.solveArmTo('r', v(-0.03, head.y + 0.34, 0.04), v(-0.85, 0.2, -0.2), {
        clavicle: { x: 22, y: 0, z: 0 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(0, 1, 0),
        fingers: 'flat',
      });
    },
  },
  {
    id: 'yoga-warrior-ii',
    name: 'Yoga Warrior II',
    category: 'dance',
    tags: ['yoga', 'warrior', 'virabhadrasana', 'lunge', 'stretch'],
    description: 'Virabhadrasana II wide lunging stance with arms parallel to the horizon and turned gaze',
    build: (p) => {
      p.setRootPelvisHeight(0.66);
      p.setPelvisOrientation({ x: 4, y: 24, z: 0 });
      p.setSpine(-4, -18, 0);
      p.setHead({ x: 0, y: 42, z: 0 }, { x: 0, y: 38, z: 0 });
      p.solveLegTo('l', v(0.42, ANKLE_FLAT_Y, 0.14), v(0.7, 0.1, 0.7), {
        foot: { mode: 'flat', yawDeg: 68 },
      });
      p.solveLegTo('r', v(-0.44, ANKLE_FLAT_Y, -0.10), v(-0.4, 0, 0.9), {
        foot: { mode: 'flat', yawDeg: -4 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(0.50, 0.02, 0.06)), v(0, -0.3, -1), {
        clavicle: { x: 0, y: 0, z: 0 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(1, 0, 0.15),
        fingers: 'open',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.50, 0.02, -0.06)), v(0, -0.3, -1), {
        clavicle: { x: 0, y: 0, z: 0 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(-1, 0, -0.15),
        fingers: 'open',
      });
    },
  },
  {
    id: 'track-sprinter-set',
    name: 'Track Sprinter Set',
    category: 'dance',
    tags: ['sprinter', 'track', 'blocks', 'start', 'athletics'],
    description: 'Track starting-block set position coiled forward over planted hands ready for the gun',
    build: (p) => {
      p.setRootPelvisHeight(0.45);
      p.setPelvisOrientation({ x: 66, y: 0, z: 0 });
      p.setSpine(12, 0, 0);
      p.setHead({ x: -24, y: 0, z: 0 }, { x: -16, y: 0, z: 0 });
      p.solveLegTo('r', v(-0.12, ANKLE_FLAT_Y + 0.04, -0.04), v(-0.12, 0.4, 1), {
        foot: { mode: 'ball', yawDeg: 0, pitchDeg: 42, ballDeg: 34 },
      });
      p.solveLegTo('l', v(0.12, ANKLE_FLAT_Y + 0.05, -0.32), v(0.12, 0.3, 1), {
        foot: { mode: 'ball', yawDeg: 0, pitchDeg: 45, ballDeg: 34 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', v(shL.x + 0.02, PALM_FLOOR_Y + 0.02, shL.z + 0.14), v(0.2, 0.3, -1), {
        clavicle: { x: 8, y: 0, z: -6 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0, 0, 1),
        fingers: 'open',
      });
      p.solveArmTo('r', v(shR.x - 0.02, PALM_FLOOR_Y + 0.02, shR.z + 0.14), v(-0.2, 0.3, -1), {
        clavicle: { x: 8, y: 0, z: 6 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0, 0, 1),
        fingers: 'open',
      });
    },
  },
  {
    id: 'handstand-balance',
    name: 'Handstand Balance',
    category: 'dance',
    tags: ['handstand', 'gymnastics', 'inverted', 'balance', 'acrobatics'],
    description: 'Inverted gymnastics handstand grounded directly through stacked wrists and shoulders',
    build: (p) => {
      p.setRootPelvisHeight(1.11);
      p.setPelvisOrientation({ x: 8, y: 0, z: 180 });
      p.setSpine(-14, 0, 0);
      p.setHead({ x: -24, y: 0, z: 0 }, { x: -16, y: 0, z: 0 });
      const pelv = wp('pelvis');
      p.solveLegTo('l', v(pelv.x - 0.11, pelv.y + 0.82, pelv.z - 0.04), v(0, 0, 1), {
        foot: { mode: 'pointed', pitchDeg: 58 },
      });
      p.solveLegTo('r', v(pelv.x + 0.11, pelv.y + 0.82, pelv.z - 0.04), v(0, 0, 1), {
        foot: { mode: 'pointed', pitchDeg: 58 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', v(shL.x, PALM_FLOOR_Y, shL.z + 0.04), v(-0.2, 0.2, -1), {
        clavicle: { x: 24, y: 0, z: 0 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0, 0, 1),
        fingers: 'flat',
      });
      p.solveArmTo('r', v(shR.x, PALM_FLOOR_Y, shR.z + 0.04), v(0.2, 0.2, -1), {
        clavicle: { x: 24, y: 0, z: 0 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0, 0, 1),
        fingers: 'flat',
      });
    },
  },
  {
    id: 'parkour-vault',
    name: 'Parkour Vault',
    category: 'dance',
    tags: ['parkour', 'freerunning', 'vault', 'hurdle', 'aerial'],
    description: 'Dynamic speed-vault clearing an obstacle horizontally over one planted push-off hand',
    groundSnap: false,
    elevationY: 0.42,
    build: (p) => {
      p.setRootPelvisHeight(0.86);
      p.setPelvisOrientation({ x: 16, y: 20, z: -34 });
      p.setSpine(12, -12, 8);
      p.setHead({ x: -10, y: -12, z: 20 }, { x: -8, y: -6, z: 12 });
      const pelv = wp('pelvis');
      const shR = wp('upperarm_r');
      // Reach right push-off palm cleanly straight DOWN-OUTWARD below shoulder!
      p.solveArmTo('r', v(shR.x - 0.16, shR.y - 0.44, shR.z + 0.04), v(-0.4, 0.5, -0.7), {
        clavicle: { x: 8, y: 0, z: 0 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0, 0, 1),
        fingers: 'flat',
      });
      const shL = wp('upperarm_l');
      p.solveArmTo('l', shL.clone().add(v(0.24, 0.12, 0.22)), v(0.5, 0.3, -0.7), {
        clavicle: { x: 10, y: 0, z: -6 },
        palmNormal: v(0, -1, 0),
        fingerDir: v(0.5, 0.2, 0.8),
        fingers: 'open',
      });
      p.solveLegTo('l', pelv.clone().add(v(0.22, -0.18, 0.44)), v(0.7, 0.5, 0.5), {
        foot: { mode: 'pointed', pitchDeg: 45 },
      });
      p.solveLegTo('r', pelv.clone().add(v(0.06, -0.24, 0.36)), v(0.7, 0.4, 0.6), {
        foot: { mode: 'pointed', pitchDeg: 48 },
      });
    },
  },
  {
    id: 'baseball-pitch-windup',
    name: 'Baseball Pitch Wind-Up',
    category: 'dance',
    tags: ['baseball', 'pitcher', 'throw', 'windup', 'sports'],
    description: 'High-torque pitching delivery tucking the glove arm ahead of the coiled throwing shoulder',
    build: (p) => {
      p.setRootPelvisHeight(0.74);
      p.setPelvisOrientation({ x: 10, y: 12, z: -4 });
      p.setSpine(14, -44, -8);
      p.setHead({ x: -6, y: 34, z: 6 }, { x: -4, y: 14, z: 4 });
      p.solveLegTo('l', v(0.14, ANKLE_FLAT_Y, 0.42), v(0.14, 0.1, 1), {
        foot: { mode: 'flat', yawDeg: 4 },
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y + 0.04, -0.34), v(-0.18, 0, 1), {
        foot: { mode: 'ball', yawDeg: -38, pitchDeg: 28, ballDeg: 24 },
      });
      const chest = wp('spine_03');
      p.solveArmTo('l', v(chest.x + 0.12, chest.y - 0.04, chest.z + 0.34), v(0.6, -0.7, -0.3), {
        clavicle: { x: 4, y: 0, z: -12 },
        palmNormal: v(-0.8, 0.3, -0.4),
        fingerDir: v(-0.2, 0.8, 0.4),
        fingers: 'grip',
      });
      const shR = wp('upperarm_r');
      p.solveArmTo('r', shR.clone().add(v(-0.26, 0.26, -0.02)), v(-0.85, -0.45, -0.25), {
        clavicle: { x: 14, y: 0, z: -12 },
        palmNormal: v(0.2, 0.2, 0.96),
        fingerDir: v(0, 1, 0),
        fingers: 'grip',
        minElbowDeg: 65,
      });
    },
  },

  // =========================================================================
  // SEATED & EXPRESSIVE GESTURE (9)
  // =========================================================================
  {
    id: 'seated-casual',
    name: 'Seated Casual',
    category: 'gesture',
    tags: ['chair', 'sit', 'seated', 'portrait', 'rest'],
    description: 'Balanced upright seated study resting forearms lightly near the thighs',
    build: (p) => {
      p.setRootPelvisHeight(0.49);
      p.setPelvisOrientation({ x: -2, y: 0, z: 0 });
      p.setSpine(10, 0, 0);
      p.setHead({ x: 4, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
      p.solveLegTo('l', v(0.12, ANKLE_FLAT_Y, 0.38), v(0.14, 0.2, 1), {
        foot: { mode: 'flat', yawDeg: 6 },
      });
      p.solveLegTo('r', v(-0.12, ANKLE_FLAT_Y, 0.38), v(-0.14, 0.2, 1), {
        foot: { mode: 'flat', yawDeg: -6 },
      });
      p.solveArmTo('l', v(0.16, 0.56, 0.22), v(0.5, -0.3, -0.8), {
        clavicle: { x: -4, y: 0, z: -4 },
        palmNormal: v(-0.3, -0.95, 0),
        fingerDir: v(-0.1, -0.2, 0.96),
        fingers: 'relaxed',
      });
      p.solveArmTo('r', v(-0.16, 0.56, 0.22), v(-0.5, -0.3, -0.8), {
        clavicle: { x: -4, y: 0, z: 4 },
        palmNormal: v(0.3, -0.95, 0),
        fingerDir: v(0.1, -0.2, 0.96),
        fingers: 'relaxed',
      });
    },
  },
  {
    id: 'cross-legged-meditate',
    name: 'Cross-Legged Meditate',
    category: 'gesture',
    tags: ['lotus', 'meditate', 'zen', 'yoga', 'seated'],
    description: 'Centered cross-legged meditation seated quietly on the floor with open resting palms',
    build: (p) => {
      // Tilting pelvis slightly backward (-14) rotates thighs forward within -115 deg ROM while spine counters +12 upright!
      p.setRootPelvisHeight(0.09);
      p.setPelvisOrientation({ x: -14, y: 0, z: 0 });
      p.setSpine(12, 0, 0);
      p.setHead({ x: 8, y: 0, z: 0 }, { x: 4, y: 0, z: 0 });
      p.solveLegTo('l', v(-0.05, 0.08, 0.34), v(0.95, 0.05, 0.35), {
        foot: { mode: 'pointed', pitchDeg: 35, yawOffset: -18 },
      });
      p.solveLegTo('r', v(0.05, 0.05, 0.27), v(-0.95, 0.05, 0.35), {
        foot: { mode: 'pointed', pitchDeg: 35, yawOffset: 18 },
      });
      const kL = wp('calf_l');
      const kR = wp('calf_r');
      p.solveArmTo('l', v(kL.x - 0.02, kL.y + 0.06, kL.z - 0.02), v(0.5, -0.5, -0.7), {
        clavicle: { x: -4, y: 0, z: 0 },
        palmNormal: v(0, 0.95, 0.3),
        fingerDir: v(0.2, 0.1, 0.96),
        fingers: 'graceful',
      });
      p.solveArmTo('r', v(kR.x + 0.02, kR.y + 0.06, kR.z - 0.02), v(-0.5, -0.5, -0.7), {
        clavicle: { x: -4, y: 0, z: 0 },
        palmNormal: v(0, 0.95, 0.3),
        fingerDir: v(-0.2, 0.1, 0.96),
        fingers: 'graceful',
      });
    },
  },
  {
    id: 'exhausted-slouch',
    name: 'Exhausted Slouch',
    category: 'gesture',
    tags: ['tired', 'slouch', 'fatigued', 'emotion', 'sad'],
    description: 'Heavy rounded-shoulder fatigue collapsing the torso and bowing the head downward',
    build: (p) => {
      p.setRootPelvisHeight(0.84);
      p.setPelvisOrientation({ x: 8, y: 0, z: 0 });
      p.setSpine(44, 0, 0);
      p.setHead({ x: 32, y: 0, z: 0 }, { x: 24, y: 0, z: 0 });
      p.solveLegTo('l', v(0.13, ANKLE_FLAT_Y, -0.02), v(0.13, 0, 1), {
        foot: { mode: 'flat', yawDeg: 6 },
      });
      p.solveLegTo('r', v(-0.13, ANKLE_FLAT_Y, -0.02), v(-0.13, 0, 1), {
        foot: { mode: 'flat', yawDeg: -6 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', v(shL.x + 0.04, shL.y - 0.52, shL.z + 0.04), v(0.2, 0, -1), {
        clavicle: { x: -12, y: 0, z: -12 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0, -1, 0),
        fingers: 'relaxed',
      });
      p.solveArmTo('r', v(shR.x - 0.04, shR.y - 0.52, shR.z + 0.04), v(-0.2, 0, -1), {
        clavicle: { x: -12, y: 0, z: 12 },
        palmNormal: v(1, 0, 0),
        fingerDir: v(0, -1, 0),
        fingers: 'relaxed',
      });
    },
  },
  {
    id: 'arms-crossed-confident',
    name: 'Arms Crossed Confident',
    category: 'gesture',
    tags: ['arms-crossed', 'attitude', 'confident', 'standing', 'guard'],
    description: 'Self-assured standing attitude with folded forearms tucked securely across the chest',
    build: (p) => {
      p.setRootPelvisHeight(0.90);
      p.setPelvisOrientation({ x: 0, y: -12, z: 4 });
      p.setSpine(-4, 8, -4);
      p.setHead({ x: -2, y: 6, z: 0 }, { x: -2, y: 6, z: 2 });
      p.solveLegTo('l', v(0.11, ANKLE_FLAT_Y, 0.06), v(0.12, 0, 1), {
        foot: { mode: 'flat', yawDeg: 8 },
      });
      p.solveLegTo('r', v(-0.10, ANKLE_FLAT_Y, -0.04), v(-0.10, 0, 1), {
        foot: { mode: 'flat', yawDeg: -10 },
      });
      const chest = wp('spine_02');
      p.solveArmTo('l', v(chest.x - 0.04, chest.y + 0.02, chest.z + 0.21), v(0.85, -0.5, 0.2), {
        clavicle: { x: 0, y: 0, z: -12 },
        palmNormal: v(0, 0, -1),
        fingerDir: v(-0.98, 0.1, 0),
        fingers: 'relaxed',
      });
      p.solveArmTo('r', v(chest.x + 0.04, chest.y + 0.06, chest.z + 0.25), v(-0.85, -0.5, 0.2), {
        clavicle: { x: 0, y: 0, z: 12 },
        palmNormal: v(0, 0, -1),
        fingerDir: v(0.98, 0.15, 0),
        fingers: 'relaxed',
      });
    },
  },
  {
    id: 'casual-hip-lean',
    name: 'Casual Hip Lean',
    category: 'gesture',
    tags: ['lean', 'sass', 'fashion', 'pose', 'standing'],
    description: 'Asymmetric relaxed hip lean with one hand perched on the waist and crossed ankles',
    build: (p) => {
      p.setRootPelvisHeight(0.895);
      p.setPelvisOrientation({ x: 2, y: 8, z: -9 });
      p.setSpine(-4, -10, 11);
      p.setHead({ x: 4, y: -4, z: -6 }, { x: 2, y: -4, z: -6 });
      p.solveLegTo('r', v(-0.07, ANKLE_FLAT_Y, -0.02), v(-0.08, 0, 1), {
        foot: { mode: 'flat', yawDeg: -8 },
      });
      p.solveLegTo('l', v(0.15, ANKLE_FLAT_Y + 0.025, 0.12), v(0.18, 0, 1), {
        foot: { mode: 'ball', yawDeg: 22, pitchDeg: 16, ballDeg: 14 },
      });
      const pelv = wp('pelvis');
      p.solveArmTo('r', v(pelv.x - 0.175, pelv.y + 0.08, pelv.z + 0.04), v(-1, 0, -0.35), {
        clavicle: { x: 2, y: 0, z: -4 },
        palmNormal: v(1, -0.2, 0),
        fingerDir: v(0.2, -0.7, 0.6),
        fingers: 'relaxed',
      });
      p.solveArmTo('l', v(0.29, 0.88, 0.06), v(0.3, -0.2, -1), {
        clavicle: { x: -6, y: 0, z: 2 },
        palmNormal: v(-1, 0, 0),
        fingerDir: v(0, -0.95, 0.2),
        fingers: 'graceful',
      });
    },
  },
  {
    id: 'over-the-shoulder-turn',
    name: 'Over-the-Shoulder Turn',
    category: 'gesture',
    tags: ['look-back', 'portrait', 'twist', 'cinematic', 'fashion'],
    description: 'Dynamic contrapposto twist turning shoulders and chin cleanly back over one shoulder',
    build: (p) => {
      p.setRootPelvisHeight(0.90);
      p.setPelvisOrientation({ x: 2, y: 74, z: -4 });
      p.setSpine(-4, 32, 2);
      p.setHead({ x: 4, y: -44, z: -6 }, { x: 2, y: -42, z: -6 });
      p.solveLegTo('r', v(-0.04, ANKLE_FLAT_Y, 0.08), v(0.2, 0, 0.9), {
        foot: { mode: 'flat', yawDeg: 64 },
      });
      p.solveLegTo('l', v(-0.10, ANKLE_FLAT_Y + 0.02, -0.10), v(0.4, 0, 0.9), {
        foot: { mode: 'ball', yawDeg: 74, pitchDeg: 14, ballDeg: 14 },
      });
      const chestQ = wq('spine_03');
      const chestBack = v(0, 0, -1).applyQuaternion(chestQ);
      const chestLeft = v(1, 0, 0).applyQuaternion(chestQ);
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      // Hang arms cleanly beside outer thighs (clear of waist/stomach!)
      p.solveArmTo(
        'r',
        shR.clone().add(v(0, -0.48, 0)).addScaledVector(chestLeft, -0.06),
        chestBack.clone().addScaledVector(chestLeft, -0.35),
        {
          clavicle: { x: -4, y: 0, z: 0 },
          palmNormal: chestLeft.clone(),
          fingerDir: v(0, -0.96, 0),
          fingers: 'graceful',
        }
      );
      p.solveArmTo(
        'l',
        shL.clone().add(v(0, -0.48, 0)).addScaledVector(chestLeft, 0.06),
        chestBack.clone().addScaledVector(chestLeft, 0.35),
        {
          clavicle: { x: -4, y: 0, z: 0 },
          palmNormal: chestLeft.clone().negate(),
          fingerDir: v(0, -0.96, 0),
          fingers: 'graceful',
        }
      );
    },
  },
  {
    id: 'reaching-skyward',
    name: 'Reaching Skyward',
    category: 'gesture',
    tags: ['reach', 'sky', 'hope', 'stretch', 'dramatic'],
    description: 'Long upward stretch balancing on toes while extending one hand open toward the sky',
    build: (p) => {
      p.setRootPelvisHeight(0.955);
      p.setPelvisOrientation({ x: -4, y: 8, z: -4 });
      p.setSpine(-14, -6, 6);
      p.setHead({ x: -28, y: -4, z: 0 }, { x: -22, y: 0, z: 0 });
      p.solveLegTo('l', v(0.11, ANKLE_FLAT_Y + 0.055, 0.04), v(0.12, 0, 1), {
        foot: { mode: 'ball', yawDeg: 6, pitchDeg: 38, ballDeg: 36 },
      });
      p.solveLegTo('r', v(-0.11, ANKLE_FLAT_Y + 0.055, -0.02), v(-0.12, 0, 1), {
        foot: { mode: 'ball', yawDeg: -6, pitchDeg: 38, ballDeg: 36 },
      });
      const shL = wp('upperarm_l');
      p.solveArmTo('l', shL.clone().add(v(0.10, 0.50, 0.12)), v(0.45, -0.55, 0.45), {
        clavicle: { x: 24, y: 0, z: 0 },
        palmNormal: v(-0.9, -0.2, 0.3),
        fingerDir: v(0, 0.96, 0.25),
        fingers: 'open',
      });
      p.solveArmTo('r', v(-0.40, 1.16, 0.22), v(-0.5, -0.5, -0.6), {
        clavicle: { x: -2, y: 0, z: 0 },
        palmNormal: v(0.5, -0.5, 0.7),
        fingerDir: v(-0.5, -0.6, 0.6),
        fingers: 'graceful',
      });
    },
  },
  {
    id: 'kneeling-despair',
    name: 'Kneeling Despair',
    category: 'gesture',
    tags: ['platoon', 'grief', 'anguish', 'dramatic', 'kneel'],
    description: 'Dramatic double-knee drop throwing the chest open and palms upward in anguish',
    build: (p) => {
      p.setRootPelvisHeight(0.46);
      p.setPelvisOrientation({ x: -12, y: 0, z: 0 });
      p.setSpine(-38, 0, 0);
      p.setHead({ x: -28, y: 0, z: 0 }, { x: -22, y: 0, z: 0 });
      p.solveLegTo('l', v(0.14, 0.19, -0.38), v(0.14, -0.9, 1), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      p.solveLegTo('r', v(-0.14, 0.19, -0.38), v(-0.14, -0.9, 1), {
        foot: { mode: 'pointed', pitchDeg: 52 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(0.28, -0.34, 0.16)), v(0.3, -0.9, -0.3), {
        clavicle: { x: 10, y: 0, z: 12 },
        palmNormal: v(0, 0.85, 0.5),
        fingerDir: v(0.7, 0.2, 0.6),
        fingers: 'open',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.28, -0.34, 0.16)), v(-0.3, -0.9, -0.3), {
        clavicle: { x: 10, y: 0, z: -12 },
        palmNormal: v(0, 0.85, 0.5),
        fingerDir: v(-0.7, 0.2, 0.6),
        fingers: 'open',
      });
    },
  },
  {
    id: 'victory-arms-raised',
    name: 'Victory Arms Raised',
    category: 'gesture',
    tags: ['victory', 'triumph', 'champion', 'celebration', 'v-pose'],
    description: 'Triumphant V-arm celebration thrusting twin fists skyward with chest lifted high',
    build: (p) => {
      p.setRootPelvisHeight(0.895);
      p.setPelvisOrientation({ x: -2, y: 0, z: 0 });
      p.setSpine(-14, 0, 0);
      p.setHead({ x: -22, y: 0, z: 0 }, { x: -16, y: 0, z: 0 });
      p.solveLegTo('l', v(0.18, ANKLE_FLAT_Y, 0.02), v(0.20, 0, 1), {
        foot: { mode: 'flat', yawDeg: 14 },
      });
      p.solveLegTo('r', v(-0.18, ANKLE_FLAT_Y, 0.02), v(-0.20, 0, 1), {
        foot: { mode: 'flat', yawDeg: -14 },
      });
      const shL = wp('upperarm_l');
      const shR = wp('upperarm_r');
      p.solveArmTo('l', shL.clone().add(v(0.24, 0.44, 0.16)), v(0.4, -0.6, 0.4), {
        clavicle: { x: 22, y: 0, z: 0 },
        palmNormal: v(-0.6, 0, 0.8),
        fingerDir: v(0.4, 0.9, 0.2),
        fingers: 'fist',
      });
      p.solveArmTo('r', shR.clone().add(v(-0.24, 0.44, 0.16)), v(-0.4, -0.6, 0.4), {
        clavicle: { x: 22, y: 0, z: 0 },
        palmNormal: v(0.6, 0, 0.8),
        fingerDir: v(-0.4, 0.9, 0.2),
        fingers: 'fist',
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Execute Solver on All 50 Poses & Audit Kinematics
// ---------------------------------------------------------------------------
const solvedPoses = [];
let auditWarnings = 0;

for (const recipe of POSE_RECIPES) {
  const builder = new PoseBuilder();
  recipe.build(builder);

  // Verify exact clamping & collect output
  const finalBones = {};
  for (const [bName, ang] of Object.entries(builder.bones)) {
    const spec = getJointSpec(bName);
    const clamped = clampJointAngles(ang, spec, true);
    if (clamped.x !== 0 || clamped.y !== 0 || clamped.z !== 0) {
      finalBones[bName] = clamped;
    }
  }

  // Re-evaluate pose strictly from finalBones to audit true FK geometry (shifted so ankle/lowest point is normalized)
  rootGroup.position.set(0, 0, 0);
  for (const [name, q] of restQ.entries()) {
    byName.get(name).quaternion.copy(q);
  }
  for (const [bName, ang] of Object.entries(finalBones)) {
    const spec = getJointSpec(bName);
    const e = new THREE.Euler(
      THREE.MathUtils.degToRad(ang.x),
      THREE.MathUtils.degToRad(ang.y),
      THREE.MathUtils.degToRad(ang.z),
      spec.order
    );
    byName
      .get(bName)
      .quaternion.copy(restQ.get(bName))
      .multiply(new THREE.Quaternion().setFromEuler(e))
      .normalize();
  }
  rootGroup.updateMatrixWorld(true);

  const keyNames = [
    'pelvis',
    'spine_01',
    'spine_02',
    'spine_03',
    'Head',
    'upperarm_l',
    'lowerarm_l',
    'hand_l',
    'middle_03_l',
    'upperarm_r',
    'lowerarm_r',
    'hand_r',
    'middle_03_r',
    'thigh_l',
    'calf_l',
    'foot_l',
    'ball_l',
    'thigh_r',
    'calf_r',
    'foot_r',
    'ball_r',
  ];
  const pts = {};
  let minBoneY = Infinity;
  for (const k of keyNames) {
    const p = wp(k);
    pts[k] = p;
    if (p.y < minBoneY) minBoneY = p.y;
  }

  // Approximate lowest skin Y across feet / knees / hands / pelvis
  const estSkinMinY = Math.min(
    pts.foot_l.y - 0.10,
    pts.foot_r.y - 0.10,
    pts.ball_l.y - 0.02,
    pts.ball_r.y - 0.02,
    pts.calf_l.y - 0.055,
    pts.calf_r.y - 0.055,
    pts.hand_l.y - 0.036,
    pts.hand_r.y - 0.036,
    pts.middle_03_l.y - 0.02,
    pts.middle_03_r.y - 0.02,
    pts.pelvis.y - 0.08
  );
  for (const k of keyNames) {
    pts[k].y -= estSkinMinY;
  }

  const hLChest = pts.hand_l.distanceTo(pts.spine_03);
  const hRChest = pts.hand_r.distanceTo(pts.spine_03);
  const hMid = pts.hand_l.distanceTo(pts.hand_r);
  const kneeDist = pts.calf_l.distanceTo(pts.calf_r);
  const ankleDist = pts.foot_l.distanceTo(pts.foot_r);

  const flags = [];
  if (kneeDist < 0.12) flags.push(`KNEES_CLOSE(${kneeDist.toFixed(2)})`);
  if (ankleDist < 0.09) flags.push(`ANKLES_CLOSE(${ankleDist.toFixed(2)})`);
  if (hLChest < 0.14 && !['the-thinker'].includes(recipe.id)) {
    flags.push(`HAND_L_IN_CHEST(${hLChest.toFixed(2)})`);
  }
  if (hRChest < 0.14 && !['the-thinker'].includes(recipe.id)) {
    flags.push(`HAND_R_IN_CHEST(${hRChest.toFixed(2)})`);
  }
  if (flags.length > 0) auditWarnings += 1;

  console.log(
    `${recipe.id.padEnd(23)} | bones=${String(Object.keys(finalBones).length).padStart(2)} | fL.y=${pts.foot_l.y.toFixed(2)} fR.y=${pts.foot_r.y.toFixed(2)} bL.y=${pts.ball_l.y.toFixed(2)} bR.y=${pts.ball_r.y.toFixed(2)} hL.y=${pts.hand_l.y.toFixed(2)} hR.y=${pts.hand_r.y.toFixed(2)} hDist=${hMid.toFixed(2)} | ${flags.join(' ; ') || 'OK'}`
  );

  solvedPoses.push({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    tags: recipe.tags,
    description: recipe.description,
    groundSnap: recipe.groundSnap,
    elevationY: recipe.elevationY,
    bones: finalBones,
  });
}

// ---------------------------------------------------------------------------
// Generate TypeScript source file src/data/poses.ts
// ---------------------------------------------------------------------------
const outLines = [
  `import type { JointAngles } from '@/types/anatomy';`,
  ``,
  `export type PoseCategory =`,
  `  | 'foundation'`,
  `  | 'classical'`,
  `  | 'action'`,
  `  | 'combat'`,
  `  | 'dance'`,
  `  | 'gesture';`,
  ``,
  `export interface PoseCategoryMeta {`,
  `  id: PoseCategory;`,
  `  label: string;`,
  `  fullLabel: string;`,
  `}`,
  ``,
  `export const POSE_CATEGORIES: readonly PoseCategoryMeta[] = [`,
  `  { id: 'foundation', label: 'Foundation', fullLabel: 'Foundation' },`,
  `  { id: 'classical', label: 'Classical', fullLabel: 'Classical & Fine Art' },`,
  `  { id: 'action', label: 'Action', fullLabel: 'Action & Comic Hero' },`,
  `  { id: 'combat', label: 'Combat', fullLabel: 'Martial Arts & Combat' },`,
  `  { id: 'dance', label: 'Dance', fullLabel: 'Dance & Athletics' },`,
  `  { id: 'gesture', label: 'Gesture', fullLabel: 'Seated & Expressive Gesture' },`,
  `];`,
  ``,
  `export interface PosePreset {`,
  `  id: string;`,
  `  label: string;`,
  `  name: string;`,
  `  category: PoseCategory;`,
  `  tags: readonly string[];`,
  `  description: string;`,
  `  groundSnap: boolean;`,
  `  elevationY: number;`,
  `  bones: Record<string, JointAngles>;`,
  `}`,
  ``,
  `function makePose(spec: {`,
  `  id: string;`,
  `  name: string;`,
  `  category: PoseCategory;`,
  `  tags: readonly string[];`,
  `  description: string;`,
  `  groundSnap?: boolean;`,
  `  elevationY?: number;`,
  `  bones: Record<string, JointAngles>;`,
  `}): PosePreset {`,
  `  return {`,
  `    id: spec.id,`,
  `    label: spec.name,`,
  `    name: spec.name,`,
  `    category: spec.category,`,
  `    tags: spec.tags,`,
  `    description: spec.description,`,
  `    groundSnap: spec.groundSnap ?? true,`,
  `    elevationY: spec.elevationY ?? 0,`,
  `    bones: spec.bones,`,
  `  };`,
  `}`,
  ``,
  `// Generated by scripts/solvePoses.mjs using 3D analytical IK against public/models/anatomy.glb`,
  `export const POSE_PRESETS: readonly PosePreset[] = [`,
];

for (const pose of solvedPoses) {
  outLines.push(`  makePose({`);
  outLines.push(`    id: ${JSON.stringify(pose.id)},`);
  outLines.push(`    name: ${JSON.stringify(pose.name)},`);
  outLines.push(`    category: ${JSON.stringify(pose.category)},`);
  outLines.push(`    tags: ${JSON.stringify(pose.tags)},`);
  outLines.push(`    description: ${JSON.stringify(pose.description)},`);
  if (pose.groundSnap === false) {
    outLines.push(`    groundSnap: false,`);
    outLines.push(`    elevationY: ${pose.elevationY},`);
  }
  const boneEntries = Object.entries(pose.bones);
  if (boneEntries.length === 0) {
    outLines.push(`    bones: {},`);
  } else {
    outLines.push(`    bones: {`);
    for (const [bName, ang] of boneEntries) {
      outLines.push(`      ${bName}: { x: ${ang.x}, y: ${ang.y}, z: ${ang.z} },`);
    }
    outLines.push(`    },`);
  }
  outLines.push(`  }),`);
}

outLines.push(`];`);
outLines.push(``);
outLines.push(`export function getPosePreset(id: string): PosePreset | undefined {`);
outLines.push(`  return POSE_PRESETS.find((preset) => preset.id === id);`);
outLines.push(`}`);
outLines.push(``);
outLines.push(`export function filterPosePresets(`);
outLines.push(`  query: string,`);
outLines.push(`  category: PoseCategory | 'all'`);
outLines.push(`): PosePreset[] {`);
outLines.push(`  const normalizedQuery = query.trim().toLowerCase();`);
outLines.push(``);
outLines.push(`  return POSE_PRESETS.filter((preset) => {`);
outLines.push(`    if (category !== 'all' && preset.category !== category) {`);
outLines.push(`      return false;`);
outLines.push(`    }`);
outLines.push(`    if (!normalizedQuery) {`);
outLines.push(`      return true;`);
outLines.push(`    }`);
outLines.push(
  `    const haystack = \`\${preset.name} \${preset.category} \${preset.tags.join(' ')} \${preset.description}\`.toLowerCase();`
);
outLines.push(`    return haystack.includes(normalizedQuery);`);
outLines.push(`  });`);
outLines.push(`}`);
outLines.push(``);

fs.writeFileSync(
  path.join(process.cwd(), 'src/data/poses.ts'),
  outLines.join('\n'),
  'utf8'
);

console.log(
  `\nGenerated ${solvedPoses.length} poses in src/data/poses.ts (audit warnings: ${auditWarnings}).`
);
