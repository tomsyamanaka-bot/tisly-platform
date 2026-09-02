/**
 * /customer ホームカード用モジュール v1
 *
 * /app の enabledModules とは独立した
 * ポータル既定と TOMS トグルを管理する。
 */

import {
  normalizeModuleIdListV1,
  resolveDefaultEnabledModulesV1,
} from "../../tenant/customer-enabled-modules-v1.js";
import { getStoredEnabledModulesV1 } from "../../tenant/customer-enabled-modules-store-v1.js";

/** TOMS 顧客台帳 — ポータルカード ON/OFF（追記） */
export const PORTAL_CARD_TOGGLES_V1 = [
  {
    id: "security_floor_v1",
    label: "TiSLY Security",
    description: "防犯・フロア俯瞰・警報",
    defaultOn: true,
  },
  {
    id: "tisly_home_v1",
    label: "TiSLY HOME",
    description: "住設・分電盤・風呂・空調",
    defaultOn: false,
  },
  {
    id: "camera_preview_v1",
    label: "ライブカメラプレビュー",
    description: "H.View カメラ低遅延プレビュー",
    defaultOn: true,
  },
  {
    id: "equipment_monitor_v1",
    label: "その他設備監視",
    description: "水質・ガス・電気・レーダー",
    defaultOn: false,
  },
] as const;

export type PortalCardToggleIdV1 =
  (typeof PORTAL_CARD_TOGGLES_V1)[number]["id"];

/** ポータル常時付与（追記） */
export const PORTAL_BASE_MODULES_V1 = ["customer_portal"] as const;

/**
 * /customer 既定 — app 用 DEFAULT とは別管理（追記のみ）。
 * 既存 DEFAULT_ENABLED_MODULES_BY_CODE_V1 は改変しない。
 */
export const CUSTOMER_PORTAL_DEFAULTS_BY_CODE_V1: Record<string, string[]> = {
  /** 板橋自宅: Security / HOME / カメラ */
  TOMS001: [
    "security_floor_v1",
    "tisly_home_v1",
    "camera_preview_v1",
    "customer_portal",
  ],
  /** 豊島邸: Security / カメラ */
  TOYOSHIMA001: [
    "security_floor_v1",
    "camera_preview_v1",
    "customer_portal",
  ],
};

/** 一般顧客の Security 単体既定（追記） */
export const SECURITY_PORTAL_FALLBACK_V1: string[] = [
  "security_floor_v1",
  "camera_preview_v1",
  "customer_portal",
];

function normalizePortalCode(customerCode: string): string {
  const code = String(customerCode || "").trim().toUpperCase();
  if (code === "TOSHIMA001") return "TOYOSHIMA001";
  return code;
}

function ensurePortalBase(modules: string[]): string[] {
  const normalized = normalizeModuleIdListV1(modules);
  if (!normalized.length) return [...SECURITY_PORTAL_FALLBACK_V1];
  if (normalized.includes("*")) return normalized;
  const withBase = [...normalized];
  for (const base of PORTAL_BASE_MODULES_V1) {
    if (!withBase.includes(base)) withBase.push(base);
  }
  return normalizeModuleIdListV1(withBase);
}

/** 顧客コード別 /customer 既定モジュール */
export function resolveDefaultCustomerPortalModulesV1(
  customerCode: string
): string[] {
  const code = normalizePortalCode(customerCode);
  const preset = CUSTOMER_PORTAL_DEFAULTS_BY_CODE_V1[code];
  if (preset?.length) return [...preset];
  const appDefault = resolveDefaultEnabledModulesV1(code);
  if (appDefault.includes("*")) return [...appDefault];
  return [...SECURITY_PORTAL_FALLBACK_V1];
}

/**
 * /customer レンダリング用モジュール。
 * TOMS 保存済み → ポータル既定 → Security フォールバック。
 */
export function getCustomerPortalModulesV1(
  customerCode: string
): string[] {
  const code = normalizePortalCode(customerCode);
  const stored = getStoredEnabledModulesV1(code);
  // 社内 "*" は /customer カード既定へ展開
  if (stored?.enabledModules?.includes("*")) {
    return resolveDefaultCustomerPortalModulesV1(code);
  }
  if (stored?.enabledModules?.length) {
    const normalized = normalizeStoredPortalModulesV1(
      code,
      stored.enabledModules
    );
    if (normalized) return normalized;
  }
  return resolveDefaultCustomerPortalModulesV1(code);
}

/** 旧 app 既定と同一の保存値はポータル既定へ移行 */
function normalizeStoredPortalModulesV1(
  customerCode: string,
  stored: string[]
): string[] | null {
  const portalMarkerIds = [
    "camera_preview_v1",
    "equipment_monitor_v1",
  ];
  const hasPortalMarker = stored.some((m) =>
    portalMarkerIds.includes(m)
  );
  if (hasPortalMarker) {
    return ensurePortalBase(stored);
  }
  const appLegacy = resolveDefaultEnabledModulesV1(customerCode).filter(
    (m) => m !== "*"
  );
  const storedCore = [...stored]
    .filter((m) => m !== "customer_portal")
    .sort()
    .join(",");
  const legacyCore = [...appLegacy]
    .filter((m) => m !== "customer_portal")
    .sort()
    .join(",");
  if (storedCore === legacyCore && legacyCore.length > 0) {
    return null;
  }
  return ensurePortalBase(stored);
}

/** トグル状態 → enabledModules 配列 */
export function buildModulesFromPortalTogglesV1(
  toggles: Partial<Record<PortalCardToggleIdV1, boolean>>
): string[] {
  const modules: string[] = [...PORTAL_BASE_MODULES_V1];
  for (const toggle of PORTAL_CARD_TOGGLES_V1) {
    const on = toggles[toggle.id] ?? toggle.defaultOn;
    if (on) modules.push(toggle.id);
  }
  return normalizeModuleIdListV1(modules);
}

/** enabledModules → TOMS トグル表示用 */
export function parsePortalCardTogglesV1(
  enabledModules: string[] | null | undefined,
  customerCode?: string
): Record<PortalCardToggleIdV1, boolean> {
  const mods = enabledModules ?? [];
  const out = {} as Record<PortalCardToggleIdV1, boolean>;
  if (mods.includes("*")) {
    for (const toggle of PORTAL_CARD_TOGGLES_V1) {
      out[toggle.id] = true;
    }
    return out;
  }
  if (!mods.length && customerCode) {
    const defaults = resolveDefaultCustomerPortalModulesV1(customerCode);
    for (const toggle of PORTAL_CARD_TOGGLES_V1) {
      out[toggle.id] = defaults.includes(toggle.id);
    }
    return out;
  }
  for (const toggle of PORTAL_CARD_TOGGLES_V1) {
    out[toggle.id] = mods.includes(toggle.id);
  }
  return out;
}

/** 新規顧客の Security 単体プリセット */
export function defaultPortalModulesForNewCustomerV1(): string[] {
  return buildModulesFromPortalTogglesV1({});
}

export function listPortalCardTogglesAdminV1() {
  return PORTAL_CARD_TOGGLES_V1.map((t) => ({ ...t }));
}
