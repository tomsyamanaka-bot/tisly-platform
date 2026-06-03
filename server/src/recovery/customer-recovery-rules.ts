import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";

export interface CustomerRecoveryRule {
  id: string;
  customer_id: string;
  name: string;
  condition_type: string;
  condition_device_type: string | null;
  action_type: string;
  action_target: string | null;
  enabled: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export function listCustomerRecoveryRules(customerId: string): CustomerRecoveryRule[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM customer_recovery_rules WHERE customer_id = ? ORDER BY priority DESC, created_at`
    )
    .all(customerId) as CustomerRecoveryRule[];
}

export function createCustomerRecoveryRule(input: {
  customerId: string;
  name: string;
  conditionType: string;
  conditionDeviceType?: string | null;
  actionType: string;
  actionTarget?: string | null;
  enabled?: boolean;
  priority?: number;
}): CustomerRecoveryRule {
  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO customer_recovery_rules (id, customer_id, name, condition_type, condition_device_type, action_type, action_target, enabled, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.customerId,
      input.name,
      input.conditionType,
      input.conditionDeviceType ?? null,
      input.actionType,
      input.actionTarget ?? null,
      input.enabled !== false ? 1 : 0,
      input.priority ?? 0,
      now,
      now
    );
  return getCustomerRecoveryRule(input.customerId, id)!;
}

export function getCustomerRecoveryRule(customerId: string, id: string): CustomerRecoveryRule | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_recovery_rules WHERE customer_id = ? AND id = ?`)
    .get(customerId, id) as CustomerRecoveryRule | undefined;
  return row ?? null;
}

export function updateCustomerRecoveryRule(
  customerId: string,
  id: string,
  patch: Partial<{
    name: string;
    conditionType: string;
    conditionDeviceType: string | null;
    actionType: string;
    actionTarget: string | null;
    enabled: boolean;
    priority: number;
  }>
): CustomerRecoveryRule | null {
  const existing = getCustomerRecoveryRule(customerId, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `UPDATE customer_recovery_rules SET name = ?, condition_type = ?, condition_device_type = ?,
       action_type = ?, action_target = ?, enabled = ?, priority = ?, updated_at = ? WHERE id = ? AND customer_id = ?`
    )
    .run(
      patch.name ?? existing.name,
      patch.conditionType ?? existing.condition_type,
      patch.conditionDeviceType !== undefined ? patch.conditionDeviceType : existing.condition_device_type,
      patch.actionType ?? existing.action_type,
      patch.actionTarget !== undefined ? patch.actionTarget : existing.action_target,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
      patch.priority ?? existing.priority,
      now,
      id,
      customerId
    );
  return getCustomerRecoveryRule(customerId, id);
}

export function deleteCustomerRecoveryRule(customerId: string, id: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM customer_recovery_rules WHERE customer_id = ? AND id = ?`)
    .run(customerId, id);
  return r.changes > 0;
}
