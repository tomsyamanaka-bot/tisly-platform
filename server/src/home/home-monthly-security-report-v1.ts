/**
 * 月次セキュリティ安心レポート v1
 *
 * 当月の検知・ライト稼働・通信率を集計し
 * 顧客向けサマリーと PDF(HTML) を返す。
 */

import { customerSiteTitleV1 } from "../shared/customer/customer-display-labels-v1.js";
import {
  buildToyoshimaSecurityDashboardV1,
  type ToyoshimaTimelineEventV1,
} from "./home-toyoshima-security-v1.js";
import { deriveCustomerSecurityModeV1 } from "./home-customer-security-mode-v1.js";
import { getHomeSecurityRulesV1 } from "./home-security-rules-v1.js";

export interface MonthlySecurityReportV1 {
  siteId: string;
  displayName: string;
  yearMonth: string;
  yearMonthLabel: string;
  detectionCount: number;
  detectionLabel: string;
  lightOnCount: number;
  lightOnLabel: string;
  uptimePercent: number;
  uptimeLabel: string;
  modeLabel: string;
  summaryLines: string[];
  generatedAt: string;
}

function jstYearMonth(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

function inYearMonth(iso: string, ym: string): boolean {
  try {
    const d = new Date(iso);
    return jstYearMonth(d) === ym;
  } catch {
    return false;
  }
}

function isDetectionEvent(ev: ToyoshimaTimelineEventV1): boolean {
  return (
    ev.kind === "main_beam" ||
    ev.kind === "detached_road" ||
    ev.kind === "detached_path"
  );
}

function isLightEvent(ev: ToyoshimaTimelineEventV1): boolean {
  if (isDetectionEvent(ev)) return true;
  return /ライト|点灯|照明/.test(`${ev.title}${ev.detail || ""}`);
}

/**
 * 当月サマリーを構築
 * （タイムライン + 通信ヘルスから推定）
 */
export function buildMonthlySecurityReportV1(input?: {
  siteId?: string | null;
  yearMonth?: string | null;
}): MonthlySecurityReportV1 {
  const dash = buildToyoshimaSecurityDashboardV1(input?.siteId);
  const ym = String(input?.yearMonth || jstYearMonth()).trim() || jstYearMonth();
  const [y, m] = ym.split("-");
  const yearMonthLabel = `${y}年${Number(m)}月`;

  const monthEvents = (dash.timeline || []).filter((ev) =>
    inYearMonth(ev.at, ym)
  );
  const detectionCount = monthEvents.filter(isDetectionEvent).length;
  const lightOnCount = monthEvents.filter(isLightEvent).length;

  const devices = dash.commHealth?.devices || [];
  const onlineCount = devices.filter((d) => d.online).length;
  const uptimePercent =
    devices.length > 0
      ? Math.round((onlineCount / devices.length) * 1000) / 10
      : 100;

  const rules = getHomeSecurityRulesV1(dash.homeSiteId || dash.propertyId);
  const mode = deriveCustomerSecurityModeV1(rules);
  const modeLabel =
    mode === "away"
      ? "おでかけ警戒"
      : mode === "home"
        ? "在宅見守り"
        : "警戒一時解除";

  const detectionLabel =
    detectionCount === 0
      ? "0件（異常なし）"
      : `${detectionCount}件`;
  const lightOnLabel = `${lightOnCount}回 稼働`;
  const uptimeLabel = `${uptimePercent.toFixed(1)}% オンライン`;

  return {
    siteId: dash.siteId,
    displayName: customerSiteTitleV1(dash.displayName || "豊島邸"),
    yearMonth: ym,
    yearMonthLabel,
    detectionCount,
    detectionLabel,
    lightOnCount,
    lightOnLabel,
    uptimePercent,
    uptimeLabel,
    modeLabel,
    summaryLines: [
      `${yearMonthLabel}の防犯稼働実績`,
      `侵入・センサー検知: ${detectionLabel}`,
      `夜間防犯ライト自動点灯: ${lightOnLabel}`,
      `主装置・子機 正常稼働率: ${uptimeLabel}`,
      `現在の警戒モード: ${modeLabel}`,
    ],
    generatedAt: new Date().toISOString(),
  };
}

/** 月次報告書 HTML（PDF 印刷用） */
export function buildMonthlySecurityReportHtmlV1(
  report: MonthlySecurityReportV1
): string {
  const generated = new Date(report.generatedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>${report.displayName} 月次セキュリティ安心レポート</title>
  <style>
    body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: #0f172a; margin: 32px; }
    h1 { color: #1e3a8a; font-size: 1.4rem; margin: 0 0 8px; }
    .sub { color: #64748b; margin-bottom: 24px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
    .card strong { display: block; color: #1e3a8a; font-size: 1.2rem; margin-top: 4px; }
    .label { color: #475569; font-size: 0.9rem; font-weight: 700; }
    footer { margin-top: 28px; color: #94a3b8; font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>${report.displayName} · 月次セキュリティ安心レポート</h1>
  <p class="sub">${report.yearMonthLabel} の防犯稼働実績</p>
  <div class="card"><span class="label">侵入・センサー検知総数</span><strong>${report.detectionLabel}</strong></div>
  <div class="card"><span class="label">夜間防犯ライト自動点灯回数</span><strong>${report.lightOnLabel}</strong></div>
  <div class="card"><span class="label">主装置・子機 正常稼働率</span><strong>${report.uptimeLabel}</strong></div>
  <div class="card"><span class="label">現在の警戒モード</span><strong>${report.modeLabel}</strong></div>
  <footer>出力日時: ${generated} · TiSLY Security</footer>
  <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body>
</html>`;
}
