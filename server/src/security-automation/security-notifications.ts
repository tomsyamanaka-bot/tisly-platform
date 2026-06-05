/**
 * Phase 1321–1340 — Security automation notification candidates
 */
import { listSecurityEventLogs } from "../security-automation/security-automation-store.js";
import { getSecurityState } from "../services/securityAutomationService.js";
import { getSwitchBotMode } from "../services/switchbotService.js";

export interface SecurityNotificationCandidate {
  id: string;
  kind:
    | "security_armed"
    | "security_disarmed"
    | "auto_arm_failed"
    | "switchbot_status_failed";
  title: string;
  body: string;
  href: string;
}

export function collectSecurityNotificationCandidates(): SecurityNotificationCandidate[] {
  const candidates: SecurityNotificationCandidate[] = [];
  const state = getSecurityState();
  const recent = listSecurityEventLogs(10);

  const lastArmed = recent.find((e) => e.eventType === "auto_armed" || e.afterMode === "armed");
  if (state.mode === "armed" && lastArmed) {
    candidates.push({
      id: "security_armed",
      kind: "security_armed",
      title: "警戒ON",
      body: lastArmed.message,
      href: "/security",
    });
  }

  const lastDisarmed = recent.find(
    (e) => e.eventType === "auto_disarmed" || (e.afterMode === "disarmed" && e.source === "switchbot")
  );
  if (state.mode === "disarmed" && lastDisarmed) {
    candidates.push({
      id: "security_disarmed",
      kind: "security_disarmed",
      title: "警戒OFF",
      body: lastDisarmed.message,
      href: "/security",
    });
  }

  const armBlocked = recent.find((e) => e.eventType === "auto_arm_blocked");
  if (armBlocked) {
    candidates.push({
      id: "auto_arm_failed",
      kind: "auto_arm_failed",
      title: "自動警戒ON失敗",
      body: armBlocked.message,
      href: "/security/settings/automation",
    });
  }

  if (getSwitchBotMode() === "real") {
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
