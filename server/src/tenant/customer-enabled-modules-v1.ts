/**
 * 顧客別モジュール出し分け（テナント権限フィルター）
 * 既存顧客データは削除せず、有効モジュール定義を追記する。
 */

export type ModuleCategoryV1 =
  | "iot"
  | "business"
  | "portal"
  | "internal";

export interface ModuleCatalogEntryV1 {
  id: string;
  label: string;
  description: string;
  category: ModuleCategoryV1;
}

/** ホーム画面カード / PWA と対応するモジュール一覧 */
export const MODULE_CATALOG_V1: ModuleCatalogEntryV1[] = [
  {
    id: "tisly_home_v1",
    label: "TiSLY HOME",
    description: "住設・ホームIoT一元管理",
    category: "iot",
  },
  {
    id: "security_floor_v1",
    label: "TiSLY Security",
    description: "カメラ・防犯・フロア俯瞰",
    category: "iot",
  },
  {
    id: "radar_settings_v1",
    label: "ミリ波レーダー見守り",
    description: "距離ゲート・人感設定",
    category: "iot",
  },
  {
    id: "demand_security_v1",
    label: "電気デマンド・リレー",
    description: "主幹電流・ピークカット・遠隔",
    category: "iot",
  },
  {
    id: "gas_monitor_v1",
    label: "ガス見守り・ボンベ",
    description: "残量・要配送アラート",
    category: "iot",
  },
  {
    id: "eco_water_v1",
    label: "Eco-Water",
    description: "アルカリ排水の自動中和",
    category: "iot",
  },
  {
    id: "schedule_v1",
    label: "日程調整",
    description: "週間・月間カレンダー",
    category: "business",
  },
  {
    id: "survey_v1",
    label: "現調",
    description: "写真・部材・仕様書",
    category: "business",
  },
  {
    id: "estimate_v1",
    label: "見積・請求",
    description: "見積書・請求書 PDF",
    category: "business",
  },
  {
    id: "documents_v1",
    label: "Document Center",
    description: "案件書類の一元管理",
    category: "business",
  },
  {
    id: "project_dashboard_v1",
    label: "案件ダッシュボード",
    description: "今日の仕事の俯瞰",
    category: "business",
  },
  {
    id: "knowledge_module_v1",
    label: "ナレッジ",
    description: "現場ノウハウ検索",
    category: "business",
  },
  {
    id: "voice_hub_v1",
    label: "通話音声・クイック入力",
    description: "録音テキストから一発登録",
    category: "business",
  },
  {
    id: "price_cost_master_v1",
    label: "価格・原価マスター",
    description: "仕入・売価・粗利",
    category: "business",
  },
  {
    id: "device_binding_v1",
    label: "機器QR登録",
    description: "物件へデバイス登録",
    category: "business",
  },
  {
    id: "floorplan_builder_v1",
    label: "3Dフロアプラン",
    description: "方眼紙から俯瞰作成",
    category: "business",
  },
  {
    id: "print_model_viewer_v1",
    label: "3Dプリント",
    description: "STL 確認・印刷時間",
    category: "business",
  },
  // 3Dプリンター作成ジェネレーター（追記）
  {
    id: "print_generator_v1",
    label: "3Dプリンター作成",
    description: "現場パーツ・筐体 STL 生成",
    category: "business",
  },
  {
    id: "customer_mgmt",
    label: "顧客を見る",
    description: "お客様情報の一覧",
    // portal: 業務WF（現調/見積）と誤判定しない
    category: "portal",
  },
  {
    id: "installer",
    label: "施工",
    description: "現場設置・QR・同期",
    category: "business",
  },
  {
    id: "survey",
    label: "現調（レガシー）",
    description: "レガシー現調 PWA",
    category: "business",
  },
  {
    id: "business",
    label: "TOMS業務",
    description: "案件・工事・請求",
    category: "business",
  },
  {
    id: "maintenance",
    label: "保守",
    description: "Heartbeat・Recovery",
    category: "business",
  },
  {
    id: "admin",
    label: "管理",
    description: "顧客管理・設定",
    category: "business",
  },
  {
    id: "pro_remote",
    label: "監視（PRO Remote）",
    description: "遠隔オペレーション",
    category: "portal",
  },
  {
    id: "customer_portal",
    label: "顧客ポータル",
    description: "契約・現場・通知",
    category: "portal",
  },
  // ライブカメラプレビュー（追記）
  {
    id: "camera_preview_v1",
    label: "ライブカメラプレビュー",
    description: "H.View RTSP / WebRTC プレビュー",
    category: "portal",
  },
  // その他設備監視（追記）
  {
    id: "equipment_monitor_v1",
    label: "その他設備監視",
    description: "水質・ガス・電気・レーダー",
    category: "iot",
  },
  {
    id: "ops_deploy",
    label: "Deploy / 本番診断",
    description: "社内専用デプロイ・監査",
    category: "internal",
  },
];

/** 社内オペ（Deploy / 監査）を許可する顧客コード */
export const INTERNAL_OPS_CUSTOMER_CODES_V1 = ["TOMS001"] as const;

/**
 * 顧客コード別の既定有効モジュール。
 * "*" は全機能（社内管理者向け）。
 * 既存配列は追記のみ（削除禁止）。
 */
export const DEFAULT_ENABLED_MODULES_BY_CODE_V1: Record<
  string,
  string[]
> = {
  // 社内: 全機能 + 業務 + Deploy
  TOMS001: ["*"],
  // 戸建て・ホテル系: HOME / レーダー / デマンド
  HOTEL001: [
    "tisly_home_v1",
    "radar_settings_v1",
    "demand_security_v1",
    "customer_mgmt",
    "customer_portal",
    "pro_remote",
  ],
  // 店舗・工場系: Security / デマンド / ガス
  PLANT001: [
    "security_floor_v1",
    "demand_security_v1",
    "gas_monitor_v1",
    "customer_mgmt",
    "customer_portal",
    "pro_remote",
  ],
  // デモ戸建て例（CUST002）
  CUST002: [
    "tisly_home_v1",
    "radar_settings_v1",
    "demand_security_v1",
    "customer_portal",
    "customer_mgmt",
  ],
  // Demo Kit: HOME + Security 寄り
  DEMO001: [
    "tisly_home_v1",
    "security_floor_v1",
    "demand_security_v1",
    "radar_settings_v1",
    "customer_portal",
    "pro_remote",
    "customer_mgmt",
  ],
  // 豊島邸: Security + HOME のみ（追記）
  TOYOSHIMA001: [
    "tisly_home_v1",
    "security_floor_v1",
    "customer_portal",
  ],
  /** 旧コード互換 */
  TOSHIMA001: [
    "tisly_home_v1",
    "security_floor_v1",
    "customer_portal",
  ],
};

/** 未知顧客向けの安全な既定（IoT 最小セット） */
export const FALLBACK_CUSTOMER_MODULES_V1: string[] = [
  "tisly_home_v1",
  "security_floor_v1",
  "demand_security_v1",
  "customer_portal",
  "customer_mgmt",
];

export function isInternalOpsCustomerV1(customerCode: string): boolean {
  const code = String(customerCode || "").toUpperCase();
  return (INTERNAL_OPS_CUSTOMER_CODES_V1 as readonly string[]).includes(
    code
  );
}

export function normalizeModuleIdListV1(
  value: unknown
): string[] {
  if (!Array.isArray(value)) return [];
  const catalogIds = new Set(MODULE_CATALOG_V1.map((m) => m.id));
  const out: string[] = [];
  for (const raw of value) {
    const id = String(raw || "").trim();
    if (!id) continue;
    if (id === "*") {
      if (!out.includes("*")) out.push("*");
      continue;
    }
    if (catalogIds.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function resolveDefaultEnabledModulesV1(
  customerCode: string
): string[] {
  const code = String(customerCode || "").toUpperCase();
  const preset = DEFAULT_ENABLED_MODULES_BY_CODE_V1[code];
  if (preset?.length) return [...preset];
  return [...FALLBACK_CUSTOMER_MODULES_V1];
}

export function isModuleEnabledV1(
  enabledModules: string[] | null | undefined,
  moduleId: string
): boolean {
  if (!enabledModules || enabledModules.length === 0) return false;
  if (enabledModules.includes("*")) return true;
  return enabledModules.includes(moduleId);
}

export function filterItemsByEnabledModulesV1<
  T extends { id: string },
>(items: T[], enabledModules: string[] | null | undefined): T[] {
  if (!enabledModules || enabledModules.includes("*")) {
    return items;
  }
  const set = new Set(enabledModules);
  return items.filter((item) => set.has(item.id));
}

export function hasBusinessModulesV1(
  enabledModules: string[] | null | undefined
): boolean {
  if (!enabledModules) return false;
  if (enabledModules.includes("*")) return true;
  return MODULE_CATALOG_V1.some(
    (m) =>
      m.category === "business" && enabledModules.includes(m.id)
  );
}
