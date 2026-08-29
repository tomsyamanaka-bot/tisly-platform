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

/** @typedef {{ id: string, label: string, desc: string, defaults: Record<string, number>, ranges: Record<string, {min:number,max:number,step:number,label:string}> }} PrintTemplate */

/** @type {PrintTemplate[]} */
const TEMPLATES = [
  {
    id: "din_rail_bracket",
    label: "DINレールブラケット",
    desc: "盤内・センサ取付",
    defaults: { width: 35, depth: 22, height: 18, thickness: 2.5, hole: 4.2 },
    ranges: {
      width: { min: 20, max: 80, step: 0.5, label: "幅 W" },
      depth: { min: 12, max: 50, step: 0.5, label: "奥行 D" },
      height: { min: 10, max: 40, step: 0.5, label: "高さ H" },
      thickness: { min: 1.5, max: 5, step: 0.1, label: "板厚 t" },
      hole: { min: 3, max: 6, step: 0.1, label: "穴径 Ø" },
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
    },
    ranges: {
      width: { min: 40, max: 160, step: 1, label: "外寸 W" },
      depth: { min: 30, max: 120, step: 1, label: "外寸 D" },
      height: { min: 20, max: 80, step: 1, label: "外寸 H" },
      wall: { min: 1.5, max: 4, step: 0.1, label: "壁厚" },
      lip: { min: 0.8, max: 3, step: 0.1, label: "蓋リップ" },
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
    },
    ranges: {
      plateW: { min: 30, max: 100, step: 1, label: "プレート幅" },
      plateH: { min: 25, max: 80, step: 1, label: "プレート高" },
      plateT: { min: 2, max: 6, step: 0.1, label: "プレート厚" },
      armLen: { min: 15, max: 60, step: 1, label: "アーム長" },
      armW: { min: 8, max: 24, step: 0.5, label: "アーム幅" },
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
    },
    ranges: {
      base: { min: 20, max: 80, step: 1, label: "底辺" },
      upright: { min: 15, max: 70, step: 1, label: "立上り" },
      width: { min: 12, max: 40, step: 0.5, label: "幅" },
      thickness: { min: 1.5, max: 5, step: 0.1, label: "板厚" },
      hole: { min: 2.5, max: 6, step: 0.1, label: "穴径 Ø" },
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
/** @type {string | null} */
let sketchDataUrl = null;
/** 操作中の寸法キー（ハイライト連動） */
/** @type {string | null} */
let activeDimKey = null;
/** スライダー操作中フラグ */
let dimDragging = false;

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
    c?.material?.dispose?.();
  }
  const tris = buildTris(activeTpl.id, dims);
  const geo = trisToGeometry(tris);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    metalness: 0.08,
    roughness: 0.45,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  meshGroup.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x0ea5e9 })
  );
  meshGroup.add(edges);

  rebuildDimGuides();

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
 * 方眼紙画像をプレビューへ反映
 * @param {File} file
 */
function applySketchFile(file) {
  if (!file || !/^image\//i.test(file.type || "")) return;
  const reader = new FileReader();
  reader.onload = () => {
    sketchDataUrl = String(reader.result || "");
    const prev = $("#pg-sketch-preview");
    const img = $("#pg-sketch-img");
    if (img) img.src = sketchDataUrl;
    if (prev) prev.hidden = false;
    const status = $("#pg-ai-status");
    if (status) {
      status.textContent =
        "スケッチ読込済 — 「AI寸法抽出」を押してください";
      status.classList.remove("is-warn", "is-ok");
    }
  };
  reader.readAsDataURL(file);
}

/** 選択中スケッチをクリア */
function clearSketch() {
  sketchDataUrl = null;
  const prev = $("#pg-sketch-preview");
  const img = $("#pg-sketch-img");
  if (img) img.removeAttribute("src");
  if (prev) prev.hidden = true;
  // input value を空にして同一ファイル再選択を許可
  const lib = $("#pg-sketch-library");
  const cam = $("#pg-sketch-camera");
  if (lib) lib.value = "";
  if (cam) cam.value = "";
  const status = $("#pg-ai-status");
  if (status) {
    status.textContent = "スケッチを削除しました";
    status.classList.remove("is-warn", "is-ok");
  }
}

/**
 * 方眼紙画像から概寸を推定
 * （現場即時用ヒューリスティック）
 */
function extractDimsFromSketch() {
  const status = $("#pg-ai-status");
  if (!sketchDataUrl) {
    if (status) {
      status.textContent =
        "先に「写真から選ぶ」または「カメラで撮影」してください";
      status.classList.add("is-warn");
      status.classList.remove("is-ok");
    }
    return;
  }
  const img = new Image();
  img.onload = () => {
    // 短辺≈40mm 方眼想定でスケール
    const short = Math.min(img.naturalWidth, img.naturalHeight);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const mmPerPx = 40 / Math.max(short * 0.55, 1);
    const estW = Math.round(long * mmPerPx * 0.42);
    const estD = Math.round(short * mmPerPx * 0.38);
    const estH = Math.round((estW + estD) / 6);

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
    if (keys.includes("height")) apply("height", Math.max(estH, 15));
    if (keys.includes("upright")) apply("upright", Math.max(estH, 15));

    renderSliders();
    rebuildMesh();
    if (status) {
      status.textContent =
        `AI寸法抽出: 約 W${estW} × D${estD} × H${estH} mm（スライダーへ反映）`;
      status.classList.add("is-ok");
      status.classList.remove("is-warn");
    }
  };
  img.onerror = () => {
    if (status) {
      status.textContent = "画像の読込に失敗しました";
      status.classList.add("is-warn");
    }
  };
  img.src = sketchDataUrl;
}

function bindUi() {
  $("#pg-stl-btn")?.addEventListener("click", downloadStl);
  $("#pg-ai-extract-btn")?.addEventListener("click", extractDimsFromSketch);
  $("#pg-sketch-clear")?.addEventListener("click", clearSketch);

  /* ドラッグ終了でハイライト解除フラグを戻す */
  window.addEventListener(
    "pointerup",
    () => {
      if (!dimDragging) return;
      dimDragging = false;
    },
    { passive: true }
  );

  // アルバム選択（capture なし）
  $("#pg-sketch-library")?.addEventListener("change", (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    applySketchFile(file);
  });

  // 現場カメラ（capture=environment）
  $("#pg-sketch-camera")?.addEventListener("change", (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;
    applySketchFile(file);
  });
}

renderTemplates();
renderSliders();
bindUi();
initViewer();
