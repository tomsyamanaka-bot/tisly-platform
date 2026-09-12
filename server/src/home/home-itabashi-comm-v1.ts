/**
 * 板橋自宅 通信ステータス SSOT
 * 豊島邸と同じカード項目を返す。
 * 既存 DI/DO・顧客配列は変更しない。
 */

import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "./home-sites-v1.js";
import {
  TISLY_HEARTBEAT_UI_ONLINE_MS_V1,
  isHeartbeatOnlineV1,
} from "./home-heartbeat-standard-v1.js";
import {
  getToyoshimaOpsConfigV1,
  updateToyoshimaOpsConfigV1,
} from "./home-toyoshima-ops-config-v1.js";
import {
  loadToyoshimaHeartbeatStoreV1,
  saveToyoshimaHeartbeatStoreV1,
  type ToyoshimaHeartbeatStoreV1,
} from "./home-toyoshima-heartbeat-store-v1.js";
import { getHeartbeatDebugSnapshot } from "../remote-test/remote-test-state.js";
import { getTislyOtaVersionV1 } from "../firmware/tisly-rp2350-ota-v1.js";

export const ITABASHI_COMM_SSOT_ID_V1 = "itabashi-commHealth";
export const ITABASHI_BOARD_TEMP_CAUTION_C_V1 = 45;
export const ITABASHI_BOARD_TEMP_WARN_C_V1 = 60;
export const ITABASHI_RP2350_MAIN_ID_V1 = "rp2350-itabashi-main-01";

export interface ItabashiStatusSsotV1 {
  ok: true;
  ssot: typeof ITABASHI_COMM_SSOT_ID_V1;
  siteId: string;
  lastHeartbeatAt: string | null;
  lastHeartbeatLabelJst: string;
  confirmLabelJst: string;
  uiOnline: boolean;
  isHardwareOnline: boolean;
  customerOnline: string;
  operatorOnline: string;
  onlineSummary: string;
  boardTempC: number | null;
  boardTempLabel: string;
  boardTempLevel: "normal" | "caution" | "warning";
  firmwareVersion: string | null;
  firmwareServerVersion: string;
  firmwareLatest: boolean;
  firmwareLabel: string;
  heartbeatWatchEnabled: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseBoardTempC(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < -40 || n > 125) return null;
  return Math.round(n * 10) / 10;
}

function boardTempLevelV1(
  c: number
): "normal" | "caution" | "warning" {
  if (c >= ITABASHI_BOARD_TEMP_WARN_C_V1) return "warning";
  if (c >= ITABASHI_BOARD_TEMP_CAUTION_C_V1) return "caution";
  return "normal";
}

function formatFirmwareLabelV1(running: string | null): string {
  const raw = String(running ?? "").trim();
  if (!raw) return "―";
  return /^v/i.test(raw) ? raw : `v${raw}`;
}

function formatBoardTempLabelV1(c: number | null): string {
  /* 未取得は数値を出さず取得中と書く */
  if (c == null || Number.isNaN(c)) return "―（取得中）";
  const level = boardTempLevelV1(c);
  const suffix =
    level === "warning"
      ? "（警告）"
      : level === "caution"
        ? "（注意）"
        : "（適温・正常）";
  return `${c.toFixed(1)}℃${suffix}`;
}

function formatJstCommTimeV1(iso: string | null): string {
  if (!iso) return "未受信";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "未受信";
  }
}

function formatJstConfirmTimeV1(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function emptyStore(): ToyoshimaHeartbeatStoreV1 {
  return {
    siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    main: {
      lastHeartbeatAt: null,
      lastCommAt: null,
      boardTempC: null,
    },
    detached: {
      lastHeartbeatAt: null,
      lastCommAt: null,
      boardTempC: null,
    },
    updatedAt: nowIso(),
  };
}

function loadStore(): ToyoshimaHeartbeatStoreV1 {
  const existing = loadToyoshimaHeartbeatStoreV1(
    HOME_ITABASHI_LIVE_SITE_ID_V1
  );
  if (existing) return existing;
  /* 初回のみ remote-test 直近を取り込む
   * 既存の板橋行は上書きしない */
  return hydrateFromRemoteTestIfEmpty(emptyStore());
}

/**
 * remote-test の直近 HB を初回だけ取り込む
 * 既存の板橋行は上書きしない
 */
function hydrateFromRemoteTestIfEmpty(
  store: ToyoshimaHeartbeatStoreV1
): ToyoshimaHeartbeatStoreV1 {
  if (store.main.lastHeartbeatAt) return store;
  const snap = getHeartbeatDebugSnapshot();
  if (!snap.lastHeartbeatAt) return store;
  const body =
    snap.heartbeatBody && typeof snap.heartbeatBody === "object"
      ? (snap.heartbeatBody as Record<string, unknown>)
      : {};
  const temp = parseBoardTempC(body.board_temp ?? body.boardTemp);
  const next: ToyoshimaHeartbeatStoreV1 = {
    ...store,
    main: {
      lastHeartbeatAt: snap.lastHeartbeatAt,
      lastCommAt: snap.lastHeartbeatAt,
      boardTempC: temp ?? store.main.boardTempC,
    },
    updatedAt: nowIso(),
  };
  saveToyoshimaHeartbeatStoreV1(next);
  return next;
}

function buildFirmwareSsotV1(): {
  firmwareVersion: string | null;
  firmwareServerVersion: string;
  firmwareLatest: boolean;
  firmwareLabel: string;
} {
  try {
    const ota = getTislyOtaVersionV1({ siteKey: "itabashi" });
    const running = ota.runningVersion || null;
    const server = ota.version || "1.0.0";
    const latest = Boolean(
      running && running === server && !ota.has_ota_update
    );
    return {
      firmwareVersion: running,
      firmwareServerVersion: server,
      firmwareLatest: latest,
      firmwareLabel: formatFirmwareLabelV1(running),
    };
  } catch {
    return {
      firmwareVersion: null,
      firmwareServerVersion: "1.0.0",
      firmwareLatest: false,
      firmwareLabel: "―",
    };
  }
}

/** 板橋自宅の通信ステータス単一ソース */
export function buildItabashiStatusSsotV1(
  nowMs: number = Date.now()
): ItabashiStatusSsotV1 {
  const store = loadStore();
  const lastHeartbeatAt = store.main.lastHeartbeatAt;
  const boardTempC = store.main.boardTempC;
  const uiOnline = isHeartbeatOnlineV1(
    lastHeartbeatAt,
    nowMs,
    TISLY_HEARTBEAT_UI_ONLINE_MS_V1
  );
  const onlineLabel = uiOnline
    ? "🟢 正常稼働中（オンライン）"
    : "🔴 通信途絶";
  const fw = buildFirmwareSsotV1();
  const watch = getToyoshimaOpsConfigV1(HOME_ITABASHI_LIVE_SITE_ID_V1);
  return {
    ok: true,
    ssot: ITABASHI_COMM_SSOT_ID_V1,
    siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    lastHeartbeatAt,
    lastHeartbeatLabelJst: formatJstCommTimeV1(lastHeartbeatAt),
    confirmLabelJst: formatJstConfirmTimeV1(lastHeartbeatAt),
    uiOnline,
    isHardwareOnline: uiOnline,
    customerOnline: uiOnline
      ? "🟢 正常稼働中（オンライン）"
      : "🔴 オフライン（通信途絶）",
    operatorOnline: onlineLabel,
    onlineSummary: onlineLabel,
    boardTempC,
    boardTempLabel: formatBoardTempLabelV1(boardTempC),
    boardTempLevel:
      boardTempC != null ? boardTempLevelV1(boardTempC) : "normal",
    firmwareVersion: fw.firmwareVersion,
    firmwareServerVersion: fw.firmwareServerVersion,
    firmwareLatest: fw.firmwareLatest,
    firmwareLabel: fw.firmwareLabel,
    heartbeatWatchEnabled: watch.heartbeatWatchEnabled !== false,
  };
}

/** 実機 / 疑似ハートビートを追記（既存行は消さない） */
export function recordItabashiHeartbeatV1(input?: {
  boardTemp?: unknown;
  deviceId?: string;
}): ItabashiStatusSsotV1 {
  const at = nowIso();
  const store = loadStore();
  const temp = parseBoardTempC(input?.boardTemp);
  const next: ToyoshimaHeartbeatStoreV1 = {
    ...store,
    siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    main: {
      lastHeartbeatAt: at,
      lastCommAt: at,
      boardTempC: temp ?? store.main.boardTempC,
    },
    updatedAt: at,
  };
  saveToyoshimaHeartbeatStoreV1(next);
  return buildItabashiStatusSsotV1();
}

/** 死活監視トグル（板橋 siteId 行のみ） */
export function setItabashiHeartbeatWatchV1(
  enabled: boolean
): ItabashiStatusSsotV1 {
  updateToyoshimaOpsConfigV1(HOME_ITABASHI_LIVE_SITE_ID_V1, {
    heartbeatWatchEnabled: enabled,
  });
  return buildItabashiStatusSsotV1();
}

export function parseItabashiBoardTempC(raw: unknown): number | null {
  return parseBoardTempC(raw);
}

/** テスト用: 板橋行だけ空に戻す
 * 豊島邸の heartbeat 行は消さない */
export function resetItabashiCommForTestV1(): void {
  saveToyoshimaHeartbeatStoreV1(emptyStore());
  updateToyoshimaOpsConfigV1(HOME_ITABASHI_LIVE_SITE_ID_V1, {
    heartbeatWatchEnabled: true,
  });
}

/** テスト用: 最終受信時刻だけ差し替える */
export function setItabashiHeartbeatAtForTestV1(
  iso: string | null,
  boardTempC?: number | null
): void {
  const store = loadStore();
  saveToyoshimaHeartbeatStoreV1({
    ...store,
    siteId: HOME_ITABASHI_LIVE_SITE_ID_V1,
    main: {
      lastHeartbeatAt: iso,
      lastCommAt: iso,
      boardTempC:
        boardTempC === undefined ? store.main.boardTempC : boardTempC,
    },
    updatedAt: nowIso(),
  });
}
