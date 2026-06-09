import { sendWebPush } from "../notification/channels/web-push.js";
import { logBusinessIntegration, listBusinessIntegrationLogs } from "./business-integration-log.js";
import { countProjectsByStatus } from "./business-store.js";
import { getGoogleOAuthStatus } from "../services/googleOAuthService.js";
import { expandStatusAliases } from "./business-status.js";
export function collectBusinessAlerts() {
    const alerts = [];
    const paymentDue = countProjectsByStatus(expandStatusAliases(["invoice_sent"]));
    if (paymentDue > 0) {
        alerts.push({
            id: "payment_due",
            kind: "payment_due",
            title: "入金待ち",
            body: `${paymentDue} 件の請求済み案件があります`,
            href: "/business/projects?status=invoice_sent",
        });
    }
    const estimateUnsent = countProjectsByStatus(expandStatusAliases(["estimate_created"]));
    if (estimateUnsent > 0) {
        alerts.push({
            id: "estimate_unsent",
            kind: "estimate_unsent",
            title: "見積未送信",
            body: `${estimateUnsent} 件の見積が未送信です`,
            href: "/business/projects?status=estimate_created",
        });
    }
    const google = getGoogleOAuthStatus();
    if (google.enabled && google.mode === "real" && !google.connected) {
        alerts.push({
            id: "google_error",
            kind: "google_error",
            title: "Google連携エラー",
            body: "Google OAuth が未接続です",
            href: "/business/settings",
        });
    }
    const recentErrors = listBusinessIntegrationLogs({ limit: 20 }).filter((l) => l.status === "error");
    if (recentErrors.some((l) => l.type === "qnap")) {
        alerts.push({
            id: "qnap_error",
            kind: "qnap_error",
            title: "QNAP保存エラー",
            body: "直近の QNAP 連携でエラーがあります",
            href: "/business/settings",
        });
    }
    if (recentErrors.some((l) => l.type === "pdf")) {
        alerts.push({
            id: "pdf_error",
            kind: "pdf_error",
            title: "PDF生成エラー",
            body: "直近の PDF 生成でエラーがあります",
            href: "/business/settings",
        });
    }
    return alerts;
}
export async function sendBusinessMockNotifications() {
    const alerts = collectBusinessAlerts();
    for (const a of alerts) {
        logBusinessIntegration({
            type: "status_flow",
            provider: "business_push_mock",
            status: "success",
            request: { alert: a.kind },
            response: { title: a.title, href: a.href },
        });
    }
    const push = await sendWebPush({
        title: alerts[0]?.title ?? "TOMS業務",
        body: alerts[0]?.body ?? "Business notifications (mock)",
        eventType: "business_alert",
        url: alerts[0]?.href ?? "/business",
        data: { alerts: alerts.map((x) => x.id), mock: true },
    });
    return {
        alerts,
        push: { success: push.success, error: push.error },
    };
}
