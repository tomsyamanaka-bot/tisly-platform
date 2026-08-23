import { normalizeRole } from "../auth/roles.js";

/** TiSLY Multi PWA App Hub — Phase 461–480 role-based app visibility */

function normalizePwaRole(role: string): string {
  if (role === "super_admin") return "admin";
  return normalizeRole(role);
}

export type PwaAppId =
  | "installer"
  | "survey"
  | "schedule_v1"
  | "survey_v1"
  | "estimate_v1"
  | "business"
  | "pro_remote"
  | "maintenance"
  | "customer_portal"
  | "admin";

export interface PwaAppCard {
  id: PwaAppId;
  label: string;
  description: string;
  href: (customerCode: string) => string;
  themeColor: string;
  optional?: boolean;
}

export const PWA_APP_CATALOG: Record<PwaAppId, PwaAppCard> = {
  installer: {
    id: "installer",
    label: "施工",
    description: "現場設置・QR・Map・オフライン同期",
    href: (code) => `/customer/${code}/install/home`,
    themeColor: "#1a7f37",
  },
  survey: {
    id: "survey",
    label: "現調",
    description: "案件・写真・図面・見積候補（レガシー）",
    href: () => "/survey",
    themeColor: "#2563eb",
  },
  schedule_v1: {
    id: "schedule_v1",
    label: "日程調整",
    description: "空き日をすぐ確認 — 週間・月間カレンダー",
    href: () => "/schedule-v1",
    themeColor: "#e8a54b",
  },
  survey_v1: {
    id: "survey_v1",
    label: "現調 v1",
    description: "実務現調PWA — 案件・写真・部材・見積引き渡し",
    href: () => "/survey-v1",
    themeColor: "#1a7f37",
  },
  estimate_v1: {
    id: "estimate_v1",
    label: "見積 v1",
    description: "実務見積PWA — 現調から作成・税込計算・PDF",
    href: () => "/estimate-v1",
    themeColor: "#0969da",
  },
  business: {
    id: "business",
    label: "TOMS業務",
    description: "案件・見積・工事・請求・入金",
    href: () => "/business",
    themeColor: "#0d9488",
  },
  pro_remote: {
    id: "pro_remote",
    label: "監視",
    description: "PRO Remote オペレーション",
    href: (code) => `/customer/${code}/pro-remote`,
    themeColor: "#7c3aed",
  },
  maintenance: {
    id: "maintenance",
    label: "保守",
    description: "デバイス・Heartbeat・Recovery",
    href: () => "/maintenance",
    themeColor: "#b45309",
  },
  customer_portal: {
    id: "customer_portal",
    label: "顧客ポータル",
    description: "契約・現場・通知・Recovery",
    href: (code) => `/customer/${code}`,
    themeColor: "#0ea5e9",
  },
  admin: {
    id: "admin",
    label: "管理",
    description: "顧客管理・設定",
    href: (code) => `/admin/${code}`,
    themeColor: "#334155",
  },
};

/** Role → visible PWA apps (Google TV excluded — not a PWA). */
export function getPwaAppsForRole(role: string, opts?: { installerSurveyOptional?: boolean }): PwaAppId[] {
  const r = normalizePwaRole(role);

  switch (r) {
    case "installer":
      if (opts?.installerSurveyOptional) return ["installer", "survey"];
      return ["installer"];
    case "surveyor":
      return ["schedule_v1", "survey_v1", "estimate_v1", "survey", "business"];
    case "maintenance":
      return ["maintenance", "installer"];
    case "viewer":
      return ["pro_remote", "customer_portal"];
    case "manager":
      return [
        "installer",
        "schedule_v1",
        "survey_v1",
        "estimate_v1",
        "survey",
        "business",
        "pro_remote",
        "maintenance",
        "customer_portal",
      ];
    case "owner":
    case "admin":
    case "super_admin":
      return [
        "installer",
        "schedule_v1",
        "survey_v1",
        "estimate_v1",
        "survey",
        "business",
        "pro_remote",
        "maintenance",
        "customer_portal",
        "admin",
      ];
    default:
      return ["customer_portal"];
  }
}

export function canAccessPwa(role: string, pwaId: PwaAppId): boolean {
  return getPwaAppsForRole(role).includes(pwaId);
}

export function buildHubCards(
  role: string,
  customerCode: string,
  opts?: { installerSurveyOptional?: boolean }
): Array<PwaAppCard & { url: string }> {
  return getPwaAppsForRole(role, opts).map((id) => {
    const card = PWA_APP_CATALOG[id];
    return { ...card, url: card.href(customerCode.toUpperCase()) };
  });
}

/** 実務 PWA 入口カード（App Hub 上部に表示） */
export type PracticalPwaStatus = "ready" | "coming_soon";

export interface PracticalPwaCard {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  features: string[];
  url: string | null;
  themeColor: string;
  status: PracticalPwaStatus;
  statusLabel: string;
}

const PRACTICAL_PWA_DEFS: Array<
  Omit<PracticalPwaCard, "url" | "status" | "statusLabel"> & {
    href: string | null;
    readyRoles: string[];
  }
> = [
  {
    id: "documents_v1",
    label: "Document Center",
    subtitle: "案件の書類・写真・図面を一元管理",
    icon: "📁",
    features: ["書類一覧", "QNAP連携", "検索", "プレビュー"],
    href: "/documents-v1",
    themeColor: "#6366f1",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  {
    id: "project_dashboard_v1",
    label: "案件ダッシュボード",
    subtitle: "今日の仕事が一目でわかる",
    icon: "📊",
    features: ["案件件数", "今日の予定", "要対応", "売上集計"],
    href: "/project-dashboard-v1",
    themeColor: "#4f6fa8",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  {
    id: "schedule_v1",
    label: "日程を調整する",
    subtitle: "空き日をすぐ確認",
    icon: "📅",
    features: ["週間カード", "3週間サマリー", "月間表示", "現場不可の登録"],
    href: "/schedule-v1",
    themeColor: "#e8a54b",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  {
    id: "survey_v1",
    label: "現調する",
    subtitle: "お客様の現場を見に行く記録",
    icon: "📋",
    features: ["写真を撮る", "メモする", "部材を選ぶ", "見積へ送る"],
    href: "/survey-v1",
    themeColor: "#5cb87a",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  {
    id: "estimate_v1",
    label: "見積を作る",
    subtitle: "お仕事の料金をまとめる",
    icon: "💰",
    features: ["現調から見積作成", "数量・単価を直す", "PDFプレビュー", "見積を確定"],
    href: "/estimate-v1",
    themeColor: "#4a90d9",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  {
    id: "work_report",
    label: "作業報告する",
    subtitle: "工事が終わったあとの報告",
    icon: "📝",
    features: ["写真で報告", "お客様へ送る", "履歴を見る"],
    href: null,
    themeColor: "#e8a54b",
    readyRoles: [],
  },
  {
    id: "customer_mgmt",
    label: "顧客を見る",
    subtitle: "お客様の情報をまとめて見る",
    icon: "👥",
    features: ["お客様一覧", "連絡先", "契約・施工情報", "警報・操作ログ"],
    href: "/customer-view-v1",
    themeColor: "#7c6fd6",
    readyRoles: [
      "surveyor",
      "manager",
      "owner",
      "admin",
      "super_admin",
      "viewer",
    ],
  },
  {
    id: "inventory",
    label: "在庫を見る",
    subtitle: "部材の残り数を確認",
    icon: "📦",
    features: ["在庫一覧", "入出庫", "発注の目安"],
    href: null,
    themeColor: "#6a737d",
    readyRoles: [],
  },
  {
    id: "knowledge_module_v1",
    label: "ナレッジを見る",
    subtitle: "現場のノウハウ・アイデアを検索する",
    icon: "💡",
    features: ["ナレッジ検索", "現場メモ", "アイデア共有", "QNAP連携"],
    href: "/knowledge-module-v1",
    themeColor: "#0d9488",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  {
    id: "print_model_viewer_v1",
    label: "3Dプリントを見る",
    subtitle: "STL をグリグリ確認・印刷時間ダッシュボード",
    icon: "🖨",
    features: ["Three.js 3D表示", "印刷時間", "ノズル温度", "レイヤー数"],
    href: "/print-model-viewer",
    themeColor: "#0ea5e9",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin"],
  },
  // TiSLY Eco-Water — アルカリ排水自動中和デモ（追記）
  {
    id: "eco_water_v1",
    label: "Eco-Water（排水中和）",
    subtitle: "生コン・工場向けアルカリ排水の自動中和",
    icon: "💧",
    features: ["pHリアルタイム", "CO₂バルブ連動", "デモ中和", "放流証明書"],
    href: "/eco-water-v1",
    themeColor: "#1e3a8a",
    readyRoles: ["surveyor", "manager", "owner", "admin", "super_admin", "viewer"],
  },
  // ガス見守り・ボンベ配送（追記）
  {
    id: "gas_monitor_v1",
    label: "ガス見守り・ボンベ",
    subtitle: "自動検針・残量・要配送アラート",
    icon: "🔥",
    features: ["積算パルス", "ボンベ残量%", "要配送ソート", "緊急遮断"],
    href: "/gas-monitor-v1",
    themeColor: "#1e3a8a",
    readyRoles: [
      "surveyor",
      "manager",
      "owner",
      "admin",
      "super_admin",
      "viewer",
    ],
  },
  // ミリ波レーダー BLE 設定（追記）
  {
    id: "radar_settings_v1",
    label: "ミリ波レーダー設定",
    subtitle: "HLK-LD2410C · 距離ゲート · 感度",
    icon: "📡",
    features: ["BLE接続", "3方向CH", "距離ゲート", "Flash保存"],
    href: "/radar-settings-v1",
    themeColor: "#1e3a8a",
    readyRoles: [
      "surveyor",
      "manager",
      "owner",
      "admin",
      "super_admin",
    ],
  },
  // 電気デマンド＆セキュリティ（追記）
  {
    id: "demand_security_v1",
    label: "電気デマンド・防犯",
    subtitle: "主幹電流・ピークカット・リレー遠隔",
    icon: "⚡",
    features: [
      "主幹電流A",
      "ピークカット",
      "100V/200Vリレー",
      "施錠・人感",
    ],
    href: "/demand-security-v1",
    themeColor: "#1e3a8a",
    readyRoles: [
      "surveyor",
      "manager",
      "owner",
      "admin",
      "super_admin",
      "viewer",
    ],
  },
  // TiSLY HOME 住設・ホームIoT統合（追記）
  {
    id: "tisly_home_v1",
    label: "TiSLY HOME（住設統合）",
    subtitle: "分電盤CT・給湯・空調・玄関錠を一元管理",
    icon: "🏠",
    features: [
      "主幹CT・デマンド",
      "湯はり・追いだき",
      "エアコン制御",
      "スマートロック",
    ],
    href: "/home-v1",
    themeColor: "#0f172a",
    readyRoles: [
      "surveyor",
      "installer",
      "maintenance",
      "manager",
      "owner",
      "admin",
      "super_admin",
      "viewer",
    ],
  },
  // RP2350 QR物件登録（追記）
  {
    id: "device_binding_v1",
    label: "機器をQR登録",
    subtitle: "物件を選び、カメラで1秒登録",
    icon: "📷",
    features: [
      "物件を選ぶ",
      "QRを読み取る",
      "接続を即時確認",
      "シール印刷",
    ],
    href: "/device-binding-v1",
    themeColor: "#1e3a8a",
    readyRoles: [
      "surveyor",
      "installer",
      "maintenance",
      "manager",
      "owner",
      "admin",
      "super_admin",
    ],
  },
  // 価格・原価マスター（追記）
  {
    id: "price_cost_master_v1",
    label: "価格・原価マスター",
    subtitle: "仕入・売価・粗利を現場で即確認",
    icon: "💰",
    features: [
      "材料・パーツ原価",
      "月額サブスク",
      "標準工事単価",
      "粗利率カード",
    ],
    href: "/price-cost-master-v1",
    themeColor: "#1e3a8a",
    readyRoles: [
      "surveyor",
      "installer",
      "maintenance",
      "manager",
      "owner",
      "admin",
      "super_admin",
    ],
  },
  // ホームセキュリティ フロア俯瞰（追記）
  {
    id: "security_floor_v1",
    label: "TiSLY Security",
    subtitle: "3D俯瞰・実機センサー/ライト動的設定・発報発光・警備モード",
    icon: "🛡️",
    features: [
      "3D俯瞰・RP2350遠隔設定",
      "センサー/ライト動的制御",
      "発報発光・警備モード",
      "JP/AU物件",
    ],
    href: "/security-v1",
    themeColor: "#1e3a8a",
    readyRoles: [
      "surveyor",
      "installer",
      "maintenance",
      "manager",
      "owner",
      "admin",
      "super_admin",
      "viewer",
    ],
  },
  // 3D Floorplan Builder（追記）
  {
    id: "floorplan_builder_v1",
    label: "3Dフロアプランビルダー",
    subtitle: "方眼紙スキャン・アイソメ俯瞰・Security送信",
    icon: "📐",
    features: [
      "方眼紙写真読込",
      "1F/2F/外周タブ",
      "3D斜め俯瞰",
      "Security連携",
    ],
    href: "/builder",
    themeColor: "#0d1528",
    readyRoles: [
      "surveyor",
      "installer",
      "maintenance",
      "manager",
      "owner",
      "admin",
      "super_admin",
    ],
  },
];

export function buildPracticalHubCards(role: string): PracticalPwaCard[] {
  const r = normalizePwaRole(role);
  return PRACTICAL_PWA_DEFS.map((def) => {
    const ready = def.readyRoles.includes(r) || def.readyRoles.includes(role);
    return {
      id: def.id,
      label: def.label,
      subtitle: def.subtitle,
      icon: def.icon,
      features: def.features,
      url: ready && def.href ? def.href : null,
      themeColor: def.themeColor,
      status: ready ? "ready" : "coming_soon",
      statusLabel: ready ? "使えます" : "準備中",
    };
  });
}

/** manager 以上のみデプロイ系カードを表示 */
export function showOpsPanelsForRole(role: string): boolean {
  const r = normalizePwaRole(role);
  return ["manager", "owner", "admin", "super_admin"].includes(r) || role === "super_admin";
}
