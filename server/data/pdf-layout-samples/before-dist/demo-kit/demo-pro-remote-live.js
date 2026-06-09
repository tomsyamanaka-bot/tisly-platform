/**
 * Phase906 — PRO Remote 図面への実機状態反映（ライブ）
 */
import { getDemoFloorPreview } from "./demo-floor-preview.js";
import { listUnifiedDevices } from "../device/device-adapter.js";
import { getDeviceMode } from "../device/device-mode-store.js";
const STATUS_COLORS = {
    ONLINE: "#22c55e",
    WARNING: "#f59e0b",
    OFFLINE: "#ef4444",
};
export function getProRemoteLiveFloorPreview(customerCode = "TOMS001") {
    const base = getDemoFloorPreview(customerCode);
    const devices = listUnifiedDevices(customerCode);
    const byId = new Map(devices.map((d) => [d.deviceId, d]));
    const layers = base.layers.map((layer) => ({
        ...layer,
        pins: layer.pins.map((pin) => {
            const dev = pin.deviceId ? byId.get(pin.deviceId) : undefined;
            const status = dev?.status ?? pin.status ?? "ONLINE";
            const pinType = pin.pinType;
            const color = STATUS_COLORS[status] ?? STATUS_COLORS.ONLINE;
            return {
                ...pin,
                status,
                statusColor: color,
                live: !!dev,
                kind: dev?.kind ?? (pinType === "shelly" ? "Shelly" : pinType === "camera" ? "Camera" : "ESP"),
            };
        }),
    }));
    return {
        ...base,
        deviceMode: getDeviceMode(),
        live: true,
        statusColors: STATUS_COLORS,
        layers,
        deviceSummary: {
            online: devices.filter((d) => d.status === "ONLINE").length,
            warning: devices.filter((d) => d.status === "WARNING").length,
            offline: devices.filter((d) => d.status === "OFFLINE").length,
        },
    };
}
