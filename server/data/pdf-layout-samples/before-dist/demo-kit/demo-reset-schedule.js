import { config as appConfig } from "../config.js";
const MODE_META = {
    manual: { cronLabel: "—", description: "手動のみ（営業画面のボタン）", hourJst: -1 },
    morning: { cronLabel: "0 6 * * *", description: "毎朝 6:00（JST）にデモを初期化", hourJst: 6 },
    before_sales: { cronLabel: "0 8 * * 1-5", description: "平日 8:00 営業前リセット", hourJst: 8 },
};
let schedule = {
    mode: "manual",
    enabled: false,
    nextRunAt: null,
    lastRunAt: null,
    description: MODE_META.manual.description,
    cronExpr: appConfig.demoReset.cronExpr,
    envEnabled: appConfig.demoReset.enabled,
    cronActive: false,
};
function computeNextRun(mode) {
    if (mode === "manual" && !appConfig.demoReset.enabled)
        return null;
    const meta = MODE_META[mode];
    if (meta.hourJst < 0)
        return appConfig.demoReset.enabled ? new Date().toISOString() : null;
    const now = new Date();
    const next = new Date(now);
    next.setHours(meta.hourJst, 0, 0, 0);
    if (next <= now)
        next.setDate(next.getDate() + 1);
    if (mode === "before_sales") {
        while (next.getDay() === 0 || next.getDay() === 6) {
            next.setDate(next.getDate() + 1);
        }
    }
    return next.toISOString();
}
export function getDemoResetSchedule() {
    const meta = MODE_META[schedule.mode];
    const cronExpr = schedule.mode === "manual" && appConfig.demoReset.enabled
        ? appConfig.demoReset.cronExpr
        : meta.cronLabel === "—"
            ? appConfig.demoReset.cronExpr
            : meta.cronLabel;
    const cronActive = (schedule.enabled || appConfig.demoReset.enabled) && schedule.mode !== "manual";
    return {
        ...schedule,
        cronLabel: meta.cronLabel,
        cronExpr,
        envEnabled: appConfig.demoReset.enabled,
        cronActive,
    };
}
export function setDemoResetSchedule(input) {
    if (input.mode) {
        schedule.mode = input.mode;
        schedule.description = MODE_META[input.mode].description;
    }
    if (input.enabled !== undefined)
        schedule.enabled = input.enabled;
    schedule.nextRunAt =
        schedule.enabled || appConfig.demoReset.enabled ? computeNextRun(schedule.mode) : null;
    return getDemoResetSchedule();
}
export function markDemoResetScheduleRan() {
    schedule.lastRunAt = new Date().toISOString();
    if ((schedule.enabled || appConfig.demoReset.enabled) && schedule.mode !== "manual") {
        schedule.nextRunAt = computeNextRun(schedule.mode);
    }
}
export function listDemoResetScheduleModes() {
    return ["manual", "morning", "before_sales"];
}
