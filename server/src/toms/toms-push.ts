import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import { collectBusinessAlerts } from "../business/business-notifications.js";
import { buildHubOperations } from "./hub-operations.js";

export type TomsPushKind =
  | "project_alert"
  | "estimate_unsent"
  | "invoice_unsent"
  | "payment_pending"
  | "maintenance_due"
  | "esp_anomaly"
  | "shelly_anomaly";

export async function dispatchTomsPushAlerts(): Promise<{
  queued: number;
  sent: boolean;
  error?: string;
}> {
  const ops = buildHubOperations("TOMS001");
  const alerts: Array<{ kind: TomsPushKind; title: string; body: string; href: string }> = [];

  for (const a of collectBusinessAlerts()) {
    alerts.push({
      kind: a.kind === "estimate_unsent" ? "estimate_unsent" : "payment_pending",
      title: a.title,
      body: a.body,
      href: a.href,
    });
  }
  if (ops.uninvoiced > 0) {
    alerts.push({
      kind: "invoice_unsent",
      title: "未請求案件",
      body: `${ops.uninvoiced} 件が請求待ちです`,
      href: "/business/projects",
    });
  }
  if (ops.maintenanceDue > 0) {
    alerts.push({
      kind: "maintenance_due",
      title: "保守期限",
      body: `${ops.maintenanceDue} 件の保守期限が近づいています`,
      href: "/maintenance",
    });
  }
  if (ops.espAnomaly > 0) {
    alerts.push({
      kind: "esp_anomaly",
      title: "ESP異常",
      body: `${ops.espAnomaly} 台で通信異常があります`,
      href: "/maintenance",
    });
  }
  if (ops.shellyAnomaly > 0) {
    alerts.push({
      kind: "shelly_anomaly",
      title: "Shelly異常",
      body: `${ops.shellyAnomaly} 台で異常があります`,
      href: "/maintenance",
    });
  }

  const db = getDatabase();
  for (const a of alerts) {
    const id = `TPA-${uuid().slice(0, 8).toUpperCase()}`;
    db.prepare(
      `INSERT INTO toms_push_alerts (id, project_id, alert_kind, title, body, href, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, datetime('now'))`
    ).run(id, a.kind, a.title, a.body, a.href);
  }

  const first = alerts[0];
  const push = first
    ? await sendWebPush({
        title: first.title,
        body: first.body,
        eventType: "toms_alert",
        url: first.href,
        data: { kinds: alerts.map((x) => x.kind) },
      })
    : { success: false, error: "no alerts" };

  if (first) {
    db.prepare(
      `UPDATE toms_push_alerts SET sent_at = datetime('now') WHERE alert_kind = ? AND sent_at IS NULL`
    ).run(first.kind);
  }

  return {
    queued: alerts.length,
    sent: push.success,
    error: push.error,
  };
}
