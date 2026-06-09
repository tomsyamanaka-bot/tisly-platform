import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getInputConfig, loadSecurityDemoConfig } from "./security-demo-config.js";
const MAX_EVENT_HISTORY = 100;
const PWA_EVENT_DISPLAY = 20;
let stateFileOverride = null;
function stateFilePath() {
    if (stateFileOverride)
        return stateFileOverride;
    const envPath = process.env.SECURITY_DEMO_STATE_PATH?.trim();
    if (envPath)
        return envPath;
    return path.join(process.cwd(), "data", "remote-test-security-demo.json");
}
export function setSecurityDemoStatePathForTests(filePath) {
    stateFileOverride = filePath;
}
function loadPersisted() {
    const file = stateFilePath();
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        return {
            securityMode: raw.securityMode === "ARM" ? "ARM" : "DISARM",
            eventHistory: Array.isArray(raw.eventHistory) ? raw.eventHistory : [],
        };
    }
    catch {
        return { securityMode: "DISARM", eventHistory: [] };
    }
}
function savePersisted() {
    const file = stateFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify({
        securityMode: state.securityMode,
        eventHistory: state.eventHistory,
    }, null, 2), "utf-8");
}
const state = {
    ...loadPersisted(),
    lastArmAt: null,
    lastDisarmAt: null,
};
function trimEventHistory() {
    if (state.eventHistory.length > MAX_EVENT_HISTORY) {
        state.eventHistory.length = MAX_EVENT_HISTORY;
    }
}
function pushEvent(entry) {
    const full = {
        id: uuid(),
        timestamp: new Date().toISOString(),
        ...entry,
    };
    state.eventHistory.unshift(full);
    trimEventHistory();
    savePersisted();
    return full;
}
export function getSecurityMode() {
    return state.securityMode;
}
export function isArmed() {
    return state.securityMode === "ARM";
}
export function getSecurityDemoStatus() {
    const cfg = loadSecurityDemoConfig();
    return {
        securityMode: state.securityMode,
        armed: isArmed(),
        deviceName: cfg.deviceName,
        deviceId: cfg.deviceId,
        lastArmAt: state.lastArmAt,
        lastDisarmAt: state.lastDisarmAt,
        eventHistory: [...state.eventHistory],
        eventHistoryDisplay: state.eventHistory.slice(0, PWA_EVENT_DISPLAY),
    };
}
export function setSecurityMode(mode) {
    if (state.securityMode === mode)
        return { mode, changed: false };
    state.securityMode = mode;
    const now = new Date().toISOString();
    if (mode === "ARM") {
        state.lastArmAt = now;
    }
    else {
        state.lastDisarmAt = now;
    }
    const cfg = loadSecurityDemoConfig();
    pushEvent({
        type: mode === "ARM" ? "arm" : "disarm",
        device: cfg.deviceName,
        input: mode,
        state: mode,
    });
    savePersisted();
    return { mode, changed: true };
}
export function recordInputSecurityEvent(change) {
    const cfg = loadSecurityDemoConfig();
    const inputCfg = getInputConfig(change.input);
    const stateLabel = change.to.toUpperCase();
    return pushEvent({
        type: isArmed() ? inputCfg.eventType : "input",
        device: cfg.deviceName,
        input: `DI${change.input}`,
        state: stateLabel,
    });
}
export function resetSecurityDemoState() {
    state.securityMode = "DISARM";
    state.eventHistory = [];
    state.lastArmAt = null;
    state.lastDisarmAt = null;
    try {
        const file = stateFilePath();
        if (fs.existsSync(file))
            fs.unlinkSync(file);
    }
    catch {
        /* ignore */
    }
}
export function reloadSecurityDemoStateFromDisk() {
    const loaded = loadPersisted();
    state.securityMode = loaded.securityMode;
    state.eventHistory = loaded.eventHistory;
}
