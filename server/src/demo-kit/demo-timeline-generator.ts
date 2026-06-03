import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { appendDeviceTimeline } from "../device/device-timeline.js";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { DEMO_PACK_CUSTOMERS } from "./demo-customer-pack.js";

const DEMO_TIMELINE_MARKER = "demo-kit-timeline-v1";

export function hasDemoTimelineSeed(): boolean {
  const row = getDatabase()
    .prepare(
      `SELECT COUNT(*) as c FROM events WHERE source_type = 'demo-kit' AND payload_json LIKE ?`
    )
    .get(`%${DEMO_TIMELINE_MARKER}%`) as { c: number };
  return row.c >= 8;
}

function daysAgoIso(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function seedDemoTimeline30Days(): { events: number; projectEntries: number; deviceEntries: number } {
  const db = getDatabase();
  if (hasDemoTimelineSeed()) {
    return { events: 0, projectEntries: 0, deviceEntries: 0 };
  }

  let events = 0;
  let projectEntries = 0;
  let deviceEntries = 0;

  for (const c of DEMO_PACK_CUSTOMERS) {
    const tenantId = c.customerId;
    const siteId = c.siteId;
    const esp = `${c.customerCode}-ESP-01`;
    const shelly = `${c.customerCode}-SHELLY-01`;

    const dayEvents: Array<{
      day: number;
      eventType: string;
      severity: string;
      title: string;
      message: string;
      deviceId: string;
    }> = [
      { day: 28, eventType: "intrusion", severity: "alarm", title: "侵入検知", message: "外周ビーム", deviceId: esp },
      { day: 25, eventType: "maintenance", severity: "info", title: "保守点検", message: "年次点検実施", deviceId: esp },
      { day: 22, eventType: "estimate", severity: "info", title: "見積作成", message: "追加センサー見積", deviceId: esp },
      { day: 18, eventType: "invoice", severity: "info", title: "請求発行", message: "工事一式", deviceId: esp },
      { day: 15, eventType: "payment", severity: "info", title: "入金確認", message: "振込入金", deviceId: esp },
      { day: 12, eventType: "shelly_restart", severity: "warning", title: "Shelly再起動", message: "電源瞬断後復旧", deviceId: shelly },
      { day: 8, eventType: "esp_recovery", severity: "info", title: "ESP復旧", message: "通信復旧", deviceId: esp },
      { day: 3, eventType: "intrusion", severity: "warning", title: "侵入疑い", message: "夜間 PIR", deviceId: esp },
    ];

    for (const e of dayEvents) {
      const createdAt = daysAgoIso(e.day, 9 + (e.day % 5));
      db.prepare(
        `INSERT INTO events (id, event_id, tenant_id, site_id, device_id, source_type, event_type, severity, message, title, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'demo-kit', ?, ?, ?, ?, ?, ?)`
      ).run(
        uuid(),
        `DEMO-TL-${c.customerCode}-${e.day}-${e.eventType}`,
        tenantId,
        siteId,
        e.deviceId,
        e.eventType,
        e.severity,
        e.message,
        e.title,
        JSON.stringify({ demo_kit: true, demo_timeline: DEMO_TIMELINE_MARKER, customerCode: c.customerCode }),
        createdAt
      );
      events += 1;

      if (e.eventType === "shelly_restart" || e.eventType === "esp_recovery") {
        appendDeviceTimeline({
          customerId: c.customerId,
          deviceId: e.deviceId,
          eventType: e.eventType === "esp_recovery" ? "heartbeat_recovered" : "config_change",
          title: e.title,
          detail: e.message,
          actor: "demo-kit",
        });
        deviceEntries += 1;
      }
    }

    const bizProject = db
      .prepare(`SELECT id FROM business_projects WHERE id LIKE ? LIMIT 1`)
      .get(`BIZ-DEMO-${c.customerCode}%`) as { id: string } | undefined;
    if (bizProject) {
      const bizEvents = [
        { day: 27, type: "survey", title: "現調完了" },
        { day: 20, type: "ai_estimate", title: "AI見積候補" },
        { day: 16, type: "invoice", title: "請求" },
        { day: 14, type: "payment", title: "入金" },
        { day: 5, type: "maintenance_complete", title: "保守完了" },
      ] as const;
      for (const be of bizEvents) {
        const entry = appendProjectTimeline({
          projectId: bizProject.id,
          eventType: be.type,
          title: be.title,
          detail: `${c.customerName} — デモ履歴`,
          actor: "demo-kit",
        });
        db.prepare(`UPDATE business_project_timeline SET created_at = ? WHERE id = ?`).run(
          daysAgoIso(be.day),
          entry.id
        );
        projectEntries += 1;
      }
    }
  }

  return { events, projectEntries, deviceEntries };
}

export function clearDemoTimeline(): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM events WHERE source_type = 'demo-kit'`).run();
  for (const c of DEMO_PACK_CUSTOMERS) {
    db.prepare(
      `DELETE FROM device_timeline WHERE actor = 'demo-kit' AND customer_id = ?`
    ).run(c.customerId);
    db.prepare(
      `DELETE FROM business_project_timeline WHERE actor = 'demo-kit' AND project_id LIKE ?`
    ).run(`BIZ-DEMO-${c.customerCode}%`);
  }
}
