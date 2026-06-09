import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { classifyEventCategory } from "./event-classifier.js";
import { computeRiskScore } from "./risk-score.js";
import { analyzeTrends } from "./trend-analyzer.js";
const SITE_NAMES = {
    "site-moriya": "守谷住宅",
    "site-factory-a": "工場A",
    "site-warehouse-a": "倉庫A",
    "site-minpaku-a": "民泊A",
    "site-carshop-a": "車屋A",
};
function siteLabel(id) {
    if (!id)
        return "施設";
    return SITE_NAMES[id] ?? id;
}
export function processEventAnalytics(event) {
    const db = getDatabase();
    const siteId = event.siteId ?? event.payload?.site_id;
    let concurrent = 0;
    if (siteId) {
        const row = db
            .prepare(`SELECT COUNT(*) as c FROM events
         WHERE site_id = ? AND created_at >= datetime('now', '-5 minutes')`)
            .get(siteId);
        concurrent = row.c;
    }
    const siteAnomaly = siteId
        ? db
            .prepare(`SELECT COUNT(*) as c FROM events
             WHERE site_id = ? AND created_at >= datetime('now', '-1 day')
             AND severity IN ('alarm', 'critical', 'warning')`)
            .get(siteId).c
        : 0;
    const risk = computeRiskScore(event.eventType, {
        createdAt: event.timestamp,
        concurrentCount: concurrent,
        siteAnomalyCount24h: siteAnomaly,
    });
    db.prepare(`INSERT INTO analytics_snapshots (id, event_id, device_id, site_id, event_type, risk_score, priority, factors_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(uuid(), event.id ?? uuid(), event.deviceId, siteId ?? null, event.eventType, risk.score, risk.priority, JSON.stringify(risk.factors));
    return { riskScore: risk.score, priority: risk.priority, factors: risk.factors };
}
export function generateAiSummary(period) {
    const trend = analyzeTrends(period);
    const bullets = [];
    const topSite = trend.bySite[0];
    if (topSite) {
        bullets.push({
            text: `${siteLabel(topSite.label)}でイベント${topSite.count}件`,
            priority: "info",
        });
    }
    if (trend.anomalyCount > 0) {
        bullets.push({
            text: `異常・警告 ${trend.anomalyCount}件`,
            priority: trend.anomalyCount >= 10 ? "alarm" : "warning",
        });
    }
    if (trend.peakHour) {
        bullets.push({
            text: `${trend.peakHour}台にイベント集中`,
            priority: "warning",
        });
    }
    const perimeter = trend.byType.find((t) => t.label === "perimeter");
    if (perimeter && perimeter.count >= 2) {
        bullets.push({
            text: "外周センサー多発",
            priority: "alarm",
        });
    }
    const intrusion = trend.byType.find((t) => t.label === "intrusion");
    if (intrusion && intrusion.count >= 1) {
        bullets.push({
            text: `侵入系イベント ${intrusion.count}件`,
            priority: "critical",
        });
    }
    if (bullets.length === 0) {
        bullets.push({ text: "特筆すべき異常はありません", priority: "info" });
    }
    return { period, bullets, generatedAt: new Date().toISOString() };
}
export function generateNaturalLanguageReport(period) {
    const trend = analyzeTrends(period);
    const paragraphs = [];
    const periodLabel = period === "today" ? "本日" : period === "week" ? "今週" : "今月";
    paragraphs.push(`${periodLabel}の分析では、全${trend.totalEvents}件のイベントのうち、異常・警告は${trend.anomalyCount}件でした。`);
    const topSite = trend.bySite[0];
    if (topSite && trend.anomalyCount > 0) {
        const name = siteLabel(topSite.label);
        const cat = trend.topEventType
            ? classifyEventCategory(trend.topEventType)
            : "other";
        const catJa = cat === "intrusion"
            ? "侵入系"
            : cat === "perimeter"
                ? "外周"
                : cat === "access"
                    ? "アクセス"
                    : "各種";
        if (trend.peakHour) {
            paragraphs.push(`${name}では${trend.peakHour}前後の時間帯に${catJa}イベントが集中しています。`);
        }
        else {
            paragraphs.push(`${name}でイベントが最も多く記録されています。`);
        }
    }
    const estop = trend.byType.find((t) => t.label === "estop");
    if (estop) {
        paragraphs.push(`非常停止が${estop.count}件検出されています。優先対応を推奨します。`);
    }
    return { period, paragraphs, generatedAt: new Date().toISOString() };
}
export function getAnalyticsOverview() {
    const today = analyzeTrends("today");
    const week = analyzeTrends("week");
    const month = analyzeTrends("month");
    const summaryToday = generateAiSummary("today");
    const nlToday = generateNaturalLanguageReport("today");
    const db = getDatabase();
    const avgRisk = db
        .prepare(`SELECT AVG(risk_score) as avg FROM analytics_snapshots
         WHERE created_at >= datetime('now', '-1 day')`)
        .get().avg;
    const highRisk = db
        .prepare(`SELECT COUNT(*) as c FROM analytics_snapshots
         WHERE risk_score >= 70 AND created_at >= datetime('now', '-1 day')`)
        .get().c;
    return {
        risk: { avg24h: Math.round(avgRisk ?? 0), highRiskCount24h: highRisk },
        trends: { today, week, month },
        summary: {
            today: summaryToday,
            week: generateAiSummary("week"),
            month: generateAiSummary("month"),
        },
        naturalLanguage: {
            today: nlToday,
            week: generateNaturalLanguageReport("week"),
            month: generateNaturalLanguageReport("month"),
        },
    };
}
