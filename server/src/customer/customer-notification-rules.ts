import { v4 as uuid } from "uuid";
import { getDatabase } from "../db/database.js";
import type { CustomerPlan } from "./types.js";
import {
  getPlanChannelLimits,
  validateRuleChannels,
  type CustomerNotificationRule,
} from "../notification/customer-rule-engine.js";

export function listCustomerNotificationRules(customerId: string): CustomerNotificationRule[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM customer_notification_rules WHERE customer_id = ? ORDER BY created_at DESC`
    )
    .all(customerId) as CustomerNotificationRule[];
}

export function createCustomerNotificationRule(input: {
  customerId: string;
  name: string;
  plan: CustomerPlan;
  enabled?: boolean;
  eventTypes?: string[];
  severity?: string;
  channels?: string[];
  timeStart?: string | null;
  timeEnd?: string | null;
  daysOfWeek?: number[];
}): { rule: CustomerNotificationRule } | { error: string; channel?: string } {
  const channels = input.channels ?? ["email"];
  const check = validateRuleChannels(input.plan, channels);
  if (!check.ok) return { error: check.reason, channel: check.channel };

  const id = uuid();
  const now = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO customer_notification_rules (
        id, customer_id, name, enabled, event_types_json, severity, channels_json,
        time_start, time_end, days_of_week_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.customerId,
      input.name,
      input.enabled !== false ? 1 : 0,
      JSON.stringify(input.eventTypes ?? ["*"]),
      input.severity ?? "*",
      JSON.stringify(channels),
      input.timeStart ?? null,
      input.timeEnd ?? null,
      JSON.stringify(input.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]),
      now,
      now
    );
  return { rule: getCustomerNotificationRule(input.customerId, id)! };
}

export function getCustomerNotificationRule(
  customerId: string,
  id: string
): CustomerNotificationRule | null {
  const row = getDatabase()
    .prepare(`SELECT * FROM customer_notification_rules WHERE customer_id = ? AND id = ?`)
    .get(customerId, id) as CustomerNotificationRule | undefined;
  return row ?? null;
}

export function updateCustomerNotificationRule(
  customerId: string,
  id: string,
  plan: CustomerPlan,
  patch: Partial<{
    name: string;
    enabled: boolean;
    eventTypes: string[];
    severity: string;
    channels: string[];
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: number[];
  }>
): { ok: true } | { error: string } {
  const existing = getCustomerNotificationRule(customerId, id);
  if (!existing) return { error: "Rule not found" };
  if (patch.channels) {
    const check = validateRuleChannels(plan, patch.channels);
    if (!check.ok) return { error: check.reason };
  }
  getDatabase()
    .prepare(
      `UPDATE customer_notification_rules SET
        name = COALESCE(?, name),
        enabled = COALESCE(?, enabled),
        event_types_json = COALESCE(?, event_types_json),
        severity = COALESCE(?, severity),
        channels_json = COALESCE(?, channels_json),
        time_start = COALESCE(?, time_start),
        time_end = COALESCE(?, time_end),
        days_of_week_json = COALESCE(?, days_of_week_json),
        updated_at = datetime('now')
       WHERE customer_id = ? AND id = ?`
    )
    .run(
      patch.name ?? null,
      patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : null,
      patch.eventTypes ? JSON.stringify(patch.eventTypes) : null,
      patch.severity ?? null,
      patch.channels ? JSON.stringify(patch.channels) : null,
      patch.timeStart ?? null,
      patch.timeEnd ?? null,
      patch.daysOfWeek ? JSON.stringify(patch.daysOfWeek) : null,
      customerId,
      id
    );
  return { ok: true };
}

export function deleteCustomerNotificationRule(customerId: string, id: string): boolean {
  const r = getDatabase()
    .prepare(`DELETE FROM customer_notification_rules WHERE customer_id = ? AND id = ?`)
    .run(customerId, id);
  return r.changes > 0;
}

export function notificationRulesPortalPayload(plan: CustomerPlan, customerId: string) {
  const limits = getPlanChannelLimits(plan);
  return {
    planLimits: limits,
    rules: listCustomerNotificationRules(customerId).map((r) => ({
      id: r.id,
      name: r.name,
      enabled: Boolean(r.enabled),
      eventTypes: JSON.parse(r.event_types_json),
      severity: r.severity,
      channels: JSON.parse(r.channels_json),
      timeStart: r.time_start,
      timeEnd: r.time_end,
      daysOfWeek: JSON.parse(r.days_of_week_json),
    })),
  };
}
