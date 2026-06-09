import webpush from "web-push";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
export function configureWebPush() {
    if (!config.vapid.publicKey || !config.vapid.privateKey)
        return;
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}
export async function sendWebPush(payload, userId) {
    if (!config.vapid.publicKey || !config.vapid.privateKey) {
        return { channel: "web_push", success: false, error: "VAPID keys not configured" };
    }
    configureWebPush();
    let db;
    try {
        db = getDatabase();
    }
    catch (err) {
        return {
            channel: "web_push",
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    const tokens = userId
        ? db
            .prepare(`SELECT * FROM notification_tokens WHERE channel = 'web_push' AND active = 1 AND user_id = ?`)
            .all(userId)
        : db
            .prepare(`SELECT * FROM notification_tokens WHERE channel = 'web_push' AND active = 1`)
            .all();
    if (!tokens.length) {
        return { channel: "web_push", success: false, error: "No push subscriptions" };
    }
    const message = JSON.stringify({
        title: payload.title,
        body: payload.body,
        eventType: payload.eventType,
        deviceId: payload.deviceId,
        url: payload.url ?? "/app/notifications",
        data: payload.data,
    });
    let sent = 0;
    let lastError;
    for (const row of tokens) {
        try {
            const keys = JSON.parse(row.keys_json);
            await webpush.sendNotification({ endpoint: row.endpoint, keys }, message);
            sent++;
        }
        catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (String(lastError).includes("410") || String(lastError).includes("404")) {
                db.prepare("UPDATE notification_tokens SET active = 0 WHERE id = ?").run(row.id);
            }
        }
    }
    return {
        channel: "web_push",
        success: sent > 0,
        error: sent > 0 ? undefined : lastError ?? "All subscriptions failed",
    };
}
export function countPushSubscriptions(userId) {
    let db;
    try {
        db = getDatabase();
    }
    catch {
        return 0;
    }
    if (userId) {
        const row = db
            .prepare(`SELECT COUNT(*) AS n FROM notification_tokens WHERE channel = 'web_push' AND active = 1 AND user_id = ?`)
            .get(userId);
        return row.n;
    }
    const row = db
        .prepare(`SELECT COUNT(*) AS n FROM notification_tokens WHERE channel = 'web_push' AND active = 1`)
        .get();
    return row.n;
}
function ensurePushUserExists(userId) {
    const db = getDatabase();
    const row = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (row)
        return;
    if (userId === "remote-test") {
        db.prepare(`INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)`).run("remote-test", "remote-test@tisly.jp", "TiSLY Remote Test", "viewer");
        return;
    }
    if (userId === "admin-default") {
        db.prepare(`INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)`).run("admin-default", "admin@tisly.jp", "TiSLY Admin", "admin");
    }
}
export function savePushSubscription(userId, subscription, deviceId) {
    const id = uuid();
    const db = getDatabase();
    ensurePushUserExists(userId);
    db.prepare(`INSERT INTO notification_tokens (id, user_id, device_id, channel, token, endpoint, keys_json)
     VALUES (?, ?, ?, 'web_push', ?, ?, ?)`).run(id, userId, deviceId ?? null, subscription.endpoint, subscription.endpoint, JSON.stringify(subscription.keys));
    db.prepare(`INSERT INTO pwa_subscriptions (id, user_id, endpoint, keys_json, active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(endpoint) DO UPDATE SET
       keys_json = excluded.keys_json,
       active = 1,
       updated_at = datetime('now')`).run(id, userId, subscription.endpoint, JSON.stringify(subscription.keys));
    return id;
}
