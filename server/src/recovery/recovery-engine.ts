import { getDatabase } from "../db/database.js";
import type { TislyEvent } from "../notification/types.js";
import { runDeviceRecovery } from "./device-recovery.js";
import { DEFAULT_ESCALATION } from "./escalation-engine.js";
import { getIncidentTimeline } from "./incident-timeline.js";
import { RECOVERY_PLAYBOOKS, getPlaybook } from "./playbook.js";
import { DEVICE_RECOVERY_RULES } from "./recovery-rules.js";
import { getSlaMetrics, computeMttr } from "./sla-monitor.js";
import {
  appendTimeline,
  ensureIncident,
} from "./incident-timeline.js";
import type { AiAlertPriority } from "../analytics/risk-score.js";

let recoveryEngineStarted = false;

export function startRecoveryEngine(): void {
  if (recoveryEngineStarted) return;
  recoveryEngineStarted = true;
  console.log("[TiSLY Recovery] Engine started — rules:", DEVICE_RECOVERY_RULES.length);
}

export async function handleEventRecovery(
  event: TislyEvent,
  meta?: { riskScore?: number; priority?: string }
): Promise<void> {
  const incidentId = ensureIncident(event.deviceId, event.siteId);
  const riskNote =
    meta?.riskScore != null
      ? `risk=${meta.riskScore} priority=${meta.priority ?? event.severity}`
      : event.severity ?? "info";
  appendTimeline(
    incidentId,
    event.eventType === "recovery" ? "recover" : "anomaly",
    event.title,
    riskNote,
    event.deviceId,
    event.siteId
  );

  if (
    event.eventType === "heartbeat_alarm" ||
    event.eventType === "heartbeat_warning" ||
    (event.eventType === "heartbeat" && event.payload?.offline)
  ) {
    await runDeviceRecovery(event.deviceId, "heartbeat_lost");
  }

  if (event.eventType === "recovery") {
    appendTimeline(incidentId, "recover", "復旧イベント受信", event.body, event.deviceId, event.siteId);
  }
}

export function applyAiPriorityToEvent(
  event: TislyEvent,
  priority: AiAlertPriority
): TislyEvent {
  return { ...event, severity: priority };
}

export function getRecoveryOverview() {
  const db = getDatabase();
  const recentRuns = db
    .prepare(
      `SELECT id, rule_id as ruleId, device_id as deviceId, status, started_at as startedAt, completed_at as completedAt
       FROM recovery_runs ORDER BY started_at DESC LIMIT 20`
    )
    .all();

  return {
    rules: DEVICE_RECOVERY_RULES,
    escalation: DEFAULT_ESCALATION,
    playbooks: RECOVERY_PLAYBOOKS,
    sla: getSlaMetrics(30),
    mttr: computeMttr(30),
    recentRuns,
    timeline: getIncidentTimeline(undefined, 30),
  };
}

export { getPlaybook, getSlaMetrics, computeMttr };
