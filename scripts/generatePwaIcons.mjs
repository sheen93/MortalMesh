import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'icons');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// CRC32 table for valid PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePngRgba(width, height, pixels) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function distSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq)) : 0;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function distCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function renderMonochromeStudioIcon(size, safeScale = 1.0) {
  const pixels = Buffer.alloc(size * size * 4);

  // Studio neutral dark charcoal #1B1D21 background with crisp monochrome #F4F4F5 emblem
  const bgR = 0x1b;
  const bgG = 0x1d;
  const bgB = 0x21;
  const accentR = 0x2a;
  const accentG = 0x2e;
  const accentB = 0x36;
  const fgR = 0xf4;
  const fgG = 0xf4;
  const fgB = 0xf5;
  const midR = 0xa1;
  const midG = 0xa1;
  const midB = 0xaa;

  const half = size / 2;
  const unit = (size / 2) * safeScale;
  const stroke = Math.max(2.2, unit * 0.085);
  const aa = 1.15;

  // Isometric hexagon + anatomical joint nodes inside unit box [-1, 1]
  const pts = [
    [0, -0.68], // top
    [0.59, -0.34], // top-right
    [0.59, 0.34], // bottom-right
    [0, 0.68], // bottom
    [-0.59, 0.34], // bottom-left
    [-0.59, -0.34], // top-left
  ].map(([x, y]) => [half + x * unit, half + y * unit]);

  const center = [half, half];

  const edges = [
    [pts[0], pts[1]],
    [pts[1], pts[2]],
    [pts[2], pts[3]],
    [pts[3], pts[4]],
    [pts[4], pts[5]],
    [pts[5], pts[0]],
    [pts[1], center],
    [pts[5], center],
    [center, pts[3]],
  ];

  // Subtle anatomical head + shoulder horizon crossbar
  const headCenter = [half, half - 0.14 * unit];
  const nodePositions = [pts[0], pts[1], pts[3], pts[5], center];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Base background radial vignette from subtle slate #2A2E36 center to #1B1D21 edge
      const rad = Math.min(1, Math.hypot(px - half, py - half) / (half * 1.1));
      let r = bgR + (accentR - bgR) * (1 - rad * 0.85);
      let g = bgG + (accentG - bgG) * (1 - rad * 0.85);
      let b = bgB + (accentB - bgB) * (1 - rad * 0.85);

      // Faint inner frame ring for maskable/adaptive crispness
      const ringDist = Math.abs(Math.hypot(px - half, py - half) - unit * 0.82) - stroke * 0.22;
      if (ringDist < aa) {
        const alpha = Math.max(0, Math.min(1, (aa - ringDist) / (2 * aa))) * 0.26;
        r = r * (1 - alpha) + midR * alpha;
        g = g * (1 - alpha) + midG * alpha;
        b = b * (1 - alpha) + midB * alpha;
      }

      // Edges
      let minEdgeDist = Infinity;
      for (const [a, c] of edges) {
        const d = distSegment(px, py, a[0], a[1], c[0], c[1]) - stroke * 0.52;
        if (d < minEdgeDist) minEdgeDist = d;
      }

      // Joint node dots + inner silhouette disc
      let minNodeDist = distCircle(
        px,
        py,
        headCenter[0],
        headCenter[1],
        stroke * 0.85
      );
      for (const np of nodePositions) {
        const d = distCircle(px, py, np[0], np[1], stroke * 0.92);
        if (d < minNodeDist) minNodeDist = d;
      }

      const dShape = Math.min(minEdgeDist, minNodeDist);
      if (dShape < aa) {
        const alpha = Math.max(0, Math.min(1, (aa - dShape) / (2 * aa)));
        r = r * (1 - alpha) + fgR * alpha;
        g = g * (1 - alpha) + fgG * alpha;
        b = b * (1 - alpha) + fgB * alpha;
      }

      const idx = (y * size + x) * 4;
      pixels[idx] = Math.round(r);
      pixels[idx + 1] = Math.round(g);
      pixels[idx + 2] = Math.round(b);
      pixels[idx + 3] = 255;
    }
  }

  return encodePngRgba(size, size, pixels);
}

const specs = [
  { filename: 'icon-192.png', size: 192, safeScale: 0.82 },
  { filename: 'icon-512.png', size: 512, safeScale: 0.82 },
  // >= 22% safe-zone inset on maskable 512 for Samsung One UI adaptive icons
  { filename: 'icon-maskable-512.png', size: 512, safeScale: 0.62 },
  { filename: 'apple-touch-icon.png', size: 180, safeScale: 0.8 },
];

for (const spec of specs) {
  const png = renderMonochromeStudioIcon(spec.size, spec.safeScale);
  const outPath = path.join(OUTPUT_DIR, spec.filename);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${spec.size}x${spec.size}, ${png.length} bytes)`);
}
