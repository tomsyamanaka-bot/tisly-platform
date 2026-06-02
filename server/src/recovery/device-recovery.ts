import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import { findRuleForDevice, type RecoveryRule } from "./recovery-rules.js";
import { tierForElapsed } from "./escalation-engine.js";
import {
  appendTimeline,
  ensureIncident,
} from "./incident-timeline.js";

export interface RecoveryRunResult {
  runId: string;
  ruleId: string;
  deviceId: string;
  status: "started" | "completed" | "failed";
  stepsExecuted: number;
  message: string;
}

function inferDeviceKind(deviceType: string, platform: string): string {
  const t = deviceType.toLowerCase();
  if (t.includes("esp")) return "esp32";
  if (t.includes("rp2350") || t.includes("rp")) return "rp2350";
  if (t.includes("plc")) return "plc";
  if (t.includes("tv")) return "tv";
  if (t.includes("camera")) return "camera";
  if (platform.toLowerCase().includes("node")) return "node-red";
  return "generic";
}

export async function runDeviceRecovery(
  deviceId: string,
  trigger: RecoveryRule["trigger"] = "heartbeat_lost"
): Promise<RecoveryRunResult> {
  const db = getDatabase();
  const dev = db
    .prepare(`SELECT device_type, platform, metadata_json FROM devices WHERE device_id = ?`)
    .get(deviceId) as
    | { device_type: string; platform: string; metadata_json: string | null }
    | undefined;

  const kind = dev
    ? inferDeviceKind(dev.device_type, dev.platform)
    : "generic";
  const rule =
    findRuleForDevice(kind, trigger) ??
    findRuleForDevice("generic", trigger)!;

  const runId = uuid();
  const meta = dev?.metadata_json ? JSON.parse(dev.metadata_json) : {};
  const siteId = meta.site_id as string | undefined;
  const incidentId = ensureIncident(deviceId, siteId);

  appendTimeline(incidentId, "anomaly", `復旧開始: ${rule.name}`, rule.id, deviceId, siteId);

  db.prepare(
    `INSERT INTO recovery_runs (id, rule_id, device_id, incident_id, status, steps_json, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, datetime('now'))`
  ).run(runId, rule.id, deviceId, incidentId, JSON.stringify(rule.steps));

  let executed = 0;
  for (const step of rule.steps) {
    executed++;
    appendTimeline(
      incidentId,
      step.action === "notify" || step.action === "escalate" ? "notify" : "respond",
      step.description,
      `action=${step.action}`,
      deviceId,
      siteId
    );
    if (step.action === "reconnect") {
      db.prepare(
        `UPDATE devices SET heartbeat_status = 'warning', updated_at = datetime('now') WHERE device_id = ?`
      ).run(deviceId);
    }
    if (step.action === "escalate") {
      const tier = tierForElapsed(step.delaySec);
      appendTimeline(
        incidentId,
        "notify",
        `エスカレーション ${tier.label}`,
        tier.channels.join(","),
        deviceId,
        siteId
      );
    }
  }

  db.prepare(
    `UPDATE devices SET heartbeat_status = 'ok', last_heartbeat_at = datetime('now') WHERE device_id = ?`
  ).run(deviceId);

  db.prepare(
    `UPDATE recovery_runs SET status = 'completed', completed_at = datetime('now') WHERE id = ?`
  ).run(runId);

  appendTimeline(incidentId, "recover", "自動復旧完了", undefined, deviceId, siteId);

  return {
    runId,
    ruleId: rule.id,
    deviceId,
    status: "completed",
    stepsExecuted: executed,
    message: `${rule.name} — ${executed} ステップ実行`,
  };
}
