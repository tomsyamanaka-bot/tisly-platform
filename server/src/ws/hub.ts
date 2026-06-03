import type { WebSocket } from "ws";
import { appendProjectTimeline } from "../toms/project-timeline.js";
import { pushProjectTimelineLive } from "../toms/live-push-bridge.js";

export type WsMessageType = "heartbeat" | "event" | "alarm" | "connected";

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
}

const clients = new Map<WebSocket, WsClientState>();

export function registerWsClient(socket: WebSocket): void {
  clients.set(socket, { socket, projectIds: new Set() });
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
    state.projectIds.add(String(msg.projectId));
    sendToClient(socket, {
      type: "event",
      payload: { subscribed: msg.projectId },
      at: new Date().toISOString(),
    });
  }
  if (msg.type === "unsubscribe" && msg.projectId) {
    state.projectIds.delete(String(msg.projectId));
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

function sendToClient(socket: WebSocket, message: WsOutboundMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

function shouldReceive(state: WsClientState, message: WsOutboundMessage): boolean {
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
