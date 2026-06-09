import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FIELD_ASSET_KINDS } from "./field-asset-registry.js";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const serverRoot = path.join(repoRoot, "server");
const publicDir = path.join(serverRoot, "public");
function fileExists(rel) {
    return fs.existsSync(path.join(publicDir, rel));
}
function serverFileExists(rel) {
    return fs.existsSync(path.join(serverRoot, rel));
}
function fileContains(rel, needle) {
    const full = path.join(publicDir, rel);
    if (!fs.existsSync(full))
        return false;
    return fs.readFileSync(full, "utf8").includes(needle);
}
export function buildFieldOperationsAudit() {
    const surveyReady = fileExists("survey.html") &&
        fileExists("js/survey.js") &&
        fileContains("survey.html", "btn-survey-new-case") &&
        fileContains("survey.html", "survey-category-bar");
    const projectReady = fileExists("project-dashboard.html") &&
        fileExists("js/project-dashboard.js") &&
        fileContains("project-dashboard.html", "btn-field-pro-remote") &&
        fileContains("js/project-dashboard.js", "bindFieldActionButtons");
    const installReady = fileExists("installer-home.html") &&
        fileContains("installer-home.html", "installer-workflow") &&
        fileContains("installer-home.html", "card-checklist");
    const maintenanceReady = fileExists("maintenance.html") &&
        fileContains("maintenance.html", "maint-dashboard") &&
        fileContains("maintenance.html", "maint-next-date");
    const customerHandoverReady = fileExists("customer-portal.html") &&
        fileContains("customer-portal.html", "handover-card") &&
        fileContains("js/customer-portal.js", "loadHandoverCard");
    const proRemoteLinked = fileExists("js/pro-remote-floor-map.js") &&
        fs.existsSync(path.join(serverRoot, "src/pro-remote/pro-remote-field-media.ts")) &&
        fileContains("js/pro-remote-floor-map.js", "floor-map-field-media");
    const checks = [
        {
            id: "survey_pwa",
            area: "現調PWA",
            label: "新規現調・GPS・分類写真・AI見積",
            status: surveyReady ? "pass" : "fail",
            path: "/survey",
            api: "/api/survey/*",
        },
        {
            id: "project_dashboard",
            area: "案件司令塔",
            label: "現調→見積→施工→引渡しカード",
            status: projectReady ? "pass" : "fail",
            path: "/project/:id",
            api: "/api/toms/projects/:id/dashboard",
        },
        {
            id: "estimate_v4",
            area: "見積連携",
            label: "AI見積 v4 + PRO Remote同期",
            status: serverFileExists("src/field-operations/pro-remote-sync.ts") ? "pass" : "warn",
            path: "/project/:id",
            api: "/api/field-operations/projects/:id/estimate-v4",
        },
        {
            id: "install_pwa",
            area: "施工PWA",
            label: "縦並び施工フロー（7ステップ）",
            status: installReady ? "pass" : "warn",
            path: "/customer/:code/install/home",
            api: "/api/customer/:code/install/*",
        },
        {
            id: "maintenance_pwa",
            area: "保守PWA",
            label: "点検・部材・Shelly・次回点検 1画面",
            status: maintenanceReady ? "pass" : "fail",
            path: "/maintenance",
            api: "/api/maintenance/*",
        },
        {
            id: "customer_handover",
            area: "顧客引渡し",
            label: "引渡し確認カード",
            status: customerHandoverReady ? "pass" : "warn",
            path: "/customer/:code",
            api: "/api/customer/:code/handover",
        },
        {
            id: "pro_remote",
            area: "PRO Remote",
            label: "外周/1F/2F + 現調・施工メディア",
            status: proRemoteLinked ? "pass" : "warn",
            path: "/customer/:code/pro-remote",
            api: "/api/customer/:code/pro-remote/floor-stack",
        },
        {
            id: "assets",
            area: "資産管理",
            label: `一覧 ${FIELD_ASSET_KINDS.join(" / ")}`,
            status: fileExists("assets.html") ? "pass" : "warn",
            path: "/assets",
            api: "/api/field-operations/assets",
        },
        {
            id: "business_kpi",
            area: "KPI",
            label: "売上・粗利・保守契約・月別・未請求",
            status: "pass",
            path: "/business",
            api: "/api/field-operations/kpi",
        },
        {
            id: "docs",
            area: "ドキュメント",
            label: "field_operations_v1.md Phase 1681",
            status: fs.existsSync(path.join(repoRoot, "docs", "field_operations_v1.md")) &&
                fs.readFileSync(path.join(repoRoot, "docs", "field_operations_v1.md"), "utf8").includes("Phase 1681")
                ? "pass"
                : "warn",
            path: "docs/field_operations_v1.md",
        },
    ];
    const readinessFlags = [
        surveyReady,
        projectReady,
        installReady,
        maintenanceReady,
        customerHandoverReady,
        proRemoteLinked,
        checks.find((c) => c.id === "estimate_v4")?.status === "pass",
    ];
    const readyCount = readinessFlags.filter(Boolean).length;
    const fieldReadyRate = Math.round((readyCount / readinessFlags.length) * 100);
    const passCount = checks.filter((c) => c.status === "pass").length;
    const total = checks.length;
    const readyRate = Math.round((passCount / total) * 100);
    let verdict = "FIELD_NOT_READY";
    if (fieldReadyRate >= 85 && surveyReady && projectReady && maintenanceReady) {
        verdict = "FIELD_READY";
    }
    else if (fieldReadyRate >= 50) {
        verdict = "FIELD_WARNING";
    }
    const fieldReady = verdict === "FIELD_READY";
    return {
        phase: "1681-1720",
        generatedAt: new Date().toISOString(),
        checks,
        passCount,
        total,
        readyRate,
        fieldReadyRate,
        surveyReady,
        projectReady,
        installReady,
        maintenanceReady,
        customerHandoverReady,
        proRemoteLinked,
        verdict,
        fieldReady,
    };
}
