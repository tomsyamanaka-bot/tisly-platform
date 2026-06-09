import { getDatabase } from "../db/database.js";
import { countProjectsByStatus } from "../business/business-store.js";
export function buildHubWorkflowLinks(customerCode, role) {
    const code = customerCode.toUpperCase();
    const links = [];
    const activeSurveys = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM survey_projects WHERE customer_code = ? AND status IN ('draft', 'active')`)
        .get(code).c;
    const pendingAi = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM survey_projects sp
         WHERE sp.customer_code = ? AND sp.status IN ('draft', 'active')
         AND NOT EXISTS (SELECT 1 FROM survey_ai_intakes ai WHERE ai.project_id = sp.project_id)`)
        .get(code).c;
    const floorMapReady = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM survey_floor_map_links WHERE customer_code = ?`)
        .get(code).c;
    const maintCases = getDatabase()
        .prepare(`SELECT COUNT(*) as c FROM maintenance_cases WHERE customer_code = ? AND status IN ('open', 'in_progress')`)
        .get(code).c;
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
    if (roleMeetsBusiness(role)) {
        links.push({
            id: "business_pwa",
            label: "TOMS業務PWA",
            description: "案件・見積・工事・請求の業務フロー",
            href: "/business",
        });
        links.push({
            id: "business_new",
            label: "新規案件あり",
            description: "現調予定の入力が必要",
            href: "/business/projects?status=new",
            count: countProjectsByStatus(["new"]),
        });
        links.push({
            id: "business_survey_scheduled",
            label: "現調予定あり",
            description: "現調当日の準備・入力",
            href: "/business/projects?status=survey_scheduled",
            count: countProjectsByStatus(["survey_scheduled"]),
        });
        links.push({
            id: "business_estimate_pending",
            label: "見積作成待ち",
            description: "現調完了 — 見積作成",
            href: "/business/projects?status=survey_done",
            count: countProjectsByStatus(["survey_done"]),
        });
        links.push({
            id: "business_construction",
            label: "工事予定あり",
            description: "工事日程・施工写真",
            href: "/business/projects?status=construction_scheduled",
            count: countProjectsByStatus(["construction_scheduled", "accepted"]),
        });
        links.push({
            id: "business_invoice_pending",
            label: "請求待ち",
            description: "完了報告・請求書作成",
            href: "/business/projects",
            count: countProjectsByStatus([
                "construction_done",
                "completion_report_created",
                "invoice_created",
            ]),
        });
        links.push({
            id: "business_payment_pending",
            label: "入金待ち",
            description: "入金予定・入金確認",
            href: "/business/projects?status=payment_scheduled",
            count: countProjectsByStatus(["payment_scheduled", "invoice_sent_to_owner"]),
        });
        links.push({
            id: "business_drawing_pwa",
            label: "Drawing PWA",
            description: "施工図・記号配置・ルート描画",
            href: "/business",
        });
        links.push({
            id: "business_specification_pdf",
            label: "Specification PDF",
            description: "仕様書PDF生成",
            href: "/business",
        });
        links.push({
            id: "business_drawing_estimate",
            label: "Drawing → Estimate Candidate",
            description: "施工図から見積候補を作成",
            href: "/business",
        });
        links.push({
            id: "toms_unified_dashboard",
            label: "案件ダッシュボード",
            description: "案件中心の統合ビュー /project/:id",
            href: "/business/projects",
        });
        links.push({
            id: "toms_customer_master",
            label: "顧客台帳",
            description: "Customer Master /customer-master",
            href: "/customer-master",
        });
        links.push({
            id: "toms_kpi",
            label: "TOMS KPI",
            description: "売上・未請求・未入金",
            href: "/business/kpi",
        });
    }
    return links;
}
/** owner / admin 向け Push・通知導線（RC2 App Hub） */
export function buildHubNotificationLinks(role) {
    if (!roleMeetsNotification(role))
        return [];
    return [
        {
            id: "notification_center",
            label: "通知センター",
            description: "送信ログ・既読・再送",
            href: "/app/notifications",
            themeColor: "#1a7f37",
        },
        {
            id: "push_register",
            label: "Push登録",
            description: "Web Push 購読・SW 状態確認",
            href: "/app/push",
            themeColor: "#7c3aed",
        },
        {
            id: "notification_test",
            label: "通知テスト",
            description: "テスト Push をこの端末へ送信",
            href: "/app/push#notification-test",
            themeColor: "#0ea5e9",
        },
    ];
}
function roleMeetsNotification(role) {
    return ["owner", "admin", "super_admin"].includes(role);
}
function roleMeetsSurvey(role) {
    return ["surveyor", "manager", "owner", "admin", "super_admin"].includes(role);
}
function roleMeetsMaintenance(role) {
    return ["maintenance", "manager", "owner", "admin", "super_admin"].includes(role);
}
function roleMeetsBusiness(role) {
    return ["surveyor", "manager", "owner", "admin", "super_admin"].includes(role);
}
