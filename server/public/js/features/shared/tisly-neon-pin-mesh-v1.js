/**
 * Three.js 空間内ネオンピン（Sprite + stem）
 * CSS2D / HTML オーバーレイは使わない — 回転・ズームに 100% 追従
 */
import { normalizeDeviceKind } from "./tisly-device-pin-icons-v1.js";

/** @type {Record<string, { hex: number, emoji: string, label: string }>} */
export const NEON_PIN_STYLE_V1 = {
  camera: { hex: 0x38bdf8, emoji: "📷", label: "カメラ" },
  door: { hex: 0x60a5fa, emoji: "🚪", label: "ドア" },
  lock: { hex: 0xa78bfa, emoji: "🔒", label: "鍵" },
  panel: { hex: 0xfbbf24, emoji: "⚡", label: "電源" },
  mmwave: { hex: 0x34d399, emoji: "📡", label: "ミリ波" },
  gas: { hex: 0xfbbf24, emoji: "⚡", label: "ガス" },
  window: { hex: 0x93c5fd, emoji: "🪟", label: "窓" },
};

/**
 * @param {string} kind
 */
export function neonPinStyle(kind) {
  const k = normalizeDeviceKind(kind);
  return NEON_PIN_STYLE_V1[k] || { hex: 0x2563eb, emoji: "●", label: k };
}

/**
 * Canvas テクスチャ（ネオン円 + 絵文字）
 * @param {typeof import('three')} THREE
 * @param {{ kind: string, alerting?: boolean, selected?: boolean }} opts
 */
export function makeNeonPinTexture(THREE, opts) {
  const style = neonPinStyle(opts.kind);
  const alerting = !!opts.alerting;
  const selected = !!opts.selected;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  ctx.clearRect(0, 0, size, size);

  const cx = 64;
  const cy = 52;
  const r = 34;

  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 58);
  if (alerting) {
    glow.addColorStop(0, "rgba(255,120,120,0.95)");
    glow.addColorStop(0.45, "rgba(239,68,68,0.55)");
    glow.addColorStop(1, "rgba(239,68,68,0)");
  } else {
    const rgb = hexToRgb(style.hex);
    glow.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`);
    glow.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`);
    glow.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  }
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  if (alerting) {
    body.addColorStop(0, "#fecaca");
    body.addColorStop(1, "#ef4444");
  } else {
    body.addColorStop(0, "#ffffff");
    body.addColorStop(1, "#e0f2fe");
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = selected ? 6 : 3.5;
  ctx.strokeStyle = alerting
    ? "#f87171"
    : selected
      ? "#1e3a8a"
      : `#${style.hex.toString(16).padStart(6, "0")}`;
  ctx.stroke();

  ctx.font = "48px system-ui, Segoe UI Emoji, Apple Color Emoji, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(style.emoji, cx, cy + 2);

  /* 尖端 */
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + r - 4);
  ctx.lineTo(cx + 12, cy + r - 4);
  ctx.lineTo(cx, cy + r + 22);
  ctx.closePath();
  ctx.fillStyle = alerting
    ? "#ef4444"
    : `#${style.hex.toString(16).padStart(6, "0")}`;
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  if ("SRGBColorSpace" in THREE && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else if ("sRGBEncoding" in THREE) {
    tex.encoding = THREE.sRGBEncoding;
  }
  return tex;
}

function hexToRgb(hex) {
  const n = Number(hex) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * 3D ネオングループを生成
 * @param {typeof import('three')} THREE
 * @param {{
 *   id: string,
 *   kind: string,
 *   label?: string,
 *   alerting?: boolean,
 *   selected?: boolean,
 *   linkedCameraId?: string,
 *   scale?: number,
 * }} opts
 */
export function createNeonPinMesh3d(THREE, opts) {
  const kind = normalizeDeviceKind(opts.kind);
  const style = neonPinStyle(kind);
  const scale = opts.scale ?? 1;
  const group = new THREE.Group();
  group.name = `neon-pin-${opts.id}`;

  const tex = makeNeonPinTexture(THREE, {
    kind,
    alerting: opts.alerting,
    selected: opts.selected,
  });
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 0.98,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15 * scale, 1.35 * scale, 1);
  sprite.position.y = 0.55 * scale;
  sprite.center.set(0.5, 0.15);
  group.add(sprite);

  const stemMat = new THREE.MeshStandardMaterial({
    color: opts.alerting ? 0xef4444 : style.hex,
    emissive: opts.alerting ? 0xef4444 : style.hex,
    emissiveIntensity: opts.alerting ? 0.85 : 0.35,
    metalness: 0.2,
    roughness: 0.35,
    transparent: true,
    opacity: 0.92,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.55 * scale, 10),
    stemMat
  );
  stem.position.y = 0.28 * scale;
  group.add(stem);

  const ringMat = new THREE.MeshBasicMaterial({
    color: opts.alerting ? 0xef4444 : style.hex,
    transparent: true,
    opacity: opts.alerting ? 0.55 : 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22 * scale, 0.38 * scale, 32),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  group.userData = {
    kind: "devicePin",
    pinKind: kind,
    deviceId: opts.id,
    sensorId: opts.id,
    label: opts.label || style.label,
    linkedCameraId: opts.linkedCameraId || (kind === "camera" ? opts.id : null),
    alerting: !!opts.alerting,
    selected: !!opts.selected,
    sprite,
    stem,
    ring,
    stemMat,
    ringMat,
    spriteMat: mat,
    baseHex: style.hex,
  };

  /* ヒット判定用の透明球体（Raycaster） */
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.55 * scale, 12, 12),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  hit.position.y = 0.55 * scale;
  hit.userData = { ...group.userData, isHitProxy: true };
  group.add(hit);
  group.userData.hit = hit;

  return group;
}

/**
 * アラート / 選択状態の見た目更新
 * @param {import('three').Group} group
 * @param {typeof import('three')} THREE
 * @param {{ alerting?: boolean, selected?: boolean }} next
 */
export function refreshNeonPinMesh3d(group, THREE, next = {}) {
  if (!group?.userData?.sprite) return;
  const alerting =
    next.alerting != null ? !!next.alerting : !!group.userData.alerting;
  const selected =
    next.selected != null ? !!next.selected : !!group.userData.selected;
  group.userData.alerting = alerting;
  group.userData.selected = selected;

  const oldMap = group.userData.spriteMat.map;
  const tex = makeNeonPinTexture(THREE, {
    kind: group.userData.pinKind,
    alerting,
    selected,
  });
  group.userData.spriteMat.map = tex;
  group.userData.spriteMat.needsUpdate = true;
  if (oldMap) oldMap.dispose();

  const hex = alerting ? 0xef4444 : group.userData.baseHex;
  group.userData.stemMat.color.setHex(hex);
  group.userData.stemMat.emissive.setHex(hex);
  group.userData.stemMat.emissiveIntensity = alerting ? 0.95 : 0.35;
  group.userData.ringMat.color.setHex(hex);
  group.userData.ringMat.opacity = alerting ? 0.6 : 0.22;
}

/**
 * パルス発光（animate ループから呼ぶ）
 * @param {import('three').Group} group
 * @param {number} pulse 0..1
 */
export function pulseNeonPinMesh3d(group, pulse) {
  if (!group?.userData?.alerting) return;
  const p = 0.55 + pulse * 0.45;
  if (group.userData.stemMat) {
    group.userData.stemMat.emissiveIntensity = 0.5 + p * 0.9;
  }
  if (group.userData.ringMat) {
    group.userData.ringMat.opacity = 0.35 + p * 0.55;
    const s = 1 + pulse * 0.35;
    group.userData.ring.scale.set(s, s, s);
  }
  if (group.userData.sprite) {
    const base = group.userData.sprite.scale.x;
    const b = 1.15 * (group.scale?.x || 1);
    group.userData.sprite.scale.set(b * (0.95 + pulse * 0.2), b * 1.15 * (0.95 + pulse * 0.2), 1);
    void base;
  }
}

/**
 * @param {number} pct 0..100
 */
export function pctToWorldV1(pct) {
  return (Number(pct) - 50) * 0.2;
}

/**
 * @param {number} world
 */
export function worldToPctV1(world) {
  return Number(world) / 0.2 + 50;
}

/**
 * デバイス JSON → ワールド座標
 * @param {{ x: number, y: number, z?: number }} d
 * @param {number} wallH
 */
export function deviceToWorldPosV1(d, wallH = 2.7) {
  const wx = pctToWorldV1(d.x);
  const wz = pctToWorldV1(d.y);
  const wy =
    Number.isFinite(d.z) && d.z != null
      ? Number(d.z)
      : wallH * 0.72;
  return { x: wx, y: wy, z: wz };
}

/**
 * ワールド → デバイス座標（x/y % · z 高さ）
 * @param {{ x: number, y: number, z: number }} world
 */
export function worldToDevicePosV1(world) {
  return {
    x: Math.min(96, Math.max(4, worldToPctV1(world.x))),
    y: Math.min(96, Math.max(4, worldToPctV1(world.z))),
    z: Math.max(0.2, Number(world.y) || 1.8),
  };
}
