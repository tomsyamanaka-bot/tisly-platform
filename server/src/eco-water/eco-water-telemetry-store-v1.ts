/**
 * Eco-Water IoT テレメトリ・バッファ
 * メモリ + JSON 追記（既存データは削除しない）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateEcoWaterCertificateHashV1,
  isEcoWaterNeutralCompletePhV1,
} from "./eco-water-cert-hash-v1.js";
import {
  ECO_WATER_DEFAULT_SITE_ID_V1,
  ECO_WATER_SITES_V1,
  findEcoWaterSiteV1,
  type EcoWaterSiteV1,
} from "./eco-water-sites-v1.js";
import {
  resolvePhStatusLabelV1,
  isDischargeSafePhV1,
} from "./eco-water-sim-v1.js";

export type EcoWaterValveStatusV1 = "open" | "close";

export interface EcoWaterTelemetryPacketV1 {
  site_id: string;
  ph_value: number;
  valve_status: EcoWaterValveStatusV1;
  calibration_date: string;
  timestamp: string;
}

export interface EcoWaterTelemetryLogV1 {
  id: string;
  siteKey: string;
  siteInternalId: string;
  ph_value: number;
  valve_status: EcoWaterValveStatusV1;
  calibration_date: string;
  timestamp: string;
  receivedAt: string;
  certificateHash: string | null;
  hashId: string | null;
  neutralizeComplete: boolean;
}

export interface EcoWaterSiteStatusV1 {
  site_id: string;
  siteKey: string;
  siteInternalId: string;
  siteName: string;
  companyName: string;
  ph_value: number;
  valve_status: EcoWaterValveStatusV1;
  calibration_date: string;
  timestamp: string;
  receivedAt: string;
  phStatus: { kind: "safe" | "danger"; label: string };
  dischargeSafe: boolean;
  certificateHash: string | null;
  hashId: string | null;
  neutralizeComplete: boolean;
  history: EcoWaterTelemetryLogV1[];
  live: true;
}

const LOG_MAX = 80;

type Listener = (status: EcoWaterSiteStatusV1) => void;

/** siteKey（EW-TKB 等）→ 最新ステータス */
const latestBySite = new Map<string, EcoWaterSiteStatusV1>();
/** siteKey → 履歴（先頭が最新） */
const historyBySite = new Map<string, EcoWaterTelemetryLogV1[]>();
/** siteKey → 中和中のピーク pH（証明書用） */
const peakPhBySite = new Map<string, number>();
const listeners = new Set<Listener>();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBufferPath(): string {
  const override = process.env.TISLY_ECO_WATER_TELEMETRY_PATH;
  if (override && override.trim()) return override.trim();
  return path.join(
    __dirname,
    "..",
    "..",
    "data",
    "eco-water",
    "telemetry-buffer-v1.json"
  );
}

function normalizeSiteKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

/**
 * site_id を解決
 * EW-TKB / tsukuba-tank-b 両対応
 */
export function resolveEcoWaterSiteKeyV1(
  siteIdRaw: string
): { siteKey: string; site: EcoWaterSiteV1 } | null {
  const raw = String(siteIdRaw || "").trim();
  if (!raw) return null;
  const upper = normalizeSiteKey(raw);
  const byPrefix = ECO_WATER_SITES_V1.find(
    (s) => normalizeSiteKey(s.hashIdPrefix) === upper
  );
  if (byPrefix) {
    return { siteKey: byPrefix.hashIdPrefix, site: byPrefix };
  }
  const byId = ECO_WATER_SITES_V1.find((s) => s.id === raw);
  if (byId) {
    return { siteKey: byId.hashIdPrefix, site: byId };
  }
  // 未知でも Prefix 形式なら受け入れる
  if (/^EW-[A-Z0-9]+$/i.test(upper)) {
    const fallback = findEcoWaterSiteV1(ECO_WATER_DEFAULT_SITE_ID_V1);
    return {
      siteKey: upper,
      site: {
        ...fallback,
        hashIdPrefix: upper,
        siteName: `未登録現場 (${upper})`,
        id: `external-${upper.toLowerCase()}`,
      },
    };
  }
  return null;
}

export function validateEcoWaterTelemetryPacketV1(
  body: unknown
): { ok: true; packet: EcoWaterTelemetryPacketV1 } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "JSON オブジェクトが必要です" };
  }
  const b = body as Record<string, unknown>;
  const site_id = String(b.site_id ?? "").trim();
  if (!site_id) {
    return { ok: false, error: "site_id が必要です" };
  }
  const ph_value = Number(b.ph_value);
  if (!Number.isFinite(ph_value) || ph_value < 0 || ph_value > 14) {
    return { ok: false, error: "ph_value は 0〜14 の数値が必要です" };
  }
  const valveRaw = String(b.valve_status ?? "")
    .trim()
    .toLowerCase();
  if (valveRaw !== "open" && valveRaw !== "close") {
    return {
      ok: false,
      error: 'valve_status は "open" または "close" です',
    };
  }
  const calibration_date = String(b.calibration_date ?? "").trim();
  if (!calibration_date) {
    return { ok: false, error: "calibration_date が必要です" };
  }
  const timestamp =
    String(b.timestamp ?? "").trim() || new Date().toISOString();
  return {
    ok: true,
    packet: {
      site_id,
      ph_value,
      valve_status: valveRaw as EcoWaterValveStatusV1,
      calibration_date,
      timestamp,
    },
  };
}

function persistBufferSafe(): void {
  try {
    const filePath = resolveBufferPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload = {
      updatedAt: new Date().toISOString(),
      sites: [...latestBySite.entries()].map(([key, status]) => ({
        key,
        status: {
          ...status,
          history: historyBySite.get(key) || [],
        },
      })),
    };
    // 既存ファイルは上書きだが内容は全サイト merge 保持
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* バッファ失敗でも受信は継続 */
  }
}

function notifyListeners(status: EcoWaterSiteStatusV1): void {
  for (const fn of listeners) {
    try {
      fn(status);
    } catch {
      /* 購読側例外は無視 */
    }
  }
}

/**
 * テレメトリを受信して最新＋履歴へ追記
 * 中和完了（pH≈7.2）時に証明書ハッシュを付与
 */
export function ingestEcoWaterTelemetryV1(
  packet: EcoWaterTelemetryPacketV1
): EcoWaterSiteStatusV1 {
  const resolved = resolveEcoWaterSiteKeyV1(packet.site_id);
  if (!resolved) {
    throw new Error("site_id を解決できません");
  }
  const { siteKey, site } = resolved;
  const receivedAt = new Date().toISOString();
  const prev = latestBySite.get(siteKey);
  const prevPeak = peakPhBySite.get(siteKey) ?? packet.ph_value;
  const peakPh = Math.max(prevPeak, packet.ph_value);
  peakPhBySite.set(siteKey, peakPh);

  const phStatus = resolvePhStatusLabelV1(packet.ph_value);
  const neutralizeComplete =
    isEcoWaterNeutralCompletePhV1(packet.ph_value) &&
    packet.valve_status === "close" &&
    (prev?.valve_status === "open" ||
      (prev != null && prev.ph_value > 8.0) ||
      peakPh > 8.5);

  let certificateHash: string | null = null;
  let hashId: string | null = null;
  if (neutralizeComplete) {
    const cert = generateEcoWaterCertificateHashV1({
      sitePrefix: siteKey,
      timestamp: packet.timestamp,
      phBefore: peakPh,
      phAfter: packet.ph_value,
    });
    certificateHash = cert.certificateHash;
    hashId = cert.hashId;
    // 完了後はピークをリセット（次サイクル用）
    peakPhBySite.set(siteKey, packet.ph_value);
  } else if (prev?.certificateHash && prev.hashId) {
    // 完了直後のハッシュは最新に残す
    certificateHash = prev.certificateHash;
    hashId = prev.hashId;
  }

  const log: EcoWaterTelemetryLogV1 = {
    id: `ew-tel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    siteKey,
    siteInternalId: site.id,
    ph_value: packet.ph_value,
    valve_status: packet.valve_status,
    calibration_date: packet.calibration_date,
    timestamp: packet.timestamp,
    receivedAt,
    certificateHash,
    hashId,
    neutralizeComplete,
  };

  const hist = historyBySite.get(siteKey) || [];
  const nextHist = [log, ...hist].slice(0, LOG_MAX);
  historyBySite.set(siteKey, nextHist);

  const status: EcoWaterSiteStatusV1 = {
    site_id: packet.site_id,
    siteKey,
    siteInternalId: site.id,
    siteName: site.siteName,
    companyName: site.companyName,
    ph_value: packet.ph_value,
    valve_status: packet.valve_status,
    calibration_date: packet.calibration_date,
    timestamp: packet.timestamp,
    receivedAt,
    phStatus,
    dischargeSafe: isDischargeSafePhV1(packet.ph_value),
    certificateHash,
    hashId,
    neutralizeComplete,
    history: nextHist,
    live: true,
  };
  latestBySite.set(siteKey, status);
  persistBufferSafe();
  notifyListeners(status);
  return status;
}

/**
 * 最新ステータス取得
 * 未受信時はサイト定義ベースの待機値
 */
export function getEcoWaterStatusV1(
  siteIdRaw: string
): EcoWaterSiteStatusV1 {
  const resolved = resolveEcoWaterSiteKeyV1(siteIdRaw);
  if (!resolved) {
    const fallback = findEcoWaterSiteV1(ECO_WATER_DEFAULT_SITE_ID_V1);
    const empty: EcoWaterSiteStatusV1 = {
      site_id: siteIdRaw || fallback.hashIdPrefix,
      siteKey: fallback.hashIdPrefix,
      siteInternalId: fallback.id,
      siteName: fallback.siteName,
      companyName: fallback.companyName,
      ph_value: fallback.defaultPh,
      valve_status: "close",
      calibration_date: fallback.calibrationDate.replace(/\//g, "-"),
      timestamp: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      phStatus: resolvePhStatusLabelV1(fallback.defaultPh),
      dischargeSafe: true,
      certificateHash: null,
      hashId: null,
      neutralizeComplete: false,
      history: [],
      live: true,
    };
    return empty;
  }
  const cached = latestBySite.get(resolved.siteKey);
  if (cached) {
    return {
      ...cached,
      history: historyBySite.get(resolved.siteKey) || cached.history,
    };
  }
  const site = resolved.site;
  return {
    site_id: resolved.siteKey,
    siteKey: resolved.siteKey,
    siteInternalId: site.id,
    siteName: site.siteName,
    companyName: site.companyName,
    ph_value: site.defaultPh,
    valve_status: "close",
    calibration_date: site.calibrationDate.replace(/\//g, "-"),
    timestamp: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    phStatus: resolvePhStatusLabelV1(site.defaultPh),
    dischargeSafe: true,
    certificateHash: null,
    hashId: null,
    neutralizeComplete: false,
    history: historyBySite.get(resolved.siteKey) || [],
    live: true,
  };
}

/** SSE / ポーリング用の購読 */
export function subscribeEcoWaterTelemetryV1(
  listener: Listener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** テスト用リセット（本番データは触らない） */
export function resetEcoWaterTelemetryBufferForTestsV1(): void {
  latestBySite.clear();
  historyBySite.clear();
  peakPhBySite.clear();
  listeners.clear();
}
