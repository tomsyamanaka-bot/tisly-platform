import { broadcast } from "../ws/hub.js";
function projectMessage(projectId, channel, data, severity = "info") {
    const type = severity === "critical" ? "alarm" : "event";
    return {
        type,
        topic: `toms/project/${projectId}/${channel}`,
        payload: { projectId, channel, ...data },
        at: new Date().toISOString(),
    };
}
export function pushProjectDevicesLive(projectId, devices, opts) {
    broadcast(projectMessage(projectId, "devices", { devices, scrollTier: opts?.scrollTier }, opts?.severity ?? "info"));
}
export function pushProjectNotificationsLive(projectId, notifications) {
    broadcast(projectMessage(projectId, "notifications", { notifications }, "warning"));
}
export function pushProjectTimelineLive(projectId, entry) {
    broadcast(projectMessage(projectId, "timeline", { entry }));
}
export function pushFloorAlertLive(projectId, tier, severity) {
    broadcast(projectMessage(projectId, "floor_alert", { tier, blinkPins: true }, severity));
}
export function broadcastHeartbeat() {
    broadcast({
        type: "heartbeat",
        payload: { source: "toms-live-ops" },
        at: new Date().toISOString(),
    });
}
