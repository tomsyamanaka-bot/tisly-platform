import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
import { appendTimeline, ensureIncident } from "./incident-timeline.js";
import { runDeviceRecovery } from "./device-recovery.js";
import { logAudit } from "../provisioning/audit-log.js";
import { broadcast } from "../ws/hub.js";
import { stopMqttSubscriber, startMqttSubscriber } from "../mqtt/mqtt-subscriber.js";

export type RecoveryActionType =
  | "restart_device"
  | "restart_mqtt"
  | "restart_node_red"
  | "escalate";

export interface RecoveryActionInput {
  action: RecoveryActionType;
  deviceId?: string;
  siteId?: string;
  reason?: string;
  actorId?: string;
}

export async function executeRecoveryAction(input: RecoveryActionInput) {
  const actionId = uuid();
  const reason = input.reason ?? "operator_manual";

  switch (input.action) {
    case "restart_device": {
      if (!input.deviceId) throw new Error("deviceId required for restart_device");
      const db = getDatabase();
      const row = db
        .prepare("SELECT metadata_json FROM devices WHERE device_id = ?")
        .get(input.deviceId) as { metadata_json: string | null } | undefined;
      const meta = row?.metadata_json ? JSON.parse(row.metadata_json) : {};
      meta.last_restart_request = {
        actionId,
        requestedAt: new Date().toISOString(),
        reason,
        status: "pending",
        via: "recovery_console",
      };
      db.prepare(
        `UPDATE devices SET metadata_json = ?, updated_at = datetime('now') WHERE device_id = ?`
      ).run(JSON.stringify(meta), input.deviceId);

      broadcast({
        type: "event",
        payload: { action: "restart_device", deviceId: input.deviceId, actionId },
        at: new Date().toISOString(),
      });

      const incidentId = ensureIncident(input.deviceId, input.siteId ?? (meta.site_id as string));
      appendTimeline(incidentId, "respond", "手動: デバイス再起動要求", actionId, input.deviceId);

      logAudit({
        siteId: input.siteId ?? (meta.site_id as string),
        action: "recovery.restart_device",
        entityType: "device",
        entityId: input.deviceId,
        details: { actionId, reason },
      });

      return {
        ok: true,
        actionId,
        action: input.action,
        deviceId: input.deviceId,
        topicHint: `tisly/${meta.tenant_id ?? config.defaultTenantId}/${meta.site_id ?? "default"}/${input.deviceId}/cmd`,
      };
    }

    case "restart_mqtt": {
      stopMqttSubscriber();
      startMqttSubscriber();
      logAudit({ action: "recovery.restart_mqtt", details: { actionId, reason } });
      return {
        ok: true,
        actionId,
        action: input.action,
        note: "MQTT サブスクライバーを再起動しました。",
        reconnectHint: config.mqtt.url,
      };
    }

    case "restart_node_red": {
      logAudit({ action: "recovery.restart_node_red", details: { actionId, reason } });
      return {
        ok: true,
        actionId,
        action: input.action,
        note: "Node-RED フロー再起動はホストで systemctl restart node-red 等を実行。",
        ingestUrl: `${config.publicUrl}/api/events/ingest`,
      };
    }

    case "escalate": {
      if (!input.deviceId) throw new Error("deviceId required for escalate");
      const result = await runDeviceRecovery(input.deviceId, "heartbeat_lost");
      appendTimeline(
        ensureIncident(input.deviceId, input.siteId),
        "notify",
        `手動エスカレーション: ${reason}`,
        actionId,
        input.deviceId
      );
      logAudit({
        action: "recovery.escalate",
        entityType: "device",
        entityId: input.deviceId,
        details: { actionId, runId: result.runId },
      });
      return { ok: true, actionId, action: input.action, recovery: result };
    }

    default:
      throw new Error(`unknown action: ${input.action}`);
  }
}
