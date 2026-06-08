export type RemoteTestCommand = "ch1_on" | "ch1_off";

export interface RemoteTestLogEntry {
  at: string;
  action: string;
  detail?: string;
  source?: "web" | "device";
}

/** RP2350 が応答しないと offline とみなす秒数（heartbeat 60 秒 + 余裕） */
export const DEVICE_OFFLINE_THRESHOLD_SEC = 90;

interface RemoteTestState {
  pendingCommand: RemoteTestCommand | null;
  ch1State: "on" | "off";
  lastCommand: RemoteTestCommand | null;
  lastCommandAt: string | null;
  lastPollAt: string | null;
  lastNotifyAt: string | null;
  lastPushSuccessAt: string | null;
  lastPushResult: { success: boolean; error?: string } | null;
  lastAccessIp: string | null;
  firmwareVersion: string | null;
  logs: RemoteTestLogEntry[];
}

const MAX_LOGS = 50;

const state: RemoteTestState = {
  pendingCommand: null,
  ch1State: "off",
  lastCommand: null,
  lastCommandAt: null,
  lastPollAt: null,
  lastNotifyAt: null,
  lastPushSuccessAt: null,
  lastPushResult: null,
  lastAccessIp: null,
  firmwareVersion: null,
  logs: [],
};

function pushLog(action: string, detail?: string, source: RemoteTestLogEntry["source"] = "web"): void {
  state.logs.unshift({ at: new Date().toISOString(), action, detail, source });
  if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
}

export function recordWebAccess(ip: string): void {
  state.lastAccessIp = ip;
}

export function getRemoteTestStatus() {
  return {
    pendingCommand: state.pendingCommand,
    ch1State: state.ch1State,
    lastCommand: state.lastCommand,
    lastCommandAt: state.lastCommandAt,
    lastPollAt: state.lastPollAt,
    lastNotifyAt: state.lastNotifyAt,
    lastPushSuccessAt: state.lastPushSuccessAt,
    lastPushResult: state.lastPushResult,
    lastAccessIp: state.lastAccessIp,
    logs: [...state.logs],
  };
}

export function queueCh1Command(command: RemoteTestCommand): void {
  state.pendingCommand = command;
  state.ch1State = command === "ch1_on" ? "on" : "off";
  state.lastCommand = command;
  state.lastCommandAt = new Date().toISOString();
  pushLog(command, `CH1 → ${state.ch1State.toUpperCase()}`);
}

export function recordDevicePoll(firmwareVersion?: string): void {
  state.lastPollAt = new Date().toISOString();
  if (firmwareVersion) {
    state.firmwareVersion = firmwareVersion;
  }
}

export function getDeviceStatus() {
  const lastSeen = state.lastPollAt;
  let online = false;
  if (lastSeen) {
    const elapsed = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    online = elapsed <= DEVICE_OFFLINE_THRESHOLD_SEC;
  }
  return {
    online,
    offline: !online,
    lastSeen,
    firmwareVersion: state.firmwareVersion,
  };
}

export function recordDeviceHeartbeat(firmwareVersion?: string): void {
  recordDevicePoll(firmwareVersion);
}

export function consumePendingCommand(_firmwareVersion?: string): RemoteTestCommand | null {
  const cmd = state.pendingCommand;
  if (cmd) {
    state.pendingCommand = null;
    pushLog("command_delivered", cmd, "device");
  }
  return cmd;
}

export function markPushResult(success: boolean, error?: string): void {
  state.lastPushResult = { success, error };
  if (success) {
    const at = new Date().toISOString();
    state.lastPushSuccessAt = at;
    state.lastNotifyAt = at;
    pushLog("push_sent", "TiSLY Push 通知成功");
  } else {
    pushLog("push_failed", error ?? "Push 送信失敗");
  }
}

export function resetRemoteTestState(): void {
  state.pendingCommand = null;
  state.ch1State = "off";
  state.lastCommand = null;
  state.lastCommandAt = null;
  state.lastPollAt = null;
  state.lastNotifyAt = null;
  state.lastPushSuccessAt = null;
  state.lastPushResult = null;
  state.lastAccessIp = null;
  state.firmwareVersion = null;
  state.logs = [];
}
