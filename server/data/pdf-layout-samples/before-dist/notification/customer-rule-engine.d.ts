import type { CustomerPlan } from "../customer/types.js";
import { type NotificationChannelKind } from "./channel-plan-guard.js";
export interface CustomerNotificationRule {
    id: string;
    customer_id: string;
    name: string;
    enabled: boolean;
    event_types_json: string;
    severity: string;
    channels_json: string;
    time_start: string | null;
    time_end: string | null;
    days_of_week_json: string;
    created_at: string;
    updated_at: string;
}
export declare function getPlanChannelLimits(plan: CustomerPlan): {
    allowed: NotificationChannelKind[];
    blocked: NotificationChannelKind[];
    plan: CustomerPlan;
};
export declare function validateRuleChannels(plan: CustomerPlan, channels: string[]): {
    ok: true;
} | {
    ok: false;
    channel: string;
    reason: string;
};
export declare function parseRuleChannels(rule: CustomerNotificationRule): string[];
export declare function parseRuleEventTypes(rule: CustomerNotificationRule): string[];
export declare function parseRuleDays(rule: CustomerNotificationRule): number[];
/** Returns true if rule would fire for given event (simplified). */
export declare function ruleMatchesEvent(rule: CustomerNotificationRule, event: {
    event_type: string;
    severity: string;
    at?: Date;
}): boolean;
