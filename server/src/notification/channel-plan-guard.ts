import type { Response } from "express";
import type { CustomerPlan } from "../customer/types.js";
import { planHasFeature } from "../customer/plan-guard.js";

export type NotificationChannelKind =
  | "email"
  | "web_push"
  | "discord"
  | "webhook"
  | "qnap_archive";

const CHANNEL_BY_PLAN: Record<CustomerPlan, NotificationChannelKind[]> = {
  Lite: [],
  Standard: ["email"],
  PRO: ["email", "web_push", "discord"],
  PRO_REMOTE: ["email", "web_push", "discord", "webhook", "qnap_archive"],
};

export function planAllowsChannel(plan: CustomerPlan, channel: NotificationChannelKind): boolean {
  return CHANNEL_BY_PLAN[plan]?.includes(channel) ?? false;
}

export function requireNotificationChannel(
  plan: CustomerPlan,
  channel: NotificationChannelKind,
  res: Response
): boolean {
  if (planAllowsChannel(plan, channel)) return true;
  res.status(403).json({
    error: "Plan restriction",
    plan,
    channel,
    hint: "Upgrade to PRO or PRO_REMOTE for this notification channel",
  });
  return false;
}

export function listAllowedChannels(plan: CustomerPlan): NotificationChannelKind[] {
  return [...(CHANNEL_BY_PLAN[plan] ?? [])];
}
