/**
 * Phase 1361–1380 — LockUser / LockEvent / PresenceUser persistence
 */
import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
const DEFAULT_LOCK_USERS = [
    { name: "父", role: "adult", enabled: true, notificationEnabled: true },
    { name: "母", role: "adult", enabled: true, notificationEnabled: true },
    { name: "長女", role: "child", enabled: true, notificationEnabled: true },
    { name: "次男", role: "child", enabled: true, notificationEnabled: true },
    { name: "ゲスト", role: "guest", enabled: true, notificationEnabled: false },
];
const DEFAULT_PRESENCE_USERS = [
    { name: "父", deviceIds: [], role: "adult", notificationEnabled: true },
    { name: "母", deviceIds: [], role: "adult", notificationEnabled: true },
    { name: "長女", deviceIds: [], role: "child", notificationEnabled: true },
    { name: "次男", deviceIds: [], role: "child", notificationEnabled: true },
];
function rowToLockUser(row) {
    return {
        id: String(row.id),
        name: String(row.name),
        role: row.role,
        enabled: Boolean(row.enabled),
        notificationEnabled: Boolean(row.notification_enabled),
        createdAt: String(row.created_at),
    };
}
function rowToLockEvent(row) {
    return {
        id: String(row.id),
        provider: row.provider,
        deviceId: String(row.device_id),
        eventType: row.event_type,
        userId: row.user_id ? String(row.user_id) : null,
        userName: row.user_name ? String(row.user_name) : null,
        success: Boolean(row.success),
        createdAt: String(row.created_at),
    };
}
function rowToPresenceUser(row) {
    let deviceIds = [];
    try {
        deviceIds = JSON.parse(String(row.device_ids ?? "[]"));
    }
    catch {
        deviceIds = [];
    }
    return {
        id: String(row.id),
        name: String(row.name),
        deviceIds,
        role: row.role,
        notificationEnabled: Boolean(row.notification_enabled),
    };
}
export function ensureLockProviderSeed() {
    const db = getDatabase();
    const userCount = db.prepare("SELECT COUNT(*) as c FROM lock_users").get().c;
    if (userCount === 0) {
        const now = new Date().toISOString();
        const stmt = db.prepare(`INSERT INTO lock_users (id, name, role, enabled, notification_enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`);
        for (const u of DEFAULT_LOCK_USERS) {
            stmt.run(uuid(), u.name, u.role, u.enabled ? 1 : 0, u.notificationEnabled ? 1 : 0, now);
        }
    }
    const presenceCount = db.prepare("SELECT COUNT(*) as c FROM presence_users").get().c;
    if (presenceCount === 0) {
        const stmt = db.prepare(`INSERT INTO presence_users (id, name, device_ids, role, notification_enabled)
       VALUES (?, ?, ?, ?, ?)`);
        for (const u of DEFAULT_PRESENCE_USERS) {
            stmt.run(uuid(), u.name, JSON.stringify(u.deviceIds), u.role, u.notificationEnabled ? 1 : 0);
        }
    }
}
export function listLockUsers() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM lock_users ORDER BY created_at").all();
    return rows.map(rowToLockUser);
}
export function getLockUserByName(name) {
    const db = getDatabase();
    const row = db
        .prepare("SELECT * FROM lock_users WHERE name = ? LIMIT 1")
        .get(name);
    return row ? rowToLockUser(row) : null;
}
export function listPresenceUsers() {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM presence_users ORDER BY name").all();
    return rows.map(rowToPresenceUser);
}
export function createLockEvent(input) {
    const db = getDatabase();
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO lock_events (id, provider, device_id, event_type, user_id, user_name, success, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.provider, input.deviceId, input.eventType, input.userId ?? null, input.userName ?? null, input.success !== false ? 1 : 0, now);
    return {
        id,
        provider: input.provider,
        deviceId: input.deviceId,
        eventType: input.eventType,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        success: input.success !== false,
        createdAt: now,
    };
}
export function listLockEvents(limit = 50) {
    const db = getDatabase();
    const rows = db
        .prepare("SELECT * FROM lock_events ORDER BY created_at DESC LIMIT ?")
        .all(limit);
    return rows.map(rowToLockEvent);
}
export function listFaceLockEvents(limit = 50) {
    return listLockEvents(limit * 2)
        .filter((e) => e.eventType === "face_unlock" || e.eventType === "fingerprint_unlock")
        .slice(0, limit);
}
export function createFamilyNotification(input) {
    const db = getDatabase();
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO family_notifications (id, kind, user_name, provider, method, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, input.kind, input.userName, input.provider, input.method, input.message, now);
    return { id, ...input, createdAt: now };
}
export function listFamilyNotifications(limit = 50) {
    const db = getDatabase();
    const rows = db
        .prepare("SELECT * FROM family_notifications ORDER BY created_at DESC LIMIT ?")
        .all(limit);
    return rows.map((row) => ({
        id: String(row.id),
        kind: row.kind,
        userName: String(row.user_name),
        provider: row.provider,
        method: String(row.method),
        message: String(row.message),
        createdAt: String(row.created_at),
    }));
}
export function listChildArrivalNotifications(limit = 50) {
    return listFamilyNotifications(limit * 2)
        .filter((n) => n.kind === "child_arrived_home")
        .slice(0, limit);
}
export function resetLockProviderStoreForTests() {
    const db = getDatabase();
    db.exec("DELETE FROM lock_events");
    db.exec("DELETE FROM family_notifications");
    db.exec("DELETE FROM lock_users");
    db.exec("DELETE FROM presence_users");
    ensureLockProviderSeed();
}
