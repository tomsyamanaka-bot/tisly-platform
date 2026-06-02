import { Router } from "express";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import { isQnapSmbConfigured } from "../../qnap/smb-client.js";
import { getQnapMode } from "../../qnap/smb-client.js";

export const healthFullRouter = Router();

healthFullRouter.get("/", (_req, res) => {
  const db = getDatabase();
  let dbOk = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }

  const tvCount = (
    db.prepare("SELECT COUNT(*) as c FROM tv_devices").get() as { c: number }
  ).c;
  const pairedTv = (
    db
      .prepare("SELECT COUNT(*) as c FROM tv_devices WHERE paired_at IS NOT NULL")
      .get() as { c: number }
  ).c;

  res.json({
    status: dbOk ? "ok" : "degraded",
    phase: "141-160-rc1",
    components: {
      server: { status: "ok", port: config.port },
      database: { status: dbOk ? "ok" : "error", path: config.dbPath },
      mqtt: {
        status: process.env.MQTT_SUBSCRIBER_ENABLED === "true" ? "enabled" : "standby",
        url: config.mqtt.url,
        mockMode: process.env.MQTT_MOCK_MODE === "true",
      },
      nodeRed: {
        status: config.ingestSecret ? "configured" : "missing-ingest-secret",
        ingestPath: "/api/events/ingest",
      },
      tv: {
        status: "ok",
        registered: tvCount,
        paired: pairedTv,
      },
      qnap: {
        status: getQnapMode() === "real" && isQnapSmbConfigured() ? "real-ready" : "mock",
        mode: getQnapMode(),
        smbConfigured: isQnapSmbConfigured(),
      },
    },
    demoMode: config.demoMode,
  });
});
