/**
 * セキュリティ画面の即時描画用モック
 * API 成否に依存せず UI を起動する
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
  { id: "outdoor", label: "外周・敷地", enabled: true },
  { id: "2f", label: "2F", enabled: true },
  { id: "1f", label: "1F", enabled: true },
];

const TSUKUBA_FLOORS = [
  { id: "outdoor", label: "外周・敷地", enabled: true },
  { id: "2f", label: "2F", enabled: true },
  { id: "1f", label: "1F", enabled: true },
];

function moriyaSite() {
  const rooms = [
    room({
      id: "my-1f-entry",
      floorId: "1f",
      label: "玄関ホール",
      x: 4,
      y: 58,
      w: 24,
      h: 38,
    }),
    room({
      id: "my-1f-living",
      floorId: "1f",
      label: "リビング",
      x: 30,
      y: 8,
      w: 44,
      h: 54,
    }),
    room({
      id: "my-1f-kitchen",
      floorId: "1f",
      label: "キッチン",
      x: 76,
      y: 8,
      w: 20,
      h: 40,
    }),
    room({
      id: "my-2f-master",
      floorId: "2f",
      label: "主寝室",
      x: 6,
      y: 10,
      w: 42,
      h: 48,
    }),
    room({
      id: "my-2f-child",
      floorId: "2f",
      label: "子供部屋",
      x: 52,
      y: 10,
      w: 42,
      h: 48,
    }),
    room({
      id: "my-out-park",
      floorId: "outdoor",
      label: "ガレージ",
      x: 6,
      y: 16,
      w: 50,
      h: 68,
    }),
    room({
      id: "my-out-garden",
      floorId: "outdoor",
      label: "庭・外周",
      x: 60,
      y: 16,
      w: 34,
      h: 68,
    }),
  ];
  const sensors = [
    sensor({
      id: "my-door-front",
      floorId: "1f",
      roomId: "my-1f-entry",
      kind: "door",
      label: "玄関ドアセンサー",
      icon: "🚪",
      x: 16,
      y: 88,
      linkedCameraId: "my-cam-entry",
    }),
    sensor({
      id: "my-lock-front",
      floorId: "1f",
      roomId: "my-1f-entry",
      kind: "lock",
      label: "玄関スマートロック",
      icon: "🔒",
      x: 16,
      y: 72,
      linkedCameraId: "my-cam-entry",
    }),
    sensor({
      id: "my-mmwave-living",
      floorId: "1f",
      roomId: "my-1f-living",
      kind: "mmwave",
      label: "LDKミリ波人感",
      icon: "📡",
      x: 52,
      y: 32,
      linkedCameraId: "my-cam-living",
    }),
    sensor({
      id: "my-cam-entry",
      floorId: "1f",
      roomId: "my-1f-entry",
      kind: "camera",
      label: "玄関カメラ 01",
      icon: "📷",
      x: 10,
      y: 62,
      linkedCameraId: "my-cam-entry",
    }),
    sensor({
      id: "my-cam-living",
      floorId: "1f",
      roomId: "my-1f-living",
      kind: "camera",
      label: "LDKカメラ",
      icon: "📷",
      x: 40,
      y: 20,
      linkedCameraId: "my-cam-living",
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
      id: "my-mmwave-2f",
      floorId: "2f",
      roomId: "my-2f-master",
      kind: "mmwave",
      label: "2F寝室ミリ波",
      icon: "📡",
      x: 24,
      y: 32,
    }),
    sensor({
      id: "my-window-2f",
      floorId: "2f",
      roomId: "my-2f-master",
      kind: "window",
      label: "2Fバルコニー窓",
      icon: "🪟",
      x: 40,
      y: 16,
    }),
  ];
  return {
    siteId: "SEC-JP-MORIYA-001",
    id: "SEC-JP-MORIYA-001",
    displayName: "守谷市 美園の家",
    addressLabel: "茨城県守谷市美園",
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
      "モック表示（API未接続時も操作できます）",
      "外出警戒モードです",
    ],
    soc: {
      cameras: [
        {
          id: "my-cam-entry",
          label: "玄関カメラ 01",
          customerLabel: "玄関のカメラ",
          scene: "entry",
        },
        {
          id: "my-cam-living",
          label: "LDKカメラ",
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
      weather: {
        tempC: 12.5,
        humidity: 62,
        windMs: 2.1,
        label: "晴れ",
      },
      selectedCameraId: "my-cam-entry",
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

export function listFallbackSites() {
  return [
    {
      id: "SEC-JP-MORIYA-001",
      siteId: "SEC-JP-MORIYA-001",
      displayName: "守谷市 美園の家",
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
  const site =
    id === "SEC-JP-TSUKUBA-001" ? tsukubaSite() : moriyaSite();
  return clone(site);
}

export function getFallbackOperatorBundle(siteId) {
  const site = getFallbackSite(siteId);
  return {
    site,
    dashboard: {
      totalSites: 2,
      alertCount: site.hasAlert ? 1 : 0,
      sites: listFallbackSites(),
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
  const target =
    (site.sensors || []).find(
      (s) =>
        s.id === "my-door-front" ||
        String(s.label || "").includes("玄関ドア")
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
    location: room?.label || "玄関ホール",
    kindLabel: "侵入検知",
    deviceLabel: target.label || "玄関ドアセンサー",
    sensorId: target.id,
    cameraId: target.linkedCameraId || null,
    status: "open",
    handler: "",
  });
  site.soc.selectedCameraId =
    target.linkedCameraId || site.soc.selectedCameraId;
  site.notes = [
    "1F エントランス / 玄関ドアセンサーが発報しています",
    ...(site.notes || []).slice(0, 3),
  ];
  return site;
}

export function applyLocalAck(site) {
  if (!site) return site;
  for (const sensor of site.sensors || []) {
    sensor.state = "normal";
    sensor.alertVisible = false;
  }
  for (const room of site.rooms || []) {
    room.alertVisible = false;
  }
  site.hasAlert = false;
  site.statusEmoji = "🟢";
  site.statusLabel = "正常です";
  site.status = "normal";
  for (const log of site.soc?.alarmLogs || []) {
    if (log.status !== "done") {
      log.status = "done";
      log.handler = "デモ管理者";
    }
  }
  return site;
}

export function applyLocalLights(site, on) {
  if (!site) return site;
  if (!site.soc) site.soc = {};
  const total = site.soc.lightingTotal || 8;
  site.soc.lightingOn = on ? total : 0;
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
  if (mode === "disarmed") {
    applyLocalAck(site);
  }
  return site;
}

export function markSecurityUiReady() {
  window.__TISLY_SF_READY = true;
}
