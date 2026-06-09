const PLAN_FEATURES = {
    Lite: new Set(["pwa"]),
    Standard: new Set(["pwa", "lan_ops", "basic_log"]),
    PRO: new Set([
        "pwa",
        "lan_ops",
        "basic_log",
        "notify",
        "recovery",
        "ai_basic",
    ]),
    PRO_REMOTE: new Set([
        "pwa",
        "lan_ops",
        "basic_log",
        "notify",
        "recovery",
        "ai_basic",
        "customer_portal",
        "tv_dashboard",
        "qnap",
        "ai_full",
        "soc_noc",
        "remote_maintenance",
        "sales_report",
        "external_notify",
    ]),
};
export function planHasFeature(plan, feature) {
    return PLAN_FEATURES[plan]?.has(feature) ?? false;
}
export function requirePlanFeature(plan, feature, res) {
    if (planHasFeature(plan, feature))
        return true;
    res.status(403).json({
        error: "Plan restriction",
        plan,
        feature,
        hint: "Upgrade plan to access this feature",
    });
    return false;
}
export function listPlanFeatures(plan) {
    return [...(PLAN_FEATURES[plan] ?? [])];
}
