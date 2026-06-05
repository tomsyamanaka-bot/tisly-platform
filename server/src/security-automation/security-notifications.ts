/**
 * Phase 1321–1360 — Security automation notification candidates & dispatch
 */
import { listSecurityEventLogs } from "../security-automation/security-automation-store.js";
import { getSecurityState } from "../services/securityAutomationService.js";
import { getSwitchBotMode } from "../services/switchbotService.js";
import { sendDiscord } from "../notification/channels/discord.js";
import { sendWebPush } from "../notification/channels/web-push.js";
import { sendEmail } from "../notification/channels/email.js";
import type { NotificationPayload } from "../notification/types.js";

export type SecurityNotificationKind =
  | "security_armed"
  | "security_disarmed"
  | "auto_arm_failed"
  | "auto_arm_skipped"
  | "auto_disarm_skipped"
  | "switchbot_status_failed"
  | "switchbot_locked"
  | "switchbot_unlocked"
  | "unknown_device_blocked"
  | "real_command_rejected"
  | "switchbot_api_error"
  | "switchbot_token_error";

export interface SecurityNotificationCandidate {
  id: string;
  kind: SecurityNotificationKind;
  title: string;
  body: string;
  href: string;
}

const KIND_META: Record<
  SecurityNotificationKind,
  { title: string; href: string }
> = {
  security_armed: { title: "警戒ON", href: "/security" },
  security_disarmed: { title: "警戒OFF", href: "/security" },
  auto_arm_failed: { title: "自動警戒ON失敗", href: "/security/settings/automation" },
  auto_arm_skipped: { title: "自動警戒ONスキップ", href: "/operations#security" },
  auto_disarm_skipped: { title: "自動警戒OFFスキップ", href: "/operations#security" },
  switchbot_status_failed: { title: "SwitchBot状態取得失敗", href: "/security/settings/automation" },
  switchbot_locked: { title: "SwitchBot 施錠", href: "/operations#security" },
  switchbot_unlocked: { title: "SwitchBot 解錠", href: "/operations#security" },
  unknown_device_blocked: { title: "unknown端末で自動警戒ブロック", href: "/security/settings/automation" },
  real_command_rejected: { title: "real実行拒否（confirmed未設定）", href: "/operations#security" },
  switchbot_api_error: { title: "SwitchBot APIエラー", href: "/operations#security" },
  switchbot_token_error: { title: "SwitchBot認証エラー", href: "/operations#security" },
};

const dispatchedIds = new Set<string>();

function buildPayload(kind: SecurityNotificationKind, body: string): NotificationPayload {
  const meta = KIND_META[kind];
  return {
    title: meta.title,
    body,
    eventType: `security_${kind}`,
    url: meta.href,
    data: { securityKind: kind },
  };
}

/** WebPush / Discord / mail mock に配信（失敗は握りつぶし） */
export async function dispatchSecurityEventNotification(
  kind: SecurityNotificationKind,
  body: string
): Promise<void> {
  const dedupeKey = `${kind}:${body.slice(0, 80)}`;
  if (dispatchedIds.has(dedupeKey)) return;
  dispatchedIds.add(dedupeKey);
  if (dispatchedIds.size > 200) {
    const first = dispatchedIds.values().next().value;
    if (first) dispatchedIds.delete(first);
  }

  const payload = buildPayload(kind, body);
  await Promise.allSettled([
    sendWebPush(payload),
    sendDiscord(payload),
    sendEmail(payload),
  ]);
}

export function resetSecurityNotificationDispatchForTests(): void {
  dispatchedIds.clear();
}

export function collectSecurityNotificationCandidates(): SecurityNotificationCandidate[] {
  const candidates: SecurityNotificationCandidate[] = [];
  const state = getSecurityState();
  const recent = listSecurityEventLogs(20);

  const eventKindMap: Record<string, SecurityNotificationKind> = {
    switchbot_locked: "switchbot_locked",
    switchbot_unlocked: "switchbot_unlocked",
    auto_arm_skipped: "auto_arm_skipped",
    auto_disarm_skipped: "auto_disarm_skipped",
    auto_arm_blocked: "auto_arm_failed",
    unknown_device_blocked: "unknown_device_blocked",
    real_command_rejected: "real_command_rejected",
    switchbot_status_failed: "switchbot_status_failed",
    auto_armed: "security_armed",
    auto_disarmed: "security_disarmed",
  };

  for (const log of recent) {
    const kind = eventKindMap[log.eventType];
    if (!kind) continue;
    const meta = KIND_META[kind];
    candidates.push({
      id: `${kind}-${log.id}`,
      kind,
      title: meta.title,
      body: log.message,
      href: meta.href,
    });
  }

  if (state.mode === "armed") {
    const lastArmed = recent.find((e) => e.eventType === "auto_armed" || e.afterMode === "armed");
    if (lastArmed && !candidates.some((c) => c.kind === "security_armed")) {
      candidates.push({
        id: "security_armed",
        kind: "security_armed",
        title: "警戒ON",
        body: lastArmed.message,
        href: "/security",
      });
    }
  }

  if (state.mode === "disarmed") {
    const lastDisarmed = recent.find(
      (e) => e.eventType === "auto_disarmed" || (e.afterMode === "disarmed" && e.source === "switchbot")
    );
    if (lastDisarmed && !candidates.some((c) => c.kind === "security_disarmed")) {
      candidates.push({
        id: "security_disarmed",
        kind: "security_disarmed",
        title: "警戒OFF",
        body: lastDisarmed.message,
        href: "/security",
      });
    }
  }

  if (getSwitchBotMode() === "real") {
    const tokenErr = recent.find((e) =>
      e.message.includes("TOKEN") || e.message.includes("SECRET")
    );
    if (tokenErr) {
      candidates.push({
        id: "switchbot_token_error",
        kind: "switchbot_token_error",
        title: "SwitchBot認証エラー",
        body: tokenErr.message,
        href: "/operations#security",
      });
    }
    const statusFail = recent.find((e) => e.eventType === "switchbot_status_failed");
    if (statusFail) {
      candidates.push({
        id: "switchbot_status_failed",
        kind: "switchbot_status_failed",
        title: "SwitchBot状態取得失敗",
        body: statusFail.message,
        href: "/security/settings/automation",
      });
    }
  }

  return candidates;
}
