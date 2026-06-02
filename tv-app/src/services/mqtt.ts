/**
 * TiSLY TV — WebSocket 経由イベント受信（本番: wss://tisly.jp/ws）
 * 実 MQTT ブローカー直結前は mock モードを利用可能。
 */

import { getTvSettings, getWsUrlFromSettings, loadTvSettings } from "./tvSettings";

export type MqttConnectionState = "disconnected" | "connecting" | "connected" | "mock";

export interface TvAlarmPayload {
  deviceName: string;
  eventType: string;
  severity: string;
  message: string;
  occurredAt: string;
  persistent?: boolean;
}

export type MqttMessageHandler = (msg: {
  type: "heartbeat" | "event" | "alarm" | "connected";
  payload: Record<string, unknown>;
  at: string;
}) => void;

const MOCK_MODE =
  process.env.EXPO_PUBLIC_MQTT_MOCK === "true" ||
  process.env.EXPO_PUBLIC_MQTT_WS === "mock";

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;
let state: MqttConnectionState = "disconnected";
let onStateChange: ((s: MqttConnectionState) => void) | null = null;
let messageHandler: MqttMessageHandler | null = null;
let connectStarted = false;

function setState(s: MqttConnectionState) {
  state = s;
  onStateChange?.(s);
}

export function getMqttConnectionState(): MqttConnectionState {
  return state;
}

export function watchMqttState(cb: (s: MqttConnectionState) => void): () => void {
  onStateChange = cb;
  cb(state);
  return () => {
    if (onStateChange === cb) onStateChange = null;
  };
}

function parseAlarm(payload: Record<string, unknown>, at: string): TvAlarmPayload {
  const deviceId =
    (payload.device_id as string) ??
    (payload.deviceId as string) ??
    (payload.deviceName as string) ??
    "unknown";
  const eventType =
    (payload.event_type as string) ??
    (payload.eventType as string) ??
    "alarm";
  const severity = (payload.severity as string) ?? "alarm";
  const message =
    (payload.message as string) ??
    (payload.title as string) ??
    "警報を受信しました";
  return {
    deviceName: String(deviceId),
    eventType: String(eventType),
    severity: String(severity),
    message: String(message),
    occurredAt: at,
    persistent: severity === "critical",
  };
}

function scheduleReconnect(onMessage: MqttMessageHandler) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectMqtt(onMessage);
  }, 5000);
}

function startMock(dispatch: MqttMessageHandler) {
  setState("mock");
  dispatch({
    type: "connected",
    payload: { message: "Mock mode — set EXPO_PUBLIC_MQTT_MOCK=false for live WS" },
    at: new Date().toISOString(),
  });
  mockTimer = setInterval(() => {
    dispatch({
      type: "heartbeat",
      payload: { device_id: "mock-tv", status: "ok" },
      at: new Date().toISOString(),
    });
  }, 30_000);
}

export async function connectMqtt(onMessage: MqttMessageHandler): Promise<{ disconnect: () => void }> {
  messageHandler = onMessage;
  if (connectStarted && (state === "connected" || state === "mock" || state === "connecting")) {
    return { disconnect: () => {} };
  }
  connectStarted = true;
  await loadTvSettings();
  const settings = getTvSettings();

  const dispatch = (msg: Parameters<MqttMessageHandler>[0]) => messageHandler?.(msg);

  if (MOCK_MODE) {
    startMock(dispatch);
    return { disconnect: disconnectMqtt };
  }

  const wsUrl =
    process.env.EXPO_PUBLIC_MQTT_WS?.startsWith("ws")
      ? process.env.EXPO_PUBLIC_MQTT_WS
      : getWsUrlFromSettings(settings);

  setState("connecting");
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    setState("connected");
    reconnectTimer && clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(String(ev.data)) as {
        type: "heartbeat" | "event" | "alarm" | "connected";
        payload: Record<string, unknown>;
        at: string;
      };
      if (data.type === "alarm") {
        dispatch({
          ...data,
          payload: { ...data.payload, __alarm: parseAlarm(data.payload, data.at) },
        });
      } else {
        dispatch(data);
      }
    } catch {
      /* ignore malformed */
    }
  };

  socket.onclose = () => {
    setState("disconnected");
    scheduleReconnect(dispatch);
  };

  socket.onerror = () => {
    setState("disconnected");
  };

  return { disconnect: disconnectMqtt };
}

export function disconnectMqtt(): void {
  connectStarted = false;
  messageHandler = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (mockTimer) {
    clearInterval(mockTimer);
    mockTimer = null;
  }
  socket?.close();
  socket = null;
  setState("disconnected");
}

export function extractAlarmFromMessage(msg: {
  type: string;
  payload: Record<string, unknown>;
  at: string;
}): TvAlarmPayload | null {
  if (msg.payload.__alarm) return msg.payload.__alarm as TvAlarmPayload;
  if (msg.type !== "alarm") return null;
  return parseAlarm(msg.payload, msg.at);
}

/** @deprecated use connectMqtt */
export const MQTT_CONFIG = {
  wsUrl: process.env.EXPO_PUBLIC_MQTT_WS ?? "wss://tisly.jp/ws",
  topicPrefix: "tisly/#",
};
