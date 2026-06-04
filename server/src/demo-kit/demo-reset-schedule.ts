export type DemoResetScheduleMode = "manual" | "morning" | "before_sales";

export interface DemoResetScheduleConfig {
  mode: DemoResetScheduleMode;
  enabled: boolean;
  /** mock: 次回実行予定 ISO */
  nextRunAt: string | null;
  lastRunAt: string | null;
  description: string;
}

const MODE_META: Record<DemoResetScheduleMode, { cronLabel: string; description: string; hourJst: number }> = {
  manual: { cronLabel: "—", description: "手動のみ（営業画面のボタン）", hourJst: -1 },
  morning: { cronLabel: "0 6 * * *", description: "毎朝 6:00（JST）にデモを初期化（mock）", hourJst: 6 },
  before_sales: { cronLabel: "0 8 * * 1-5", description: "平日 8:00 営業前リセット（mock）", hourJst: 8 },
};

let config: DemoResetScheduleConfig = {
  mode: "manual",
  enabled: false,
  nextRunAt: null,
  lastRunAt: null,
  description: MODE_META.manual.description,
};

function computeNextRun(mode: DemoResetScheduleMode): string | null {
  if (mode === "manual") return null;
  const meta = MODE_META[mode];
  const now = new Date();
  const next = new Date(now);
  next.setHours(meta.hourJst, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  if (mode === "before_sales") {
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }
  return next.toISOString();
}

export function getDemoResetSchedule(): DemoResetScheduleConfig & { cronLabel: string } {
  const meta = MODE_META[config.mode];
  return { ...config, cronLabel: meta.cronLabel };
}

export function setDemoResetSchedule(input: {
  mode?: DemoResetScheduleMode;
  enabled?: boolean;
}): DemoResetScheduleConfig & { cronLabel: string } {
  if (input.mode) {
    config.mode = input.mode;
    config.description = MODE_META[input.mode].description;
  }
  if (input.enabled !== undefined) config.enabled = input.enabled;
  config.nextRunAt = config.enabled ? computeNextRun(config.mode) : null;
  return getDemoResetSchedule();
}

/** mock: スケジュール実行を記録（実リセットは呼び出し側） */
export function markDemoResetScheduleRan(): void {
  config.lastRunAt = new Date().toISOString();
  if (config.enabled && config.mode !== "manual") {
    config.nextRunAt = computeNextRun(config.mode);
  }
}

export function listDemoResetScheduleModes(): DemoResetScheduleMode[] {
  return ["manual", "morning", "before_sales"];
}
