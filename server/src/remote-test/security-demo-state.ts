import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getInputConfig, loadSecurityDemoConfig } from "./security-demo-config.js";

export interface InputStateChange {
  input: number;
  from: "on" | "off";
  to: "on" | "off";
}

export type SecurityMode = "ARM" | "DISARM";

export interface SecurityEventEntry {
  id: string;
  timestamp: string;
  type: string;
  device: string;
  input: string;
  state: string;
}

interface PersistedSecurityDemoState {
  securityMode: SecurityMode;
  eventHistory: SecurityEventEntry[];
}

const MAX_EVENT_HISTORY = 100;
const PWA_EVENT_DISPLAY = 20;

let stateFileOverride: string | null = null;

function stateFilePath(): string {
  if (stateFileOverride) return stateFileOverride;
  const envPath = process.env.SECURITY_DEMO_STATE_PATH?.trim();
  if (envPath) return envPath;
  return path.join(process.cwd(), "data", "remote-test-security-demo.json");
}

export function setSecurityDemoStatePathForTests(filePath: string | null): void {
  stateFileOverride = filePath;
}

function loadPersisted(): PersistedSecurityDemoState {
  const file = stateFilePath();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as PersistedSecurityDemoState;
    return {
      securityMode: raw.securityMode === "ARM" ? "ARM" : "DISARM",
      eventHistory: Array.isArray(raw.eventHistory) ? raw.eventHistory : [],
    };
  } catch {
    return { securityMode: "DISARM", eventHistory: [] };
  }
}

function savePersisted(): void {
  const file = stateFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        securityMode: state.securityMode,
        eventHistory: state.eventHistory,
      },
      null,
      2
    ),
    "utf-8"
  );
}

interface SecurityDemoRuntimeState {
  securityMode: SecurityMode;
  eventHistory: SecurityEventEntry[];
  lastArmAt: string | null;
  lastDisarmAt: string | null;
}

const state: SecurityDemoRuntimeState = {
  ...loadPersisted(),
  lastArmAt: null,
  lastDisarmAt: null,
};

function trimEventHistory(): void {
  if (state.eventHistory.length > MAX_EVENT_HISTORY) {
    state.eventHistory.length = MAX_EVENT_HISTORY;
  }
}

function pushEvent(entry: Omit<SecurityEventEntry, "id" | "timestamp">): SecurityEventEntry {
  const full: SecurityEventEntry = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  state.eventHistory.unshift(full);
  trimEventHistory();
  savePersisted();
  return full;
}

export function getSecurityMode(): SecurityMode {
  return state.securityMode;
}

export function isArmed(): boolean {
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

export function setSecurityMode(mode: SecurityMode): { mode: SecurityMode; changed: boolean } {
  if (state.securityMode === mode) return { mode, changed: false };
  state.securityMode = mode;
  const now = new Date().toISOString();
  if (mode === "ARM") {
    state.lastArmAt = now;
  } else {
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

export function recordInputSecurityEvent(change: InputStateChange): SecurityEventEntry {
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

export function resetSecurityDemoState(): void {
  state.securityMode = "DISARM";
  state.eventHistory = [];
  state.lastArmAt = null;
  state.lastDisarmAt = null;
  try {
    const file = stateFilePath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

export function reloadSecurityDemoStateFromDisk(): void {
  const loaded = loadPersisted();
  state.securityMode = loaded.securityMode;
  state.eventHistory = loaded.eventHistory;
}
