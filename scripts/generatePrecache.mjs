import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const NEXT_STATIC_DIR = path.join(ROOT_DIR, '.next', 'static');
const PUBLIC_ICONS_DIR = path.join(ROOT_DIR, 'public', 'icons');
const OUTPUT_FILE = path.join(ROOT_DIR, 'public', 'sw-precache.json');

const CORE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/models/anatomy.glb',
  '/draco/draco_decoder.js',
  '/draco/draco_decoder.wasm',
  '/draco/draco_wasm_wrapper.js',
];

const OPTIONAL_MODEL_URLS = [
  '/models/mannequin-2.glb',
  '/models/mannequin-3.glb',
  '/models/mannequin-female.glb',
  '/models/skeleton-rig.glb',
];

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

if (!fs.existsSync(NEXT_STATIC_DIR)) {
  throw new Error(
    `.next/static directory not found at ${NEXT_STATIC_DIR}. Run next build first.`
  );
}

const urlSet = new Set(CORE_URLS);
const hash = crypto.createHash('sha256');

const iconFiles = walkFiles(PUBLIC_ICONS_DIR).filter((file) =>
  file.endsWith('.png')
);
for (const absPath of iconFiles) {
  const rel = path.relative(path.join(ROOT_DIR, 'public'), absPath);
  const url = '/' + rel.split(path.sep).join('/');
  urlSet.add(url);
}

const nextStaticFiles = walkFiles(NEXT_STATIC_DIR).filter(
  (file) => !file.endsWith('.map')
);
for (const absPath of nextStaticFiles) {
  const rel = path.relative(NEXT_STATIC_DIR, absPath);
  const url = '/_next/static/' + rel.split(path.sep).map(encodeURIComponent).join('/');
  urlSet.add(url);
}

const urls = Array.from(urlSet).sort();
const optionalModelUrls = OPTIONAL_MODEL_URLS.filter((url) =>
  fs.existsSync(path.join(ROOT_DIR, 'public', url.replace(/^\//, '')))
);

for (const url of urls) {
  hash.update(url);
  hash.update('\n');
}

const allModelUrls = ['/models/anatomy.glb', ...optionalModelUrls];
for (const modelUrl of allModelUrls) {
  const modelFile = path.join(ROOT_DIR, 'public', modelUrl.replace(/^\//, ''));
  if (fs.existsSync(modelFile)) {
    const stat = fs.statSync(modelFile);
    hash.update(`${modelUrl}:${stat.size}:`);
    hash.update(fs.readFileSync(modelFile));
    hash.update('\n');
  }
}

const buildIdPath = path.join(ROOT_DIR, '.next', 'BUILD_ID');
if (fs.existsSync(buildIdPath)) {
  hash.update(fs.readFileSync(buildIdPath, 'utf8'));
}

const version = hash.digest('hex').slice(0, 12);
const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  urls,
  optionalModelUrls,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Generated public/sw-precache.json (version=${version}, ${urls.length} core URLs, ${optionalModelUrls.length} optional models)`
);
