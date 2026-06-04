/**
 * Phase943 — 営業デモ / Google TV 向け WebSocket ブロードキャスト
 */
import { broadcast } from "../ws/hub.js";
import { getDeviceMode } from "../device/device-mode-store.js";

export type SalesWsEventKind =
  | "status"
  | "notification"
  | "intrusion"
  | "recovery"
  | "maintenance"
  | "roi"
  | "device_mode"
  | "reset";

export function broadcastSalesDemoEvent(
  kind: SalesWsEventKind,
  payload: Record<string, unknown> = {}
): void {
  const at = new Date().toISOString();
  const deviceMode = getDeviceMode();
  const liveBadge = getSalesLiveBadge();

  broadcast({
    type: "event",
    topic: "sales/demo",
    payload: {
      channel: "sales",
      kind,
      deviceMode,
      liveBadge,
      ...payload,
    },
    at,
  });

  const customerCode = payload.customerCode as string | undefined;
  if (customerCode) {
    broadcast({
      type: kind === "intrusion" || kind === "notification" ? "alarm" : "event",
      topic: `sales/demo/tv/${String(customerCode).toUpperCase()}`,
      payload: {
        channel: "tv_mirror",
        kind,
        customerCode: String(customerCode).toUpperCase(),
        title: payload.title,
        message: payload.message ?? payload.body,
        severity: payload.severity ?? "alarm",
        ...payload,
      },
      at,
    });
  }
}

export function getSalesLiveBadge(): "live" | "mock" | "offline" {
  const mode = getDeviceMode();
  if (mode === "mock") return "mock";
  if (mode === "esp" || mode === "shelly" || mode === "mixed") return "live";
  return "offline";
}
