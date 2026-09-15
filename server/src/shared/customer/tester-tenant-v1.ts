/**
 * テスター専用テナント（板橋実機連動）
 *
 * TESTER001 は限定スコープのデモテナント。
 * 画面は板橋自宅と同じ構成で動くが、物理 DO は送信しない。
 * 既存テナント配列は削除せず追記する。
 */

/** テスター専用顧客コード（Tenant ID） */
export const TESTER_CUSTOMER_CODE_V1 = "TESTER001";

/** テスターログインユーザー名 */
export const TESTER_USERNAME_V1 = "tester.user";

export const TESTER_LOGIN_PASSWORD_V1 = "tisly-test-2026";

/** ログイン応答用の固定トークン（JWT 不要・全端末共通） */
export const TESTER_STATIC_TOKEN_V1 = "tester-token-2026";

/** 公開ロール（内部権限は viewer に正規化） */
export const TESTER_LOGIN_ROLE_PUBLIC_V1 = "customer";

/** ログイン応答用の公開モジュール名 */
export const TESTER_PORTAL_MODULE_LABELS_V1 = ["security", "home"] as const;

export function isTesterStaticTokenV1(token: string | null | undefined): boolean {
  return String(token ?? "").trim() === TESTER_STATIC_TOKEN_V1;
}

export function extractLoginCustomerCodeV1(
  body: Record<string, unknown> | null | undefined
): string {
  const src = body ?? {};
  return String(
    src.customerCode ?? src.customer_code ?? src.tenantId ?? src.tenant_id ?? ""
  )
    .trim()
    .toUpperCase();
}

/** TESTER001 ログイン API の固定 JSON（DB 照会前に返す） */
export function buildTesterHardcodedLoginBodyV1(extras?: {
  urls?: { customer: string; tv: string; admin: string };
  expiresInMinutes?: number;
}): Record<string, unknown> {
  return {
    success: true,
    token: TESTER_STATIC_TOKEN_V1,
    tenantId: TESTER_CUSTOMER_CODE_V1,
    customerCode: TESTER_CUSTOMER_CODE_V1,
    userName: TESTER_USERNAME_V1,
    siteId: TESTER_HOME_SITE_ID_V1,
    displayName: TESTER_DISPLAY_NAME_V1,
    role: TESTER_LOGIN_ROLE_PUBLIC_V1,
    modules: [...TESTER_PORTAL_MODULE_LABELS_V1],
    hardwareMock: true,
    ok: true,
    user: {
      id: `cu-${TESTER_CUSTOMER_CODE_V1}-user`,
      username: TESTER_USERNAME_V1,
      role: "viewer",
      customerId: TESTER_CUSTOMER_ID_V1,
      customerCode: TESTER_CUSTOMER_CODE_V1,
    },
    scope: "customer",
    urls: extras?.urls ?? {
      customer: "/customer/TESTER001",
      tv: "/tv/TESTER001",
      admin: "/admin/TESTER001",
    },
    expiresInMinutes: extras?.expiresInMinutes ?? 480,
  };
}

export function isTesterDemoPasswordV1(password: string | null | undefined): boolean {
  const given = String(password ?? "");
  if (!given) return false;
  const fromEnv = String(process.env.TESTER001_PASSWORD ?? "").trim();
  return given === TESTER_LOGIN_PASSWORD_V1 || (Boolean(fromEnv) && given === fromEnv);
}

/** お客様画面の表示名 */
export const TESTER_DISPLAY_NAME_V1 = "テスターデモ（板橋）";

/** 内部顧客 ID（既存 ID は使わない） */
export const TESTER_CUSTOMER_ID_V1 = "cust-tester001";

/** サイト ID（デモサイト行の追記用） */
export const TESTER_SITE_ID_V1 = "site-tester001-itabashi";

/** 物件マスター ID（既存物件は上書きしない） */
export const TESTER_PROPERTY_ID_V1 = "PROP-TESTER001-ITABASHI";

/** 板橋自宅と同じ HOME 実機 */
export const TESTER_HOME_SITE_ID_V1 = "HOME-JP-ITABASHI-LIVE";

/** 板橋自宅と同じ Security 実機 */
export const TESTER_SECURITY_SITE_ID_V1 = "SEC-JP-ITABASHI-LIVE";

/** 板橋自宅 RP2350 主装置 */
export const TESTER_RP2350_MAIN_ID_V1 = "rp2350-itabashi-main-01";

/** 許可テナントコード（追記のみ） */
export const TESTER_TENANT_CODES_V1 = [TESTER_CUSTOMER_CODE_V1] as const;

/**
 * /customer・/app で許可するモジュール。
 * 見積・事業・3Dプリンターは含めない。
 * 指示上の ["security", "home"] は内部 ID へ正規化する。
 */
export const TESTER_ENABLED_MODULES_V1: string[] = [
  "security_floor_v1",
  "tisly_home_v1",
  "camera_preview_v1",
  "customer_portal",
];

/** 指示・旧別名 → 内部モジュール ID */
const TESTER_MODULE_ALIASES_V1: Record<string, string> = {
  security: "security_floor_v1",
  home: "tisly_home_v1",
  security_floor: "security_floor_v1",
  tisly_home: "tisly_home_v1",
};

/**
 * テスター画面から完全除外するモジュール。
 * 既存カタログは削除せず、表示だけ落とす。
 */
export const TESTER_HIDDEN_MODULE_IDS_V1: string[] = [
  "estimate_v1",
  "survey_v1",
  "survey",
  "documents_v1",
  "print_generator_v1",
  "print_model_viewer_v1",
  "floorplan_builder_v1",
  "price_cost_master_v1",
  "knowledge_module_v1",
  "project_dashboard_v1",
  "schedule_v1",
  "business",
  "admin",
  "voice_hub_v1",
  "device_binding_v1",
  "ops_deploy",
  "eco_water_v1",
  "gas_monitor_v1",
  "equipment_monitor_v1",
];

/**
 * お客様ホームで出すカード。
 * セキュリティと基本ダッシュボードのみ。
 */
export const TESTER_VISIBLE_HOME_CARD_IDS_V1: string[] = [
  "home_security",
  "tisly_home",
  "camera",
  "alerts",
  "notifications",
];

const TESTER_CODE_SET = new Set<string>(TESTER_TENANT_CODES_V1);

/** テスター専用テナントか */
export function isTesterTenantV1(
  customerCode: string | null | undefined
): boolean {
  const code = String(customerCode ?? "").trim().toUpperCase();
  return TESTER_CODE_SET.has(code);
}

/**
 * テスター向けモジュールを強制制限する。
 * "*" や業務モジュールが混入しても落とす。
 */
export function sanitizeTesterEnabledModulesV1(
  modules: string[] | null | undefined
): string[] {
  const allowed = new Set(TESTER_ENABLED_MODULES_V1);
  const src = Array.isArray(modules) ? modules : [];
  if (!src.length || src.includes("*")) {
    return [...TESTER_ENABLED_MODULES_V1];
  }
  const out: string[] = [];
  for (const raw of src) {
    const key = String(raw || "").trim();
    const id = TESTER_MODULE_ALIASES_V1[key] || key;
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out.length ? out : [...TESTER_ENABLED_MODULES_V1];
}

/** 業務・3D・見積モジュールを隠すか */
export function isTesterHiddenModuleV1(moduleId: string): boolean {
  const id = String(moduleId || "").trim();
  if (!id) return false;
  if (TESTER_ENABLED_MODULES_V1.includes(id)) return false;
  return TESTER_HIDDEN_MODULE_IDS_V1.includes(id);
}

/** お客様ホームカードをテスター向けに出すか */
export function isTesterHomeCardVisibleV1(cardId: string): boolean {
  return TESTER_VISIBLE_HOME_CARD_IDS_V1.includes(String(cardId || ""));
}
