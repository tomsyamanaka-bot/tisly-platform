/** 日程調整 — 通常出発地などの実務設定（platform_settings） */

import { getDatabase } from "../db/database.js";

const SETTINGS_KEY = "schedule_planner_settings_v1";

/** TiSLY 通常出発地（移動時間計算の起点） */
export const DEFAULT_SCHEDULE_ORIGIN = "茨城県つくばみらい市板橋2889-2";

export interface SchedulePlannerSettingsV1 {
  defaultOrigin: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: SchedulePlannerSettingsV1 = {
  defaultOrigin: DEFAULT_SCHEDULE_ORIGIN,
  updatedAt: new Date().toISOString(),
};

export function getSchedulePlannerSettingsV1(): SchedulePlannerSettingsV1 {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value_json: string } | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value_json) as Partial<SchedulePlannerSettingsV1>;
    const origin = String(parsed.defaultOrigin ?? "").trim();
    return {
      defaultOrigin: origin || DEFAULT_SCHEDULE_ORIGIN,
      updatedAt: parsed.updatedAt ?? DEFAULT_SETTINGS.updatedAt,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSchedulePlannerSettingsV1(
  patch: Partial<Pick<SchedulePlannerSettingsV1, "defaultOrigin">>
): SchedulePlannerSettingsV1 {
  const current = getSchedulePlannerSettingsV1();
  const next: SchedulePlannerSettingsV1 = {
    defaultOrigin:
      patch.defaultOrigin !== undefined ? String(patch.defaultOrigin).trim() : current.defaultOrigin,
    updatedAt: new Date().toISOString(),
  };
  getDatabase()
    .prepare(
      `INSERT INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** 画面上の最小表示用（番地・号はマスク） */
export function maskAddressForDisplay(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return "";
  const jpMatch = trimmed.match(
    /^(.{2,4}[都道府県])?(.{1,12}[市区町村])(.*)$/
  );
  if (!jpMatch) {
    return trimmed.length > 8 ? `${trimmed.slice(0, 6)}〇〇` : trimmed;
  }
  const pref = jpMatch[1] ?? "";
  const city = jpMatch[2] ?? "";
  const rest = (jpMatch[3] ?? "").trim();
  if (!rest) return `${pref}${city}`;
  const maskedRest = rest
    .replace(/[0-9０-９\-－ー番地号丁目]/g, "〇")
    .replace(/[^\s　〇]/g, "〇");
  const short = maskedRest.replace(/〇+/g, "〇").slice(0, 4);
  return `${pref}${city}${short || "〇〇"}`;
}

export function getDefaultOriginLabel(): string {
  const origin = getSchedulePlannerSettingsV1().defaultOrigin.trim();
  if (!origin) return "通常出発地";
  return maskAddressForDisplay(origin) || "通常出発地";
}
