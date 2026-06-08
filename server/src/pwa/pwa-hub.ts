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
    features: ["お客様一覧", "連絡先", "案件の履歴"],
    href: null,
    themeColor: "#7c6fd6",
    readyRoles: [],
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
