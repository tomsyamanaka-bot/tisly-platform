/**
 * Phase 2001 — TiSLY 六角シールド公式 PWA アイコン生成
 * 64 / 128 / 192 / 256 / 384 / 512 px
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");
const SIZES = [64, 128, 192, 256, 384, 512];

const BG = { r: 13, g: 17, b: 23 };
const GREEN = { r: 26, g: 127, b: 55 };
const GREEN_LIGHT = { r: 35, g: 134, b: 54 };
const GREEN_DARK = { r: 13, g: 77, b: 31 };
const WHITE = { r: 255, g: 255, b: 255 };

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function hexVerts(cx, cy, r, rot = -Math.PI / 2) {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + (Math.PI / 3) * i;
    verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return verts;
}

function pointInPoly(x, y, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i];
    const [xj, yj] = verts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToHexEdge(x, y, verts) {
  let min = Infinity;
  for (let i = 0; i < 6; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % 6];
    min = Math.min(min, distToSegment(x, y, x1, y1, x2, y2));
  }
  return min;
}

function inShield(cx, cy, w, h, x, y) {
  const nx = (x - cx) / w;
  const ny = (y - cy) / h;
  if (Math.abs(nx) > 1 || ny < -0.95 || ny > 1) return false;
  const top = 1 - nx * nx * 0.15;
  if (ny < top - 0.05) return true;
  const tip = 1 - Math.abs(nx) * 1.35;
  return ny <= tip;
}

function pickColor(size, x, y) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.34;
  const shieldW = size * 0.18;
  const shieldH = size * 0.22;

  const outer = hexVerts(cx, cy, outerR);
  const inner = hexVerts(cx, cy, innerR);

  const inOuter = pointInPoly(x, y, outer);
  const inInner = pointInPoly(x, y, inner);
  const edgeDist = distToHexEdge(x, y, outer);
  const border = size * 0.035;

  if (inShield(cx, cy - size * 0.02, shieldW, shieldH, x, y)) {
    return WHITE;
  }

  if (inInner) {
    return GREEN_LIGHT;
  }

  if (inOuter && !inInner) {
    if (edgeDist < border * 0.45) return WHITE;
    return GREEN;
  }

  if (edgeDist < border && edgeDist < size * 0.08) {
    return GREEN_DARK;
  }

  return BG;
}

function createPng(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      const c = pickColor(size, x, y);
      row[i] = c.r;
      row[i + 1] = c.g;
      row[i + 2] = c.b;
      row[i + 3] = 255;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), createPng(size));
}
console.log(`Wrote TiSLY hex shield icons: ${SIZES.map((s) => `icon-${s}.png`).join(", ")}`);
