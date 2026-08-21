/**
 * プリセット: つくばモデルハウス（2階建て＋外周）/ 平屋デモ住宅
 */

import {
  DEFAULT_FLOORPLAN_RENDER_V1,
  type FloorplanConfigV1,
  type FloorplanFloorLayerV1,
} from "./floorplan-types-v1.js";

function nowIso(): string {
  return new Date().toISOString();
}

function buildSecurityBridge(
  id: string,
  floors: FloorplanFloorLayerV1[]
): FloorplanConfigV1["security"] {
  const rooms = floors.flatMap((f) =>
    f.rooms.map((r) => ({
      id: r.id,
      floorId: f.id,
      label: r.label,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
    }))
  );
  const openings = floors.flatMap((f) =>
    f.openings.map((o) => ({
      id: o.id,
      floorId: f.id,
      kind: o.kind,
      label: o.label,
      x: o.x,
      y: o.y,
    }))
  );
  const devices = floors.flatMap((f) =>
    (f.devices || []).map((d) => ({
      id: d.id,
      floorId: f.id,
      kind: d.kind,
      label: d.label,
      x: d.x,
      y: d.y,
    }))
  );
  return { siteId: id, rooms, openings, devices };
}

/** 手書き方眼紙に近い平屋レイアウト（1F + 外周） */
const HIRAYA_1F: FloorplanFloorLayerV1 = {
  id: "1f",
  label: "1階",
  enabled: true,
  backgroundImage: "/images/floorplan/handplan-demo.png",
  gridCells: 20,
  walls: [
    { id: "w1", x1: 4, y1: 4, x2: 96, y2: 4 },
    { id: "w2", x1: 96, y1: 4, x2: 96, y2: 96 },
    { id: "w3", x1: 96, y1: 96, x2: 4, y2: 96 },
    { id: "w4", x1: 4, y1: 96, x2: 4, y2: 4 },
  ],
  rooms: [
    { id: "hiraya-katte", label: "勝手口キッチン", x: 4, y: 4, w: 20, h: 20 },
    { id: "hiraya-daidokoro", label: "台所", x: 24, y: 4, w: 20, h: 20 },
    { id: "hiraya-toilet", label: "トイレ", x: 4, y: 24, w: 12, h: 12 },
    { id: "hiraya-bath", label: "風呂", x: 46, y: 4, w: 16, h: 12 },
    { id: "hiraya-wc", label: "WC", x: 46, y: 16, w: 16, h: 10 },
    { id: "hiraya-hall", label: "廊下", x: 16, y: 24, w: 46, h: 12 },
    { id: "hiraya-living", label: "リビング洋", x: 4, y: 36, w: 34, h: 28 },
    { id: "hiraya-yo6a", label: "洋6畳", x: 4, y: 64, w: 22, h: 16 },
    { id: "hiraya-yo6b", label: "洋6畳", x: 4, y: 80, w: 22, h: 16 },
    { id: "hiraya-oshiire", label: "押入", x: 62, y: 4, w: 34, h: 20 },
    { id: "hiraya-doma", label: "土間", x: 38, y: 48, w: 24, h: 32 },
    { id: "hiraya-wa10", label: "和10畳", x: 62, y: 36, w: 22, h: 32 },
    { id: "hiraya-wa8", label: "和8畳", x: 84, y: 36, w: 12, h: 32 },
    { id: "hiraya-hall3", label: "廊下（3尺）", x: 62, y: 80, w: 34, h: 16 },
  ],
  openings: [
    { id: "hiraya-ent", kind: "entrance", label: "玄関", x: 50, y: 92 },
    { id: "hiraya-back", kind: "backdoor", label: "勝手口", x: 8, y: 14 },
    { id: "hiraya-win-l", kind: "window", label: "窓（リビング）", x: 6, y: 48 },
    { id: "hiraya-win-w", kind: "window", label: "窓（和室）", x: 92, y: 64 },
  ],
  devices: [
    { id: "hiraya-dev-cam-ent", kind: "camera", label: "玄関カメラ", x: 48, y: 88 },
    { id: "hiraya-dev-door-back", kind: "door", label: "勝手口センサー", x: 8, y: 14 },
    { id: "hiraya-dev-lock", kind: "lock", label: "玄関スマートロック", x: 52, y: 90 },
    { id: "hiraya-dev-panel", kind: "panel", label: "分電盤", x: 28, y: 28 },
    { id: "hiraya-dev-mmwave", kind: "mmwave", label: "リビングミリ波", x: 20, y: 48 },
  ],
};

const HIRAYA_OUTDOOR: FloorplanFloorLayerV1 = {
  id: "outdoor",
  label: "外周・敷地",
  enabled: true,
  backgroundImage: null,
  gridCells: 20,
  walls: [
    { id: "ow1", x1: 8, y1: 10, x2: 92, y2: 10 },
    { id: "ow2", x1: 92, y1: 10, x2: 92, y2: 90 },
    { id: "ow3", x1: 92, y1: 90, x2: 8, y2: 90 },
    { id: "ow4", x1: 8, y1: 90, x2: 8, y2: 10 },
  ],
  rooms: [
    { id: "hiraya-park", label: "駐車スペース", x: 8, y: 16, w: 48, h: 66 },
    { id: "hiraya-garden", label: "ガーデン", x: 60, y: 16, w: 32, h: 66 },
  ],
  openings: [
    { id: "hiraya-gate", kind: "entrance", label: "門扉", x: 20, y: 88 },
    { id: "hiraya-meter", kind: "door", label: "メーター", x: 10, y: 40 },
  ],
  devices: [
    { id: "hiraya-out-cam", kind: "camera", label: "外周カメラ", x: 88, y: 24 },
    { id: "hiraya-out-gate", kind: "door", label: "門扉センサー", x: 20, y: 88 },
  ],
};

const HIRAYA_2F_DISABLED: FloorplanFloorLayerV1 = {
  id: "2f",
  label: "2階",
  enabled: false,
  backgroundImage: null,
  gridCells: 20,
  walls: [],
  rooms: [],
  openings: [],
  devices: [],
};

/** つくばモデルハウス（2階建て） */
const TSUKUBA_1F: FloorplanFloorLayerV1 = {
  id: "1f",
  label: "1階",
  enabled: true,
  backgroundImage: null,
  gridCells: 20,
  walls: [
    { id: "t1w1", x1: 5, y1: 8, x2: 95, y2: 8 },
    { id: "t1w2", x1: 95, y1: 8, x2: 95, y2: 92 },
    { id: "t1w3", x1: 95, y1: 92, x2: 5, y2: 92 },
    { id: "t1w4", x1: 5, y1: 92, x2: 5, y2: 8 },
  ],
  rooms: [
    { id: "tkb-1f-genkan", label: "玄関", x: 2, y: 58, w: 22, h: 38 },
    { id: "tkb-1f-living", label: "リビング", x: 26, y: 8, w: 46, h: 52 },
    { id: "tkb-1f-kitchen", label: "キッチン", x: 74, y: 8, w: 24, h: 42 },
    { id: "tkb-1f-wash", label: "洗面・WC", x: 74, y: 52, w: 24, h: 20 },
    { id: "tkb-1f-stairs", label: "階段", x: 52, y: 62, w: 20, h: 28 },
    { id: "tkb-1f-storage", label: "納戸", x: 26, y: 62, w: 24, h: 28 },
  ],
  openings: [
    { id: "tkb-ent", kind: "entrance", label: "玄関ドア", x: 12, y: 92 },
    { id: "tkb-back", kind: "backdoor", label: "勝手口", x: 92, y: 28 },
    { id: "tkb-win1", kind: "window", label: "窓（LDK）", x: 40, y: 8 },
  ],
  devices: [
    { id: "tkb-dev-cam-ent", kind: "camera", label: "玄関カメラ", x: 14, y: 86 },
    { id: "tkb-dev-door", kind: "door", label: "玄関ドアセンサー", x: 12, y: 92 },
    { id: "tkb-dev-lock", kind: "lock", label: "玄関ロック", x: 18, y: 90 },
    { id: "tkb-dev-mmwave", kind: "mmwave", label: "リビングミリ波", x: 48, y: 32 },
    { id: "tkb-dev-panel", kind: "panel", label: "分電盤", x: 78, y: 58 },
  ],
};

const TSUKUBA_2F: FloorplanFloorLayerV1 = {
  id: "2f",
  label: "2階",
  enabled: true,
  backgroundImage: null,
  gridCells: 20,
  walls: [
    { id: "t2w1", x1: 10, y1: 12, x2: 90, y2: 12 },
    { id: "t2w2", x1: 90, y1: 12, x2: 90, y2: 88 },
    { id: "t2w3", x1: 90, y1: 88, x2: 10, y2: 88 },
    { id: "t2w4", x1: 10, y1: 88, x2: 10, y2: 12 },
  ],
  rooms: [
    { id: "tkb-2f-master", label: "主寝室", x: 12, y: 14, w: 40, h: 36 },
    { id: "tkb-2f-child", label: "子供部屋", x: 54, y: 14, w: 34, h: 36 },
    { id: "tkb-2f-bath", label: "浴室", x: 12, y: 54, w: 28, h: 30 },
    { id: "tkb-2f-hall", label: "廊下", x: 42, y: 54, w: 20, h: 30 },
    { id: "tkb-2f-closet", label: "クローゼット", x: 64, y: 54, w: 24, h: 30 },
  ],
  openings: [
    { id: "tkb-2f-win", kind: "window", label: "窓（主寝室）", x: 20, y: 14 },
    { id: "tkb-2f-balc", kind: "door", label: "バルコニー", x: 70, y: 14 },
  ],
  devices: [
    { id: "tkb-2f-cam", kind: "camera", label: "2F廊下カメラ", x: 50, y: 60 },
    { id: "tkb-2f-mmwave", kind: "mmwave", label: "主寝室ミリ波", x: 30, y: 30 },
  ],
};

const TSUKUBA_OUTDOOR: FloorplanFloorLayerV1 = {
  id: "outdoor",
  label: "外周・敷地",
  enabled: true,
  backgroundImage: null,
  gridCells: 20,
  walls: [
    { id: "tow1", x1: 5, y1: 5, x2: 95, y2: 5 },
    { id: "tow2", x1: 95, y1: 5, x2: 95, y2: 95 },
    { id: "tow3", x1: 95, y1: 95, x2: 5, y2: 95 },
    { id: "tow4", x1: 5, y1: 95, x2: 5, y2: 5 },
  ],
  rooms: [
    { id: "tkb-out-park", label: "駐車場", x: 8, y: 55, w: 40, h: 36 },
    { id: "tkb-out-garden", label: "庭", x: 52, y: 10, w: 40, h: 50 },
    { id: "tkb-out-gate", label: "門まわり", x: 8, y: 10, w: 40, h: 40 },
  ],
  openings: [
    { id: "tkb-gate", kind: "entrance", label: "門", x: 28, y: 92 },
    { id: "tkb-cam", kind: "door", label: "外周カメラ位置", x: 88, y: 20 },
  ],
  devices: [
    { id: "tkb-out-cam", kind: "camera", label: "外周カメラ", x: 88, y: 20 },
    { id: "tkb-out-gate", kind: "door", label: "門センサー", x: 28, y: 92 },
  ],
};

export function createHirayaDemoPresetV1(): FloorplanConfigV1 {
  const floors = [HIRAYA_1F, HIRAYA_2F_DISABLED, HIRAYA_OUTDOOR];
  const id = "FP-HIRAYA-DEMO-001";
  return {
    version: 1,
    id,
    name: "平屋デモ住宅",
    presetId: "hiraya_demo",
    scaleLabel: "1マス = 3尺",
    metersPerCell: 0.909,
    activeFloor: "1f",
    floors: structuredClone(floors),
    render: { ...DEFAULT_FLOORPLAN_RENDER_V1 },
    security: buildSecurityBridge(id, floors),
    updatedAt: nowIso(),
  };
}

export function createTsukubaModelHousePresetV1(): FloorplanConfigV1 {
  const floors = [TSUKUBA_1F, TSUKUBA_2F, TSUKUBA_OUTDOOR];
  const id = "FP-TSUKUBA-MH-001";
  return {
    version: 1,
    id,
    name: "つくばモデルハウス（2階建て＋外周）",
    presetId: "tsukuba_model_house",
    scaleLabel: "1マス = 3尺",
    metersPerCell: 0.909,
    activeFloor: "1f",
    floors: structuredClone(floors),
    render: {
      ...DEFAULT_FLOORPLAN_RENDER_V1,
      wallHeight: 2.8,
      glowColor: "#059669",
      glowColorAlt: "#0284c7",
    },
    security: buildSecurityBridge(id, floors),
    updatedAt: nowIso(),
  };
}

export function listFloorplanPresetsV1(): FloorplanConfigV1[] {
  return [
    createTsukubaModelHousePresetV1(),
    createHirayaDemoPresetV1(),
  ];
}

export function getFloorplanPresetByIdV1(
  presetId: string
): FloorplanConfigV1 | null {
  const key = String(presetId || "").trim();
  if (key === "tsukuba_model_house" || key === "tsukuba") {
    return createTsukubaModelHousePresetV1();
  }
  if (key === "hiraya_demo" || key === "hiraya") {
    return createHirayaDemoPresetV1();
  }
  return null;
}

/** Security 互換 rooms へ再計算 */
export function refreshSecurityBridgeV1(
  config: FloorplanConfigV1
): FloorplanConfigV1 {
  return {
    ...config,
    security: buildSecurityBridge(config.id, config.floors),
    updatedAt: nowIso(),
  };
}
