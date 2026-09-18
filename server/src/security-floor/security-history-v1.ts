/**
 * センサー検知・セキュリティ履歴（直近50件）
 *
 * 既存の alarmLogs / サイト配列 / 顧客データは削除しない。
 * 板橋自宅は実機ログを優先し、件数不足時のみモックで埋める。
 */

import { HOME_ITABASHI_LIVE_SITE_ID_V1 } from "../home/home-sites-v1.js";
import { listSystemLogsV1 } from "../home/home-system-log-v1.js";
import { buildToyoshimaSecurityDashboardV1 } from "../home/home-toyoshima-security-v1.js";
import {
  SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1,
  SECURITY_FLOOR_TOYOSHIMA_SITE_ID_V1,
} from "./security-floor-sites-v1.js";
import {
  listSecurityAlarmLogsV1,
  mapHomeSiteIdToSecurityFloorSiteIdV1,
  type SecurityAlarmLogV1,
} from "./security-floor-soc-v1.js";

export const SECURITY_HISTORY_LIMIT_V1 = 50;

export const SECURITY_HISTORY_TITLE_V1 =
  "🛡️ センサー検知・セキュリティ履歴（直近50件）";

export type SecurityHistorySourceV1 = "live" | "mock";

export interface SecurityHistoryCardV1 {
  id: string;
  at: string;
  atLabel: string;
  sensorLabel: string;
  resultLabel: string;
  icon: string;
  source: SecurityHistorySourceV1;
  siteId: string;
}

function clampLimitV1(raw: unknown): number {
  const n = Number(raw ?? SECURITY_HISTORY_LIMIT_V1);
  if (!Number.isFinite(n)) return SECURITY_HISTORY_LIMIT_V1;
  return Math.max(1, Math.min(SECURITY_HISTORY_LIMIT_V1, Math.floor(n)));
}

export function formatSecurityHistoryAtLabelV1(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso || "");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value || "";
    const hour = pick("hour") === "24" ? "00" : pick("hour");
    return `${pick("year")}/${pick("month")}/${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
  } catch {
    return String(iso || "");
  }
}

function jstHourV1(iso: string): number {
  try {
    const hour = Number(
      new Date(iso).toLocaleString("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Tokyo",
      })
    );
    return Number.isFinite(hour) ? hour % 24 : 0;
  } catch {
    return 0;
  }
}

function isNightHoursV1(iso: string): boolean {
  const hour = jstHourV1(iso);
  return hour >= 18 || hour < 6;
}

function resultLabelForAtV1(iso: string, text = ""): string {
  if (/ライト点灯スキップ|時間外|日中/.test(text)) {
    return "通知送信済み";
  }
  if (/ライト|点灯/.test(text) || isNightHoursV1(iso)) {
    return "防犯ライト点灯・通知送信済み";
  }
  return "通知送信済み";
}

export function sensorLabelForHistoryV1(
  deviceLabel: string,
  kindLabel = "",
  extra = ""
): string {
  const hay = `${deviceLabel} ${kindLabel} ${extra}`;
  if (/DI\s*1|駐車場/.test(hay) && !/ガレージ/.test(hay)) {
    return "駐車場センサー DI1";
  }
  if (/DI\s*2|ガレージ/.test(hay)) {
    return "ガレージセンサー DI2";
  }
  const trimmed = String(deviceLabel || kindLabel || "").trim();
  return trimmed || "センサー";
}

function resolveSecuritySiteIdV1(
  siteId?: string | null,
  homeSiteId?: string | null
): string {
  const raw = String(siteId || homeSiteId || "").trim();
  if (!raw) return SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1;
  return mapHomeSiteIdToSecurityFloorSiteIdV1(raw);
}

function homeSiteIdForSecurityV1(securitySiteId: string): string {
  if (securitySiteId === SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1) {
    return HOME_ITABASHI_LIVE_SITE_ID_V1;
  }
  if (securitySiteId === SECURITY_FLOOR_TOYOSHIMA_SITE_ID_V1) {
    return "HOME-JP-TOYOSHIMA";
  }
  if (securitySiteId.startsWith("SEC-")) {
    return `HOME-${securitySiteId.slice("SEC-".length)}`;
  }
  return securitySiteId;
}

function cardFromAlarmLogV1(
  log: SecurityAlarmLogV1
): SecurityHistoryCardV1 {
  const sensorLabel = sensorLabelForHistoryV1(
    log.deviceLabel || "",
    log.kindLabel || ""
  );
  return {
    id: String(log.id || `ALM-${log.at}`),
    at: log.at,
    atLabel: formatSecurityHistoryAtLabelV1(log.at),
    sensorLabel,
    resultLabel: resultLabelForAtV1(
      log.at,
      `${log.kindLabel || ""} ${log.deviceLabel || ""}`
    ),
    icon: "🚨",
    source: "live",
    siteId: log.siteId,
  };
}

function cardFromSystemLogV1(
  row: {
    id: number;
    siteId: string;
    message: string;
    createdAt: string;
    detail: Record<string, unknown> | null;
  },
  securitySiteId: string
): SecurityHistoryCardV1 {
  const di = Number(row.detail?.di ?? row.detail?.input ?? 0);
  const extra = di === 1 ? "DI1" : di === 2 ? "DI2" : "";
  return {
    id: `SYS-${row.id}`,
    at: row.createdAt,
    atLabel: formatSecurityHistoryAtLabelV1(row.createdAt),
    sensorLabel: sensorLabelForHistoryV1(row.message, extra, extra),
    resultLabel: resultLabelForAtV1(row.createdAt, row.message),
    icon: "🚨",
    source: "live",
    siteId: securitySiteId,
  };
}

function toyoshimaHistoryCardsV1(): SecurityHistoryCardV1[] {
  try {
    const dash = buildToyoshimaSecurityDashboardV1();
    return (dash.timeline || []).map((ev) => ({
      id: String(ev.id || `TS-${ev.at}`),
      at: ev.at,
      atLabel: formatSecurityHistoryAtLabelV1(ev.at),
      sensorLabel: sensorLabelForHistoryV1(
        ev.title || "",
        ev.kind || "",
        ev.detail || ""
      ),
      resultLabel: resultLabelForAtV1(
        ev.at,
        `${ev.title || ""} ${ev.detail || ""}`
      ),
      icon: "🚨",
      source: "live" as const,
      siteId: SECURITY_FLOOR_TOYOSHIMA_SITE_ID_V1,
    }));
  } catch {
    return [];
  }
}

/** 板橋自宅の閲覧用モック（既存実機ログは上書きしない） */
export function buildItabashiSecurityHistoryMockV1(
  nowMs = Date.now()
): SecurityHistoryCardV1[] {
  const cards: SecurityHistoryCardV1[] = [];
  for (let i = 0; i < SECURITY_HISTORY_LIMIT_V1; i += 1) {
    const atMs = nowMs - i * 41 * 60 * 1000;
    const iso = new Date(atMs).toISOString();
    const di = (i % 2) + 1;
    cards.push({
      id: `MOCK-ITB-DI${di}-${i}`,
      at: iso,
      atLabel: formatSecurityHistoryAtLabelV1(iso),
      sensorLabel:
        di === 1 ? "駐車場センサー DI1" : "ガレージセンサー DI2",
      resultLabel: resultLabelForAtV1(iso),
      icon: "🚨",
      source: "mock",
      siteId: SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1,
    });
  }
  return cards;
}

function mergeHistoryCardsV1(
  cards: SecurityHistoryCardV1[]
): SecurityHistoryCardV1[] {
  const seen = new Set<string>();
  const merged: SecurityHistoryCardV1[] = [];
  const sorted = [...cards].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at)
  );
  for (const card of sorted) {
    const key = `${card.source}:${card.id}`;
    const loose = `${card.at}|${card.sensorLabel}`;
    if (seen.has(key) || seen.has(loose)) continue;
    seen.add(key);
    seen.add(loose);
    merged.push(card);
  }
  return merged;
}

export function listSecurityHistoryV1(input: {
  siteId?: string | null;
  homeSiteId?: string | null;
  includeMock?: boolean;
  limit?: number;
} = {}): {
  ok: true;
  title: string;
  siteId: string;
  homeSiteId: string;
  limit: number;
  items: SecurityHistoryCardV1[];
} {
  const limit = clampLimitV1(input.limit);
  const siteId = resolveSecuritySiteIdV1(input.siteId, input.homeSiteId);
  const homeSiteId = homeSiteIdForSecurityV1(siteId);
  const isItabashi = siteId === SECURITY_FLOOR_ITABASHI_LIVE_SITE_ID_V1;
  const includeMock = Boolean(input.includeMock) || isItabashi;

  const live: SecurityHistoryCardV1[] = listSecurityAlarmLogsV1(siteId).map(
    cardFromAlarmLogV1
  );

  const sysRows = listSystemLogsV1({
    siteId: homeSiteId,
    category: "sensor_alert",
    limit: SECURITY_HISTORY_LIMIT_V1,
  });
  for (const row of sysRows) {
    live.push(cardFromSystemLogV1(row, siteId));
  }

  if (siteId === SECURITY_FLOOR_TOYOSHIMA_SITE_ID_V1) {
    live.push(...toyoshimaHistoryCardsV1());
  }

  const merged = mergeHistoryCardsV1(live);
  if (includeMock && merged.length < limit) {
    const mock = buildItabashiSecurityHistoryMockV1();
    merged.push(...mock);
  }

  const items = mergeHistoryCardsV1(merged).slice(0, limit);
  return {
    ok: true,
    title: SECURITY_HISTORY_TITLE_V1,
    siteId,
    homeSiteId,
    limit,
    items,
  };
}
