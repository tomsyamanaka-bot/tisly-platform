import { isRealUnlockGuarded } from "../services/switchbotService.js";
export function switchBotModeLabel(mode) {
    if (mode === "real")
        return "本番注意";
    if (mode === "dryrun" || mode === "dryRun")
        return "実機前チェック";
    return "初回公開OK";
}
export function buildSwitchBotReleaseGateChecks(source = process.env) {
    const get = (k, fallback = "") => (source[k] ?? fallback).trim();
    const mode = get("SWITCHBOT_MODE", "mock").toLowerCase();
    const checks = [];
    const modeLabel = switchBotModeLabel(mode);
    checks.push({
        id: "switchbot_mode",
        name: "SwitchBot mode",
        status: mode === "real" ? "warn" : "pass",
        message: `${mode} — ${modeLabel}`,
        hint: mode === "mock" ? "初回公開は mock 維持" : undefined,
    });
    if (mode === "real") {
        const token = get("SWITCHBOT_TOKEN");
        const secret = get("SWITCHBOT_SECRET");
        const deviceId = get("SWITCHBOT_LOCK_DEVICE_ID");
        checks.push({
            id: "switchbot_token",
            name: "SWITCHBOT_TOKEN",
            status: token ? "pass" : "fail",
            message: token ? "設定済み" : "SWITCHBOT_MODE=real だが TOKEN 未設定",
        });
        checks.push({
            id: "switchbot_secret",
            name: "SWITCHBOT_SECRET",
            status: secret ? "pass" : "fail",
            message: secret ? "設定済み" : "SWITCHBOT_MODE=real だが SECRET 未設定",
        });
        checks.push({
            id: "switchbot_lock_device_id",
            name: "SWITCHBOT_LOCK_DEVICE_ID",
            status: deviceId ? "pass" : "fail",
            message: deviceId ? "設定済み" : "SWITCHBOT_MODE=real だが LOCK_DEVICE_ID 未設定",
        });
    }
    else {
        checks.push({
            id: "switchbot_credentials",
            name: "SwitchBot credentials",
            status: "pass",
            message: `${mode} モード — token/secret 不要`,
        });
    }
    const autoDisarm = get("SWITCHBOT_AUTO_DISARM_ENABLED", "false") === "true";
    const eventLog = get("SECURITY_EVENT_LOG_ENABLED", "true") === "true";
    checks.push({
        id: "switchbot_auto_disarm_event_log",
        name: "auto disarm + event log",
        status: autoDisarm && !eventLog ? "fail" : "pass",
        message: autoDisarm && !eventLog
            ? "auto disarm 有効だが SECURITY_EVENT_LOG_ENABLED=false"
            : autoDisarm
                ? "auto disarm 有効 — event log OK"
                : "auto disarm 無効（デモ安全）",
    });
    checks.push({
        id: "switchbot_real_unlock_guard",
        name: "real unlock guard",
        status: isRealUnlockGuarded() ? "pass" : "fail",
        message: isRealUnlockGuarded()
            ? "confirmed=true 必須 — real unlock guard 有効"
            : "real unlock が guard なしで動作する危険状態",
    });
    const unknownPolicy = get("SECURITY_UNKNOWN_DEVICE_POLICY", "block_auto_arm");
    checks.push({
        id: "security_unknown_device_policy",
        name: "unknownDevicePolicy",
        status: unknownPolicy ? "pass" : "fail",
        message: unknownPolicy
            ? `設定: ${unknownPolicy}`
            : "unknownDevicePolicy 未設定 — block_auto_arm を推奨",
    });
    const autoArm = get("SWITCHBOT_AUTO_ARM_ENABLED", "false") === "true";
    checks.push({
        id: "switchbot_auto_arm",
        name: "SWITCHBOT_AUTO_ARM_ENABLED",
        status: autoArm ? "warn" : "pass",
        message: autoArm ? "自動警戒ON 有効 — 本番注意" : "自動警戒ON 無効（デモ安全）",
    });
    checks.push({
        id: "switchbot_auto_disarm",
        name: "SWITCHBOT_AUTO_DISARM_ENABLED",
        status: autoDisarm ? "warn" : "pass",
        message: autoDisarm ? "自動警戒OFF 有効 — 本番注意" : "自動警戒OFF 無効（デモ安全）",
    });
    if (get("DEMO_RESET_ENABLED", "false") === "true") {
        checks.push({
            id: "demo_reset_enabled",
            name: "DEMO_RESET_ENABLED",
            status: "fail",
            message: "DEMO_RESET_ENABLED=true — 本番公開前に false へ",
        });
    }
    return checks;
}
export function buildSwitchBotDeploymentChecklist() {
    const get = (k, fallback = "") => (process.env[k] ?? fallback).trim();
    const mode = get("SWITCHBOT_MODE", "mock").toLowerCase();
    const autoArm = get("SWITCHBOT_AUTO_ARM_ENABLED", "false") === "true";
    const autoDisarm = get("SWITCHBOT_AUTO_DISARM_ENABLED", "false") === "true";
    const policy = get("SECURITY_UNKNOWN_DEVICE_POLICY", "block_auto_arm");
    return [
        {
            id: "switchbot_mode",
            label: "SwitchBot mode",
            ok: mode === "mock" || mode === "dryrun",
            detail: `${mode} (${switchBotModeLabel(mode)})`,
        },
        {
            id: "switchbot_token",
            label: "token/secret 設定",
            ok: mode !== "real" || (!!get("SWITCHBOT_TOKEN") && !!get("SWITCHBOT_SECRET")),
            detail: mode === "real" ? "TOKEN + SECRET 必須" : "mock/dryRun では不要",
        },
        {
            id: "switchbot_lock_device_id",
            label: "lock device id",
            ok: mode !== "real" || !!get("SWITCHBOT_LOCK_DEVICE_ID"),
            detail: get("SWITCHBOT_LOCK_DEVICE_ID") || "未設定",
        },
        {
            id: "switchbot_auto_arm",
            label: "auto arm enabled",
            ok: !autoArm,
            detail: autoArm ? "有効 — 本番注意" : "無効（推奨）",
        },
        {
            id: "switchbot_auto_disarm",
            label: "auto disarm enabled",
            ok: !autoDisarm,
            detail: autoDisarm ? "有効 — 本番注意" : "無効（推奨）",
        },
        {
            id: "switchbot_unlock_guard",
            label: "real unlock guard",
            ok: isRealUnlockGuarded(),
            detail: "confirmed=true 必須",
        },
        {
            id: "unknown_device_policy",
            label: "unknown device policy",
            ok: !!policy,
            detail: policy || "未設定",
        },
    ];
}
