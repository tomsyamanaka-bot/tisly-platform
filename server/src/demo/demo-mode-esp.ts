import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { recordDeviceHeartbeat } from "../device/device-heartbeat.js";
import { appendDeviceTimeline } from "../device/device-timeline.js";
import { getNotificationService } from "../notification/notification-service.js";
import { broadcast } from "../ws/hub.js";

const DEMO_ESP_IDS = ["DEMO-ESP-LIVING", "DEMO-ESP-ENTRANCE", "DEMO-ESP-GARAGE"];

let demoTimer: ReturnType<typeof setInterval> | null = null;

export function seedDemoModeVirtualEsp(customerId: string, siteId: string): void {
  const db = getDatabase();
  const zones = [
    { deviceId: "DEMO-ESP-LIVING", label: "Living — ESP32-S3", zone: "Living" },
    { deviceId: "DEMO-ESP-ENTRANCE", label: "Entrance — ESP32-S3", zone: "Entrance" },
    { deviceId: "DEMO-ESP-GARAGE", label: "Garage — ESP32-S3", zone: "Garage" },
  ];
  for (const z of zones) {
    const id = `dev-demo-${z.deviceId.toLowerCase()}`;
    db.prepare(
      `INSERT INTO devices (id, customer_id, site_id, device_id, device_type, platform, label,
        device_status, commissioning_status, metadata_json, last_heartbeat_at, last_seen, first_seen, heartbeat_status)
       VALUES (?, ?, ?, ?, 'ESP32', 'demo-virtual', ?, 'COMMISSIONING', 'claimed', ?, datetime('now'), datetime('now'), datetime('now'), 'ok')
       ON CONFLICT(id) DO UPDATE SET
         customer_id = excluded.customer_id,
         site_id = excluded.site_id,
         label = excluded.label,
         device_status = excluded.device_status,
         updated_at = datetime('now')`
    ).run(
      id,
      customerId,
      siteId,
      z.deviceId,
      z.label,
      JSON.stringify({ zone: z.zone, demo_virtual: true })
    );
    appendDeviceTimeline({
      deviceId: z.deviceId,
      customerId,
      eventType: "created",
      title: "デモ仮想 ESP 登録",
      detail: z.zone,
    });
  }
}

const SIM_EVENTS = [
  { eventType: "motion", title: "人感", severity: "warning" as const },
  { eventType: "window_open", title: "窓開", severity: "warning" as const },
  { eventType: "intrusion", title: "侵入", severity: "alarm" as const },
  { eventType: "recovery", title: "復旧", severity: "info" as const },
  { eventType: "power_loss", title: "停電", severity: "critical" as const },
  { eventType: "comm_loss", title: "通信断", severity: "alarm" as const },
];

export function startDemoModeVirtualEspRunner(): void {
  if (!config.demoMode || demoTimer) return;
  const db = getDatabase();
  const demo = db
    .prepare(`SELECT customer_id FROM customers WHERE customer_code = 'DEMO001'`)
    .get() as { customer_id: string } | undefined;
  if (demo) {
    const site = db
      .prepare(`SELECT id FROM sites WHERE customer_id = ? AND site_name LIKE '%DEMO%' LIMIT 1`)
      .get(demo.customer_id) as { id: string } | undefined;
    if (site) seedDemoModeVirtualEsp(demo.customer_id, site.id);
  }

  demoTimer = setInterval(() => {
    for (const deviceId of DEMO_ESP_IDS) {
      recordDeviceHeartbeat(deviceId, "demo-virtual");
      appendDeviceTimeline({
        deviceId,
        eventType: "heartbeat",
        title: "デモ Heartbeat",
      });
    }
    if (Math.random() < 0.35) {
      const deviceId = DEMO_ESP_IDS[Math.floor(Math.random() * DEMO_ESP_IDS.length)]!;
      const ev = SIM_EVENTS[Math.floor(Math.random() * SIM_EVENTS.length)]!;
      void getNotificationService().processEvent({
        deviceId,
        eventType: ev.eventType,
        title: `[DEMO] ${ev.title}`,
        body: `${deviceId} — デモイベント`,
        severity: ev.severity,
      });
      broadcast({
        type: "event",
        payload: { deviceId, ...ev },
        at: new Date().toISOString(),
      });
    }
  }, 45_000);
  console.log("[DemoMode] virtual ESP heartbeat + event runner started");
}

export function stopDemoModeVirtualEspRunner(): void {
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = null;
  }
}

export function emitSimulatorEvent(
  customerCode: string,
  scenario: string,
  deviceId?: string
): { ok: boolean; deviceId: string; eventType: string } {
  const map: Record<string, { eventType: string; title: string; severity: "info" | "warning" | "alarm" | "critical" }> = {
    intrusion: { eventType: "intrusion", title: "侵入", severity: "alarm" },
    recovery: { eventType: "recovery", title: "復旧", severity: "info" },
    power_loss: { eventType: "power_loss", title: "停電", severity: "critical" },
    comm_loss: { eventType: "comm_loss", title: "通信断", severity: "alarm" },
    motion: { eventType: "motion", title: "人感", severity: "warning" },
    window_open: { eventType: "window_open", title: "窓開", severity: "warning" },
  };
  const ev = map[scenario] ?? map.motion!;
  const dev =
    deviceId ??
    DEMO_ESP_IDS[0] ??
    `${customerCode}-ESP-01`;
  void getNotificationService().processEvent({
    deviceId: dev,
    eventType: ev.eventType,
    title: ev.title,
    body: `Simulator: ${scenario}`,
    severity: ev.severity,
  });
  appendDeviceTimeline({
    deviceId: dev,
    eventType: "notification",
    title: `シミュレータ: ${ev.title}`,
    detail: scenario,
  });
  return { ok: true, deviceId: dev, eventType: ev.eventType };
}
