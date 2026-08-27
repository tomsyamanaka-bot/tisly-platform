/**
 * Three.js 空間内ネオンピン（Sprite + stem）
 * CSS2D / HTML オーバーレイは使わない — 回転・ズームに 100% 追従
 * ヘッドはデバイス種別 SVG アイコン（絵文字非依存）
 */
import { normalizeDeviceKind } from "./tisly-device-pin-icons-v1.js";

/**
 * テーマカラー（カメラ:青 / ドア:緑 / 鍵:琥珀 / 電源:黄 / ミリ波:紫 / 警報:赤）
 * @type {Record<string, { hex: number, label: string }>}
 */
export const NEON_PIN_STYLE_V1 = {
  camera: { hex: 0x2563eb, label: "カメラ" },
  door: { hex: 0x16a34a, label: "ドア" },
  lock: { hex: 0xea580c, label: "鍵" },
  panel: { hex: 0xeab308, label: "電源" },
  mmwave: { hex: 0x7c3aed, label: "ミリ波" },
  gas: { hex: 0xf59e0b, label: "ガス" },
  window: { hex: 0x0ea5e9, label: "窓" },
  light: { hex: 0xf97316, label: "ライト" },
};

/**
 * @param {string} kind
 */
export function neonPinStyle(kind) {
  const k = normalizeDeviceKind(kind);
  return NEON_PIN_STYLE_V1[k] || { hex: 0x2563eb, label: k };
}

function hexToRgb(hex) {
  const n = Number(hex) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hexCss(hex) {
  return `#${Number(hex).toString(16).padStart(6, "0")}`;
}

/**
 * 24x24 ビュー相当のデバイス SVG を Canvas に描画（太線・高コントラスト）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kind
 * @param {number} cx
 * @param {number} cy
 * @param {number} scale 1 = 24px 相当
 * @param {string} color
 */
export function drawDeviceIconSvgV1(ctx, kind, cx, cy, scale, color) {
  const k = normalizeDeviceKind(kind);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.65;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (k === "camera") {
    roundRectStroke(ctx, 2.5, 6.5, 14.5, 11, 2.2);
    ctx.beginPath();
    ctx.moveTo(17, 9.5);
    ctx.lineTo(21.5, 7);
    ctx.lineTo(21.5, 17);
    ctx.lineTo(17, 14.5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(9.8, 12, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (k === "door") {
    roundRectStroke(ctx, 5.5, 3.5, 10, 17, 1.8);
    ctx.beginPath();
    ctx.moveTo(17.5, 6);
    ctx.lineTo(21, 7.5);
    ctx.lineTo(21, 19.5);
    ctx.lineTo(17.5, 21);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13.5, 12, 1.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (k === "lock") {
    roundRectStroke(ctx, 4.5, 10.5, 15, 10.5, 2.2);
    ctx.beginPath();
    ctx.moveTo(7.5, 10.5);
    ctx.lineTo(7.5, 7.5);
    ctx.arc(12, 7.5, 4.5, Math.PI, 0, false);
    ctx.lineTo(16.5, 10.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 15.5, 1.55, 0, Math.PI * 2);
    ctx.fill();
  } else if (k === "panel" || k === "gas") {
    ctx.beginPath();
    ctx.moveTo(13, 1.5);
    ctx.lineTo(4.5, 13);
    ctx.lineTo(11, 13);
    ctx.lineTo(9.5, 22.5);
    ctx.lineTo(19.5, 9.5);
    ctx.lineTo(13, 9.5);
    ctx.closePath();
    ctx.stroke();
  } else if (k === "mmwave") {
    ctx.beginPath();
    ctx.moveTo(12, 17.5);
    ctx.lineTo(12, 21.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 13.5, 4.2, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(12, 13.5, 7.2, Math.PI * 0.12, Math.PI * 0.88, true);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(12, 13.5, 10.2, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (k === "window") {
    roundRectStroke(ctx, 3.5, 4.5, 17, 15, 1.8);
    ctx.beginPath();
    ctx.moveTo(12, 4.5);
    ctx.lineTo(12, 19.5);
    ctx.moveTo(3.5, 12);
    ctx.lineTo(20.5, 12);
    ctx.stroke();
  } else if (k === "light") {
    /* 防犯ライト（電球シルエット） */
    ctx.beginPath();
    ctx.arc(12, 9.5, 5.2, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    roundRectStroke(ctx, 9.2, 14.2, 5.6, 4.2, 1.2);
    ctx.beginPath();
    ctx.moveTo(10, 18.5);
    ctx.lineTo(14, 18.5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(12, 12, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function roundRectStroke(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.stroke();
}

/**
 * Canvas テクスチャ（白カプセルバッジ + デバイス色アイコン）
 * @param {typeof import('three')} THREE
 * @param {{ kind: string, alerting?: boolean, selected?: boolean, capsule?: boolean }} opts
 */
export function makeNeonPinTexture(THREE, opts) {
  const style = neonPinStyle(opts.kind);
  const alerting = !!opts.alerting;
  const selected = !!opts.selected;
  const capsule = opts.capsule !== false;
  const size = 160;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  ctx.clearRect(0, 0, size, size);

  const cx = 80;
  const cy = 70;
  const theme = alerting ? 0xef4444 : style.hex;
  const rgb = hexToRgb(theme);

  /* ソフトドロップシャドウ */
  const glow = ctx.createRadialGradient(cx, cy + 18, 2, cx, cy + 22, 70);
  glow.addColorStop(0, "rgba(15,23,42,0.22)");
  glow.addColorStop(1, "rgba(15,23,42,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 28, 52, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  if (capsule) {
    /* 白カプセル型フロートバッジ */
    const bw = 108;
    const bh = 52;
    const x = cx - bw / 2;
    const y = cy - bh / 2;
    const rr = bh / 2;
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + bw - rr, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + rr);
    ctx.lineTo(x + bw, y + bh - rr);
    ctx.quadraticCurveTo(x + bw, y + bh, x + bw - rr, y + bh);
    ctx.lineTo(x + rr, y + bh);
    ctx.quadraticCurveTo(x, y + bh, x, y + bh - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
    ctx.fillStyle = alerting ? "#fef2f2" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = selected ? 3.5 : 2.2;
    ctx.strokeStyle = alerting
      ? "#ef4444"
      : selected
        ? "#1e3a8a"
        : "rgba(148,163,184,0.85)";
    ctx.stroke();

    /* 左端の色ドット（デバイス種別アクセント） */
    ctx.beginPath();
    ctx.arc(x + 22, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = alerting ? "#ef4444" : hexCss(theme);
    ctx.fill();
    drawDeviceIconSvgV1(ctx, opts.kind, x + 22, cy, 0.95, "#ffffff");
    drawDeviceIconSvgV1(ctx, opts.kind, cx + 14, cy, 1.55, alerting ? "#b91c1c" : "#0f172a");
  } else {
    const r = 46;
    const glow2 = ctx.createRadialGradient(cx, cy + 6, 4, cx, cy + 10, 82);
    glow2.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.95)`);
    glow2.addColorStop(0.4, `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`);
    glow2.addColorStop(1, `rgba(15,23,42,0)`);
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(cx, cy + 8, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = alerting ? "#ef4444" : hexCss(theme);
    ctx.fill();
    drawDeviceIconSvgV1(ctx, opts.kind, cx, cy + 1, 2.15, "#ffffff");
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  if ("SRGBColorSpace" in THREE && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else if ("sRGBEncoding" in THREE) {
    tex.encoding = THREE.sRGBEncoding;
  }
  return tex;
}

/** スプライト基準サイズ（白カプセル横長） */
const PIN_SPRITE_W = 2.15;
const PIN_SPRITE_H = 1.55;

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
 *   capsule?: boolean,
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
    capsule: opts.capsule !== false,
  });
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 0.98,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(PIN_SPRITE_W * scale, PIN_SPRITE_H * scale, 1);
  sprite.position.y = 0.55 * scale;
  sprite.center.set(0.5, 0.35);
  group.add(sprite);

  const stemMat = new THREE.MeshStandardMaterial({
    color: opts.alerting ? 0xef4444 : 0x94a3b8,
    emissive: opts.alerting ? 0xef4444 : 0x1e3a8a,
    emissiveIntensity: opts.alerting ? 0.55 : 0.08,
    metalness: 0.12,
    roughness: 0.55,
    transparent: true,
    opacity: 0.9,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.48 * scale, 12),
    stemMat
  );
  stem.position.y = 0.24 * scale;
  stem.castShadow = true;
  stem.receiveShadow = true;
  group.add(stem);

  const ringMat = new THREE.MeshBasicMaterial({
    color: opts.alerting ? 0xef4444 : style.hex,
    transparent: true,
    opacity: opts.alerting ? 0.4 : 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28 * scale, 0.46 * scale, 36),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);

  /* 地面へのソフトシャドウ円 */
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const shadowDisk = new THREE.Mesh(
    new THREE.CircleGeometry(0.4 * scale, 24),
    shadowMat
  );
  shadowDisk.rotation.x = -Math.PI / 2;
  shadowDisk.position.y = 0.01;
  group.add(shadowDisk);

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

  /* ヒット判定用の透明球体（Raycaster）— 大型ピンに合わせて拡大 */
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.85 * scale, 14, 14),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  hit.position.y = 0.72 * scale;
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
  group.userData.stemMat.emissiveIntensity = alerting ? 0.95 : 0.55;
  group.userData.ringMat.color.setHex(hex);
  group.userData.ringMat.opacity = alerting ? 0.65 : 0.32;
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
    const b = PIN_SPRITE_W * (group.scale?.x || 1);
    group.userData.sprite.scale.set(
      b * (0.95 + pulse * 0.2),
      (PIN_SPRITE_H / PIN_SPRITE_W) * b * (0.95 + pulse * 0.2),
      1
    );
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
    Number.isFinite(d.z) && d.z != null ? Number(d.z) : wallH * 0.72;
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
