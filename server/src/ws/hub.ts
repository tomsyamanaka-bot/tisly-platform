import type { WebSocket } from "ws";

export type WsMessageType = "heartbeat" | "event" | "alarm" | "connected";

export interface WsOutboundMessage {
  type: WsMessageType;
  topic?: string;
  payload: Record<string, unknown>;
  at: string;
}

const clients = new Set<WebSocket>();

export function registerWsClient(socket: WebSocket): void {
  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  broadcast({
    type: "connected",
    payload: { message: "TiSLY WebSocket ready" },
    at: new Date().toISOString(),
  });
}

export function broadcast(message: WsOutboundMessage): void {
  const raw = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(raw);
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
