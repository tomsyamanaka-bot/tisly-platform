import { Router } from "express";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { buildDeployDryRun, buildReleaseGateInfo, } from "../../deploy/deploy-dry-run.js";
import { buildDeployPreflight } from "../../deploy/deploy-preflight.js";
import { getBuildVersion } from "../../deploy/build-version.js";
import { buildProductionReadiness } from "../../deploy/production-readiness.js";
import { buildProductionUrlAudit } from "../../deploy/production-url-audit.js";
import { buildVpsDeployStatus } from "../../deploy/vps-deploy-status.js";
import { appendDeployHistory, buildDeployCenterStatus, listByType, listDeployHistory, } from "../../deploy/deploy-history.js";
import { buildProductionAudit } from "../../deploy/production-audit.js";
import { getHealthMonitorLogTail, probeHealth } from "../../deploy/health-monitor.js";
import { buildPwaInstallAudit } from "../../pwa/pwa-install-audit.js";
import { buildPwaIconCheck } from "../../pwa/pwa-icon-check.js";
import { buildCustomerLoginCheck } from "../../deploy/customer-login-check.js";
import { buildRealDataMigrationCheck } from "../../deploy/real-data-migration-check.js";
import { buildPhase2300ProductionCheck } from "../../deploy/phase2300-production-check.js";
import { buildPhase2350ProductionCheck } from "../../deploy/phase2350-production-check.js";
import { buildPhase2380ProductionCheck } from "../../deploy/phase2380-production-check.js";
import { buildPhase2381ProductionCheck } from "../../deploy/phase2381-production-check.js";
import { buildPhase2383ProductionCheck } from "../../deploy/phase2383-production-check.js";
import { buildPhase2384ProductionCheck } from "../../deploy/phase2384-production-check.js";
import { buildPhase2385ProductionCheck } from "../../deploy/phase2385-production-check.js";
import { buildPhase2386ProductionCheck } from "../../deploy/phase2386-production-check.js";
import { buildSwitchBotDeploymentChecklist } from "../../security-automation/switchbot-release-gate.js";
import { getSecurityState } from "../../services/securityAutomationService.js";
import { getSwitchBotMode, isRealUnlockGuarded } from "../../services/switchbotService.js";
import { getAutomationSettings } from "../../security-automation/security-automation-store.js";
import { config } from "../../config.js";
import { buildDeployLayoutAudit } from "../../deploy/deploy-layout-audit.js";
import { buildDeployRehearsalChecklist } from "../../deploy/deploy-rehearsal-checklist.js";
import { buildProductionSimulation, buildPwaRehearsalAudit, buildSecurityRehearsalAudit, buildTvRehearsalAudit, buildUrlCheck, } from "../../deploy/production-rehearsal.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..", "..", "..");
export const deployRouter = Router();
/** Phase 1291–1320 — デプロイ dry-run 結果（秘密情報なし） */
deployRouter.get("/dry-run", (_req, res) => {
    res.json(buildDeployDryRun());
});
/** Phase 1321–1340 — SwitchBot 導入チェックリスト項目 */
deployRouter.get("/switchbot-checklist", (_req, res) => {
    res.json({ phase: "1321-1340", items: buildSwitchBotDeploymentChecklist() });
});
/** Phase 1321–1340 — Security Automation 公開ステータス（認証不要） */
deployRouter.get("/security-automation-status", (_req, res) => {
    res.json({
        switchbotMode: getSwitchBotMode(),
        securityState: getSecurityState().mode,
        realUnlockGuarded: isRealUnlockGuarded(),
        eventLogEnabled: config.securityAutomation.eventLogEnabled,
        settings: getAutomationSettings(),
    });
});
/** Phase 1381–1400 — 本番 URL 監査 */
deployRouter.get("/url-audit", (_req, res) => {
    res.json(buildProductionUrlAudit());
});
/** Phase 1381–1400 — PWA インストール監査 */
deployRouter.get("/pwa-install-audit", (_req, res) => {
    res.json(buildPwaInstallAudit());
});
/** Phase 2041–2080 — PWA アイコン本番確認（新アイコン URL / manifest バージョン） */
deployRouter.get("/pwa-icon-check", (_req, res) => {
    res.json(buildPwaIconCheck());
});
/** Phase 2161–2200 — 顧客ログイン本番確認 */
deployRouter.get("/customer-login-check", (_req, res) => {
    res.json(buildCustomerLoginCheck());
});
/** Phase 2201–2250 — 実データ移行チェック */
deployRouter.get("/real-data-check", (_req, res) => {
    res.json(buildRealDataMigrationCheck());
});
/** Phase 2251–2300 — 本番化完了チェック（レガシー） */
deployRouter.get("/production-check-2300", (_req, res) => {
    res.json(buildPhase2300ProductionCheck());
});
/** Phase 2301–2350 — Gmail SMTP 実運用チェック（レガシー） */
deployRouter.get("/production-check-2350", (_req, res) => {
    res.json(buildPhase2350ProductionCheck());
});
/** Phase 2351–2380 — 管理者パスワードハッシュ整備（レガシー） */
deployRouter.get("/production-check-2380", (_req, res) => {
    res.json(buildPhase2380ProductionCheck());
});
/** Phase 2381–2400 — 管理者パスワード復旧（レガシー） */
deployRouter.get("/production-check-2381", (_req, res) => {
    res.json(buildPhase2381ProductionCheck());
});
/** Phase 2383 — Gmail 通知経路（SMTP + test-email 準備）レガシー */
deployRouter.get("/production-check-2383", (_req, res) => {
    res.json(buildPhase2383ProductionCheck());
});
/** Phase 2384 — Gmail 実送信確認（test-email 成功 + lastSendStatus=sent）レガシー */
deployRouter.get("/production-check-2384", (_req, res) => {
    res.json(buildPhase2384ProductionCheck());
});
/** Phase 2385 — Gmail PDF 添付テストメール（本文に認証情報なし）レガシー */
deployRouter.get("/production-check-2385", (_req, res) => {
    res.json(buildPhase2385ProductionCheck());
});
/** Phase 2386 — App Hub Gmail テスト UI（単一モーダル） */
deployRouter.get("/production-check", (_req, res) => {
    res.json(buildPhase2386ProductionCheck());
});
/** Phase 1441–1460 — 本番設定監査（不足一覧） */
deployRouter.get("/preflight", (_req, res) => {
    res.json(buildDeployPreflight());
});
/** Phase 1291–1320 — Release Gate 状態（dry-run 構造 + gate メタ） */
deployRouter.get("/release-gate", (_req, res) => {
    const dryRun = buildDeployDryRun(undefined, { includeReleaseGate: true });
    const releaseGate = buildReleaseGateInfo(dryRun);
    const readiness = buildProductionReadiness({
        ...dryRun,
        releaseGate,
    });
    res.json({
        ...dryRun,
        releaseGate,
        productionReadiness: readiness,
        vpsDeployStatus: buildVpsDeployStatus({ ...dryRun, releaseGate }),
        deployCenter: buildDeployCenterStatus(),
        buildVersion: getBuildVersion(),
        urlAudit: buildProductionUrlAudit(),
        pwaInstallAudit: buildPwaInstallAudit(),
    });
});
/** Phase 1461–1500 — Deploy Center 状態 */
deployRouter.get("/center", (_req, res) => {
    res.json({
        ...buildDeployCenterStatus(),
        buildVersion: getBuildVersion(),
        healthProbe: probeHealth(),
    });
});
/** Phase 1461–1500 — バージョン / デプロイ履歴 */
deployRouter.get("/history", (_req, res) => {
    res.json({
        phase: "1461-1500-conoha-vps-auto-deploy",
        builds: listByType("build", 30),
        deploys: listByType("deploy", 30),
        rollbacks: listByType("rollback", 30),
        all: listDeployHistory(50),
        buildVersion: getBuildVersion(),
    });
});
/** Phase 1461–1500 — 本番統合監査 */
deployRouter.get("/audit", async (_req, res) => {
    res.json(await buildProductionAudit());
});
/** Phase 1461–1500 — ヘルスモニター状態 */
deployRouter.get("/health-monitor", (_req, res) => {
    res.json({
        enabled: process.env.HEALTH_MONITOR_ENABLED === "true",
        cron: process.env.HEALTH_MONITOR_CRON || "*/5 * * * *",
        lastProbe: probeHealth(),
        recentLog: getHealthMonitorLogTail(30),
    });
});
function verifyDeployOpsToken(req) {
    const token = process.env.DEPLOY_OPS_TOKEN?.trim();
    if (!token)
        return false;
    return req.header("X-Deploy-Ops-Token") === token;
}
/** Phase 1681–1720 — リポジトリ構成監査（server/public 標準 · web/ 不要） */
deployRouter.get("/layout-audit", (_req, res) => {
    res.json(buildDeployLayoutAudit());
});
/** Phase 1801–1840 — VPS Production Start Command Finalize（リハーサルチェックリスト） */
deployRouter.get("/rehearsal-checklist", (_req, res) => {
    res.json(buildDeployRehearsalChecklist());
});
/** Phase 1581–1620 — Production Deployment Rehearsal（総合シミュレーション） */
deployRouter.get("/simulate", (_req, res) => {
    res.json(buildProductionSimulation());
});
/** Phase 1581–1620 — URL Validator（9 ルート × HTTP/manifest/SW/icon） */
deployRouter.get("/url-check", (_req, res) => {
    res.json(buildUrlCheck());
});
/** Phase 1581–1620 — PWA 監査（installReady / manifest / sw / offline / standalone / icon） */
deployRouter.get("/pwa-audit", (_req, res) => {
    res.json(buildPwaRehearsalAudit());
});
/** Phase 1581–1620 — Google TV 監査 */
deployRouter.get("/tv-audit", (_req, res) => {
    res.json(buildTvRehearsalAudit());
});
/** Phase 1581–1620 — Security 監査 */
deployRouter.get("/security-audit", (_req, res) => {
    res.json(buildSecurityRehearsalAudit());
});
/** Phase 1461–1500 — ロールバック（DEPLOY_OPS_TOKEN 必須） */
deployRouter.post("/rollback", (req, res) => {
    if (!verifyDeployOpsToken(req)) {
        res.status(403).json({ error: "DEPLOY_OPS_TOKEN required (X-Deploy-Ops-Token header)" });
        return;
    }
    const scriptPath = process.env.DEPLOY_ROLLBACK_SCRIPT || path.join(repoRoot, "scripts", "rollback.sh");
    let commit = "unknown";
    try {
        commit = execSync("git rev-parse HEAD", {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
        }).trim();
    }
    catch {
        /* dev environment */
    }
    const version = getBuildVersion();
    const entry = appendDeployHistory({
        type: "rollback",
        commit,
        commitShort: commit === "unknown" ? "unknown" : commit.slice(0, 7),
        build: version.build,
        status: "pending",
        message: "rollback requested via Deploy Center",
        actor: "deploy-center-api",
    });
    if (process.env.DEPLOY_ROLLBACK_EXEC === "true" && process.platform !== "win32") {
        try {
            execSync(`bash "${scriptPath}"`, {
                cwd: repoRoot,
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 300_000,
            });
            appendDeployHistory({
                type: "rollback",
                commit,
                commitShort: commit.slice(0, 7),
                build: version.build,
                status: "rolled_back",
                message: "rollback script completed",
                actor: "deploy-center-api",
            });
            res.json({ ok: true, entry, executed: true });
            return;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            appendDeployHistory({
                type: "rollback",
                commit,
                commitShort: commit.slice(0, 7),
                build: version.build,
                status: "failed",
                message: msg,
                actor: "deploy-center-api",
            });
            res.status(500).json({ ok: false, error: msg, entry });
            return;
        }
    }
    res.json({
        ok: true,
        entry,
        executed: false,
        hint: "Set DEPLOY_ROLLBACK_EXEC=true on VPS or run scripts/rollback.sh manually",
    });
});
