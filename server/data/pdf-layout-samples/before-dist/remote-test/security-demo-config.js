import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const DEFAULT_INPUT = {
    label: "予備",
    eventType: "spare",
    notifyTitleOn: "センサー反応",
    notifyBodyOn: "予備入力",
    notifyTitleOff: "センサー復帰",
    notifyBodyOff: "予備入力",
};
const DEFAULT_CONFIG = {
    deviceId: "rp2350-remote-test-01",
    deviceName: "TiSLY Lite Demo",
    inputs: {},
    armNotify: { title: "警戒ON", body: "システムが警戒モードになりました" },
    disarmNotify: { title: "警戒OFF", body: "システムが解除モードになりました" },
};
function configPath() {
    const envPath = process.env.SECURITY_DEMO_CONFIG_PATH?.trim();
    if (envPath)
        return envPath;
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, "..", "..", "config", "security-demo.json");
}
let cached = null;
export function loadSecurityDemoConfig() {
    if (cached)
        return cached;
    const file = configPath();
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        cached = { ...DEFAULT_CONFIG, ...raw, inputs: raw.inputs ?? {} };
        return cached;
    }
    catch {
        cached = { ...DEFAULT_CONFIG };
        return cached;
    }
}
export function resetSecurityDemoConfigCache() {
    cached = null;
}
export function getInputConfig(di) {
    const cfg = loadSecurityDemoConfig();
    return cfg.inputs[String(di)] ?? { ...DEFAULT_INPUT, label: `DI${di}` };
}
export function buildInputNotifyPayload(di, to) {
    const inputCfg = getInputConfig(di);
    const demoCfg = loadSecurityDemoConfig();
    const title = to === "on" ? inputCfg.notifyTitleOn : inputCfg.notifyTitleOff;
    const body = to === "on" ? inputCfg.notifyBodyOn : inputCfg.notifyBodyOff;
    return {
        title,
        body,
        eventType: inputCfg.eventType,
        deviceId: demoCfg.deviceId,
        url: "/remote-test",
        data: {
            kind: "security",
            input: di,
            from: to === "on" ? "off" : "on",
            to,
            eventType: inputCfg.eventType,
            label: inputCfg.label,
        },
    };
}
