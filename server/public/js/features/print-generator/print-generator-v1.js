/**
 * TiSLY 3Dプリンター作成ジェネレーター v1
 * パラメトリック寸法 → Three.js プレビュー
 * → ワンタップ ASCII STL ダウンロード
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

/** @typedef {{ id: string, label: string, desc: string, defaults: Record<string, number>, ranges: Record<string, {min:number,max:number,step:number,label:string}> }} PrintTemplate */

/** @type {PrintTemplate[]} */
const TEMPLATES = [
  {
    id: "din_rail_bracket",
    label: "DINレールブラケット",
    desc: "盤内・センサ取付",
    defaults: { width: 35, depth: 22, height: 18, thickness: 2.5, hole: 4.2, holePitch: 25 },
    ranges: {
      width: { min: 20, max: 80, step: 0.5, label: "幅 W" },
      depth: { min: 12, max: 50, step: 0.5, label: "奥行 D" },
      height: { min: 10, max: 40, step: 0.5, label: "高さ H" },
      thickness: { min: 1.5, max: 5, step: 0.1, label: "板厚 t" },
      hole: { min: 3, max: 6, step: 0.1, label: "穴径 Ø" },
      holePitch: { min: 10, max: 60, step: 0.5, label: "穴ピッチ" },
    },
  },
  {
    id: "iot_box",
    label: "IoTボックス筐体",
    desc: "ESP / RP2350 収納",
    defaults: {
      width: 90,
      depth: 60,
      height: 35,
      wall: 2.2,
      lip: 1.5,
      holePitch: 30,
    },
    ranges: {
      width: { min: 40, max: 160, step: 1, label: "外寸 W" },
      depth: { min: 30, max: 120, step: 1, label: "外寸 D" },
      height: { min: 20, max: 80, step: 1, label: "外寸 H" },
      wall: { min: 1.5, max: 4, step: 0.1, label: "壁厚" },
      lip: { min: 0.8, max: 3, step: 0.1, label: "蓋リップ" },
      holePitch: { min: 10, max: 80, step: 0.5, label: "穴ピッチ" },
    },
  },
  {
    id: "camera_mount",
    label: "カメラマウント",
    desc: "壁面・柱取付プレート",
    defaults: {
      plateW: 50,
      plateH: 40,
      plateT: 3,
      armLen: 28,
      armW: 12,
      holePitch: 25,
    },
    ranges: {
      plateW: { min: 30, max: 100, step: 1, label: "プレート幅" },
      plateH: { min: 25, max: 80, step: 1, label: "プレート高" },
      plateT: { min: 2, max: 6, step: 0.1, label: "プレート厚" },
      armLen: { min: 15, max: 60, step: 1, label: "アーム長" },
      armW: { min: 8, max: 24, step: 0.5, label: "アーム幅" },
      holePitch: { min: 10, max: 80, step: 0.5, label: "穴ピッチ" },
    },
  },
  {
    id: "sensor_l_bracket",
    label: "センサLブラケット",
    desc: "ミリ波・接点センサ",
    defaults: {
      base: 40,
      upright: 35,
      width: 20,
      thickness: 3,
      hole: 3.5,
      holePitch: 20,
    },
    ranges: {
      base: { min: 20, max: 80, step: 1, label: "底辺" },
      upright: { min: 15, max: 70, step: 1, label: "立上り" },
      width: { min: 12, max: 40, step: 0.5, label: "幅" },
      thickness: { min: 1.5, max: 5, step: 0.1, label: "板厚" },
      hole: { min: 2.5, max: 6, step: 0.1, label: "穴径 Ø" },
      holePitch: { min: 10, max: 60, step: 0.5, label: "穴ピッチ" },
    },
  },
  {
    id: "rp2350_poe_cover",
    label: "RP2350-POE用 保護カバー/端子フード",
    desc: "実測154.2×88.1 · 配線逃げ付き",
    defaults: {
      length: 154.2,
      outerWidth: 88.1,
      innerWidth: 69.5,
      depth: 15.5,
      bossH: 11.4,
      wall: 2.0,
      clearance: 0.4,
      slitW: 6.5,
      holePitch: 70,
    },
    ranges: {
      length: { min: 140, max: 180, step: 0.1, label: "全長 L" },
      outerWidth: {
        min: 70,
        max: 110,
        step: 0.1,
        label: "全幅（耳込）",
      },
      innerWidth: {
        min: 60,
        max: 85,
        step: 0.1,
        label: "内寸幅",
      },
      depth: { min: 10, max: 30, step: 0.1, label: "基準深さ" },
      bossH: { min: 6, max: 18, step: 0.1, label: "ボス高" },
      wall: { min: 1.5, max: 4, step: 0.1, label: "壁厚" },
      clearance: {
        min: 0.2,
        max: 1.0,
        step: 0.1,
        label: "クリアランス",
      },
      slitW: {
        min: 4,
        max: 12,
        step: 0.1,
        label: "配線逃げ幅",
      },
      holePitch: {
        min: 40,
        max: 120,
        step: 0.5,
        label: "ネジ穴ピッチ",
      },
    },
  },
];

/** @type {PrintTemplate} */
let activeTpl = TEMPLATES[0];
/** @type {Record<string, number>} */
let dims = { ...activeTpl.defaults };

/** @type {THREE.Scene | null} */
let scene = null;
/** @type {THREE.PerspectiveCamera | null} */
let camera = null;
/** @type {THREE.WebGLRenderer | null} */
let renderer = null;
/** @type {OrbitControls | null} */
let controls = null;
/** @type {THREE.Group | null} */
let meshGroup = null;
/** @type {THREE.Group | null} */
let dimGuideGroup = null;
/** @type {CSS2DRenderer | null} */
let labelRenderer = null;
/** Revopoint スキャンメッシュ群 */
/** @type {THREE.Group | null} */
let scanMeshGroup = null;
/** スキャン読込済みフラグ */
let scanLoaded = false;
/** オーバーレイ表示 ON */
let scanOverlayOn = true;
/** 方眼紙スケッチ（最大4枚） */
/** @type {{ id: string, dataUrl: string, width: number, height: number }[]} */
let sketchImages = [];
const SKETCH_MAX = 4;
/** 操作中の寸法キー（ハイライト連動） */
/** @type {string | null} */
let activeDimKey = null;
/** スライダー操作中フラグ */
let dimDragging = false;
/** Web Speech 認識インスタンス */
/** @type {SpeechRecognition | null} */
let speechRec = null;
/** 音声入力トグル中 */
let voiceListening = false;

const DIM_LINE_COLOR = 0x64748b;
const DIM_LINE_ACTIVE = 0x0ea5e9;
const DIM_PAD = 7;

const $ = (sel) => document.querySelector(sel);

/**
 * 1始まりインデックスを丸数字へ
 * （①〜⑳、超過時は数字）
 * @param {number} n
 */
function circledNumber(n) {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x245f + n);
  return String(n);
}

/** @param {PrintTemplate} tpl */
function dimKeysInOrder(tpl) {
  return Object.keys(tpl.ranges);
}

/**
 * 寸法キーの表示番号（1始まり）
 * @param {string} key
 */
function getDimIndex(key) {
  return dimKeysInOrder(activeTpl).indexOf(key) + 1;
}

function initViewer() {
  const wrap = $("#pg-canvas-wrap");
  if (!wrap) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  const w = wrap.clientWidth || 320;
  const h = wrap.clientHeight || 280;
  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 2000);
  camera.position.set(80, 70, 110);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  wrap.appendChild(renderer.domElement);

  /* 寸法番号は CSS2D で常にカメラ向き */
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  labelRenderer.domElement.className = "pg-dim-labels";
  wrap.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 10, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.05);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.75);
  dir.position.set(40, 80, 30);
  scene.add(dir);

  const grid = new THREE.GridHelper(160, 16, 0xcbd5e1, 0xe2e8f0);
  scene.add(grid);

  meshGroup = new THREE.Group();
  scene.add(meshGroup);
  scanMeshGroup = new THREE.Group();
  scene.add(scanMeshGroup);
  dimGuideGroup = new THREE.Group();
  scene.add(dimGuideGroup);

  window.addEventListener("resize", onResize);
  animate();
  rebuildMesh({ frameCamera: true });
}

function onResize() {
  const wrap = $("#pg-canvas-wrap");
  if (!wrap || !camera || !renderer) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls?.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
    labelRenderer?.render(scene, camera);
  }
}

/**
 * 直方体を三角形リストへ追加（mm）
 * @param {number[][]} tris
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {number} w
 * @param {number} h
 * @param {number} d
 */
function addBox(tris, cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy;
  const y1 = cy + h;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const v = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const faces = [
    [0, 1, 2, 3],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [1, 5, 6, 2],
    [3, 2, 6, 7],
    [4, 5, 1, 0],
  ];
  for (const f of faces) {
    const a = v[f[0]];
    const b = v[f[1]];
    const c = v[f[2]];
    const d2 = v[f[3]];
    tris.push([a, b, c], [a, c, d2]);
  }
}

/** @param {Record<string, number>} p */
function buildTris(tplId, p) {
  /** @type {number[][]} */
  const tris = [];
  if (tplId === "din_rail_bracket") {
    // 底面プレート + 立上り壁 + 簡易ボス
    addBox(tris, 0, 0, 0, p.width, p.thickness, p.depth);
    addBox(
      tris,
      0,
      p.thickness,
      -p.depth / 2 + p.thickness / 2,
      p.width,
      p.height - p.thickness,
      p.thickness
    );
    addBox(tris, -p.width / 4, p.thickness, 0, p.width / 3, p.thickness * 1.2, p.depth * 0.55);
    addBox(tris, p.width / 4, p.thickness, 0, p.width / 3, p.thickness * 1.2, p.depth * 0.55);
  } else if (tplId === "iot_box") {
    const w = p.width;
    const d = p.depth;
    const h = p.height;
    const t = p.wall;
    // 底板
    addBox(tris, 0, 0, 0, w, t, d);
    // 4壁
    addBox(tris, 0, t, -d / 2 + t / 2, w, h - t, t);
    addBox(tris, 0, t, d / 2 - t / 2, w, h - t, t);
    addBox(tris, -w / 2 + t / 2, t, 0, t, h - t, d - 2 * t);
    addBox(tris, w / 2 - t / 2, t, 0, t, h - t, d - 2 * t);
    // 蓋リップ（内側段差）
    addBox(
      tris,
      0,
      h - p.lip,
      0,
      w - 2 * t,
      p.lip,
      d - 2 * t
    );
  } else if (tplId === "rp2350_poe_cover") {
    /* RP2350-POE 実測カバー
     * フランジ耳・ボス・端子逃げ付き */
    const cl = Number(p.clearance) || 0.4;
    const L = p.length + 2 * cl;
    const Wout = p.outerWidth + 2 * cl;
    const Win = p.innerWidth + 2 * cl;
    const H = p.depth + cl;
    const t = p.wall;
    const boss = p.bossH;
    const slit = p.slitW;
    const pitch = p.holePitch;
    const ear = Math.max((Wout - Win) / 2, 2);

    // 底板（フランジ耳含む）
    addBox(tris, 0, 0, 0, L, t, Wout);
    // DIN リップ（底面中央）
    addBox(tris, 0, t, 0, L * 0.55, t * 0.8, Math.min(Win * 0.35, 22));

    // 長辺壁（CH/DI 逃げスリットで分割）
    const wallSeg = (L - slit * 4) / 5;
    let xCursor = -L / 2;
    for (let i = 0; i < 5; i++) {
      const segL = wallSeg;
      const cx = xCursor + segL / 2;
      // -Z 側: CH1〜CH8 側壁セグメント
      addBox(tris, cx, t, -Win / 2 + t / 2, segL, H - t, t);
      // +Z 側: DI1〜DI8 側壁セグメント
      addBox(tris, cx, t, Win / 2 - t / 2, segL, H - t, t);
      xCursor += segL;
      if (i < 4) {
        // 配線ガイド（スリット両縁の薄壁）
        const gx = xCursor + slit / 2;
        addBox(tris, gx - slit / 2 + 0.6, t, -Win / 2 + t / 2, 1.2, H * 0.55, t);
        addBox(tris, gx + slit / 2 - 0.6, t, -Win / 2 + t / 2, 1.2, H * 0.55, t);
        addBox(tris, gx - slit / 2 + 0.6, t, Win / 2 - t / 2, 1.2, H * 0.55, t);
        addBox(tris, gx + slit / 2 - 0.6, t, Win / 2 - t / 2, 1.2, H * 0.55, t);
        xCursor += slit;
      }
    }

    // 短辺壁（RS485 / PoE-LAN 開口）
    const endGap = Math.max(slit * 1.4, 10);
    const endSeg = (Win - endGap) / 2;
    // -X: RS485
    addBox(
      tris,
      -L / 2 + t / 2,
      t,
      -Win / 2 + endSeg / 2,
      t,
      H - t,
      endSeg
    );
    addBox(
      tris,
      -L / 2 + t / 2,
      t,
      Win / 2 - endSeg / 2,
      t,
      H - t,
      endSeg
    );
    // +X: PoE-LAN
    addBox(
      tris,
      L / 2 - t / 2,
      t,
      -Win / 2 + endSeg / 2,
      t,
      H - t,
      endSeg
    );
    addBox(
      tris,
      L / 2 - t / 2,
      t,
      Win / 2 - endSeg / 2,
      t,
      H - t,
      endSeg
    );

    // フランジ耳（取付耳）
    addBox(tris, -L / 4, t, -Wout / 2 + ear / 2, L * 0.28, t, ear);
    addBox(tris, L / 4, t, -Wout / 2 + ear / 2, L * 0.28, t, ear);
    addBox(tris, -L / 4, t, Wout / 2 - ear / 2, L * 0.28, t, ear);
    addBox(tris, L / 4, t, Wout / 2 - ear / 2, L * 0.28, t, ear);

    // ネジボス（ピッチ左右）
    const bx = pitch / 2;
    addBox(tris, -bx, t, -Win * 0.28, 8, boss, 8);
    addBox(tris, bx, t, -Win * 0.28, 8, boss, 8);
    addBox(tris, -bx, t, Win * 0.28, 8, boss, 8);
    addBox(tris, bx, t, Win * 0.28, 8, boss, 8);
  } else if (tplId === "camera_mount") {
    addBox(tris, 0, 0, 0, p.plateW, p.plateT, p.plateH);
    addBox(
      tris,
      0,
      p.plateT,
      p.plateH / 2 - p.armW / 2,
      p.armW,
      p.armLen,
      p.armW
    );
    addBox(
      tris,
      0,
      p.plateT + p.armLen,
      p.plateH / 2 - p.armW,
      p.armW * 1.4,
      p.plateT,
      p.armW * 1.6
    );
  } else {
    // Lブラケット
    addBox(tris, 0, 0, 0, p.width, p.thickness, p.base);
    addBox(
      tris,
      0,
      p.thickness,
      -p.base / 2 + p.thickness / 2,
      p.width,
      p.upright,
      p.thickness
    );
  }
  return tris;
}

function trisToGeometry(tris) {
  const positions = new Float32Array(tris.length * 9);
  let i = 0;
  for (const t of tris) {
    for (const p of t) {
      positions[i++] = p[0];
      positions[i++] = p[1];
      positions[i++] = p[2];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * テンプレ寸法のガイド線端点を算出
 * @param {string} tplId
 * @param {Record<string, number>} p
 * @returns {{ key: string, index: number, p0: number[], p1: number[], labelAt: number[] }[]}
 */
function buildDimGuides(tplId, p) {
  /** @type {{ key: string, index: number, p0: number[], p1: number[], labelAt: number[] }[]} */
  const guides = [];
  const add = (key, p0, p1, labelAt) => {
    if (!activeTpl.ranges[key]) return;
    const index = getDimIndex(key);
    if (index < 1) return;
    const mid = labelAt || [
      (p0[0] + p1[0]) / 2,
      (p0[1] + p1[1]) / 2,
      (p0[2] + p1[2]) / 2,
    ];
    guides.push({ key, index, p0, p1, labelAt: mid });
  };

  if (tplId === "din_rail_bracket") {
    const w = p.width;
    const d = p.depth;
    const h = p.height;
    const t = p.thickness;
    add(
      "width",
      [-w / 2, 0, d / 2 + DIM_PAD],
      [w / 2, 0, d / 2 + DIM_PAD],
      [0, 2, d / 2 + DIM_PAD + 2]
    );
    add(
      "depth",
      [w / 2 + DIM_PAD, 0, -d / 2],
      [w / 2 + DIM_PAD, 0, d / 2],
      [w / 2 + DIM_PAD + 2, 2, 0]
    );
    add(
      "height",
      [w / 2 + DIM_PAD, 0, -d / 2 + t / 2],
      [w / 2 + DIM_PAD, h, -d / 2 + t / 2],
      [w / 2 + DIM_PAD + 2, h / 2, -d / 2 + t / 2]
    );
    add(
      "thickness",
      [w / 2 + DIM_PAD, 0, d / 2],
      [w / 2 + DIM_PAD, t, d / 2],
      [w / 2 + DIM_PAD + 2, t / 2, d / 2]
    );
    add(
      "hole",
      [-w / 4, t + 1, 0],
      [-w / 4, t + 1 + Math.max(p.hole, 3), 0],
      [-w / 4, t + 4, DIM_PAD]
    );
  } else if (tplId === "iot_box") {
    const w = p.width;
    const d = p.depth;
    const h = p.height;
    const t = p.wall;
    add(
      "width",
      [-w / 2, 0, d / 2 + DIM_PAD],
      [w / 2, 0, d / 2 + DIM_PAD],
      [0, 2, d / 2 + DIM_PAD + 2]
    );
    add(
      "depth",
      [w / 2 + DIM_PAD, 0, -d / 2],
      [w / 2 + DIM_PAD, 0, d / 2],
      [w / 2 + DIM_PAD + 2, 2, 0]
    );
    add(
      "height",
      [w / 2 + DIM_PAD, 0, 0],
      [w / 2 + DIM_PAD, h, 0],
      [w / 2 + DIM_PAD + 2, h / 2, 0]
    );
    add(
      "wall",
      [w / 2, h / 2, d / 2 + DIM_PAD],
      [w / 2 - t, h / 2, d / 2 + DIM_PAD],
      [w / 2 - t / 2, h / 2 + 2, d / 2 + DIM_PAD + 2]
    );
    add(
      "lip",
      [0, h - p.lip, d / 2 + DIM_PAD],
      [0, h, d / 2 + DIM_PAD],
      [0, h - p.lip / 2, d / 2 + DIM_PAD + 2]
    );
  } else if (tplId === "rp2350_poe_cover") {
    const cl = Number(p.clearance) || 0.4;
    const L = p.length + 2 * cl;
    const Wout = p.outerWidth + 2 * cl;
    const Win = p.innerWidth + 2 * cl;
    const H = p.depth + cl;
    add(
      "length",
      [-L / 2, 0, Wout / 2 + DIM_PAD],
      [L / 2, 0, Wout / 2 + DIM_PAD],
      [0, 3, Wout / 2 + DIM_PAD + 2]
    );
    add(
      "outerWidth",
      [L / 2 + DIM_PAD, 0, -Wout / 2],
      [L / 2 + DIM_PAD, 0, Wout / 2],
      [L / 2 + DIM_PAD + 2, 3, 0]
    );
    add(
      "innerWidth",
      [L / 2 + DIM_PAD * 0.4, H / 2, -Win / 2],
      [L / 2 + DIM_PAD * 0.4, H / 2, Win / 2],
      [L / 2 + DIM_PAD * 0.4 + 2, H / 2 + 2, 0]
    );
    add(
      "depth",
      [L / 2 + DIM_PAD, 0, 0],
      [L / 2 + DIM_PAD, H, 0],
      [L / 2 + DIM_PAD + 2, H / 2, 0]
    );
    add(
      "bossH",
      [-p.holePitch / 2, p.wall, -Win * 0.28],
      [-p.holePitch / 2, p.wall + p.bossH, -Win * 0.28],
      [-p.holePitch / 2, p.wall + p.bossH / 2, -Win * 0.28 - DIM_PAD]
    );
    add(
      "clearance",
      [0, H + 1, Win / 2],
      [0, H + 1 + cl * 4, Win / 2],
      [0, H + 2 + cl * 2, Win / 2 + DIM_PAD]
    );
    add(
      "slitW",
      [-p.slitW / 2, H * 0.4, -Win / 2 - DIM_PAD],
      [p.slitW / 2, H * 0.4, -Win / 2 - DIM_PAD],
      [0, H * 0.4 + 2, -Win / 2 - DIM_PAD - 2]
    );
    add(
      "holePitch",
      [-p.holePitch / 2, p.wall + 1, Win * 0.28 + DIM_PAD],
      [p.holePitch / 2, p.wall + 1, Win * 0.28 + DIM_PAD],
      [0, p.wall + 4, Win * 0.28 + DIM_PAD + 2]
    );
  } else if (tplId === "camera_mount") {
    const pw = p.plateW;
    const ph = p.plateH;
    const pt = p.plateT;
    add(
      "plateW",
      [-pw / 2, 0, ph / 2 + DIM_PAD],
      [pw / 2, 0, ph / 2 + DIM_PAD],
      [0, 2, ph / 2 + DIM_PAD + 2]
    );
    add(
      "plateH",
      [pw / 2 + DIM_PAD, 0, -ph / 2],
      [pw / 2 + DIM_PAD, 0, ph / 2],
      [pw / 2 + DIM_PAD + 2, 2, 0]
    );
    add(
      "plateT",
      [pw / 2 + DIM_PAD, 0, ph / 2],
      [pw / 2 + DIM_PAD, pt, ph / 2],
      [pw / 2 + DIM_PAD + 2, pt / 2, ph / 2]
    );
    add(
      "armLen",
      [p.armW / 2 + DIM_PAD, pt, ph / 2 - p.armW / 2],
      [p.armW / 2 + DIM_PAD, pt + p.armLen, ph / 2 - p.armW / 2],
      [p.armW / 2 + DIM_PAD + 2, pt + p.armLen / 2, ph / 2 - p.armW / 2]
    );
    add(
      "armW",
      [-p.armW / 2, pt + p.armLen / 2, ph / 2 + DIM_PAD],
      [p.armW / 2, pt + p.armLen / 2, ph / 2 + DIM_PAD],
      [0, pt + p.armLen / 2 + 2, ph / 2 + DIM_PAD + 2]
    );
  } else {
    /* センサLブラケット: ①底辺 ②立上り ③幅 ④板厚 ⑤穴径 */
    const base = p.base;
    const upright = p.upright;
    const w = p.width;
    const t = p.thickness;
    add(
      "base",
      [w / 2 + DIM_PAD, 0, -base / 2],
      [w / 2 + DIM_PAD, 0, base / 2],
      [w / 2 + DIM_PAD + 3, 3, 0]
    );
    add(
      "upright",
      [w / 2 + DIM_PAD, t, -base / 2 + t / 2],
      [w / 2 + DIM_PAD, t + upright, -base / 2 + t / 2],
      [w / 2 + DIM_PAD + 3, t + upright / 2, -base / 2 + t / 2]
    );
    add(
      "width",
      [-w / 2, 0, base / 2 + DIM_PAD],
      [w / 2, 0, base / 2 + DIM_PAD],
      [0, 3, base / 2 + DIM_PAD + 3]
    );
    add(
      "thickness",
      [w / 2 + DIM_PAD, 0, base / 2],
      [w / 2 + DIM_PAD, t, base / 2],
      [w / 2 + DIM_PAD + 3, t / 2, base / 2]
    );
    add(
      "hole",
      [0, t + upright * 0.55, -base / 2 + t + 1],
      [0, t + upright * 0.55, -base / 2 + t + 1 + Math.max(p.hole, 3)],
      [DIM_PAD, t + upright * 0.55 + 2, -base / 2 + t + 2]
    );
  }
  return guides;
}

/** CSS2D / 寸法線グループを全消去 */
function clearDimGuides() {
  if (!dimGuideGroup) return;
  while (dimGuideGroup.children.length) {
    const c = dimGuideGroup.children.pop();
    if (!c) continue;
    if (c.isCSS2DObject && c.element) {
      c.element.remove();
    }
    c.geometry?.dispose?.();
    if (Array.isArray(c.material)) {
      c.material.forEach((m) => m.dispose?.());
    } else {
      c.material?.dispose?.();
    }
  }
}

/**
 * 寸法ガイド線 + 丸数字ビルボードを再構築
 */
function rebuildDimGuides() {
  if (!dimGuideGroup) return;
  clearDimGuides();
  const guides = buildDimGuides(activeTpl.id, dims);
  for (const g of guides) {
    const active = g.key === activeDimKey;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...g.p0),
      new THREE.Vector3(...g.p1),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: active ? DIM_LINE_ACTIVE : DIM_LINE_COLOR,
        transparent: true,
        opacity: active ? 1 : 0.85,
      })
    );
    line.userData.dimKey = g.key;
    dimGuideGroup.add(line);

    /* 端点マーカー（視認性） */
    for (const pt of [g.p0, g.p1]) {
      const tick = new THREE.Mesh(
        new THREE.SphereGeometry(active ? 1.1 : 0.7, 8, 8),
        new THREE.MeshBasicMaterial({
          color: active ? DIM_LINE_ACTIVE : DIM_LINE_COLOR,
        })
      );
      tick.position.set(pt[0], pt[1], pt[2]);
      tick.userData.dimKey = g.key;
      dimGuideGroup.add(tick);
    }

    const el = document.createElement("div");
    el.className = `pg-dim-badge${active ? " is-active" : ""}`;
    el.dataset.dimKey = g.key;
    el.textContent = circledNumber(g.index);
    el.setAttribute("aria-label", `${circledNumber(g.index)} ${activeTpl.ranges[g.key]?.label ?? g.key}`);
    const label = new CSS2DObject(el);
    label.position.set(g.labelAt[0], g.labelAt[1], g.labelAt[2]);
    label.userData.dimKey = g.key;
    dimGuideGroup.add(label);
  }
}

/**
 * スライダー ↔ 3D バッジ／寸法線のハイライト同期
 * @param {string | null} key
 */
function setActiveDimKey(key) {
  activeDimKey = key;
  document.querySelectorAll(".pg-field[data-key]").forEach((el) => {
    el.classList.toggle(
      "is-active",
      key != null && el.getAttribute("data-key") === key
    );
  });
  if (!dimGuideGroup) return;
  dimGuideGroup.traverse((obj) => {
    const k = obj.userData?.dimKey;
    if (!k) return;
    const on = k === key;
    if (obj.isCSS2DObject && obj.element) {
      obj.element.classList.toggle("is-active", on);
    }
    if (obj.isLine && obj.material) {
      obj.material.color.setHex(on ? DIM_LINE_ACTIVE : DIM_LINE_COLOR);
      obj.material.opacity = on ? 1 : 0.85;
      obj.material.needsUpdate = true;
    }
    if (obj.isMesh && obj.material?.color) {
      obj.material.color.setHex(on ? DIM_LINE_ACTIVE : DIM_LINE_COLOR);
      obj.scale.setScalar(on ? 1.35 : 1);
    }
  });
}

/**
 * @param {{ frameCamera?: boolean }} [opts]
 */
function rebuildMesh(opts = {}) {
  if (!meshGroup) return;
  while (meshGroup.children.length) {
    const c = meshGroup.children.pop();
    c?.geometry?.dispose?.();
    if (Array.isArray(c?.material)) {
      c.material.forEach((m) => m.dispose?.());
    } else {
      c?.material?.dispose?.();
    }
  }
  const tris = buildTris(activeTpl.id, dims);
  const geo = trisToGeometry(tris);
  const overlay = scanLoaded && scanOverlayOn;
  const mat = new THREE.MeshStandardMaterial({
    color: overlay ? 0x1e3a8a : 0x1e3a8a,
    metalness: 0.08,
    roughness: 0.45,
    flatShading: true,
    transparent: overlay,
    opacity: overlay ? 0.42 : 1,
    depthWrite: !overlay,
  });
  const mesh = new THREE.Mesh(geo, mat);
  meshGroup.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: overlay,
      opacity: overlay ? 0.9 : 1,
    })
  );
  meshGroup.add(edges);

  rebuildDimGuides();
  updateScanInterferenceStatus();

  // カメラは初回・テンプレ切替時のみ
  if (!opts.frameCamera) return;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (box && camera && controls) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    controls.target.copy(center);
    const maxDim = Math.max(size.x, size.y, size.z, 40);
    camera.position.set(
      center.x + maxDim * 1.2,
      center.y + maxDim * 0.9,
      center.z + maxDim * 1.4
    );
  }
}

function trisToAsciiStl(name, tris) {
  const safe = String(name || "part").replace(/[^\w\-]+/g, "_");
  let out = `solid ${safe}\n`;
  for (const t of tris) {
    const [a, b, c] = t;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    out += `  facet normal ${nx} ${ny} ${nz}\n`;
    out += `    outer loop\n`;
    out += `      vertex ${a[0]} ${a[1]} ${a[2]}\n`;
    out += `      vertex ${b[0]} ${b[1]} ${b[2]}\n`;
    out += `      vertex ${c[0]} ${c[1]} ${c[2]}\n`;
    out += `    endloop\n`;
    out += `  endfacet\n`;
  }
  out += `endsolid ${safe}\n`;
  return out;
}

function downloadStl() {
  const tris = buildTris(activeTpl.id, dims);
  const stl = trisToAsciiStl(activeTpl.id, tris);
  const blob = new Blob([stl], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tisly_${activeTpl.id}_${stamp}.stl`;
  a.click();
  URL.revokeObjectURL(url);
  const el = $("#pg-export-status");
  if (el) {
    el.textContent = `STL を保存しました（${tris.length} 三角形）`;
    el.classList.add("is-ok");
    el.classList.remove("is-warn");
  }
}

function renderTemplates() {
  const grid = $("#pg-tpl-grid");
  if (!grid) return;
  grid.innerHTML = TEMPLATES.map(
    (t) => `
    <button type="button" class="pg-tpl-btn${
      t.id === activeTpl.id ? " is-active" : ""
    }" data-id="${t.id}" role="option" aria-selected="${
      t.id === activeTpl.id
    }">
      ${t.label}
      <small>${t.desc}</small>
    </button>`
  ).join("");
  grid.querySelectorAll(".pg-tpl-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const next = TEMPLATES.find((t) => t.id === id);
      if (!next) return;
      activeTpl = next;
      dims = { ...next.defaults };
      activeDimKey = null;
      dimDragging = false;
      renderTemplates();
      renderSliders();
      rebuildMesh({ frameCamera: true });
    });
  });
}

function renderSliders() {
  const host = $("#pg-sliders");
  if (!host) return;
  const keys = dimKeysInOrder(activeTpl);
  host.innerHTML = keys
    .map((key, i) => {
      const r = activeTpl.ranges[key];
      const val = dims[key] ?? activeTpl.defaults[key];
      const num = circledNumber(i + 1);
      const active = key === activeDimKey ? " is-active" : "";
      return `
      <div class="pg-field${active}" data-key="${key}">
        <label for="pg-dim-${key}">
          <span class="pg-field-title">
            <span class="pg-dim-index" aria-hidden="true">${num}</span>
            <span>${r.label}</span>
          </span>
          <span class="pg-field-value" id="pg-val-${key}">${val} mm</span>
        </label>
        <input type="range" class="pg-range" id="pg-dim-${key}"
          min="${r.min}" max="${r.max}" step="${r.step}" value="${val}"
          data-key="${key}" />
      </div>`;
    })
    .join("");

  host.querySelectorAll(".pg-field").forEach((field) => {
    const key = field.getAttribute("data-key");
    if (!key) return;
    field.addEventListener("pointerenter", () => {
      if (!dimDragging) setActiveDimKey(key);
    });
    field.addEventListener("pointerleave", () => {
      if (!dimDragging) setActiveDimKey(null);
    });
  });

  host.querySelectorAll(".pg-range").forEach((input) => {
    input.addEventListener("pointerdown", () => {
      const key = input.getAttribute("data-key");
      dimDragging = true;
      if (key) setActiveDimKey(key);
    });
    input.addEventListener("pointerup", () => {
      dimDragging = false;
    });
    input.addEventListener("pointercancel", () => {
      dimDragging = false;
      setActiveDimKey(null);
    });
    input.addEventListener("focus", () => {
      const key = input.getAttribute("data-key");
      if (key) setActiveDimKey(key);
    });
    input.addEventListener("blur", () => {
      if (!dimDragging) setActiveDimKey(null);
    });
    input.addEventListener("input", () => {
      const key = input.getAttribute("data-key");
      if (!key) return;
      const n = Number(input.value);
      dims[key] = n;
      const lab = $(`#pg-val-${key}`);
      if (lab) lab.textContent = `${n} mm`;
      setActiveDimKey(key);
      rebuildMesh();
    });
  });
}

/**
 * サムネイル一覧を描画
 */
function renderSketchThumbs() {
  const host = $("#pg-sketch-thumbs");
  const prev = $("#pg-sketch-preview");
  const label = $("#pg-sketch-count-label");
  if (label) {
    label.textContent = `選択中のスケッチ（${sketchImages.length}/${SKETCH_MAX}）`;
  }
  if (!host) return;
  if (!sketchImages.length) {
    host.innerHTML = "";
    if (prev) prev.hidden = true;
    return;
  }
  if (prev) prev.hidden = false;
  host.innerHTML = sketchImages
    .map(
      (s, i) => `
    <div class="pg-sketch-thumb" role="listitem" data-id="${s.id}">
      <img src="${s.dataUrl}" alt="スケッチ${i + 1}" />
      <span class="pg-sketch-thumb-idx">${i + 1}</span>
      <button
        type="button"
        class="pg-sketch-thumb-remove"
        data-remove-id="${s.id}"
        aria-label="スケッチ${i + 1}を削除"
      >✕</button>
    </div>`
    )
    .join("");
  host.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-id");
      if (!id) return;
      removeSketchById(id);
    });
  });
}

/**
 * 1枚削除
 * @param {string} id
 */
function removeSketchById(id) {
  sketchImages = sketchImages.filter((s) => s.id !== id);
  renderSketchThumbs();
  const status = $("#pg-ai-status");
  if (status) {
    status.textContent = sketchImages.length
      ? `スケッチ ${sketchImages.length} 枚 — 「AI寸法抽出」で高精度抽出`
      : "スケッチを削除しました";
    status.classList.remove("is-warn", "is-ok");
  }
}

/**
 * File → dataURL + 寸法メタ
 * @param {File} file
 * @returns {Promise<{ id: string, dataUrl: string, width: number, height: number } | null>}
 */
function readSketchFile(file) {
  return new Promise((resolve) => {
    if (!file || !/^image\//i.test(file.type || "")) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `sk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 600,
        });
      };
      img.onerror = () => {
        resolve({
          id: `sk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl,
          width: 800,
          height: 600,
        });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * 複数ファイルを末尾追記（上限4）
 * @param {FileList | File[]} fileList
 */
async function addSketchFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) =>
    /^image\//i.test(f.type || "")
  );
  if (!files.length) return;
  const status = $("#pg-ai-status");
  const room = SKETCH_MAX - sketchImages.length;
  if (room <= 0) {
    if (status) {
      status.textContent = `最大 ${SKETCH_MAX} 枚までです。不要な写真を ✕ で削除してください`;
      status.classList.add("is-warn");
      status.classList.remove("is-ok");
    }
    return;
  }
  const take = files.slice(0, room);
  const loaded = [];
  for (const f of take) {
    const item = await readSketchFile(f);
    if (item) loaded.push(item);
  }
  sketchImages = [...sketchImages, ...loaded].slice(0, SKETCH_MAX);
  renderSketchThumbs();
  if (status) {
    const skipped = files.length - take.length;
    status.textContent = skipped
      ? `${sketchImages.length} 枚登録（上限超過分はスキップ）`
      : `${sketchImages.length} 枚登録済 — 「AI寸法抽出」を押してください`;
    status.classList.remove("is-warn", "is-ok");
  }
}

/** 選択中スケッチを全クリア */
function clearSketch() {
  sketchImages = [];
  renderSketchThumbs();
  const lib = $("#pg-sketch-library");
  const cam = $("#pg-sketch-camera");
  if (lib) lib.value = "";
  if (cam) cam.value = "";
  const status = $("#pg-ai-status");
  if (status) {
    status.textContent = "スケッチを全削除しました";
    status.classList.remove("is-warn", "is-ok");
  }
}

/**
 * 方眼紙（複数アングル）から寸法抽出
 * Gemini Vision API → 失敗時はローカル推定
 */
async function extractDimsFromSketch() {
  const status = $("#pg-ai-status");
  const btn = $("#pg-ai-extract-btn");
  if (!sketchImages.length) {
    if (status) {
      status.textContent =
        "先に「写真から選ぶ」または「カメラで撮影」してください";
      status.classList.add("is-warn");
      status.classList.remove("is-ok");
    }
    return;
  }
  if (btn) btn.disabled = true;
  if (status) {
    status.textContent = `AI寸法抽出中（${sketchImages.length}枚・三面図整合）…`;
    status.classList.remove("is-warn", "is-ok");
  }
  try {
    const res = await fetch("/api/print-generator/v1/sketch-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: sketchImages.map((s) => ({ dataUrl: s.dataUrl })),
        imageMetas: sketchImages.map((s) => ({
          width: s.width,
          height: s.height,
        })),
        hintText: activeTpl?.label || "",
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "extract_failed");
    }
    applyParsedParams(data.templateId, data.params || {});
    renderFeatureFlags(data.features);
    if (status) {
      const via = data.provider === "gemini" ? "Gemini Vision" : "ルール";
      status.textContent =
        `抽出完了（${via}・${sketchImages.length}枚）: ${data.summary || ""}`;
      status.classList.add("is-ok");
      status.classList.remove("is-warn");
    }
  } catch (err) {
    // API 失敗時はローカル平均でフォールバック
    fallbackLocalMultiSketchEstimate();
    if (status) {
      status.textContent =
        `オフライン推定に切替: ${
          err instanceof Error ? err.message : String(err)
        }`;
      status.classList.add("is-warn");
      status.classList.remove("is-ok");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** API 無し時の複数枚平均推定 */
function fallbackLocalMultiSketchEstimate() {
  let sumW = 0;
  let sumD = 0;
  let sumH = 0;
  for (const s of sketchImages) {
    const short = Math.min(s.width, s.height);
    const long = Math.max(s.width, s.height);
    const mmPerPx = 40 / Math.max(short * 0.55, 1);
    sumW += long * mmPerPx * 0.42;
    sumD += short * mmPerPx * 0.38;
    sumH += (long * mmPerPx * 0.42 + short * mmPerPx * 0.38) / 6;
  }
  const n = Math.max(sketchImages.length, 1);
  const estW = Math.round(sumW / n);
  const estD = Math.round(sumD / n);
  const estH = Math.max(15, Math.round(sumH / n));
  const keys = Object.keys(activeTpl.ranges);
  const apply = (key, value) => {
    if (!activeTpl.ranges[key]) return;
    const r = activeTpl.ranges[key];
    dims[key] = Math.min(r.max, Math.max(r.min, value));
  };
  if (keys.includes("width")) apply("width", estW);
  if (keys.includes("plateW")) apply("plateW", estW);
  if (keys.includes("base")) apply("base", estW);
  if (keys.includes("depth")) apply("depth", estD);
  if (keys.includes("plateH")) apply("plateH", estD);
  if (keys.includes("height")) apply("height", estH);
  if (keys.includes("upright")) apply("upright", estH);
  if (keys.includes("thickness") && n >= 2) apply("thickness", 3);
  if (keys.includes("hole") && n >= 2) apply("hole", 4.5);
  if (keys.includes("holePitch") && n >= 2) apply("holePitch", 22);
  renderSliders();
  rebuildMesh();
}

/**
 * 特殊加工フラグをチップ表示
 * @param {Record<string, unknown> | null | undefined} features
 */
function renderFeatureFlags(features) {
  const host = $("#pg-ai-feature-flags");
  if (!host) return;
  if (!features) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  const chips = [];
  if (features.tubeGroove) chips.push("単管R溝");
  if (features.insertNut) chips.push("インサートナット");
  if (features.packingGroove) chips.push("パッキン溝");
  if (features.cornerFillet) chips.push("角R面取り");
  if (Number(features.holeCount) > 0) {
    chips.push(`穴 ${features.holeCount} 箇所`);
  }
  if (!chips.length) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.innerHTML = chips
    .map((c) => `<span class="pg-ai-chip">${c}</span>`)
    .join("");
}

/**
 * API 結果の params をスライダーへ反映
 * @param {string} templateId
 * @param {Record<string, number>} params
 */
function applyParsedParams(templateId, params) {
  const next = TEMPLATES.find((t) => t.id === templateId);
  if (next && next.id !== activeTpl.id) {
    activeTpl = next;
    dims = { ...next.defaults };
  }
  for (const [key, value] of Object.entries(params || {})) {
    if (!activeTpl.ranges[key]) continue;
    const r = activeTpl.ranges[key];
    dims[key] = Math.min(r.max, Math.max(r.min, Number(value)));
  }
  activeDimKey = null;
  dimDragging = false;
  renderTemplates();
  renderSliders();
  rebuildMesh({ frameCamera: true });
}

/**
 * 自然言語プロンプトで 3D 生成
 */
async function generateFromPrompt() {
  const input = $("#pg-ai-prompt");
  const status = $("#pg-ai-prompt-status");
  const btn = $("#pg-ai-generate-btn");
  const prompt = String(input?.value || "").trim();
  if (!prompt) {
    if (status) {
      status.textContent =
        "先にテキストを入力するか、音声入力してください";
      status.classList.add("is-warn");
      status.classList.remove("is-ok");
    }
    return;
  }
  if (btn) btn.disabled = true;
  if (status) {
    status.textContent = "AI が寸法を解析中…";
    status.classList.remove("is-warn", "is-ok");
  }
  try {
    const res = await fetch("/api/print-generator/v1/prompt-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "parse_failed");
    }
    applyParsedParams(data.templateId, data.params || {});
    renderFeatureFlags(data.features);
    if (status) {
      const via = data.provider === "gemini" ? "Gemini" : "ルール";
      status.textContent =
        `生成完了（${via}）: ${data.summary || ""} — STL / ビューワーへ直結可`;
      status.classList.add("is-ok");
      status.classList.remove("is-warn");
    }
    // 印刷ビューワーリンクにテンプレ情報を付与
    const link = $("#pg-viewer-link");
    if (link) {
      link.href =
        `/print-model-viewer?from=/3d-generator&tpl=${encodeURIComponent(
          data.templateId || ""
        )}`;
    }
  } catch (err) {
    if (status) {
      status.textContent =
        `生成に失敗しました: ${
          err instanceof Error ? err.message : String(err)
        }`;
      status.classList.add("is-warn");
      status.classList.remove("is-ok");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** SpeechRecognition コンストラクタ取得 */
function getSpeechRecognitionCtor() {
  const w = window;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * スキャンメッシュを全消去
 * @param {{ silent?: boolean }} [opts]
 */
function clearScanMesh(opts = {}) {
  if (!scanMeshGroup) return;
  while (scanMeshGroup.children.length) {
    const c = scanMeshGroup.children.pop();
    c?.traverse?.((obj) => {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose?.());
      } else {
        obj.material?.dispose?.();
      }
    });
  }
  scanLoaded = false;
  const status = $("#pg-scan-status");
  if (status && !opts.silent) {
    status.textContent = "スキャン未読込";
    status.classList.remove("is-ok", "is-warn", "is-bad");
  }
  const nameEl = $("#pg-scan-name");
  if (nameEl && !opts.silent) nameEl.textContent = "";
  if (!opts.silent) rebuildMesh();
}

/**
 * AABB 干渉ステータス更新
 * （ネジ穴ピッチ・端子開口の目視補助）
 */
function updateScanInterferenceStatus() {
  const status = $("#pg-scan-status");
  if (!status || !scanLoaded || !meshGroup || !scanMeshGroup) return;
  if (!scanOverlayOn) {
    status.textContent = "オーバーレイ OFF（スキャン非表示）";
    status.classList.remove("is-ok", "is-warn", "is-bad");
    return;
  }
  const coverBox = new THREE.Box3().setFromObject(meshGroup);
  const scanBox = new THREE.Box3().setFromObject(scanMeshGroup);
  if (coverBox.isEmpty() || scanBox.isEmpty()) {
    status.textContent = "メッシュ境界を計算中…";
    return;
  }
  const coverSize = coverBox.getSize(new THREE.Vector3());
  const scanSize = scanBox.getSize(new THREE.Vector3());
  const dx = Math.abs(coverSize.x - scanSize.x);
  const dz = Math.abs(coverSize.z - scanSize.z);
  const cl = Number(dims.clearance) || 0.4;
  const overlap = coverBox.intersectsBox(scanBox);
  status.classList.remove("is-ok", "is-warn", "is-bad");
  if (!overlap) {
    status.textContent =
      "干渉なし（AABB 非交差）— 位置合わせを確認";
    status.classList.add("is-warn");
    return;
  }
  if (dx <= cl * 4 && dz <= cl * 4) {
    status.textContent =
      `干渉チェック OK（ΔL ${dx.toFixed(1)} / ΔW ${dz.toFixed(1)} mm · CL ${cl}）`;
    status.classList.add("is-ok");
  } else if (dx <= 8 && dz <= 8) {
    status.textContent =
      `要確認: 寸法差 ΔL ${dx.toFixed(1)} / ΔW ${dz.toFixed(1)} mm — クリアランス調整推奨`;
    status.classList.add("is-warn");
  } else {
    status.textContent =
      `干渉注意: 寸法差が大きい（ΔL ${dx.toFixed(1)} / ΔW ${dz.toFixed(1)} mm）`;
    status.classList.add("is-bad");
  }
}

/**
 * 読込ジオメトリをシーンへ配置
 * @param {THREE.BufferGeometry} geo
 * @param {string} fileName
 */
function placeScanGeometry(geo, fileName) {
  if (!scanMeshGroup) return;
  clearScanMesh({ silent: true });
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (box) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    geo.translate(-center.x, -box.min.y, -center.z);
  }
  const mat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.05,
    roughness: 0.7,
    flatShading: true,
    transparent: true,
    opacity: 0.78,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scanMeshGroup.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x94a3b8, opacity: 0.6, transparent: true })
  );
  scanMeshGroup.add(edges);
  scanLoaded = true;
  scanOverlayOn = true;
  const toggle = $("#pg-scan-overlay-toggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", "true");
    toggle.textContent = "オーバーレイ ON";
  }
  const nameEl = $("#pg-scan-name");
  if (nameEl) nameEl.textContent = fileName || "scan";
  /* RP2350 テンプレへ自動切替（未選択時） */
  if (activeTpl.id !== "rp2350_poe_cover") {
    const next = TEMPLATES.find((t) => t.id === "rp2350_poe_cover");
    if (next) {
      activeTpl = next;
      dims = { ...next.defaults };
      renderTemplates();
      renderSliders();
    }
  }
  rebuildMesh({ frameCamera: true });
  const status = $("#pg-scan-status");
  if (status) {
    status.textContent = `スキャン読込: ${fileName}`;
    status.classList.add("is-ok");
    status.classList.remove("is-warn", "is-bad");
  }
  updateScanInterferenceStatus();
}

/**
 * Revopoint STL/OBJ 読込
 * @param {File} file
 */
async function loadScanFile(file) {
  const status = $("#pg-scan-status");
  if (!file) return;
  const name = file.name || "scan";
  const lower = name.toLowerCase();
  if (status) {
    status.textContent = `読込中… ${name}`;
    status.classList.remove("is-ok", "is-warn", "is-bad");
  }
  try {
    if (lower.endsWith(".stl")) {
      const buf = await file.arrayBuffer();
      const geo = new STLLoader().parse(buf);
      placeScanGeometry(geo, name);
      return;
    }
    if (lower.endsWith(".obj")) {
      const text = await file.text();
      const obj = new OBJLoader().parse(text);
      const geos = [];
      obj.traverse((child) => {
        if (child.isMesh && child.geometry) {
          geos.push(child.geometry.clone());
        }
      });
      if (!geos.length) throw new Error("OBJ にメッシュがありません");
      const merged = geos[0];
      if (geos.length > 1) {
        /* 先頭ジオメトリを代表表示 */
      }
      placeScanGeometry(merged, name);
      return;
    }
    throw new Error("対応形式は STL / OBJ のみです");
  } catch (err) {
    if (status) {
      status.textContent =
        `読込失敗: ${err instanceof Error ? err.message : String(err)}`;
      status.classList.add("is-warn");
    }
  }
}

/** オーバーレイ表示トグル */
function toggleScanOverlay() {
  scanOverlayOn = !scanOverlayOn;
  if (scanMeshGroup) scanMeshGroup.visible = scanOverlayOn;
  const toggle = $("#pg-scan-overlay-toggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", scanOverlayOn ? "true" : "false");
    toggle.textContent = scanOverlayOn ? "オーバーレイ ON" : "オーバーレイ OFF";
  }
  rebuildMesh();
}

/** 音声入力の開始／停止トグル */
function toggleVoiceInput() {
  const status = $("#pg-ai-prompt-status");
  const btn = $("#pg-ai-voice-btn");
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    if (status) {
      status.textContent =
        "このブラウザは音声入力に未対応です（Chrome推奨）";
      status.classList.add("is-warn");
    }
    return;
  }
  if (voiceListening && speechRec) {
    try {
      speechRec.stop();
    } catch {
      /* ignore */
    }
    voiceListening = false;
    if (btn) {
      btn.classList.remove("is-listening");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "🎙️ 音声入力";
    }
    return;
  }
  speechRec = new Ctor();
  speechRec.lang = "ja-JP";
  speechRec.interimResults = true;
  speechRec.continuous = false;
  speechRec.onstart = () => {
    voiceListening = true;
    if (btn) {
      btn.classList.add("is-listening");
      btn.setAttribute("aria-pressed", "true");
      btn.textContent = "⏹ 録音停止";
    }
    if (status) {
      status.textContent = "聞いています… 寸法を話してください";
      status.classList.remove("is-warn", "is-ok");
    }
  };
  speechRec.onresult = (ev) => {
    let transcript = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      transcript += ev.results[i][0].transcript;
    }
    const input = $("#pg-ai-prompt");
    if (input && transcript) {
      input.value = transcript.trim();
    }
  };
  speechRec.onerror = () => {
    voiceListening = false;
    if (btn) {
      btn.classList.remove("is-listening");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "🎙️ 音声入力";
    }
    if (status) {
      status.textContent = "音声認識エラー — テキスト入力も利用できます";
      status.classList.add("is-warn");
    }
  };
  speechRec.onend = () => {
    voiceListening = false;
    if (btn) {
      btn.classList.remove("is-listening");
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "🎙️ 音声入力";
    }
  };
  try {
    speechRec.start();
  } catch {
    if (status) {
      status.textContent = "音声入力を開始できませんでした";
      status.classList.add("is-warn");
    }
  }
}

function bindUi() {
  $("#pg-stl-btn")?.addEventListener("click", downloadStl);
  $("#pg-ai-extract-btn")?.addEventListener("click", extractDimsFromSketch);
  $("#pg-sketch-clear")?.addEventListener("click", clearSketch);
  $("#pg-ai-generate-btn")?.addEventListener("click", generateFromPrompt);
  $("#pg-ai-voice-btn")?.addEventListener("click", toggleVoiceInput);
  $("#pg-scan-clear")?.addEventListener("click", () => clearScanMesh());
  $("#pg-scan-overlay-toggle")?.addEventListener("click", toggleScanOverlay);
  $("#pg-scan-input")?.addEventListener("change", (ev) => {
    const files = ev.target?.files;
    if (!files?.length) return;
    void loadScanFile(files[0]);
    ev.target.value = "";
  });

  /* ドラッグ終了でハイライト解除フラグを戻す */
  window.addEventListener(
    "pointerup",
    () => {
      if (!dimDragging) return;
      dimDragging = false;
    },
    { passive: true }
  );

  // アルバム選択（multiple 対応）
  $("#pg-sketch-library")?.addEventListener("change", (ev) => {
    const files = ev.target?.files;
    if (!files?.length) return;
    void addSketchFiles(files);
    ev.target.value = "";
  });

  // 現場カメラ（1枚ずつ追加）
  $("#pg-sketch-camera")?.addEventListener("change", (ev) => {
    const files = ev.target?.files;
    if (!files?.length) return;
    void addSketchFiles(files);
    ev.target.value = "";
  });
}

renderTemplates();
renderSliders();
bindUi();
initViewer();
