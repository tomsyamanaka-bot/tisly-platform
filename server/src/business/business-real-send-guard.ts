import { getDatabase } from "../db/database.js";

const SETTINGS_KEY = "business_real_send_settings";

export type RealSendOperation =
  | "gmail_send"
  | "calendar_create"
  | "qnap_real_upload"
  | "pdf_generate"
  | "web_push";

export interface BusinessRealSendSettings {
  dryRun: boolean;
  mockOnly: boolean;
  realSendEnabled: boolean;
}

const DEFAULTS: BusinessRealSendSettings = {
  dryRun: true,
  mockOnly: true,
  realSendEnabled: false,
};

export function getBusinessRealSendSettings(): BusinessRealSendSettings {
  const row = getDatabase()
    .prepare(`SELECT value_json FROM platform_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value_json: string } | undefined;
  if (!row) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(row.value_json) as Partial<BusinessRealSendSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBusinessRealSendSettings(
  patch: Partial<BusinessRealSendSettings>
): BusinessRealSendSettings {
  const next = { ...getBusinessRealSendSettings(), ...patch };
  getDatabase()
    .prepare(
      `INSERT OR REPLACE INTO platform_settings (key, value_json, updated_at) VALUES (?, ?, datetime('now'))`
    )
    .run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function assertRealSendAllowed(
  operation: RealSendOperation,
  opts?: { confirmed?: boolean; mode?: "mock" | "dryRun" | "real" }
): { allowed: boolean; dryRun: boolean; reason?: string } {
  const settings = getBusinessRealSendSettings();
  if (opts?.mode === "mock" || opts?.mode === "dryRun") {
    return { allowed: true, dryRun: opts.mode === "dryRun" };
  }
  if (settings.mockOnly) {
    return { allowed: false, dryRun: true, reason: "mock_only mode — enable real send in settings" };
  }
  if (settings.dryRun) {
    return { allowed: false, dryRun: true, reason: `dry_run: ${operation} blocked` };
  }
  if (!settings.realSendEnabled) {
    return {
      allowed: false,
      dryRun: true,
      reason: "real_send_enabled is false — confirm in Business settings",
    };
  }
  if (!opts?.confirmed) {
    return {
      allowed: false,
      dryRun: true,
      reason: `confirmation required for ${operation}`,
    };
  }
  return { allowed: true, dryRun: false };
}
