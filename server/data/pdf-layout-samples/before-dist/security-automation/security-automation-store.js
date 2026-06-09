/**
 * Phase 1321–1340 — Security automation persistence (SQLite)
 */
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { getDatabase } from "../db/database.js";
const DEFAULT_SETTINGS = {
    switchbotIntegrationEnabled: false,
    autoArmEnabled: false,
    autoDisarmEnabled: false,
    delaySeconds: 300,
    unknownDevicePolicy: "block_auto_arm",
    manualOverride: false,
    realExecutionConfirmed: false,
};
const DEFAULT_RULES = [
    {
        name: "SwitchBot locked → auto arm",
        enabled: true,
        triggerType: "switchbot_locked",
        requiredPresence: "all_away",
        action: "arm",
        delaySeconds: 300,
        unknownDevicePolicy: "block_auto_arm",
        requireConfirmation: false,
    },
    {
        name: "SwitchBot unlocked → auto disarm",
        enabled: true,
        triggerType: "switchbot_unlocked",
        requiredPresence: "ignore",
        action: "disarm",
        delaySeconds: 0,
        unknownDevicePolicy: "block_auto_arm",
        requireConfirmation: false,
    },
];
export function ensureSecurityAutomationSeed() {
    const db = getDatabase();
    const stateRow = db.prepare("SELECT id FROM security_state LIMIT 1").get();
    if (!stateRow) {
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO security_state (id, mode, reason, source, last_changed_at, last_changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`).run(uuid(), "disarmed", "Initial state", "system", now, "system");
    }
    const ruleCount = db.prepare("SELECT COUNT(*) as c FROM security_automation_rules").get().c;
    if (ruleCount === 0) {
        for (const rule of DEFAULT_RULES) {
            db.prepare(`INSERT INTO security_automation_rules
         (id, name, enabled, trigger_type, required_presence, action, delay_seconds, unknown_device_policy, require_confirmation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(uuid(), rule.name, rule.enabled ? 1 : 0, rule.triggerType, rule.requiredPresence, rule.action, rule.delaySeconds, rule.unknownDevicePolicy, rule.requireConfirmation ? 1 : 0);
        }
    }
    const settingsRow = db
        .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
        .get("security_automation_settings");
    if (!settingsRow) {
        const initial = {
            ...DEFAULT_SETTINGS,
            autoArmEnabled: config.switchbot.autoArmEnabled,
            autoDisarmEnabled: config.switchbot.autoDisarmEnabled,
            unknownDevicePolicy: process.env.SECURITY_UNKNOWN_DEVICE_POLICY || DEFAULT_SETTINGS.unknownDevicePolicy,
        };
        db.prepare(`INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`).run("security_automation_settings", JSON.stringify(initial));
    }
}
export function getSecurityState() {
    ensureSecurityAutomationSeed();
    const row = getDatabase()
        .prepare(`SELECT id, mode, reason, source, last_changed_at, last_changed_by FROM security_state ORDER BY last_changed_at DESC LIMIT 1`)
        .get();
    return {
        id: row.id,
        mode: row.mode,
        reason: row.reason,
        source: row.source,
        lastChangedAt: row.last_changed_at,
        lastChangedBy: row.last_changed_by,
    };
}
export function saveSecurityState(mode, reason, source, changedBy) {
    const now = new Date().toISOString();
    const id = uuid();
    getDatabase()
        .prepare(`INSERT INTO security_state (id, mode, reason, source, last_changed_at, last_changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, mode, reason, source, now, changedBy);
    return { id, mode, reason, source, lastChangedAt: now, lastChangedBy: changedBy };
}
export function createSecurityEventLogEntry(event) {
    if (!config.securityAutomation.eventLogEnabled) {
        return null;
    }
    const id = uuid();
    const createdAt = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO security_event_logs
       (id, event_type, source, message, before_mode, after_mode, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, event.eventType, event.source, event.message, event.beforeMode, event.afterMode, JSON.stringify(event.metadata ?? {}), createdAt);
    return { ...event, id, createdAt };
}
export function listSecurityEventLogs(limit = 50) {
    const rows = getDatabase()
        .prepare(`SELECT id, event_type, source, message, before_mode, after_mode, metadata_json, created_at
       FROM security_event_logs ORDER BY created_at DESC LIMIT ?`)
        .all(limit);
    return rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        source: r.source,
        message: r.message,
        beforeMode: r.before_mode,
        afterMode: r.after_mode,
        metadata: JSON.parse(r.metadata_json || "{}"),
        createdAt: r.created_at,
    }));
}
export function getRegisteredDevices() {
    ensureSecurityAutomationSeed();
    const rows = getDatabase()
        .prepare(`SELECT id, name, type, owner_name, mac_address, ip_address, enabled, last_seen_at, presence_status
       FROM registered_presence_devices ORDER BY name`)
        .all();
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        ownerName: r.owner_name,
        macAddress: r.mac_address ?? undefined,
        ipAddress: r.ip_address ?? undefined,
        enabled: r.enabled === 1,
        lastSeenAt: r.last_seen_at,
        presenceStatus: r.presence_status,
    }));
}
export function upsertPresenceDevice(input) {
    const id = input.id ?? uuid();
    const now = new Date().toISOString();
    getDatabase()
        .prepare(`INSERT INTO registered_presence_devices
       (id, name, type, owner_name, mac_address, ip_address, enabled, last_seen_at, presence_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         owner_name = excluded.owner_name,
         mac_address = excluded.mac_address,
         ip_address = excluded.ip_address,
         enabled = excluded.enabled,
         last_seen_at = excluded.last_seen_at,
         presence_status = excluded.presence_status,
         updated_at = excluded.updated_at`)
        .run(id, input.name, input.type, input.ownerName ?? "", input.macAddress ?? null, input.ipAddress ?? null, input.enabled !== false ? 1 : 0, input.lastSeenAt ?? now, input.presenceStatus ?? "unknown", now);
    return {
        id,
        name: input.name,
        type: input.type,
        ownerName: input.ownerName ?? "",
        macAddress: input.macAddress,
        ipAddress: input.ipAddress,
        enabled: input.enabled !== false,
        lastSeenAt: input.lastSeenAt ?? now,
        presenceStatus: input.presenceStatus ?? "unknown",
    };
}
export function updateDevicePresenceInStore(deviceId, status) {
    const now = new Date().toISOString();
    const result = getDatabase()
        .prepare(`UPDATE registered_presence_devices SET presence_status = ?, last_seen_at = ?, updated_at = ? WHERE id = ?`)
        .run(status, now, now, deviceId);
    if (result.changes === 0)
        return null;
    return getRegisteredDevices().find((d) => d.id === deviceId) ?? null;
}
export function getAutomationRules() {
    ensureSecurityAutomationSeed();
    const rows = getDatabase()
        .prepare(`SELECT id, name, enabled, trigger_type, required_presence, action, delay_seconds, unknown_device_policy, require_confirmation
       FROM security_automation_rules ORDER BY trigger_type`)
        .all();
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled === 1,
        triggerType: r.trigger_type,
        requiredPresence: r.required_presence,
        action: r.action,
        delaySeconds: r.delay_seconds,
        unknownDevicePolicy: r.unknown_device_policy,
        requireConfirmation: r.require_confirmation === 1,
    }));
}
export function updateAutomationRule(id, patch) {
    const existing = getAutomationRules().find((r) => r.id === id);
    if (!existing)
        return null;
    const merged = { ...existing, ...patch };
    getDatabase()
        .prepare(`UPDATE security_automation_rules SET
         name = ?, enabled = ?, trigger_type = ?, required_presence = ?, action = ?,
         delay_seconds = ?, unknown_device_policy = ?, require_confirmation = ?
       WHERE id = ?`)
        .run(merged.name, merged.enabled ? 1 : 0, merged.triggerType, merged.requiredPresence, merged.action, merged.delaySeconds, merged.unknownDevicePolicy, merged.requireConfirmation ? 1 : 0, id);
    return merged;
}
export function getAutomationSettings() {
    ensureSecurityAutomationSeed();
    const row = getDatabase()
        .prepare("SELECT value_json FROM platform_settings WHERE key = ?")
        .get("security_automation_settings");
    try {
        const parsed = JSON.parse(row.value_json);
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            manualOverride: parsed.manualOverride ?? false,
            realExecutionConfirmed: parsed.realExecutionConfirmed ?? false,
        };
    }
    catch {
        return DEFAULT_SETTINGS;
    }
}
export function saveAutomationSettings(settings) {
    const merged = { ...getAutomationSettings(), ...settings };
    getDatabase()
        .prepare(`INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
        .run("security_automation_settings", JSON.stringify(merged));
    return merged;
}
/** テスト用 — pending arm タイマーを即時実行できるよう公開 */
export function resetSecurityAutomationForTests() {
    const db = getDatabase();
    db.exec(`DELETE FROM security_event_logs`);
    db.exec(`DELETE FROM security_state`);
    db.exec(`DELETE FROM registered_presence_devices`);
    db.exec(`DELETE FROM security_automation_rules`);
    db.prepare(`DELETE FROM platform_settings WHERE key = ?`).run("security_automation_settings");
    ensureSecurityAutomationSeed();
}
