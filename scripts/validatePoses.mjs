import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
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

const { POSEABLE_BONE_NAMES } = require('@/types/anatomy');
const { getJointSpec, clampJointAngles } = require('@/data/jointLimits');
const { POSE_PRESETS } = require('@/data/poses');

const EXPECTED_CATEGORY_COUNTS = {
  foundation: 5,
  classical: 10,
  action: 10,
  combat: 8,
  dance: 8,
  gesture: 9,
};

const poseableSet = new Set(POSEABLE_BONE_NAMES);
const seenIds = new Set();
const seenNames = new Set();
const categoryCounts = {
  foundation: 0,
  classical: 0,
  action: 0,
  combat: 0,
  dance: 0,
  gesture: 0,
};

const errors = [];

if (POSE_PRESETS.length !== 50) {
  errors.push(`Expected exactly 50 poses, found ${POSE_PRESETS.length}`);
}

for (const preset of POSE_PRESETS) {
  if (seenIds.has(preset.id)) {
    errors.push(`Duplicate pose id: "${preset.id}"`);
  }
  seenIds.add(preset.id);

  if (seenNames.has(preset.name)) {
    errors.push(`Duplicate pose name: "${preset.name}"`);
  }
  seenNames.add(preset.name);

  if (!(preset.category in categoryCounts)) {
    errors.push(`Unknown category "${preset.category}" on "${preset.id}"`);
  } else {
    categoryCounts[preset.category] += 1;
  }

  if (preset.groundSnap) {
    if (preset.elevationY !== 0) {
      errors.push(
        `Pose "${preset.id}" has groundSnap=true but elevationY=${preset.elevationY}`
      );
    }
  } else if (!(preset.elevationY > 0)) {
    errors.push(
      `Aerial pose "${preset.id}" has groundSnap=false but elevationY=${preset.elevationY}`
    );
  }

  for (const [boneName, angles] of Object.entries(preset.bones)) {
    if (!poseableSet.has(boneName)) {
      errors.push(`Pose "${preset.id}" references invalid bone "${boneName}"`);
      continue;
    }

    for (const axis of ['x', 'y', 'z']) {
      if (!Number.isFinite(angles[axis])) {
        errors.push(
          `Pose "${preset.id}" bone "${boneName}.${axis}" is not finite: ${angles[axis]}`
        );
      }
    }

    const spec = getJointSpec(boneName);
    const clamped = clampJointAngles(angles, spec, true);
    if (
      clamped.x !== angles.x ||
      clamped.y !== angles.y ||
      clamped.z !== angles.z
    ) {
      errors.push(
        `Pose "${preset.id}" bone "${boneName}" exceeds ROM or uses locked axis: raw=${JSON.stringify(angles)}, clamped=${JSON.stringify(clamped)}`
      );
    }
  }
}

for (const [cat, expected] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
  if (categoryCounts[cat] !== expected) {
    errors.push(
      `Category "${cat}" expected ${expected} poses, got ${categoryCounts[cat]}`
    );
  }
}

if (errors.length > 0) {
  console.error('Pose library validation FAILED:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}

console.log(
  `VALIDATED ${POSE_PRESETS.length} POSES (categories=${JSON.stringify(categoryCounts)}, 0 ROM/bone violations)`
);
