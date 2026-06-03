import { getDatabase } from "../db/database.js";

export interface HubWorkflowLink {
  id: string;
  label: string;
  description: string;
  href: string;
  count?: number;
}

export function buildHubWorkflowLinks(customerCode: string, role: string): HubWorkflowLink[] {
  const code = customerCode.toUpperCase();
  const links: HubWorkflowLink[] = [];

  const activeSurveys = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM survey_projects WHERE customer_code = ? AND status IN ('draft', 'active')`
      )
      .get(code) as { c: number }
  ).c;

  const pendingAi = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM survey_projects sp
         WHERE sp.customer_code = ? AND sp.status IN ('draft', 'active')
         AND NOT EXISTS (SELECT 1 FROM survey_ai_intakes ai WHERE ai.project_id = sp.project_id)`
      )
      .get(code) as { c: number }
  ).c;

  const floorMapReady = (
    getDatabase()
      .prepare(`SELECT COUNT(*) as c FROM survey_floor_map_links WHERE customer_code = ?`)
      .get(code) as { c: number }
  ).c;

  const maintCases = (
    getDatabase()
      .prepare(
        `SELECT COUNT(*) as c FROM maintenance_cases WHERE customer_code = ? AND status IN ('open', 'in_progress')`
      )
      .get(code) as { c: number }
  ).c;

  if (roleMeetsSurvey(role)) {
    links.push({
      id: "survey_active",
      label: "現調中案件",
      description: "進行中の現調プロジェクト",
      href: "/survey",
      count: activeSurveys,
    });
    links.push({
      id: "survey_unsynced",
      label: "未同期あり",
      description: "現調PWAでオフライン保存 → オンライン時に同期",
      href: "/survey",
    });
    links.push({
      id: "survey_ai_pending",
      label: "AI解析待ち",
      description: "AI Intake 未実行の案件",
      href: "/survey",
      count: pendingAi,
    });
    links.push({
      id: "survey_pro_map",
      label: "PRO Map生成済み",
      description: "PRO Remote フロアマップ連携済み",
      href: `/customer/${code}/pro-remote`,
      count: floorMapReady,
    });
  }

  if (roleMeetsMaintenance(role)) {
    links.push({
      id: "maint_cases",
      label: "保守ケースあり",
      description: "オープンな保守案件",
      href: "/maintenance",
      count: maintCases,
    });
  }

  return links;
}

function roleMeetsSurvey(role: string): boolean {
  return ["surveyor", "manager", "owner", "admin", "super_admin"].includes(role);
}

function roleMeetsMaintenance(role: string): boolean {
  return ["maintenance", "manager", "owner", "admin", "super_admin"].includes(role);
}
