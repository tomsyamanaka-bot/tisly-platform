/**
 * Phase902 — Device Registry 一覧 API
 */
import { listUnifiedDevices, type UnifiedDeviceView } from "./device-adapter.js";
import { getDeviceAdapterStatus } from "./device-adapter.js";

export interface DeviceRegistryRow {
  deviceId: string;
  name: string;
  kind: UnifiedDeviceView["kind"];
  status: UnifiedDeviceView["status"];
  lastSeen: string | null;
  customerCode: string | null;
  source: UnifiedDeviceView["source"];
}

export function getDeviceRegistry(customerCode?: string): {
  phase: string;
  devices: DeviceRegistryRow[];
  summary: ReturnType<typeof getDeviceAdapterStatus>;
} {
  const devices = listUnifiedDevices(customerCode).map((d) => ({
    deviceId: d.deviceId,
    name: d.name,
    kind: d.kind,
    status: d.status,
    lastSeen: d.lastSeen,
    customerCode: d.customerCode,
    source: d.source,
  }));
  return {
    phase: "901-940",
    devices,
    summary: getDeviceAdapterStatus(),
  };
}
