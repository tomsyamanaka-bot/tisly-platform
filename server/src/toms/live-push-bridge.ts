import { broadcast, type WsOutboundMessage } from "../ws/hub.js";
import type { ProjectTimelineEntry } from "./project-timeline.js";

export type LivePushChannel = "devices" | "notifications" | "timeline" | "floor_alert";

export interface ProjectLivePayload {
  projectId: string;
  channel: LivePushChannel;
  data: Record<string, unknown>;
}

function projectMessage(
  projectId: string,
  channel: LivePushChannel,
  data: Record<string, unknown>,
  severity: "info" | "warning" | "critical" = "info"
): WsOutboundMessage {
  const type = severity === "critical" ? "alarm" : "event";
  return {
    type,
    topic: `toms/project/${projectId}/${channel}`,
    payload: { projectId, channel, ...data },
    at: new Date().toISOString(),
  };
}

export function pushProjectDevicesLive(
  projectId: string,
  devices: unknown[],
  opts?: { scrollTier?: string; severity?: "info" | "warning" | "critical" }
): void {
  broadcast(
    projectMessage(
      projectId,
      "devices",
      { devices, scrollTier: opts?.scrollTier },
      opts?.severity ?? "info"
    )
  );
}

export function pushProjectNotificationsLive(projectId: string, notifications: unknown[]): void {
  broadcast(
    projectMessage(projectId, "notifications", { notifications }, "warning")
  );
}

export function pushProjectTimelineLive(
  projectId: string,
  entry: ProjectTimelineEntry | Record<string, unknown>
): void {
  broadcast(projectMessage(projectId, "timeline", { entry }));
}

export function pushFloorAlertLive(
  projectId: string,
  tier: string,
  severity: "warning" | "critical"
): void {
  broadcast(
    projectMessage(
      projectId,
      "floor_alert",
      { tier, blinkPins: true },
      severity
    )
  );
}

export function broadcastHeartbeat(): void {
  broadcast({
    type: "heartbeat",
    payload: { source: "toms-live-ops" },
    at: new Date().toISOString(),
  });
}
