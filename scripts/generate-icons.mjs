// Generates icons/icon16.png, icon48.png, icon128.png for the extension.
// Dependency-free: renders the logo (rounded gradient square + knowledge-graph
// spark) into a raw RGBA buffer at 4x supersampling, box-downsamples, and
// writes a valid PNG using Node's built-in zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- PNG writer
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ renderer
// All coordinates are fractions of the icon size, matching src/components/Logo.jsx.
const NODES = [
  { x: 0.5, y: 0.5, r: 0.135 }, // center
  { x: 0.27, y: 0.29, r: 0.072 },
  { x: 0.73, y: 0.27, r: 0.058 },
  { x: 0.75, y: 0.65, r: 0.066 },
  { x: 0.31, y: 0.73, r: 0.054 },
];
const EDGES = NODES.slice(1).map((n) => [NODES[0], n]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Brand gradient: violet #a78bfa → #8b5cf6 → blue #3b82f6, diagonal.
function gradientAt(t) {
  const stops = [
    [0.0, [167, 139, 250]],
    [0.5, [139, 92, 246]],
    [1.0, [59, 130, 246]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return stops[stops.length - 1][1];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Render one pixel (u,v in 0..1) → [r,g,b,a 0..255]. */
function shade(u, v, size) {
  const cornerR = 0.24;
  // Rounded-rect mask (signed distance)
  const qx = Math.abs(u - 0.5) - (0.5 - cornerR);
  const qy = Math.abs(v - 0.5) - (0.5 - cornerR);
  const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - cornerR;
  if (dist > 0) return [0, 0, 0, 0];

  let [r, g, b] = gradientAt((u + v) / 2);

  // Edges (white lines)
  const lineW = Math.max(0.022, 1.6 / size);
  let white = 0;
  for (const [a, c] of EDGES) {
    if (distToSegment(u, v, a.x, a.y, c.x, c.y) < lineW) white = Math.max(white, 0.85);
  }
  // Nodes (white circles)
  for (const n of NODES) {
    if (Math.hypot(u - n.x, v - n.y) < n.r) white = 1;
  }
  if (white > 0) {
    r = lerp(r, 255, white);
    g = lerp(g, 255, white);
    b = lerp(b, 255, white);
  }
  return [r, g, b, 255];
}

function renderIcon(size) {
  const ss = 4; // supersampling factor for smooth edges
  const big = size * ss;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x * ss + sx + 0.5) / big;
          const v = (y * ss + sy + 0.5) / big;
          const [pr, pg, pb, pa] = shade(u, v, size);
          r += pr * (pa / 255);
          g += pg * (pa / 255);
          b += pb * (pa / 255);
          a += pa;
        }
      }
      const n = ss * ss;
      const alpha = a / n;
      const i = (y * size + x) * 4;
      // un-premultiply
      const k = alpha > 0 ? 255 / alpha : 0;
      out[i] = Math.min(255, Math.round((r / n) * k));
      out[i + 1] = Math.min(255, Math.round((g / n) * k));
      out[i + 2] = Math.min(255, Math.round((b / n) * k));
      out[i + 3] = Math.round(alpha);
    }
  }
  return encodePNG(size, size, out);
}

for (const size of [16, 48, 128]) {
  const file = join(outDir, `icon${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`✓ ${file}`);
}
