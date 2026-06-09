import type { CustomerPlan } from "./types.js";
import { type CustomerNotificationRule } from "../notification/customer-rule-engine.js";
export declare function listCustomerNotificationRules(customerId: string): CustomerNotificationRule[];
export declare function createCustomerNotificationRule(input: {
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
}): {
    rule: CustomerNotificationRule;
} | {
    error: string;
    channel?: string;
};
export declare function getCustomerNotificationRule(customerId: string, id: string): CustomerNotificationRule | null;
export declare function updateCustomerNotificationRule(customerId: string, id: string, plan: CustomerPlan, patch: Partial<{
    name: string;
    enabled: boolean;
    eventTypes: string[];
    severity: string;
    channels: string[];
    timeStart: string | null;
    timeEnd: string | null;
    daysOfWeek: number[];
}>): {
    ok: true;
} | {
    error: string;
};
export declare function deleteCustomerNotificationRule(customerId: string, id: string): boolean;
export declare function notificationRulesPortalPayload(plan: CustomerPlan, customerId: string): {
    planLimits: {
        allowed: import("../notification/channel-plan-guard.js").NotificationChannelKind[];
        blocked: import("../notification/channel-plan-guard.js").NotificationChannelKind[];
        plan: CustomerPlan;
    };
    rules: {
        id: string;
        name: string;
        enabled: boolean;
        eventTypes: any;
        severity: string;
        channels: any;
        timeStart: string | null;
        timeEnd: string | null;
        daysOfWeek: any;
    }[];
};
