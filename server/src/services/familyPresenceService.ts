/**
 * Phase 1361–1380 — Family presence automation & child arrival notifications
 */
import {
  createFamilyNotification,
  listChildArrivalNotifications,
  listFamilyNotifications,
  listPresenceUsers,
} from "../lock-provider/lock-provider-store.js";
import { createSecurityEventLogEntry } from "../security-automation/security-automation-store.js";
import { dispatchSecurityEventNotification } from "../security-automation/security-notifications.js";
import type { LockEvent, LockUserRole } from "../providers/lock/types.js";
import { getPresenceSummary } from "./securityPresenceService.js";

export { listPresenceUsers, listFamilyNotifications, listChildArrivalNotifications };

function resolveUserRole(userName: string | null): LockUserRole | "unknown" {
  if (!userName) return "unknown";
  const user = listPresenceUsers().find((u) => u.name === userName);
  if (user) return user.role;
  if (userName === "不明" || userName === "Unknown") return "unknown";
  return "guest";
}

export function processFamilyUnlockEvent(event: LockEvent): void {
  const role = resolveUserRole(event.userName);
  const method =
    event.eventType === "face_unlock"
      ? "SESAME Face"
      : event.eventType === "fingerprint_unlock"
        ? "Fingerprint"
        : event.eventType === "nfc_unlock"
          ? "NFC"
          : event.eventType === "manual_unlock"
            ? "Manual"
            : event.eventType === "unknown"
              ? "Unknown"
              : "Unlock";

  if (role === "child" && event.success) {
    const time = new Date(event.createdAt).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const message = `${time} ${event.userName}帰宅 — ${method} — 警戒OFF`;
    const record = createFamilyNotification({
      kind: "child_arrived_home",
      userName: event.userName ?? "子ども",
      provider: event.provider,
      method,
      message,
    });
    createSecurityEventLogEntry({
      eventType: "child_arrived_home",
      source: "presence",
      message: record.message,
      beforeMode: null,
      afterMode: null,
      metadata: { lockEventId: event.id, kind: "child_arrived_home" },
    });
    void dispatchFamilyNotification("child_arrived_home", record.message);
    return;
  }

  if (role === "guest" && event.success) {
    const message = `ゲスト解錠 — ${event.userName} — ${method}`;
    createFamilyNotification({
      kind: "guest_unlock",
      userName: event.userName ?? "ゲスト",
      provider: event.provider,
      method,
      message,
    });
    void dispatchFamilyNotification("guest_unlock", message);
    return;
  }

  if (role === "unknown" || event.eventType === "unknown" || !event.success) {
    const message = `不明な解錠 — ${method}`;
    createFamilyNotification({
      kind: "unknown_unlock",
      userName: event.userName ?? "不明",
      provider: event.provider,
      method,
      message,
    });
    void dispatchFamilyNotification("unknown_unlock", message);
  }
}

async function dispatchFamilyNotification(
  kind: "child_arrived_home" | "guest_unlock" | "unknown_unlock",
  body: string
): Promise<void> {
  await dispatchSecurityEventNotification(kind, body).catch(() => undefined);
}

export function getFamilyPresenceOverview() {
  const presence = getPresenceSummary();
  const users = listPresenceUsers();
  const notifications = listFamilyNotifications(20);
  const childArrivals = listChildArrivalNotifications(10);
  return {
    presenceUsers: users,
    presenceSummary: presence,
    recentNotifications: notifications,
    childArrivals,
    rules: {
      lockAndAllAway: "施錠 + 全員不在 → 警戒ON",
      unlock: "解錠 → 警戒OFF",
      childUnlock: "child 解錠 → 帰宅通知",
    },
  };
}
