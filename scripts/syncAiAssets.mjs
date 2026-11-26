import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const FORCE_DOWNLOAD = process.argv.includes('--force');

const MP_WASM_DIR = path.join(
  ROOT_DIR,
  'node_modules',
  '@mediapipe',
  'tasks-vision',
  'wasm'
);
const PUBLIC_AI_WASM_DIR = path.join(ROOT_DIR, 'public', 'ai', 'wasm');
const PUBLIC_AI_MODELS_DIR = path.join(ROOT_DIR, 'public', 'ai', 'models');

const REQUIRED_WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
];

const OPTIONAL_WASM_FILES = [
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

const TASK_MODELS = [
  {
    filename: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
    minBytes: 1_000_000,
    maxBytes: 15_000_000,
  },
  {
    filename: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
    minBytes: 1_000_000,
    maxBytes: 15_000_000,
  },
];

const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const TFLITE_SIG = Buffer.from('TFL3', 'ascii');

function isValidTaskBuffer(buf, minBytes, maxBytes) {
  if (!buf || buf.length < minBytes || buf.length > maxBytes) return false;
  const head = buf.subarray(0, 64);
  return head.includes(ZIP_SIG) || head.includes(TFLITE_SIG);
}

function isValidTaskFile(filePath, minBytes, maxBytes) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < minBytes || stat.size > maxBytes) {
    return false;
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(64);
    fs.readSync(fd, header, 0, 64, 0);
    return header.includes(ZIP_SIG) || header.includes(TFLITE_SIG);
  } finally {
    fs.closeSync(fd);
  }
}

async function syncWasmRuntime() {
  if (!fs.existsSync(MP_WASM_DIR)) {
    throw new Error(
      `Missing MediaPipe WASM folder at ${MP_WASM_DIR}. Run npm install first.`
    );
  }

  fs.mkdirSync(PUBLIC_AI_WASM_DIR, { recursive: true });

  for (const filename of REQUIRED_WASM_FILES) {
    const src = path.join(MP_WASM_DIR, filename);
    const dst = path.join(PUBLIC_AI_WASM_DIR, filename);
    if (!fs.existsSync(src)) {
      throw new Error(`Required MediaPipe WASM file missing: ${src}`);
    }
    const stat = fs.statSync(src);
    if (stat.size <= 0 || stat.size > 15_000_000) {
      throw new Error(
        `Unexpected WASM asset size for ${filename}: ${stat.size} bytes`
      );
    }
    fs.copyFileSync(src, dst);
    console.log(`Synced WASM runtime: public/ai/wasm/${filename} (${stat.size} bytes)`);
  }

  for (const filename of OPTIONAL_WASM_FILES) {
    const src = path.join(MP_WASM_DIR, filename);
    if (fs.existsSync(src)) {
      const dst = path.join(PUBLIC_AI_WASM_DIR, filename);
      fs.copyFileSync(src, dst);
      const stat = fs.statSync(dst);
      console.log(`Synced optional WASM runtime: public/ai/wasm/${filename} (${stat.size} bytes)`);
    }
  }
}

async function syncModels() {
  fs.mkdirSync(PUBLIC_AI_MODELS_DIR, { recursive: true });

  for (const model of TASK_MODELS) {
    const dst = path.join(PUBLIC_AI_MODELS_DIR, model.filename);
    if (!FORCE_DOWNLOAD && isValidTaskFile(dst, model.minBytes, model.maxBytes)) {
      const stat = fs.statSync(dst);
      console.log(
        `Verified existing model: public/ai/models/${model.filename} (${stat.size} bytes)`
      );
      continue;
    }

    console.log(`Downloading ${model.filename} from ${model.url}...`);
    const res = await fetch(model.url);
    if (!res.ok) {
      throw new Error(
        `Failed to download ${model.filename}: HTTP ${res.status} ${res.statusText}`
      );
    }
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (!isValidTaskBuffer(buf, model.minBytes, model.maxBytes)) {
      throw new Error(
        `Downloaded ${model.filename} failed validation (size=${buf.length})`
      );
    }

    const tmp = `${dst}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dst);
    console.log(
      `Saved model: public/ai/models/${model.filename} (${buf.length} bytes)`
    );
  }
}

async function main() {
  await syncWasmRuntime();
  await syncModels();
  console.log('AI Vision assets synced and verified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
