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

export interface ChStateChange {
  channel: number;
  from: ChannelState;
  to: ChannelState;
}

export interface RemoteTestNotificationEntry {
  id: string;
  /** @deprecated use timestamp */
  at: string;
  timestamp: string;
  channel: number;
  from: ChannelState;
  to: ChannelState;
  title: string;
  body: string;
  pushSuccess: boolean;
  pushError?: string;
}

export interface HeartbeatDebugSnapshot {
  heartbeatMethod: string | null;
  heartbeatBody: unknown;
  lastHeartbeatAt: string | null;
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

function normalizeChannelValue(val: unknown): ChannelState | null {
  if (val === "on" || val === "off") return val;
  if (val === true || val === 1 || val === "1" || val === "ON") return "on";
  if (val === false || val === 0 || val === "0" || val === "OFF") return "off";
  return null;
}

export function normalizeDeviceChStates(input: unknown): ChStates | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const states = createDefaultChStates();
  let recognized = 0;
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const key = String(ch);
    const val = normalizeChannelValue(obj[key]);
    if (val) {
      states[key] = val;
      recognized++;
    }
  }
  return recognized > 0 ? states : null;
}

interface RemoteTestState {
  pendingCommand: RemoteTestCommand | null;
  /** heartbeat で確定した実機 chStates（PWA 楽観更新は含まない） */
  confirmedChStates: ChStates;
  /** 前回 heartbeat 時の confirmedChStates（差分検出用） */
  lastDeviceChStates: ChStates;
  deviceChStatesBaselined: boolean;
  lastCommand: RemoteTestCommand | null;
  lastCommandAt: string | null;
  lastPollAt: string | null;
  lastNotifyAt: string | null;
  lastPushSuccessAt: string | null;
  lastPushResult: { success: boolean; error?: string } | null;
  lastAccessIp: string | null;
  firmwareVersion: string | null;
  logs: RemoteTestLogEntry[];
  notificationHistory: RemoteTestNotificationEntry[];
}

const MAX_LOGS = 50;
const MAX_NOTIFICATION_HISTORY = 50;

const state: RemoteTestState = {
  pendingCommand: null,
  confirmedChStates: createDefaultChStates(),
  lastDeviceChStates: createDefaultChStates(),
  deviceChStatesBaselined: false,
  lastCommand: null,
  lastCommandAt: null,
  lastPollAt: null,
  lastNotifyAt: null,
  lastPushSuccessAt: null,
  lastPushResult: null,
  lastAccessIp: null,
  firmwareVersion: null,
  logs: [],
  notificationHistory: [],
};

let heartbeatDebug: HeartbeatDebugSnapshot = {
  heartbeatMethod: null,
  heartbeatBody: null,
  lastHeartbeatAt: null,
};

export function recordHeartbeatDebug(method: string, body: unknown): void {
  heartbeatDebug = {
    heartbeatMethod: method,
    heartbeatBody: body,
    lastHeartbeatAt: new Date().toISOString(),
  };
}

export function getHeartbeatDebugSnapshot(): HeartbeatDebugSnapshot {
  return { ...heartbeatDebug };
}

export function getRemoteTestDebugInfo() {
  return {
    heartbeatMethod: heartbeatDebug.heartbeatMethod,
    heartbeatBody: heartbeatDebug.heartbeatBody,
    lastHeartbeatAt: heartbeatDebug.lastHeartbeatAt,
    confirmedChStates: { ...state.confirmedChStates },
    notificationHistory: [...state.notificationHistory],
    lastPushResult: state.lastPushResult,
  };
}

export function detectChStateChanges(prev: ChStates, next: ChStates): ChStateChange[] {
  const changes: ChStateChange[] = [];
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const key = String(ch);
    const from = prev[key] ?? "off";
    const to = next[key] ?? "off";
    if (from !== to) {
      changes.push({ channel: ch, from, to });
    }
  }
  return changes;
}

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
  return state.confirmedChStates[String(channel)] ?? "off";
}

export function recordWebAccess(ip: string): void {
  state.lastAccessIp = ip;
}

export function getRemoteTestStatus() {
  return {
    pendingCommand: state.pendingCommand,
    chStates: { ...state.confirmedChStates },
    ch1State: getChState(1),
    lastCommand: state.lastCommand,
    lastCommandAt: state.lastCommandAt,
    lastPollAt: state.lastPollAt,
    lastNotifyAt: state.lastNotifyAt,
    lastPushSuccessAt: state.lastPushSuccessAt,
    lastPushResult: state.lastPushResult,
    lastAccessIp: state.lastAccessIp,
    logs: [...state.logs],
    notificationHistory: [...state.notificationHistory],
  };
}

export function queueChCommand(channel: number, on: boolean): void {
  const command = buildChCommand(channel, on);
  state.pendingCommand = command;
  // confirmedChStates は heartbeat でのみ更新する（PWA 楽観更新しない）
  state.lastCommand = command;
  state.lastCommandAt = new Date().toISOString();
  pushLog(command, `CH${channel} → ${on ? "ON" : "OFF"} (pending)`);
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
    chStates: { ...state.confirmedChStates },
  };
}

export function recordDeviceHeartbeat(firmwareVersion?: string, chStates?: ChStates): ChStateChange[] {
  recordDevicePoll(firmwareVersion);
  if (!chStates) {
    console.log("[remote-test] heartbeat: chStates missing — skip diff (lastPollAt only)");
    return [];
  }

  // 比較は confirmedChStates 上書き前に行う（prev = 前回確定状態）
  const prev = { ...state.confirmedChStates };
  for (let ch = 1; ch <= CHANNEL_COUNT; ch++) {
    const key = String(ch);
    const prevState = prev[key] ?? "off";
    const currentState = chStates[key] ?? "off";
    console.log(`[remote-test] heartbeat CH${ch} prev=${prevState} current=${currentState}`);
  }

  if (!state.deviceChStatesBaselined) {
    state.deviceChStatesBaselined = true;
    state.confirmedChStates = { ...chStates };
    state.lastDeviceChStates = { ...chStates };
    console.log("[remote-test] heartbeat: baseline established — notification skipped");
    return [];
  }

  const changes = detectChStateChanges(prev, chStates);
  if (changes.length > 0) {
    for (const change of changes) {
      console.log(
        `[remote-test] notification condition MET CH${change.channel} prev=${change.from} current=${change.to}`
      );
    }
  } else {
    console.log("[remote-test] notification condition not met (no state changes)");
  }

  state.confirmedChStates = { ...chStates };
  state.lastDeviceChStates = { ...chStates };

  return changes;
}

export function recordChStateNotification(
  change: ChStateChange,
  payload: { title: string; body: string },
  result: { success: boolean; error?: string },
  logId: string
): void {
  const label = `CH${change.channel} ${change.to.toUpperCase()}`;
  const timestamp = new Date().toISOString();
  console.log(
    `[remote-test] notificationHistory add CH${change.channel} from=${change.from} to=${change.to} pushSuccess=${result.success}`,
    result.error ? { error: result.error } : ""
  );
  pushLog(
    "ch_state_change",
    `${label} (${change.from}→${change.to})${result.success ? "" : ` — ${result.error ?? "failed"}`}`,
    "device"
  );
  state.notificationHistory.unshift({
    id: logId,
    at: timestamp,
    timestamp,
    channel: change.channel,
    from: change.from,
    to: change.to,
    title: payload.title,
    body: payload.body,
    pushSuccess: result.success,
    pushError: result.error,
  });
  if (state.notificationHistory.length > MAX_NOTIFICATION_HISTORY) {
    state.notificationHistory.length = MAX_NOTIFICATION_HISTORY;
  }
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
  heartbeatDebug = {
    heartbeatMethod: null,
    heartbeatBody: null,
    lastHeartbeatAt: null,
  };
  state.pendingCommand = null;
  state.confirmedChStates = createDefaultChStates();
  state.lastDeviceChStates = createDefaultChStates();
  state.deviceChStatesBaselined = false;
  state.lastCommand = null;
  state.lastCommandAt = null;
  state.lastPollAt = null;
  state.lastNotifyAt = null;
  state.lastPushSuccessAt = null;
  state.lastPushResult = null;
  state.lastAccessIp = null;
  state.firmwareVersion = null;
  state.logs = [];
  state.notificationHistory = [];
}
