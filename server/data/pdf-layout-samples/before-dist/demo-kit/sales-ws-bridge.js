/**
 * Phase943 — 営業デモ / Google TV 向け WebSocket ブロードキャスト
 */
import { broadcast } from "../ws/hub.js";
import { getDeviceMode } from "../device/device-mode-store.js";
import { getShellyEnvMode } from "../device/shelly-real-client.js";
export function broadcastSalesDemoEvent(kind, payload = {}) {
    const at = new Date().toISOString();
    const deviceMode = getDeviceMode();
    const liveBadge = getSalesLiveBadge();
    const shellyEnvBadge = getSalesShellyEnvBadge();
    broadcast({
        type: "event",
        topic: "sales/demo",
        payload: {
            channel: "sales",
            kind,
            deviceMode,
            liveBadge,
            shellyEnvBadge,
            ...payload,
        },
        at,
    });
    const customerCode = payload.customerCode;
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
export function getSalesLiveBadge() {
    const mode = getDeviceMode();
    if (mode === "mock")
        return "mock";
    if (mode === "esp" || mode === "shelly" || mode === "mixed")
        return "live";
    return "offline";
}
export function getSalesShellyEnvBadge() {
    return getShellyEnvMode();
}
