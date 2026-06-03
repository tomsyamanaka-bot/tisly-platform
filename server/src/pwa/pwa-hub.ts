import { normalizeRole } from "../auth/roles.js";

/** TiSLY Multi PWA App Hub — Phase 461–480 role-based app visibility */

function normalizePwaRole(role: string): string {
  if (role === "super_admin") return "admin";
  return normalizeRole(role);
}

export type PwaAppId =
  | "installer"
  | "survey"
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
    description: "案件・写真・図面・見積候補",
    href: () => "/survey",
    themeColor: "#2563eb",
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
      return ["survey", "business"];
    case "maintenance":
      return ["maintenance", "installer"];
    case "viewer":
      return ["pro_remote", "customer_portal"];
    case "manager":
      return ["installer", "survey", "business", "pro_remote", "maintenance", "customer_portal"];
    case "owner":
    case "admin":
    case "super_admin":
      return [
        "installer",
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
