import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { config } from "../../config.js";
import { DEMO_SITES, DEMO_ZONES } from "../../demo/demo-sites.js";
import {
  emitDemoEvent,
  getDemoMapMarkers,
  getVirtualDevices,
  seedDemoDevices,
} from "../../demo/demo-generator.js";
import {
  getDemoRunnerStats,
  isDemoRunnerActive,
  startDemoRunner,
  stopDemoRunner,
} from "../../demo/demo-runner.js";

export const demoRouter = Router();

demoRouter.get("/status", (_req, res) => {
  res.json({
    phase: "61-80",
    demoMode: config.demoMode,
    runner: getDemoRunnerStats(),
    sites: DEMO_SITES.length,
    zones: DEMO_ZONES.length,
  });
});

demoRouter.post("/start", async (_req, res) => {
  await startDemoRunner();
  res.json({ ok: true, runner: getDemoRunnerStats() });
});

demoRouter.post("/stop", (_req, res) => {
  stopDemoRunner();
  res.json({ ok: true, runner: getDemoRunnerStats() });
});

demoRouter.post("/seed", (_req, res) => {
  const count = seedDemoDevices();
  res.json({ ok: true, devicesSeeded: count });
});

demoRouter.post("/trigger", async (_req, res) => {
  const id = await emitDemoEvent();
  res.status(201).json({ id });
});

demoRouter.get("/sites", (_req, res) => {
  res.json({ sites: DEMO_SITES });
});

demoRouter.get("/zones", (_req, res) => {
  res.json({ zones: DEMO_ZONES });
});

demoRouter.get("/map", (_req, res) => {
  res.json({ markers: getDemoMapMarkers(), sites: DEMO_SITES });
});

demoRouter.get("/devices", (_req, res) => {
  const db = getDatabase();
  const virtual = getVirtualDevices();
  const rows = db.prepare("SELECT * FROM devices ORDER BY updated_at DESC").all() as Array<{
    device_id: string;
    label: string;
    device_type: string;
    platform: string;
    last_heartbeat_at: string | null;
    heartbeat_status: string;
    metadata_json: string | null;
  }>;

  const alarmCounts = db
    .prepare(
      `SELECT device_id, COUNT(*) as c FROM events
       WHERE severity IN ('alarm', 'critical')
       GROUP BY device_id`
    )
    .all() as Array<{ device_id: string; c: number }>;
  const alarmMap = new Map(alarmCounts.map((r) => [r.device_id, r.c]));

  const devices = rows.map((r) => {
    const meta = r.metadata_json
      ? (JSON.parse(r.metadata_json) as Record<string, unknown>)
      : {};
    const v = virtual.find((d) => d.deviceId === r.device_id);
    return {
      deviceId: r.device_id,
      label: r.label,
      type: r.device_type,
      platform: r.platform,
      siteId: meta.site_id ?? v?.siteId,
      siteName: meta.site_name ?? v?.siteName,
      zone: meta.zone ?? v?.zone,
      heartbeatStatus: r.heartbeat_status,
      lastHeartbeatAt: r.last_heartbeat_at,
      anomalyCount: alarmMap.get(r.device_id) ?? 0,
      demo: meta.demo === true || String(meta.demo) === "true",
    };
  });

  res.json({ devices, total: devices.length });
});

demoRouter.get("/alarms", (req, res) => {
  const db = getDatabase();
  const level = req.query.level as string | undefined;
  let sql = `SELECT * FROM events WHERE severity IN ('alarm', 'critical', 'warning')`;
  if (level === "critical") sql += ` AND severity = 'critical'`;
  else if (level === "alarm") sql += ` AND severity = 'alarm'`;
  else if (level === "info") sql += ` AND severity = 'info'`;
  else if (level === "warning") sql += ` AND severity = 'warning'`;
  sql += ` ORDER BY created_at DESC LIMIT 100`;
  const rows = db.prepare(sql).all() as Array<{ severity: string }>;

  const grouped = {
    critical: rows.filter((e) => e.severity === "critical"),
    alarm: rows.filter((e) => e.severity === "alarm"),
    warning: rows.filter((e) => e.severity === "warning"),
    info: rows.filter((e) => e.severity === "info"),
  };

  res.json({ alarms: rows, grouped, counts: {
    critical: grouped.critical.length,
    alarm: grouped.alarm.length,
    warning: grouped.warning.length,
    info: grouped.info.length,
  }});
});

demoRouter.get("/analytics", (_req, res) => {
  const db = getDatabase();
  const totalEvents = (db.prepare("SELECT COUNT(*) as c FROM events").get() as { c: number }).c;
  const alarmEvents = (
    db.prepare(
      `SELECT COUNT(*) as c FROM events WHERE severity IN ('alarm', 'critical')`
    ).get() as { c: number }
  ).c;
  const devicesOk = (
    db.prepare(`SELECT COUNT(*) as c FROM devices WHERE heartbeat_status = 'ok'`).get() as {
      c: number;
    }
  ).c;
  const deviceTotal = (db.prepare("SELECT COUNT(*) as c FROM devices").get() as { c: number }).c;
  const events24h = (
    db.prepare(
      `SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', '-1 day')`
    ).get() as { c: number }
  ).c;
  const events30d = (
    db.prepare(
      `SELECT COUNT(*) as c FROM events WHERE created_at >= datetime('now', '-30 day')`
    ).get() as { c: number }
  ).c;

  const byType = db
    .prepare(
      `SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type ORDER BY count DESC LIMIT 12`
    )
    .all();

  res.json({
    eventCount: totalEvents,
    events24h,
    events30d,
    anomalyRate: totalEvents > 0 ? Math.round((alarmEvents / totalEvents) * 1000) / 10 : 0,
    deviceUptimeRate:
      deviceTotal > 0 ? Math.round((devicesOk / deviceTotal) * 1000) / 10 : 100,
    byType,
    runnerActive: isDemoRunnerActive(),
  });
});

demoRouter.get("/health", (_req, res) => {
  const db = getDatabase();
  const lastEvent = db
    .prepare(`SELECT created_at FROM events ORDER BY created_at DESC LIMIT 1`)
    .get() as { created_at: string } | undefined;
  const lastHb = db
    .prepare(`SELECT received_at FROM device_heartbeats ORDER BY received_at DESC LIMIT 1`)
    .get() as { received_at: string } | undefined;

  res.json({
    components: [
      {
        id: "server",
        name: "TiSLY Server",
        status: "ok",
        detail: config.publicUrl,
      },
      {
        id: "mqtt",
        name: "MQTT Broker",
        status: config.mqtt.url ? "ok" : "degraded",
        detail: config.mqtt.url || "未設定（デモは HTTP/WS で動作）",
      },
      {
        id: "node-red",
        name: "Node-RED",
        status: "ok",
        detail: "HTTP Ingest 対応（デモモード）",
      },
      {
        id: "tv",
        name: "Google TV",
        status: isDemoRunnerActive() ? "ok" : "idle",
        detail: "WebSocket /ws — tv-app または /tv プレビュー",
      },
      {
        id: "demo-engine",
        name: "Demo Data Engine",
        status: isDemoRunnerActive() ? "ok" : "stopped",
        detail: getDemoRunnerStats(),
      },
    ],
    lastEventAt: lastEvent?.created_at ?? null,
    lastHeartbeatAt: lastHb?.received_at ?? null,
    timestamp: new Date().toISOString(),
  });
});

demoRouter.get("/replay", (req, res) => {
  const db = getDatabase();
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const siteId = req.query.siteId as string | undefined;
  let sql = "SELECT * FROM events WHERE 1=1";
  const params: unknown[] = [];
  if (siteId) {
    sql += " AND site_id = ?";
    params.push(siteId);
  }
  sql += " ORDER BY created_at ASC LIMIT ?";
  params.push(limit);
  const events = db.prepare(sql).all(...params);
  res.json({ events, count: events.length });
});
