/**
 * フロアプラン設定の永続化（ローカル JSON）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getFloorplanPresetByIdV1,
  listFloorplanPresetsV1,
  refreshSecurityBridgeV1,
} from "./floorplan-presets-v1.js";
import type { FloorplanConfigV1 } from "./floorplan-types-v1.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dataDir(): string {
  return path.join(__dirname, "../../data/floorplan-builder");
}

function configsPath(): string {
  return path.join(dataDir(), "tisly_floorplan_configs.json");
}

function activePath(): string {
  return path.join(dataDir(), "active-id.json");
}

function ensureDir(): void {
  const dir = dataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAll(): FloorplanConfigV1[] {
  ensureDir();
  const p = configsPath();
  if (!fs.existsSync(p)) {
    const seeded = listFloorplanPresetsV1();
    fs.writeFileSync(p, JSON.stringify(seeded, null, 2), "utf8");
    fs.writeFileSync(
      activePath(),
      JSON.stringify({ activeId: seeded[0].id }, null, 2),
      "utf8"
    );
    return seeded;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(raw) ? (raw as FloorplanConfigV1[]) : [];
  } catch {
    return listFloorplanPresetsV1();
  }
}

function writeAll(list: FloorplanConfigV1[]): void {
  ensureDir();
  fs.writeFileSync(configsPath(), JSON.stringify(list, null, 2), "utf8");
}

export function listFloorplanConfigsV1(): FloorplanConfigV1[] {
  return readAll();
}

export function getActiveFloorplanIdV1(): string | null {
  ensureDir();
  const p = activePath();
  if (!fs.existsSync(p)) return readAll()[0]?.id ?? null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return String(raw?.activeId || "").trim() || null;
  } catch {
    return null;
  }
}

export function setActiveFloorplanIdV1(id: string): boolean {
  const list = readAll();
  const found = list.find((c) => c.id === id);
  if (!found) return false;
  ensureDir();
  fs.writeFileSync(
    activePath(),
    JSON.stringify({ activeId: id }, null, 2),
    "utf8"
  );
  return true;
}

export function getFloorplanConfigByIdV1(
  id: string
): FloorplanConfigV1 | null {
  const key = String(id || "").trim();
  if (!key) return null;
  return readAll().find((c) => c.id === key) || null;
}

export function getActiveFloorplanConfigV1(): FloorplanConfigV1 {
  const list = readAll();
  const activeId = getActiveFloorplanIdV1();
  const found = list.find((c) => c.id === activeId);
  if (found) return found;
  return list[0] || listFloorplanPresetsV1()[0];
}

export function saveFloorplanConfigV1(
  input: FloorplanConfigV1
): FloorplanConfigV1 {
  const refreshed = refreshSecurityBridgeV1({
    ...input,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
  const list = readAll();
  const idx = list.findIndex((c) => c.id === refreshed.id);
  if (idx >= 0) {
    list[idx] = refreshed;
  } else {
    list.push(refreshed);
  }
  writeAll(list);
  setActiveFloorplanIdV1(refreshed.id);
  // Security が読む正本としても書き出し
  ensureDir();
  fs.writeFileSync(
    path.join(dataDir(), "tisly_floorplan_config.json"),
    JSON.stringify(refreshed, null, 2),
    "utf8"
  );
  return refreshed;
}

export function loadPresetAsConfigV1(
  presetId: string
): FloorplanConfigV1 | null {
  const preset = getFloorplanPresetByIdV1(presetId);
  if (!preset) return null;
  return saveFloorplanConfigV1(preset);
}
