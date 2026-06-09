/**
 * Phase945 — node-cron デモリセット本番化
 */
import cron from "node-cron";
import { config } from "../config.js";
import { resetDemoKit } from "./demo-reset.js";
import { getDemoResetSchedule, markDemoResetScheduleRan, setDemoResetSchedule, } from "./demo-reset-schedule.js";
let cronTask = null;
function resolveCronExpr() {
    const sched = getDemoResetSchedule();
    if (sched.mode === "morning")
        return config.demoReset.cronExpr || "0 6 * * *";
    if (sched.mode === "before_sales")
        return "0 8 * * 1-5";
    return config.demoReset.cronExpr || "0 6 * * *";
}
export function startDemoResetCron() {
    stopDemoResetCron();
    if (process.env.NODE_ENV === "test")
        return;
    const sched = getDemoResetSchedule();
    const envEnabled = config.demoReset.enabled;
    if (!envEnabled && !sched.enabled) {
        console.log("[DemoReset] cron disabled (DEMO_RESET_ENABLED=false)");
        return;
    }
    if (sched.mode === "manual" && !envEnabled) {
        return;
    }
    const expr = envEnabled ? config.demoReset.cronExpr : resolveCronExpr();
    if (!cron.validate(expr)) {
        console.error(`[DemoReset] invalid cron: ${expr}`);
        return;
    }
    cronTask = cron.schedule(expr, () => {
        const current = getDemoResetSchedule();
        if (!config.demoReset.enabled && !current.enabled)
            return;
        if (current.mode === "manual" && !config.demoReset.enabled)
            return;
        console.log(`[DemoReset] scheduled reset (${expr})`);
        try {
            resetDemoKit();
            markDemoResetScheduleRan();
        }
        catch (e) {
            console.error("[DemoReset] reset failed", e);
        }
    }, { timezone: config.demoReset.timezone });
    console.log(`[DemoReset] cron started: ${expr} (${config.demoReset.timezone})`);
}
export function stopDemoResetCron() {
    if (cronTask) {
        cronTask.stop();
        cronTask = null;
    }
}
export function refreshDemoResetCron() {
    startDemoResetCron();
}
/** env から初回スケジュールを同期 */
export function syncDemoResetFromEnv() {
    if (config.demoReset.enabled) {
        setDemoResetSchedule({ enabled: true, mode: "morning" });
    }
}
