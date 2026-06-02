import { Router } from "express";
import { getDatabase } from "../../db/database.js";
import { getAnalyticsOverview } from "../../analytics/analytics-engine.js";
import { getRecoveryOverview } from "../../recovery/recovery-engine.js";
import { DEMO_SITES } from "../../demo/demo-sites.js";

export const socNocRouter = Router();

function securityEvents(limit = 30) {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM events
       WHERE event_type IN ('intrusion', 'perimeter', 'window_open', 'door_open', 'estop', 'motion')
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit);
}

function networkHealth() {
  const db = getDatabase();
  const devices = db.prepare("SELECT * FROM devices ORDER BY updated_at DESC").all();
  const heartbeats = db
    .prepare(
      `SELECT * FROM device_heartbeats ORDER BY received_at DESC LIMIT 20`
    )
    .all();
  return { devices, heartbeats };
}

socNocRouter.get("/soc", (_req, res) => {
  const analytics = getAnalyticsOverview();
  res.json({
    mode: "soc",
    label: "Security Operations Center",
    sites: DEMO_SITES,
    alarms: securityEvents(20),
    risk: analytics.risk,
    summary: analytics.summary.today,
    nlReport: analytics.naturalLanguage.today,
    recovery: {
      openIncidents: getRecoveryOverview().timeline.filter((t) => t.phase === "anomaly").length,
    },
  });
});

socNocRouter.get("/noc", (_req, res) => {
  const db = getDatabase();
  const mqttOk = true;
  const offline = db
    .prepare(
      `SELECT * FROM devices WHERE heartbeat_status != 'ok' ORDER BY updated_at DESC`
    )
    .all();
  res.json({
    mode: "noc",
    label: "Network Operations Center",
    health: networkHealth(),
    mqttConnected: mqttOk,
    offlineDevices: offline,
    sla: getRecoveryOverview().sla,
    mttr: getRecoveryOverview().mttr,
  });
});
