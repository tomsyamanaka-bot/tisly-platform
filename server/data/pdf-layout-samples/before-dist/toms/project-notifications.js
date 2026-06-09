import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { getBusinessProject, getEstimate, getInvoice, } from "../business/business-store.js";
import { listProjectLiveDevices } from "./realtime-devices.js";
import { listProjectMaintenance } from "./maintenance-flow.js";
function rowToNotification(r) {
    return {
        id: String(r.id),
        projectId: String(r.project_id),
        kind: String(r.kind),
        title: String(r.title),
        body: String(r.body),
        severity: String(r.severity),
        href: String(r.href ?? ""),
        acknowledged: Number(r.acknowledged) === 1,
        acknowledgedAt: r.acknowledged_at != null ? String(r.acknowledged_at) : null,
        createdAt: String(r.created_at),
    };
}
function upsertDerivedNotification(input) {
    const existing = getDatabase()
        .prepare(`SELECT id FROM toms_project_notifications
       WHERE project_id = ? AND kind = ? AND acknowledged = 0`)
        .get(input.projectId, input.kind);
    if (existing) {
        getDatabase()
            .prepare(`UPDATE toms_project_notifications SET title = ?, body = ?, severity = ?, href = ?
         WHERE id = ?`)
            .run(input.title, input.body, input.severity, input.href ?? "", existing.id);
        return;
    }
    const id = `PN-${uuid().slice(0, 8).toUpperCase()}`;
    getDatabase()
        .prepare(`INSERT INTO toms_project_notifications
       (id, project_id, kind, title, body, severity, href, acknowledged, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`)
        .run(id, input.projectId, input.kind, input.title, input.body, input.severity, input.href ?? `/project/${input.projectId}`);
}
export function refreshProjectNotifications(projectId) {
    const project = getBusinessProject(projectId);
    if (!project)
        return [];
    if (project.status === "estimate_created" && project.estimateId) {
        const est = getEstimate(project.estimateId);
        if (est) {
            upsertDerivedNotification({
                projectId,
                kind: "estimate_unsent",
                title: "見積未送信",
                body: `${est.estimateNo} が未送信です`,
                severity: "warning",
                href: `/business/projects/${projectId}/estimate`,
            });
        }
    }
    if (project.status === "invoice_created" && project.invoiceId) {
        const inv = getInvoice(project.invoiceId);
        if (inv) {
            upsertDerivedNotification({
                projectId,
                kind: "invoice_unsent",
                title: "請求未送信",
                body: `${inv.invoiceNo} が未送信です`,
                severity: "warning",
                href: `/business/projects/${projectId}/invoice`,
            });
        }
    }
    if (["invoice_sent", "partial_paid"].includes(project.status)) {
        upsertDerivedNotification({
            projectId,
            kind: "payment_pending",
            title: "入金待ち",
            body: "請求済み・入金待ちです",
            severity: "info",
            href: `/business/projects/${projectId}/payment`,
        });
    }
    const maint = listProjectMaintenance(projectId).filter((m) => m.status !== "closed");
    const dueSoon = maint.filter((m) => {
        const d = new Date(m.scheduledDate).getTime();
        return d - Date.now() < 14 * 86400000;
    });
    if (dueSoon.length > 0) {
        upsertDerivedNotification({
            projectId,
            kind: "maintenance_due",
            title: "保守期限",
            body: `${dueSoon.length} 件の保守予定があります`,
            severity: "warning",
        });
    }
    for (const d of listProjectLiveDevices(projectId)) {
        if (d.status === "OFFLINE" || d.status === "WARNING") {
            const t = d.device_type.toLowerCase();
            let kind = null;
            if (t.includes("esp") || t.includes("controller"))
                kind = "esp_anomaly";
            else if (t.includes("shelly"))
                kind = "shelly_anomaly";
            else if (t.includes("camera"))
                kind = "camera_anomaly";
            if (kind) {
                upsertDerivedNotification({
                    projectId,
                    kind,
                    title: `${d.name} 異常`,
                    body: `${d.device_type} が ${d.status} です`,
                    severity: d.status === "OFFLINE" ? "critical" : "warning",
                });
            }
        }
    }
    const rows = getDatabase()
        .prepare(`SELECT * FROM toms_project_notifications WHERE project_id = ?
       ORDER BY acknowledged ASC, created_at DESC LIMIT 100`)
        .all(projectId);
    return rows.map(rowToNotification);
}
export function listProjectNotifications(projectId) {
    return refreshProjectNotifications(projectId);
}
export function acknowledgeProjectNotification(projectId, notificationId, actor) {
    const row = getDatabase()
        .prepare(`SELECT * FROM toms_project_notifications WHERE id = ? AND project_id = ?`)
        .get(notificationId, projectId);
    if (!row)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE toms_project_notifications
       SET acknowledged = 1, acknowledged_at = ?, acknowledged_by = ?
       WHERE id = ?`)
        .run(now, actor, notificationId);
    return rowToNotification(getDatabase()
        .prepare(`SELECT * FROM toms_project_notifications WHERE id = ?`)
        .get(notificationId));
}
