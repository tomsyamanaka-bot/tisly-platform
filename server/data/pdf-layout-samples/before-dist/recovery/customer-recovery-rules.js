import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
export function listCustomerRecoveryRules(customerId) {
    return getDatabase()
        .prepare(`SELECT * FROM customer_recovery_rules WHERE customer_id = ? ORDER BY priority DESC, created_at`)
        .all(customerId);
}
export function createCustomerRecoveryRule(input) {
    const id = uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO customer_recovery_rules (id, customer_id, name, condition_type, condition_device_type, action_type, action_target, enabled, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, input.customerId, input.name, input.conditionType, input.conditionDeviceType ?? null, input.actionType, input.actionTarget ?? null, input.enabled !== false ? 1 : 0, input.priority ?? 0, now, now);
    return getCustomerRecoveryRule(input.customerId, id);
}
export function getCustomerRecoveryRule(customerId, id) {
    const row = getDatabase()
        .prepare(`SELECT * FROM customer_recovery_rules WHERE customer_id = ? AND id = ?`)
        .get(customerId, id);
    return row ?? null;
}
export function updateCustomerRecoveryRule(customerId, id, patch) {
    const existing = getCustomerRecoveryRule(customerId, id);
    if (!existing)
        return null;
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`UPDATE customer_recovery_rules SET name = ?, condition_type = ?, condition_device_type = ?,
       action_type = ?, action_target = ?, enabled = ?, priority = ?, updated_at = ? WHERE id = ? AND customer_id = ?`)
        .run(patch.name ?? existing.name, patch.conditionType ?? existing.condition_type, patch.conditionDeviceType !== undefined ? patch.conditionDeviceType : existing.condition_device_type, patch.actionType ?? existing.action_type, patch.actionTarget !== undefined ? patch.actionTarget : existing.action_target, patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled, patch.priority ?? existing.priority, now, id, customerId);
    return getCustomerRecoveryRule(customerId, id);
}
export function deleteCustomerRecoveryRule(customerId, id) {
    const r = getDatabase()
        .prepare(`DELETE FROM customer_recovery_rules WHERE customer_id = ? AND id = ?`)
        .run(customerId, id);
    return r.changes > 0;
}
