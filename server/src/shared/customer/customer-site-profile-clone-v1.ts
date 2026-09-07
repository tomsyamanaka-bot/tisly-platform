/**
 * 現場プロファイル複製（クローン設定）v1
 *
 * 指示例:
 * 「新規顧客［佐藤邸］を［豊島邸］と同じ機器構成で作成して。
 *  ただしライト点灯時間は45秒、DI1は玄関センサーに変更して」
 *
 * 既存プロファイルは削除せず、結果オブジェクトと
 * ランタイム追記用ドラフトを返す。
 */

import {
  normalizeCustomerTenantCodeV1,
  registerCustomerTenantProfileV1,
  resolveCustomerTenantProfileV1,
  type CustomerTenantProfileV1,
} from "./customer-tenant-profile-v1.js";

/** クローン元として許可する顧客コード */
export const CLONE_SOURCE_CUSTOMER_CODES_V1 = [
  "TOYOSHIMA001",
  "TOMS001",
] as const;

export type CloneSourceCustomerCodeV1 =
  (typeof CLONE_SOURCE_CUSTOMER_CODES_V1)[number];

/** ピンポイント上書きできる差分 */
export interface CustomerSiteProfileCloneDiffsV1 {
  lightingDurationSec?: number;
  scheduleStart?: string;
  scheduleEnd?: string;
  di1Label?: string;
  di2Label?: string;
  do1Label?: string;
  do2Label?: string;
  addressLabel?: string;
}

export interface CustomerSiteProfileCloneInputV1 {
  /** 複製元（豊島邸 / 板橋自宅） */
  sourceCustomerCode: string;
  /** 新規顧客コード（例: SATO001） */
  newCustomerCode: string;
  /** 表示名（例: 佐藤邸） */
  newDisplayName: string;
  /** ユーザー指定の差分のみ */
  diffs?: CustomerSiteProfileCloneDiffsV1;
}

export interface CustomerSiteDeviceBlueprintV1 {
  template: "toyoshima_dual_rp2350" | "itabashi_single_rp2350";
  hasDetached: boolean;
  modbusSlaveId: number | null;
  defaultLightingDurationSec: number;
  defaultScheduleStart: string;
  defaultScheduleEnd: string;
  defaultDi1Label: string;
  defaultDi2Label: string;
  heartbeatIntervalSec: number;
  heartbeatOfflineMs: number;
}

export interface CustomerSiteProfileCloneResultV1 {
  ok: true;
  sourceCustomerCode: CloneSourceCustomerCodeV1;
  sourceDisplayName: string;
  profile: CustomerTenantProfileV1;
  homeSiteId: string;
  securitySiteId: string;
  deviceBlueprint: CustomerSiteDeviceBlueprintV1;
  appliedDiffs: CustomerSiteProfileCloneDiffsV1;
  initialLogin: {
    customerCode: string;
    username: string;
    /** 初期パスワードは発行時に別途設定（平文は返さない） */
    passwordSetupHint: string;
  };
  /** docs/CUSTOMER_DEVICES.md へ追記する Markdown 断片 */
  customerDevicesMarkdownAppend: string;
}

export interface CustomerSiteProfileCloneErrorV1 {
  ok: false;
  error: string;
}

const TOYOSHIMA_BLUEPRINT: CustomerSiteDeviceBlueprintV1 = {
  template: "toyoshima_dual_rp2350",
  hasDetached: true,
  modbusSlaveId: 1,
  defaultLightingDurationSec: 45,
  defaultScheduleStart: "18:00",
  defaultScheduleEnd: "06:00",
  defaultDi1Label: "遠近ビーム1",
  defaultDi2Label: "遠近ビーム2",
  heartbeatIntervalSec: 300,
  heartbeatOfflineMs: 5 * 60 * 1000 + 30 * 1000,
};

const ITABASHI_BLUEPRINT: CustomerSiteDeviceBlueprintV1 = {
  template: "itabashi_single_rp2350",
  hasDetached: false,
  modbusSlaveId: null,
  defaultLightingDurationSec: 45,
  defaultScheduleStart: "18:00",
  defaultScheduleEnd: "06:00",
  defaultDi1Label: "駐車場センサー",
  defaultDi2Label: "ガレージセンサー",
  heartbeatIntervalSec: 300,
  heartbeatOfflineMs: 5 * 60 * 1000 + 30 * 1000,
};

function resolveCloneSourceCodeV1(
  raw: string
): CloneSourceCustomerCodeV1 | null {
  const code = normalizeCustomerTenantCodeV1(raw);
  if (
    CLONE_SOURCE_CUSTOMER_CODES_V1.includes(
      code as CloneSourceCustomerCodeV1
    )
  ) {
    return code as CloneSourceCustomerCodeV1;
  }
  const label = String(raw ?? "").trim();
  if (label === "豊島邸" || /toyoshima/i.test(label)) {
    return "TOYOSHIMA001";
  }
  if (label === "板橋自宅" || /itabashi|toms001/i.test(label)) {
    return "TOMS001";
  }
  return null;
}

function blueprintForSource(
  code: CloneSourceCustomerCodeV1
): CustomerSiteDeviceBlueprintV1 {
  return code === "TOYOSHIMA001"
    ? { ...TOYOSHIMA_BLUEPRINT }
    : { ...ITABASHI_BLUEPRINT };
}

function slugFromDisplayName(displayName: string): string {
  const raw = displayName
    .trim()
    .replace(/\s+/g, "")
    .replace(/[邸宅館]/g, "")
    .slice(0, 12);
  const ascii = raw
    .normalize("NFKC")
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]/g, "");
  return (ascii || "SITE").toUpperCase();
}

function buildHomeSiteId(displayName: string, customerCode: string): string {
  const slug = slugFromDisplayName(displayName);
  return `HOME-JP-${slug}-${customerCode}`;
}

function buildSecuritySiteId(customerCode: string): string {
  return `SEC-JP-${customerCode}-001`;
}

function applyDiffsToBlueprint(
  base: CustomerSiteDeviceBlueprintV1,
  diffs: CustomerSiteProfileCloneDiffsV1 | undefined
): {
  blueprint: CustomerSiteDeviceBlueprintV1;
  applied: CustomerSiteProfileCloneDiffsV1;
} {
  const applied: CustomerSiteProfileCloneDiffsV1 = {};
  const next = { ...base };
  if (!diffs) return { blueprint: next, applied };

  if (
    typeof diffs.lightingDurationSec === "number" &&
    diffs.lightingDurationSec >= 5 &&
    diffs.lightingDurationSec <= 180
  ) {
    next.defaultLightingDurationSec = diffs.lightingDurationSec;
    applied.lightingDurationSec = diffs.lightingDurationSec;
  }
  if (diffs.scheduleStart) {
    next.defaultScheduleStart = diffs.scheduleStart;
    applied.scheduleStart = diffs.scheduleStart;
  }
  if (diffs.scheduleEnd) {
    next.defaultScheduleEnd = diffs.scheduleEnd;
    applied.scheduleEnd = diffs.scheduleEnd;
  }
  if (diffs.di1Label) {
    next.defaultDi1Label = diffs.di1Label;
    applied.di1Label = diffs.di1Label;
  }
  if (diffs.di2Label) {
    next.defaultDi2Label = diffs.di2Label;
    applied.di2Label = diffs.di2Label;
  }
  if (diffs.do1Label) applied.do1Label = diffs.do1Label;
  if (diffs.do2Label) applied.do2Label = diffs.do2Label;
  if (diffs.addressLabel) applied.addressLabel = diffs.addressLabel;

  return { blueprint: next, applied };
}

function buildMarkdownAppend(input: {
  displayName: string;
  customerCode: string;
  homeSiteId: string;
  securitySiteId: string;
  sourceDisplayName: string;
  blueprint: CustomerSiteDeviceBlueprintV1;
  applied: CustomerSiteProfileCloneDiffsV1;
}): string {
  const lines = [
    ``,
    `## ${input.displayName}（${input.customerCode}）— クローン展開`,
    ``,
    `| 項目 | 値 |`,
    `|------|-----|`,
    `| 複製元 | ${input.sourceDisplayName} |`,
    `| HOME | \`${input.homeSiteId}\` |`,
    `| Security | \`${input.securitySiteId}\` |`,
    `| テンプレート | ${input.blueprint.template} |`,
    `| 点灯秒数 | ${input.blueprint.defaultLightingDurationSec} |`,
    `| 点灯時間帯 | ${input.blueprint.defaultScheduleStart}〜${input.blueprint.defaultScheduleEnd} |`,
    `| DI1 | ${input.blueprint.defaultDi1Label} |`,
    `| DI2 | ${input.blueprint.defaultDi2Label} |`,
    `| Heartbeat | ${input.blueprint.heartbeatIntervalSec}s / 途絶 ${input.blueprint.heartbeatOfflineMs}ms |`,
  ];
  if (Object.keys(input.applied).length > 0) {
    lines.push(``, `### 適用差分`, ``);
    for (const [k, v] of Object.entries(input.applied)) {
      lines.push(`- ${k}: ${String(v)}`);
    }
  }
  lines.push(``);
  return lines.join("\n");
}

/**
 * 指定元現場の機器構成を複製し、
 * 差分のみ上書きした新規顧客ドラフトを返す。
 * 既存配列は破壊しない（呼び出し側で append）。
 */
export function buildCustomerSiteProfileCloneV1(
  input: CustomerSiteProfileCloneInputV1
): CustomerSiteProfileCloneResultV1 | CustomerSiteProfileCloneErrorV1 {
  const sourceCode = resolveCloneSourceCodeV1(input.sourceCustomerCode);
  if (!sourceCode) {
    return {
      ok: false,
      error:
        "複製元は TOYOSHIMA001（豊島邸）または TOMS001（板橋自宅）のみです",
    };
  }

  const source = resolveCustomerTenantProfileV1(sourceCode);
  if (!source) {
    return { ok: false, error: "複製元プロファイルが見つかりません" };
  }

  const newCode = normalizeCustomerTenantCodeV1(input.newCustomerCode);
  if (!newCode || newCode.length < 3) {
    return { ok: false, error: "新規顧客コードが不正です" };
  }
  if (resolveCustomerTenantProfileV1(newCode)) {
    return {
      ok: false,
      error: `顧客コード ${newCode} は既に登録済みです`,
    };
  }

  const displayName = String(input.newDisplayName || "").trim();
  if (!displayName) {
    return { ok: false, error: "新規顧客の表示名が必要です" };
  }

  const homeSiteId = buildHomeSiteId(displayName, newCode);
  const securitySiteId = buildSecuritySiteId(newCode);
  const { blueprint, applied } = applyDiffsToBlueprint(
    blueprintForSource(sourceCode),
    input.diffs
  );

  const profile: CustomerTenantProfileV1 = {
    customerCode: newCode,
    displayName,
    securitySiteId,
    homeSiteId,
    useToyoshimaDashboard: source.useToyoshimaDashboard,
  };

  const username = `${newCode.toLowerCase()}.owner`;

  return {
    ok: true,
    sourceCustomerCode: sourceCode,
    sourceDisplayName: source.displayName,
    profile,
    homeSiteId,
    securitySiteId,
    deviceBlueprint: blueprint,
    appliedDiffs: applied,
    initialLogin: {
      customerCode: newCode,
      username,
      passwordSetupHint:
        "初回パスワードは招待フローまたは管理者発行で設定する",
    },
    customerDevicesMarkdownAppend: buildMarkdownAppend({
      displayName,
      customerCode: newCode,
      homeSiteId,
      securitySiteId,
      sourceDisplayName: source.displayName,
      blueprint,
      applied,
    }),
  };
}

/**
 * クローン結果をランタイムプロファイルへ追記。
 * 静的マップは変更しない。
 */
export function applyCustomerSiteProfileCloneV1(
  input: CustomerSiteProfileCloneInputV1
): CustomerSiteProfileCloneResultV1 | CustomerSiteProfileCloneErrorV1 {
  const draft = buildCustomerSiteProfileCloneV1(input);
  if (!draft.ok) return draft;
  const registered = registerCustomerTenantProfileV1(draft.profile);
  if (!registered) {
    return {
      ok: false,
      error: `顧客コード ${draft.profile.customerCode} の追記に失敗しました`,
    };
  }
  return draft;
}
