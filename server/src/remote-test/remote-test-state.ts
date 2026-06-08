export const CHANNEL_COUNT = 8;

export type ChannelState = "on" | "off";

export type RemoteTestCommand =
  | "ch1_on" | "ch1_off"
  | "ch2_on" | "ch2_off"
  | "ch3_on" | "ch3_off"
  | "ch4_on" | "ch4_off"
  | "ch5_on" | "ch5_off"
  | "ch6_on" | "ch6_off"
  | "ch7_on" | "ch7_off"
  | "ch8_on" | "ch8_off";

export type ChStates = Record<string, ChannelState>;

export interface RemoteTestLogEntry {
  at: string;
  action: string;
  detail?: string;
  source?: "web" | "device";
}

/** RP2350 が応答しないと offline とみなす秒数（heartbeat 60 秒 + 余裕） */
export const DEVICE_OFFLINE_THRESHOLD_SEC = 90;

function createDefaultChStates(): ChStates {
  const states: ChStates = {};
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    states[String(ch)] = "off";
  }
  return states;
}

interface RemoteTestState {
  pendingCommand: RemoteTestCommand | null;
  chStates: ChStates;
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
  chStates: createDefaultChStates(),
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

export function isValidChannel(channel: number): boolean {
  return Number.isInteger(channel) && channel >= 1 && channel <= CHANNEL_COUNT;
}

export function buildChCommand(channel: number, on: boolean): RemoteTestCommand {
  if (!isValidChannel(channel)) {
    throw new Error(`Invalid channel: ${channel}`);
  }
  return `ch${channel}_${on ? "on" : "off"}` as RemoteTestCommand;
}

function getChState(channel: number): ChannelState {
  return state.chStates[String(channel)] ?? "off";
}

export function recordWebAccess(ip: string): void {
  state.lastAccessIp = ip;
}

export function getRemoteTestStatus() {
  return {
    pendingCommand: state.pendingCommand,
    chStates: { ...state.chStates },
    ch1State: getChState(1),
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

export function queueChCommand(channel: number, on: boolean): void {
  const command = buildChCommand(channel, on);
  state.pendingCommand = command;
  state.chStates[String(channel)] = on ? "on" : "off";
  state.lastCommand = command;
  state.lastCommandAt = new Date().toISOString();
  pushLog(command, `CH${channel} → ${state.chStates[String(channel)].toUpperCase()}`);
}

/** @deprecated Use queueChCommand(1, on) */
export function queueCh1Command(command: "ch1_on" | "ch1_off"): void {
  queueChCommand(1, command === "ch1_on");
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
    chStates: { ...state.chStates },
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
  state.chStates = createDefaultChStates();
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
