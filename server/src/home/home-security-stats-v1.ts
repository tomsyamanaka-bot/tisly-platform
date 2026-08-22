/**
 * TiSLY HOME — 防犯統計ダッシュボード v1
 *
 * 過去7日間の DI1/DI2 検知を
 * ヒートマップ・日別グラフで集計する。
 */

import { getDatabase } from "../db/database.js";
import { findHomeSiteV1 } from "./home-sites-v1.js";
import { listSystemLogsV1 } from "./home-system-log-v1.js";

export interface HomeSecurityHeatmapCellV1 {
  hour: number;
  di1: number;
  di2: number;
}

export interface HomeSecurityDailyCountV1 {
  date: string;
  di1: number;
  di2: number;
  total: number;
}

export interface HomeSecurityStatsV1 {
  siteId: string;
  siteName: string;
  days: number;
  heatmap: HomeSecurityHeatmapCellV1[];
  dailyCounts: HomeSecurityDailyCountV1[];
  totalDi1: number;
  totalDi2: number;
  totalEvents: number;
}

function parseDiFromDetail(
  detail: Record<string, unknown> | null
): 1 | 2 | null {
  if (!detail) return null;
  const di = Number(detail.di ?? detail.input ?? detail.channel);
  if (di === 1) return 1;
  if (di === 2) return 2;
  return null;
}

function parseDiFromMessage(message: string): 1 | 2 | null {
  if (/DI1|di1|外周/.test(message)) return 1;
  if (/DI2|di2|近接|段階/.test(message)) return 2;
  return null;
}

function jstDateKey(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso.slice(0, 10);
  }
}

function jstHour(iso: string): number {
  try {
    return Number(
      new Date(iso).toLocaleString("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Tokyo",
      })
    );
  } catch {
    return 0;
  }
}

/** 防犯統計を集計 */
export function buildHomeSecurityStatsV1(input: {
  siteId: string;
  days?: number;
}): HomeSecurityStatsV1 {
  const siteId = String(input.siteId ?? "").trim();
  const days = Math.max(1, Math.min(30, Number(input.days ?? 7)));
  const site = findHomeSiteV1(siteId);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = listSystemLogsV1({
    siteId,
    limit: 500,
  }).filter((row) => {
    if (row.category !== "sensor_alert") return false;
    const t = Date.parse(row.createdAt);
    return !Number.isNaN(t) && t >= since.getTime();
  });

  const heatmap: HomeSecurityHeatmapCellV1[] = [];
  for (let h = 0; h < 24; h += 1) {
    heatmap.push({ hour: h, di1: 0, di2: 0 });
  }

  const dailyMap = new Map<string, HomeSecurityDailyCountV1>();
  let totalDi1 = 0;
  let totalDi2 = 0;

  for (const row of logs) {
    const di =
      parseDiFromDetail(row.detail) ??
      parseDiFromMessage(row.message);
    if (!di) continue;

    const hour = jstHour(row.createdAt);
    if (hour >= 0 && hour < 24) {
      if (di === 1) heatmap[hour].di1 += 1;
      else heatmap[hour].di2 += 1;
    }

    const dateKey = jstDateKey(row.createdAt);
    const existing = dailyMap.get(dateKey) ?? {
      date: dateKey,
      di1: 0,
      di2: 0,
      total: 0,
    };
    if (di === 1) {
      existing.di1 += 1;
      totalDi1 += 1;
    } else {
      existing.di2 += 1;
      totalDi2 += 1;
    }
    existing.total = existing.di1 + existing.di2;
    dailyMap.set(dateKey, existing);
  }

  const dailyCounts: HomeSecurityDailyCountV1[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA", {
      timeZone: "Asia/Tokyo",
    });
    dailyCounts.push(
      dailyMap.get(key) ?? {
        date: key,
        di1: 0,
        di2: 0,
        total: 0,
      }
    );
  }

  return {
    siteId,
    siteName: site?.displayName ?? siteId,
    days,
    heatmap,
    dailyCounts,
    totalDi1,
    totalDi2,
    totalEvents: totalDi1 + totalDi2,
  };
}

/** タイムライン（拡張カテゴリ対応） */
export function buildHomeActivityTimelineV1(input: {
  siteId?: string | null;
  limit?: number;
}): Array<{
  id: number;
  category: string;
  categoryLabel: string;
  message: string;
  timeLabel: string;
  createdAt: string;
  detail: Record<string, unknown> | null;
}> {
  const categoryLabels: Record<string, string> = {
    manual_control: "手動操作",
    schedule_run: "スケジュール",
    delay_run: "遅延実行",
    sensor_alert: "センサー検知",
    rp2350_comm: "RP2350通信",
    bath_state: "風呂状態",
    scene_run: "シーン実行",
    light_event: "ライト点灯",
  };

  const logs = listSystemLogsV1({
    siteId: input.siteId,
    limit: input.limit ?? 50,
  });

  return logs.map((row) => ({
    id: row.id,
    category: row.category,
    categoryLabel: categoryLabels[row.category] ?? row.category,
    message: row.message,
    timeLabel: row.createdAt,
    createdAt: row.createdAt,
    detail: row.detail,
  }));
}
