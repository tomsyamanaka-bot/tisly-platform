import { listAllowedChannels, planAllowsChannel, } from "./channel-plan-guard.js";
export function getPlanChannelLimits(plan) {
    const all = [
        "email",
        "web_push",
        "discord",
        "webhook",
        "qnap_archive",
    ];
    const allowed = listAllowedChannels(plan);
    return {
        plan,
        allowed,
        blocked: all.filter((c) => !allowed.includes(c)),
    };
}
export function validateRuleChannels(plan, channels) {
    for (const ch of channels) {
        const kind = ch;
        if (!planAllowsChannel(plan, kind)) {
            return {
                ok: false,
                channel: ch,
                reason: kind === "webhook" || kind === "qnap_archive"
                    ? "PRO_REMOTE plan required for webhook and QNAP archive"
                    : `Channel ${ch} not allowed on ${plan} plan`,
            };
        }
    }
    return { ok: true };
}
export function parseRuleChannels(rule) {
    try {
        return JSON.parse(rule.channels_json);
    }
    catch {
        return [];
    }
}
export function parseRuleEventTypes(rule) {
    try {
        return JSON.parse(rule.event_types_json);
    }
    catch {
        return ["*"];
    }
}
export function parseRuleDays(rule) {
    try {
        return JSON.parse(rule.days_of_week_json);
    }
    catch {
        return [0, 1, 2, 3, 4, 5, 6];
    }
}
/** Returns true if rule would fire for given event (simplified). */
export function ruleMatchesEvent(rule, event) {
    if (!rule.enabled)
        return false;
    const types = parseRuleEventTypes(rule);
    if (!types.includes("*") && !types.includes(event.event_type))
        return false;
    if (rule.severity !== "*" && rule.severity !== event.severity)
        return false;
    const at = event.at ?? new Date();
    const day = at.getDay();
    const days = parseRuleDays(rule);
    if (!days.includes(day))
        return false;
    if (rule.time_start && rule.time_end) {
        const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
        if (hhmm < rule.time_start || hhmm > rule.time_end)
            return false;
    }
    return true;
}
