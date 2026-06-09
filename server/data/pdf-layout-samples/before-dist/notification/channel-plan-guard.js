const CHANNEL_BY_PLAN = {
    Lite: [],
    Standard: ["email"],
    PRO: ["email", "web_push", "discord"],
    PRO_REMOTE: ["email", "web_push", "discord", "webhook", "qnap_archive"],
};
export function planAllowsChannel(plan, channel) {
    return CHANNEL_BY_PLAN[plan]?.includes(channel) ?? false;
}
export function requireNotificationChannel(plan, channel, res) {
    if (planAllowsChannel(plan, channel))
        return true;
    res.status(403).json({
        error: "Plan restriction",
        plan,
        channel,
        hint: "Upgrade to PRO or PRO_REMOTE for this notification channel",
    });
    return false;
}
export function listAllowedChannels(plan) {
    return [...(CHANNEL_BY_PLAN[plan] ?? [])];
}
