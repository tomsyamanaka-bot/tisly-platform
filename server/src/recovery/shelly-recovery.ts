/**
 * Phase 2251–2300 — Shelly Recovery（mock 排除・履歴保存）
 */
import { getDatabase } from "../db/database.js";
import { getCustomerByCode } from "../customer/customer-store.js";
import { rebootShellyDevice } from "../maintenance/shelly-manager.js";
import { shellyReboot } from "../device/shelly-real-client.js";
import { logAudit } from "../provisioning/audit-log.js";

export interface ShellyRebootInput {
  customerCode?: string;
  deviceId: string;
  actorId?: string;
  confirm?: boolean;
  dryRun?: boolean;
}

export interface ShellyRebootResult {
  ok: boolean;
  actionId: string;
  deviceId: string;
  customerCode?: string;
  shellyMode: string;
  rpcOk: boolean;
  dryRun: boolean;
  message: string;
}

export async function executeShellyReboot(input: ShellyRebootInput): Promise<ShellyRebootResult> {
  const db = getDatabase();
  const device = db
    .prepare(
      `SELECT d.device_id, d.device_type, d.customer_id, c.customer_code
       FROM devices d
       LEFT JOIN customers c ON c.customer_id = d.customer_id
       WHERE d.device_id = ?`
    )
    .get(input.deviceId) as
    | {
        device_id: string;
        device_type: string;
        customer_id: string | null;
        customer_code: string | null;
      }
    | undefined;

  if (!device || !device.device_type.toLowerCase().includes("shelly")) {
    throw new Error("Shelly device not found");
  }

  const code = input.customerCode?.toUpperCase() ?? device.customer_code ?? undefined;
  if (code) {
    const customer = getCustomerByCode(code);
    if (!customer || customer.customer_id !== device.customer_id) {
      throw new Error("customer/device mismatch");
    }
  }

  const rpc = await shellyReboot({
    confirm: input.confirm,
    dryRun: input.dryRun,
  });

  const record = rebootShellyDevice(input.deviceId, input.actorId ?? "recovery_api");
  const steps = [
    {
      step: "shelly_reboot",
      actor: input.actorId ?? "recovery_api",
      ok: rpc.ok,
      dryRun: rpc.dryRun,
      message: rpc.message,
    },
  ];
  db.prepare(`UPDATE recovery_runs SET steps_json = ? WHERE id = ?`).run(
    JSON.stringify(steps),
    record.actionId
  );

  logAudit({
    action: "recovery.shelly_reboot",
    entityType: "device",
    entityId: input.deviceId,
    details: { actionId: record.actionId, customerCode: code, rpcOk: rpc.ok },
  });

  return {
    ok: rpc.ok && record.ok,
    actionId: record.actionId,
    deviceId: input.deviceId,
    customerCode: code,
    shellyMode: rpc.mode,
    rpcOk: rpc.ok,
    dryRun: rpc.dryRun,
    message: rpc.message,
  };
}

export interface ShellyRecoveryHistoryEntry {
  id: string;
  deviceId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  steps: unknown[];
}

export function listShellyRecoveryHistory(
  customerCode?: string,
  limit = 50
): ShellyRecoveryHistoryEntry[] {
  const db = getDatabase();
  let sql = `SELECT r.id, r.device_id, r.status, r.started_at, r.completed_at, r.steps_json
             FROM recovery_runs r
             JOIN devices d ON d.device_id = r.device_id
             WHERE r.rule_id LIKE 'shelly%'`;
  const args: unknown[] = [];
  if (customerCode) {
    const customer = getCustomerByCode(customerCode);
    if (!customer) return [];
    sql += ` AND d.customer_id = ?`;
    args.push(customer.customer_id);
  }
  sql += ` ORDER BY r.started_at DESC LIMIT ?`;
  args.push(Math.min(limit, 200));

  const rows = db.prepare(sql).all(...args) as Array<{
    id: string;
    device_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    steps_json: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    steps: r.steps_json ? JSON.parse(r.steps_json) : [],
  }));
}
