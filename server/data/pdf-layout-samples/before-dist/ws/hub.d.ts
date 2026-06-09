import type { WebSocket } from "ws";
export type WsMessageType = "heartbeat" | "event" | "alarm" | "connected" | "camera_focus" | "security_focus";
export type ProRemoteWsAction = "floor_nav" | "pin_select" | "ack" | "close" | "escalate";
export interface WsOutboundMessage {
    type: WsMessageType;
    topic?: string;
    payload: Record<string, unknown>;
    at: string;
}
export declare function registerWsClient(socket: WebSocket): void;
export declare function handleWsClientMessage(socket: WebSocket, raw: string): void;
export declare function broadcast(message: WsOutboundMessage): void;
export declare function broadcastFromMqtt(topic: string, raw: string): void;
export declare function getWsClientCount(): number;
