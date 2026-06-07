export type RemoteTestCommand = "ch1_on" | "ch1_off";

export interface RemoteTestLogEntry {
  at: string;
  action: string;
  detail?: string;
  source?: "web" | "device";
}

interface RemoteTestState {
  pendingCommand: RemoteTestCommand | null;
  ch1State: "on" | "off";
  lastCommand: RemoteTestCommand | null;
  lastCommandAt: string | null;
  lastPollAt: string | null;
  lastNotifyAt: string | null;
  lastAccessIp: string | null;
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
  lastAccessIp: null,
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

export function consumePendingCommand(): RemoteTestCommand | null {
  state.lastPollAt = new Date().toISOString();
  const cmd = state.pendingCommand;
  if (cmd) {
    state.pendingCommand = null;
    pushLog("command_delivered", cmd, "device");
  }
  return cmd;
}

export function markNotifySent(): void {
  state.lastNotifyAt = new Date().toISOString();
  pushLog("notify_sent", "TiSLY 通知テスト成功");
}

export function resetRemoteTestState(): void {
  state.pendingCommand = null;
  state.ch1State = "off";
  state.lastCommand = null;
  state.lastCommandAt = null;
  state.lastPollAt = null;
  state.lastNotifyAt = null;
  state.lastAccessIp = null;
  state.logs = [];
}
