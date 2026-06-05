import type { WebSocket } from "ws";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { pushProjectTimelineLive } from "../toms/live-push-bridge.js";
import { getProRemoteState, recordProRemoteState } from "../toms/pro-remote-state.js";

export type WsMessageType = "heartbeat" | "event" | "alarm" | "connected" | "camera_focus" | "security_focus";

export type ProRemoteWsAction =
  | "floor_nav"
  | "pin_select"
  | "ack"
  | "close"
  | "escalate";

export interface WsOutboundMessage {
  type: WsMessageType;
  topic?: string;
  payload: Record<string, unknown>;
  at: string;
}

interface WsClientState {
  socket: WebSocket;
  projectIds: Set<string>;
  /** sales | tv:CODE */
  channels: Set<string>;
}

const clients = new Map<WebSocket, WsClientState>();

export function registerWsClient(socket: WebSocket): void {
  clients.set(socket, { socket, projectIds: new Set(), channels: new Set() });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  sendToClient(socket, {
    type: "connected",
    payload: { message: "TiSLY WebSocket ready", subscribeHint: "send {type:'subscribe', projectId}" },
    at: new Date().toISOString(),
  });
}

export function handleWsClientMessage(socket: WebSocket, raw: string): void {
  let msg: {
    type?: string;
    projectId?: string;
    channel?: string;
    customerCode?: string;
    ping?: boolean;
    action?: ProRemoteWsAction;
    tier?: string;
    pinId?: string;
    notificationId?: string;
    actor?: string;
  };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return;
  }
  const state = clients.get(socket);
  if (!state) return;
  if (msg.type === "subscribe" && msg.projectId) {
    const projectId = String(msg.projectId);
    state.projectIds.add(projectId);
    sendToClient(socket, {
      type: "event",
      payload: { subscribed: projectId },
      at: new Date().toISOString(),
    });
    replayProRemoteState(socket, projectId);
  }
  if (msg.type === "unsubscribe" && msg.projectId) {
    state.projectIds.delete(String(msg.projectId));
  }
  if (msg.type === "subscribe" && msg.channel === "sales") {
    state.channels.add("sales");
    sendToClient(socket, {
      type: "event",
      payload: { subscribed: "sales", channel: "sales" },
      at: new Date().toISOString(),
    });
  }
  if (msg.type === "subscribe" && msg.channel === "tv" && msg.customerCode) {
    const code = String(msg.customerCode).toUpperCase();
    state.channels.add(`tv:${code}`);
    sendToClient(socket, {
      type: "event",
      payload: { subscribed: `tv:${code}`, channel: "tv_mirror", customerCode: code },
      at: new Date().toISOString(),
    });
  }
  if (msg.type === "unsubscribe" && msg.channel === "sales") {
    state.channels.delete("sales");
  }
  if (msg.type === "unsubscribe" && msg.channel === "tv" && msg.customerCode) {
    state.channels.delete(`tv:${String(msg.customerCode).toUpperCase()}`);
  }
  if (msg.ping || msg.type === "ping") {
    sendToClient(socket, {
      type: "heartbeat",
      payload: { pong: true },
      at: new Date().toISOString(),
    });
  }
  if (msg.type === "pro_remote" && msg.projectId && msg.action) {
    handleProRemoteInbound(msg.projectId, msg.action, msg, msg.actor ?? "remote");
  }
}

function handleProRemoteInbound(
  projectId: string,
  action: ProRemoteWsAction,
  msg: Record<string, unknown>,
  actor: string
): void {
  const titles: Record<ProRemoteWsAction, string> = {
    floor_nav: "PRO Remote フロア操作",
    pin_select: "PRO Remote ピン選択",
    ack: "PRO Remote 確認",
    close: "PRO Remote クローズ",
    escalate: "PRO Remote エスカレーション",
  };
  const entry = appendProjectTimeline({
    projectId,
    eventType: "pro_operations",
    title: titles[action],
    detail: JSON.stringify({
      tier: msg.tier,
      pinId: msg.pinId,
      notificationId: msg.notificationId,
    }),
    actor,
    metadata: { action, ...msg },
  });
  pushProjectTimelineLive(projectId, entry);

  recordProRemoteState({
    projectId,
    action,
    tier: msg.tier as string | undefined,
    pinId: msg.pinId as string | undefined,
    notificationId: msg.notificationId as string | undefined,
    actor,
  });

  broadcast({
    type: action === "escalate" ? "alarm" : "event",
    topic: `toms/project/${projectId}/pro_mirror`,
    payload: {
      projectId,
      channel: "pro_mirror",
      action,
      tier: msg.tier,
      pinId: msg.pinId,
      notificationId: msg.notificationId,
      actor,
    },
    at: new Date().toISOString(),
  });
}

function replayProRemoteState(socket: WebSocket, projectId: string): void {
  const snap = getProRemoteState(projectId);
  if (!snap) return;
  sendToClient(socket, {
    type: "event",
    topic: `toms/project/${projectId}/pro_mirror`,
    payload: {
      projectId,
      channel: "pro_mirror",
      action: snap.lastAction,
      tier: snap.tier,
      pinId: snap.pinId,
      notificationId: snap.notificationId,
      actor: snap.actor,
      replay: true,
    },
    at: snap.at,
  });
}

function sendToClient(socket: WebSocket, message: WsOutboundMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

function shouldReceive(state: WsClientState, message: WsOutboundMessage): boolean {
  const topic = message.topic ?? "";
  if (topic.startsWith("sales/demo/tv/")) {
    const code = topic.split("/").pop()?.toUpperCase();
    if (state.channels.size === 0 && state.projectIds.size === 0) return true;
    return state.channels.has(`tv:${code}`);
  }
  if (topic === "sales/demo" || message.payload?.channel === "sales") {
    if (state.channels.size === 0 && state.projectIds.size === 0) return true;
    return state.channels.has("sales");
  }
  const projectId = message.payload?.projectId as string | undefined;
  if (!projectId) return true;
  if (state.projectIds.size === 0) return true;
  return state.projectIds.has(projectId);
}

export function broadcast(message: WsOutboundMessage): void {
  const raw = JSON.stringify(message);
  for (const state of clients.values()) {
    if (state.socket.readyState === 1 && shouldReceive(state, message)) {
      state.socket.send(raw);
    }
  }
}

export function broadcastFromMqtt(topic: string, raw: string): void {
  let payload: Record<string, unknown> = { value: raw };
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* plain text */
  }
  const eventType =
    (payload.event_type as string) ??
    (payload.eventType as string) ??
    topic.split("/").pop() ??
    "event";
  const severity = (payload.severity as string) ?? "info";
  let type: WsMessageType = "event";
  if (eventType === "heartbeat") type = "heartbeat";
  else if (severity === "alarm" || severity === "critical" || eventType.includes("alarm")) {
    type = "alarm";
  }
  broadcast({
    type,
    topic,
    payload,
    at: new Date().toISOString(),
  });
}

export function getWsClientCount(): number {
  return clients.size;
}
