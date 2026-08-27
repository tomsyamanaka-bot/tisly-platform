/**
 * セキュリティ画面の即時描画用モック
 * API 成否に依存せず UI を起動する
 * 平屋・手書き間取りデモ
 */

export const FALLBACK_DEFAULT_SITE_ID = "SEC-JP-MORIYA-001";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sensor(partial) {
  return {
    state: "normal",
    alertVisible: false,
    linkedCameraId: null,
    icon: "●",
    ...partial,
  };
}

function room(partial) {
  return { alertVisible: false, ...partial };
}

function nowIso() {
  return new Date().toISOString();
}

const MORIYA_FLOORS = [
  { id: "1f", label: "1F", enabled: true },
  { id: "2f", label: "2F", enabled: false },
  { id: "outdoor", label: "外周・敷地", enabled: true },
];

const TSUKUBA_FLOORS = [
  { id: "outdoor", label: "外周・敷地", enabled: true },
  { id: "2f", label: "2F", enabled: true },
  { id: "1f", label: "1F", enabled: true },
];

function moriyaSite() {
  const rooms = [
    room({
      id: "my-1f-katte",
      floorId: "1f",
      label: "勝手口キッチン",
      x: 4,
      y: 4,
      w: 20,
      h: 20,
    }),
    room({
      id: "my-1f-daidokoro",
      floorId: "1f",
      label: "台所",
      x: 24,
      y: 4,
      w: 20,
      h: 20,
    }),
    room({
      id: "my-1f-toilet",
      floorId: "1f",
      label: "トイレ",
      x: 4,
      y: 24,
      w: 12,
      h: 12,
    }),
    room({
      id: "my-1f-bath",
      floorId: "1f",
      label: "風呂",
      x: 46,
      y: 4,
      w: 16,
      h: 12,
    }),
    room({
      id: "my-1f-wc",
      floorId: "1f",
      label: "WC",
      x: 46,
      y: 16,
      w: 16,
      h: 10,
    }),
    room({
      id: "my-1f-hall",
      floorId: "1f",
      label: "廊下",
      x: 16,
      y: 24,
      w: 46,
      h: 12,
    }),
    room({
      id: "my-1f-living",
      floorId: "1f",
      label: "リビング洋",
      x: 4,
      y: 36,
      w: 34,
      h: 28,
    }),
    room({
      id: "my-1f-yo6a",
      floorId: "1f",
      label: "洋6畳",
      x: 4,
      y: 64,
      w: 22,
      h: 16,
    }),
    room({
      id: "my-1f-yo6b",
      floorId: "1f",
      label: "洋6畳",
      x: 4,
      y: 80,
      w: 22,
      h: 16,
    }),
    room({
      id: "my-1f-oshiire",
      floorId: "1f",
      label: "押入",
      x: 62,
      y: 4,
      w: 34,
      h: 20,
    }),
    room({
      id: "my-1f-doma",
      floorId: "1f",
      label: "土間",
      x: 38,
      y: 48,
      w: 24,
      h: 32,
    }),
    room({
      id: "my-1f-wa10",
      floorId: "1f",
      label: "和10畳",
      x: 62,
      y: 36,
      w: 22,
      h: 32,
    }),
    room({
      id: "my-1f-wa8",
      floorId: "1f",
      label: "和8畳",
      x: 84,
      y: 36,
      w: 12,
      h: 32,
    }),
    room({
      id: "my-1f-hall3",
      floorId: "1f",
      label: "廊下（3尺）",
      x: 62,
      y: 80,
      w: 34,
      h: 16,
    }),
    room({
      id: "my-out-park",
      floorId: "outdoor",
      label: "駐車スペース",
      x: 8,
      y: 16,
      w: 48,
      h: 66,
    }),
    room({
      id: "my-out-garden",
      floorId: "outdoor",
      label: "庭・外周",
      x: 60,
      y: 16,
      w: 32,
      h: 66,
    }),
    room({
      id: "my-out-approach",
      floorId: "outdoor",
      label: "北側進入路",
      x: 28,
      y: 2,
      w: 44,
      h: 16,
    }),
    room({
      id: "my-out-hedge",
      floorId: "outdoor",
      label: "西側植栽帯",
      x: 2,
      y: 16,
      w: 18,
      h: 70,
    }),
    room({
      id: "my-out-house",
      floorId: "outdoor",
      label: "母屋",
      x: 30,
      y: 56,
      w: 40,
      h: 30,
    }),
  ];
  const sensors = [
    sensor({
      id: "my-door-katte",
      floorId: "1f",
      roomId: "my-1f-katte",
      kind: "door",
      label: "勝手口ドアセンサー（20m）",
      icon: "🚪",
      x: 8,
      y: 14,
      linkedCameraId: "my-cam-katte",
    }),
    sensor({
      id: "my-lock-katte",
      floorId: "1f",
      roomId: "my-1f-katte",
      kind: "lock",
      label: "スマートロック",
      icon: "🔒",
      x: 16,
      y: 10,
      linkedCameraId: "my-cam-katte",
    }),
    sensor({
      id: "my-gas-katte",
      floorId: "1f",
      roomId: "my-1f-katte",
      kind: "gas",
      label: "ガス警報器",
      icon: "🔥",
      x: 18,
      y: 18,
    }),
    sensor({
      id: "my-panel-50a",
      floorId: "1f",
      roomId: "my-1f-katte",
      kind: "panel",
      label: "50A個別配",
      icon: "⚡",
      x: 22,
      y: 8,
    }),
    sensor({
      id: "my-mmwave-bath",
      floorId: "1f",
      roomId: "my-1f-hall",
      kind: "mmwave",
      label: "風呂・WC付近人感",
      icon: "📡",
      x: 54,
      y: 22,
      linkedCameraId: "my-cam-living",
    }),
    sensor({
      id: "my-door-living",
      floorId: "1f",
      roomId: "my-1f-living",
      kind: "door",
      label: "リビング洋ドアセンサー",
      icon: "🚪",
      x: 6,
      y: 48,
      linkedCameraId: "my-cam-living",
    }),
    sensor({
      id: "my-door-yo6",
      floorId: "1f",
      roomId: "my-1f-yo6b",
      kind: "door",
      label: "洋6畳ドアセンサー",
      icon: "🚪",
      x: 10,
      y: 92,
      linkedCameraId: "my-cam-living",
    }),
    sensor({
      id: "my-door-wa8",
      floorId: "1f",
      roomId: "my-1f-wa8",
      kind: "door",
      label: "和8畳ドアセンサー",
      icon: "🚪",
      x: 92,
      y: 64,
      linkedCameraId: "my-cam-garden",
    }),
    sensor({
      id: "my-cam-katte",
      floorId: "1f",
      roomId: "my-1f-katte",
      kind: "camera",
      label: "勝手口カメラ 01",
      icon: "📷",
      x: 12,
      y: 20,
      linkedCameraId: "my-cam-katte",
    }),
    sensor({
      id: "my-cam-living",
      floorId: "1f",
      roomId: "my-1f-living",
      kind: "camera",
      label: "リビング洋カメラ",
      icon: "📷",
      x: 28,
      y: 44,
      linkedCameraId: "my-cam-living",
    }),
    sensor({
      id: "my-cam-garden",
      floorId: "outdoor",
      roomId: "my-out-garden",
      kind: "camera",
      label: "庭・外周カメラ",
      icon: "📷",
      x: 76,
      y: 40,
      linkedCameraId: "my-cam-garden",
    }),
    sensor({
      id: "my-cam-park",
      floorId: "outdoor",
      roomId: "my-out-park",
      kind: "camera",
      label: "駐車カメラ",
      icon: "📷",
      x: 30,
      y: 50,
      linkedCameraId: "my-cam-park",
    }),
    sensor({
      id: "my-di1-park",
      floorId: "outdoor",
      roomId: "my-out-approach",
      kind: "mmwave",
      label: "進入路センサー (DI1)",
      icon: "📡",
      x: 50,
      y: 10,
    }),
    sensor({
      id: "my-di2-garage",
      floorId: "outdoor",
      roomId: "my-out-park",
      kind: "mmwave",
      label: "駐車場センサー (DI2)",
      icon: "📡",
      x: 48,
      y: 36,
    }),
    sensor({
      id: "my-do2-light",
      floorId: "outdoor",
      roomId: "my-out-house",
      kind: "light",
      label: "防犯ライト (DO2)",
      icon: "💡",
      x: 50,
      y: 56,
    }),
  ];
  return {
    siteId: "SEC-JP-MORIYA-001",
    id: "SEC-JP-MORIYA-001",
    displayName: "平屋デモ宅（手書き間取り）",
    addressLabel: "茨城県守谷市",
    countryCode: "JP",
    currency: "JPY",
    planCode: "home_security_std",
    planStatus: "active",
    tenantId: "tenant_toms_jp",
    hasAlert: false,
    guardMode: "away",
    guardModeLabel: "外出警戒",
    statusEmoji: "🟢",
    statusLabel: "正常です",
    floors: MORIYA_FLOORS,
    rooms,
    sensors,
    notes: [
      "平屋・手書き間取りに基づくデモ物件です",
      "外出警戒モードです",
    ],
    soc: {
      cameras: [
        {
          id: "my-cam-katte",
          label: "勝手口カメラ 01",
          customerLabel: "勝手口のカメラ",
          scene: "backdoor",
        },
        {
          id: "my-cam-living",
          label: "リビング洋カメラ",
          customerLabel: "リビングのカメラ",
          scene: "lobby",
        },
        {
          id: "my-cam-park",
          label: "駐車カメラ",
          customerLabel: "駐車場のカメラ",
          scene: "parking",
        },
      ],
      alarmLogs: [],
      lightingOn: 4,
      lightingTotal: 8,
      energyKw: 2.35,
      energyMaxKw: 5.21,
      networkMs: 12,
      lastHeartbeatAt: null,
      deviceOnline: false,
      weather: {
        tempC: 12.5,
        humidity: 62,
        windMs: 2.1,
        label: "晴れ",
      },
      selectedCameraId: "my-cam-katte",
    },
  };
}

function tsukubaSite() {
  const site = moriyaSite();
  site.siteId = "SEC-JP-TSUKUBA-001";
  site.id = "SEC-JP-TSUKUBA-001";
  site.displayName = "つくばモデルハウス";
  site.addressLabel = "茨城県つくば市";
  site.floors = TSUKUBA_FLOORS;
  site.guardMode = "home";
  site.guardModeLabel = "在宅警備";
  site.soc.energyKw = 1.82;
  site.notes = [
    "つくばモデルハウス（フォールバック）",
    "在宅警備モードです",
  ];
  return site;
}

function itabashiSite() {
  const site = moriyaSite();
  site.siteId = "SEC-JP-ITABASHI-LIVE";
  site.id = "SEC-JP-ITABASHI-LIVE";
  site.displayName = "板橋自宅";
  site.addressLabel = "東京都板橋区";
  site.planCode = "home_live";
  site.notes = [
    "RP2350 実機連動（HOME-JP-ITABASHI-LIVE）",
    "DI/DO ステータスは板橋自宅ライブと同期します",
  ];
  site.soc.energyKw = 2.1;
  site.soc.energyMaxKw = 6;
  site.soc.networkMs = 8;
  return site;
}

export function listFallbackSites() {
  return [
    {
      id: "SEC-JP-ITABASHI-LIVE",
      siteId: "SEC-JP-ITABASHI-LIVE",
      displayName: "板橋自宅",
      countryCode: "JP",
    },
    {
      id: "SEC-JP-MORIYA-001",
      siteId: "SEC-JP-MORIYA-001",
      displayName: "平屋デモ宅（手書き間取り）",
      countryCode: "JP",
    },
    {
      id: "SEC-JP-TSUKUBA-001",
      siteId: "SEC-JP-TSUKUBA-001",
      displayName: "つくばモデルハウス",
      countryCode: "JP",
    },
  ];
}

export function getFallbackSite(siteId) {
  const id = String(siteId || FALLBACK_DEFAULT_SITE_ID);
  if (id === "SEC-JP-ITABASHI-LIVE") return clone(itabashiSite());
  const site =
    id === "SEC-JP-TSUKUBA-001" ? tsukubaSite() : moriyaSite();
  return clone(site);
}

export function getFallbackOperatorBundle(siteId) {
  const site = getFallbackSite(siteId);
  const sites = listFallbackSites();
  return {
    site,
    dashboard: {
      totalSites: sites.length,
      alertCount: site.hasAlert ? 1 : 0,
      sites,
    },
  };
}

export function getFallbackCustomerDash(siteId) {
  const site = getFallbackSite(siteId);
  return {
    ...site,
    status: site.hasAlert ? "alert" : "normal",
    statusEmoji: site.hasAlert ? "🔴" : "🟢",
    statusLabel: site.hasAlert
      ? "異常があります"
      : "正常に動いています",
  };
}

export function applyLocalPrimaryAlert(site) {
  if (!site) return site;
  if (site.hasAlert) {
    return applyLocalAck(site);
  }
  const target =
    (site.sensors || []).find(
      (s) =>
        s.id === "my-door-katte" ||
        String(s.label || "").includes("勝手口ドア")
    ) ||
    (site.sensors || []).find((s) => s.kind === "door") ||
    (site.sensors || [])[0];
  if (!target) return site;
  target.state = "alert";
  target.alertVisible = true;
  const room = (site.rooms || []).find(
    (r) => r.id === target.roomId
  );
  if (room) room.alertVisible = true;
  site.hasAlert = true;
  site.statusEmoji = "🔴";
  site.statusLabel = "発報があります";
  site.status = "alert";
  if (!site.soc) site.soc = {};
  if (!Array.isArray(site.soc.alarmLogs)) site.soc.alarmLogs = [];
  site.soc.alarmLogs.unshift({
    id: `local-${Date.now()}`,
    at: nowIso(),
    floorId: target.floorId || "1f",
    location: room?.label || "勝手口キッチン",
    kind: target.kind || "door",
    kindLabel: "開放検知",
    deviceLabel: target.label || "勝手口ドアセンサー",
    sensorId: target.id,
    cameraId: target.linkedCameraId || null,
    status: "open",
    handler: "",
  });
  site.soc.selectedCameraId =
    target.linkedCameraId || site.soc.selectedCameraId;
  site.notes = [
    "1F 勝手口キッチン / 勝手口ドアセンサーが発報しています",
    ...(site.notes || []).slice(0, 3),
  ];
  return site;
}

export function applyLocalAck(site) {
  if (!site) return site;
  (site.sensors || []).forEach((s) => {
    s.state = "normal";
    s.alertVisible = false;
  });
  (site.rooms || []).forEach((r) => {
    r.alertVisible = false;
  });
  site.hasAlert = false;
  site.statusEmoji = "🟢";
  site.statusLabel = "正常です";
  site.status = "normal";
  if (site.soc?.alarmLogs) {
    site.soc.alarmLogs.forEach((l) => {
      if (l.status !== "done") {
        l.status = "done";
        l.handler = "デモ管理者";
      }
    });
  }
  return site;
}

export function applyLocalGuardMode(site, mode) {
  if (!site) return site;
  site.guardMode = mode;
  site.guardModeLabel =
    mode === "home"
      ? "在宅警備"
      : mode === "away"
        ? "外出警戒"
        : "警戒解除";
  if (mode === "disarmed") applyLocalAck(site);
  return site;
}

export function applyLocalLights(site, on) {
  if (!site) return site;
  if (!site.soc) site.soc = {};
  const total = site.soc.lightingTotal || 8;
  site.soc.lightingOn = on ? total : 0;
  return site;
}

export function markSecurityUiReady() {
  window.__TISLY_SF_READY = true;
  document.body?.setAttribute("data-sf-ready", "1");
}
