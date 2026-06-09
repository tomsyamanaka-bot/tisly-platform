import { getDatabase } from "../db/database.js";
import { getCustomerById, getDashboardSummary, listDevicesForCustomer, listSitesForCustomer } from "./customer-store.js";
export function buildCustomerSalesReport(customerId) {
    const customer = getCustomerById(customerId);
    const tenantId = customer?.tenant_id ?? customerId;
    const db = getDatabase();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthlyEvents = db
        .prepare(`SELECT COUNT(*) as c FROM events
         WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
           AND created_at >= ?`)
        .get(tenantId, customerId, monthStart).c;
    const alarmCount = db
        .prepare(`SELECT COUNT(*) as c FROM events
         WHERE (tenant_id = ? OR site_id IN (SELECT id FROM sites WHERE customer_id = ?))
           AND severity IN ('critical', 'alarm')
           AND created_at >= ?`)
        .get(tenantId, customerId, monthStart).c;
    const recoveryCount = db
        .prepare(`SELECT COUNT(*) as c FROM incidents
         WHERE (customer_id = ? OR tenant_id = ?) AND created_at >= ?`)
        .get(customerId, tenantId, monthStart).c;
    const summary = getDashboardSummary(customerId);
    const devices = listDevicesForCustomer(customerId);
    const uptimePercent = devices.length > 0 ? Math.round((summary.onlineCount / devices.length) * 1000) / 10 : 100;
    const sites = listSitesForCustomer(customerId);
    const siteNames = sites.map((s) => s.site_name).join("、");
    let aiComment = "今月は大きな異常は検知されていません。引き続き遠隔監視を継続します。";
    if (summary.overallStatus === "abnormal") {
        aiComment =
            "警報またはオフライン設備が多く検出されています。現場確認または遠隔復旧プレイブックの実行を推奨します。";
    }
    else if (summary.overallStatus === "warning") {
        aiComment = "一部設備の通信遅延が見られます。ハートビートとゲートウェイ状態を確認してください。";
    }
    const improvements = [];
    if (summary.offlineCount > 0) {
        improvements.push(`${summary.offlineCount} 台のオフライン設備の再接続を優先`);
    }
    if (alarmCount > 5) {
        improvements.push("警報閾値の見直しと通知ルールの最適化");
    }
    if (customer?.plan === "Standard") {
        improvements.push("PRO / PRO_REMOTE プランで顧客ポータル・TV・QNAP連携が利用可能");
    }
    if (!improvements.length) {
        improvements.push("定期メンテナンスウィンドウの維持", "月次レポートの顧客共有");
    }
    return {
        period: {
            month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
            from: monthStart,
            to: now.toISOString(),
        },
        monthlyEvents,
        alarmCount,
        recoveryCount,
        uptimePercent,
        aiComment: `${aiComment}（対象現場: ${siteNames || "—"}）`,
        improvements,
    };
}
