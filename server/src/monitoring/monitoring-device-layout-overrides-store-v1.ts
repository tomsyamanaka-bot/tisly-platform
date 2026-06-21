/** TiSLY Monitoring 3D V3.1 — センサー/機器 3D 座標オーバーライド */

import fs from "fs";
import path from "path";
import type { MonitoringDeviceTypeV1 } from "./tisly-monitoring-layout-v1.js";

export const MONITORING_DEVICE_LAYOUT_OVERRIDE_TYPES: MonitoringDeviceTypeV1[] = [
  "camera",
  "sensor",
  "door",
  "window",
  "light",
  "panel",
  "gate",
  "silo",
  "conveyor",
  "mixer",
  "tank",
  "pump",
  "scale",
  "yardSensor",
];

export interface MonitoringDeviceLayoutOverrideV1 {
  deviceId: string;
  deviceType: MonitoringDeviceTypeV1;
  siteId: string;
  label: string;
  floorLevel: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  updatedAt: string;
  notes?: string;
}

export interface MonitoringDeviceLayoutOverridesStoreV1 {
  version: 1;
  updatedAt: string;
  sites: Record<string, MonitoringDeviceLayoutOverrideV1[]>;
}

function getStorePath(): string {
  const override = process.env.TISLY_MONITORING_DEVICE_LAYOUT_PATH;
  if (override) return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  return path.join(process.cwd(), "data", "monitoring", "device-layout-overrides.json");
}

function readStore(): MonitoringDeviceLayoutOverridesStoreV1 {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, updatedAt: new Date().toISOString(), sites: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as MonitoringDeviceLayoutOverridesStoreV1;
    return parsed?.sites ? parsed : { version: 1, updatedAt: new Date().toISOString(), sites: {} };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), sites: {} };
  }
}

function writeStore(store: MonitoringDeviceLayoutOverridesStoreV1): void {
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizePosition(raw: Partial<{ x: number; y: number; z: number }> | undefined) {
  return {
    x: Number(raw?.x ?? 0),
    y: Number(raw?.y ?? 0),
    z: Number(raw?.z ?? 0),
  };
}

export function listMonitoringDeviceLayoutOverridesV1(siteId: string): {
  siteId: string;
  overrides: MonitoringDeviceLayoutOverrideV1[];
  supportedDeviceTypes: MonitoringDeviceTypeV1[];
} {
  const store = readStore();
  return {
    siteId,
    overrides: store.sites[siteId] ?? [],
    supportedDeviceTypes: MONITORING_DEVICE_LAYOUT_OVERRIDE_TYPES,
  };
}

export interface SaveMonitoringDeviceLayoutOverrideInputV1 {
  siteId: string;
  deviceId: string;
  deviceType: MonitoringDeviceTypeV1;
  label?: string;
  floorLevel?: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  notes?: string;
}

export function saveMonitoringDeviceLayoutOverrideV1(
  input: SaveMonitoringDeviceLayoutOverrideInputV1
): MonitoringDeviceLayoutOverrideV1 {
  const store = readStore();
  if (!store.sites[input.siteId]) store.sites[input.siteId] = [];

  const existing = store.sites[input.siteId].find((o) => o.deviceId === input.deviceId);
  const record: MonitoringDeviceLayoutOverrideV1 = {
    deviceId: input.deviceId,
    deviceType: input.deviceType,
    siteId: input.siteId,
    label: input.label?.trim() || input.deviceId,
    floorLevel: input.floorLevel ?? "1f",
    position: normalizePosition(input.position),
    rotation: normalizePosition(input.rotation),
    updatedAt: new Date().toISOString(),
    notes: input.notes,
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    store.sites[input.siteId].push(record);
  }

  writeStore(store);
  return existing ?? record;
}

export function findMonitoringDeviceLayoutOverrideV1(
  siteId: string,
  deviceId: string
): MonitoringDeviceLayoutOverrideV1 | undefined {
  const store = readStore();
  return store.sites[siteId]?.find((o) => o.deviceId === deviceId);
}

export function resetMonitoringDeviceLayoutOverridesForTestV1(): void {
  const filePath = getStorePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
