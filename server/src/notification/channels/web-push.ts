import webpush from "web-push";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { getDatabase } from "../../db/database.js";
import type { NotificationPayload } from "../types.js";
import type { DeliveryResult, WebPushAttemptResult } from "../types.js";

let vapidConfiguredLogged = false;

function endpointTail(endpoint: string, n = 48): string {
  if (!endpoint) return "";
  return endpoint.length <= n ? endpoint : endpoint.slice(-n);
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown-host";
  }
}

/** HTTP ステータスを人間可読ラベルへ（ログ / API 用） */
export function webPushStatusLabel(statusCode?: number): string {
  if (statusCode == null) return "unknown";
  const known: Record<number, string> = {
    201: "201 Created",
    400: "400 Bad Request",
    401: "401 Unauthorized",
    403: "403 Forbidden",
    404: "404 Not Found",
    410: "410 Gone / Expired",
    413: "413 Payload Too Large",
    429: "429 Too Many Requests",
  };
  return known[statusCode] ?? String(statusCode);
}

function formatWebPushError(err: unknown): string {
  if (!err || typeof err !== "object") {
    return err instanceof Error ? err.message : String(err);
  }
  const e = err as {
    message?: string;
    statusCode?: number;
    body?: string | Buffer;
    endpoint?: string;
  };
  const parts: string[] = [];
  if (e.statusCode != null) parts.push(webPushStatusLabel(e.statusCode));
  if (e.message) parts.push(e.message);
  if (e.body) {
    const body =
      typeof e.body === "string"
        ? e.body
        : Buffer.isBuffer(e.body)
          ? e.body.toString("utf8")
          : String(e.body);
    if (body.trim()) parts.push(`body=${body.slice(0, 300)}`);
  }
  if (e.endpoint) parts.push(`endpoint=${e.endpoint.slice(0, 80)}`);
  return parts.length ? parts.join(" | ") : String(err);
}

function isVapidHeaderError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("vapid") ||
    m.includes("unauthorized") ||
    m.includes("jwt") ||
    m.includes("invalid authentication")
  );
}

export function configureWebPush(): void {
  if (!config.vapid.publicKey || !config.vapid.privateKey) {
    if (!vapidConfiguredLogged) {
      console.warn(
        "[web-push] VAPID keys not configured — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY"
      );
      vapidConfiguredLogged = true;
    }
    return;
  }
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
  if (!vapidConfiguredLogged) {
    console.log(
      `[web-push] VAPID configured subject=${config.vapid.subject} publicKeyLen=${config.vapid.publicKey.length}`
    );
    vapidConfiguredLogged = true;
  }
}

export function isVapidConfigured(): boolean {
  return !!(config.vapid.publicKey && config.vapid.privateKey);
}

/**
 * Web Push 送信。
 * userId 省略時は全アクティブ端末へ配信（セキュリティ/通知テスト用）。
 */
export async function sendWebPush(
  payload: NotificationPayload,
  userId?: string
): Promise<DeliveryResult> {
  if (!config.vapid.publicKey || !config.vapid.privateKey) {
    console.error("[web-push] send aborted: VAPID keys not configured", {
      hasPublic: !!config.vapid.publicKey,
      hasPrivate: !!config.vapid.privateKey,
      subject: config.vapid.subject,
    });
    return {
      channel: "web_push",
      success: false,
      error: "VAPID keys not configured",
      sent: 0,
      attempted: 0,
      attempts: [],
    };
  }
  configureWebPush();
  let db;
  try {
    db = getDatabase();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[web-push] database unavailable:", msg);
    return {
      channel: "web_push",
      success: false,
      error: msg,
      sent: 0,
      attempted: 0,
      attempts: [],
    };
  }
  const tokens = userId
    ? db
        .prepare(
          `SELECT * FROM notification_tokens WHERE channel = 'web_push' AND active = 1 AND user_id = ?`
        )
        .all(userId)
    : db
        .prepare(
          `SELECT * FROM notification_tokens WHERE channel = 'web_push' AND active = 1`
        )
        .all();

  if (!tokens.length) {
    console.warn(
      `[web-push] No active subscriptions found` +
        (userId ? ` for user_id=${userId}` : " (all users)")
    );
    return {
      channel: "web_push",
      success: false,
      error: "No active subscriptions found",
      sent: 0,
      attempted: 0,
      attempts: [],
    };
  }

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    eventType: payload.eventType,
    deviceId: payload.deviceId,
    url: payload.url ?? "/app/notifications",
    icon: payload.icon,
    badge: payload.badge,
    data: payload.data,
  });

  console.log(
    `[web-push] sending title="${payload.title}" subscriptionCount=${tokens.length}` +
      (userId ? ` userId=${userId}` : " (all active)")
  );

  let sent = 0;
  let lastError: string | undefined;
  const attempts: WebPushAttemptResult[] = [];

  for (const row of tokens as Array<{
    id: string;
    endpoint: string;
    keys_json: string;
  }>) {
    const host = endpointHost(row.endpoint);
    const tail = endpointTail(row.endpoint);
    try {
      const keys = JSON.parse(row.keys_json);
      if (!keys?.p256dh || !keys?.auth) {
        throw new Error("subscription keys missing p256dh/auth");
      }
      const response = await webpush.sendNotification(
        { endpoint: row.endpoint, keys },
        message
      );
      const statusCode =
        (response as { statusCode?: number } | undefined)?.statusCode ?? 201;
      const statusLabel = webPushStatusLabel(statusCode);
      sent++;
      attempts.push({
        id: row.id,
        endpointTail: tail,
        endpointHost: host,
        success: true,
        statusCode,
        statusLabel,
      });
      console.log(
        `[web-push] attempt ok id=${row.id} host=${host} status=${statusLabel} endpoint=…${tail}`
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const statusLabel = webPushStatusLabel(statusCode);
      lastError = formatWebPushError(err);
      if (isVapidHeaderError(lastError)) {
        lastError = `VAPID header error: ${lastError}`;
      }
      attempts.push({
        id: row.id,
        endpointTail: tail,
        endpointHost: host,
        success: false,
        statusCode,
        statusLabel,
        error: lastError,
      });
      console.error(
        `[web-push] attempt fail id=${row.id} host=${host} status=${statusLabel} endpoint=…${tail}:`,
        lastError
      );
      if (
        statusCode === 410 ||
        statusCode === 404 ||
        String(lastError).includes("410") ||
        String(lastError).includes("404")
      ) {
        db.prepare(
          "UPDATE notification_tokens SET active = 0, updated_at = datetime('now') WHERE id = ?"
        ).run(row.id);
        db.prepare(
          "UPDATE pwa_subscriptions SET active = 0, updated_at = datetime('now') WHERE endpoint = ?"
        ).run(row.endpoint);
        console.warn(
          `[web-push] deactivated expired subscription id=${row.id} (${statusLabel})`
        );
      }
    }
  }

  const result: DeliveryResult = {
    channel: "web_push",
    success: sent > 0,
    error: sent > 0 ? undefined : lastError ?? "All subscriptions failed",
    sent,
    attempted: tokens.length,
    attempts,
  };
  console.log(
    `[web-push] result success=${result.success} sent=${sent}/${tokens.length}` +
      (result.error ? ` error=${result.error}` : "")
  );
  return result;
}

export function countPushSubscriptions(userId?: string): number {
  let db;
  try {
    db = getDatabase();
  } catch {
    return 0;
  }
  if (userId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM notification_tokens WHERE channel = 'web_push' AND active = 1 AND user_id = ?`
      )
      .get(userId) as { n: number };
    return row.n;
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM notification_tokens WHERE channel = 'web_push' AND active = 1`
    )
    .get() as { n: number };
  return row.n;
}

function ensurePushUserExists(userId: string): void {
  const db = getDatabase();
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (row) return;
  if (userId === "remote-test") {
    db.prepare(
      `INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)`
    ).run("remote-test", "remote-test@tisly.jp", "TiSLY Remote Test", "viewer");
    return;
  }
  if (userId === "home-security") {
    db.prepare(
      `INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)`
    ).run(
      "home-security",
      "home-security@tisly.jp",
      "TiSLY Home Security",
      "viewer"
    );
    return;
  }
  if (userId === "admin-default") {
    db.prepare(
      `INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)`
    ).run("admin-default", "admin@tisly.jp", "TiSLY Admin", "admin");
  }
}

/**
 * PushSubscription を DB に保存（同一 endpoint は upsert）。
 */
export function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  deviceId?: string
): string {
  if (!subscription?.endpoint) {
    throw new Error("subscription.endpoint required");
  }
  if (!subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("subscription.keys.p256dh and auth required");
  }

  const db = getDatabase();
  ensurePushUserExists(userId);
  const keysJson = JSON.stringify(subscription.keys);

  const existing = db
    .prepare(
      `SELECT id FROM notification_tokens WHERE channel = 'web_push' AND endpoint = ?`
    )
    .get(subscription.endpoint) as { id: string } | undefined;

  let id: string;
  if (existing?.id) {
    id = existing.id;
    db.prepare(
      `UPDATE notification_tokens
       SET user_id = ?, device_id = COALESCE(?, device_id), token = ?, keys_json = ?,
           active = 1, updated_at = datetime('now')
       WHERE id = ?`
    ).run(userId, deviceId ?? null, subscription.endpoint, keysJson, id);
  } else {
    id = uuid();
    db.prepare(
      `INSERT INTO notification_tokens (id, user_id, device_id, channel, token, endpoint, keys_json, active)
       VALUES (?, ?, ?, 'web_push', ?, ?, ?, 1)`
    ).run(
      id,
      userId,
      deviceId ?? null,
      subscription.endpoint,
      subscription.endpoint,
      keysJson
    );
  }

  db.prepare(
    `INSERT INTO pwa_subscriptions (id, user_id, endpoint, keys_json, active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       keys_json = excluded.keys_json,
       active = 1,
       updated_at = datetime('now')`
  ).run(id, userId, subscription.endpoint, keysJson);

  console.log(
    `[web-push] subscription saved userId=${userId} id=${id} endpoint=${subscription.endpoint.slice(0, 64)}…`
  );
  return id;
}
