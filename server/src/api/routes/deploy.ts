import { Router } from "express";
import {
  buildDeployDryRun,
  buildReleaseGateInfo,
} from "../../deploy/deploy-dry-run.js";
import { buildSwitchBotDeploymentChecklist } from "../../security-automation/switchbot-release-gate.js";
import { getSecurityState } from "../../services/securityAutomationService.js";
import { getSwitchBotMode, isRealUnlockGuarded } from "../../services/switchbotService.js";
import { getAutomationSettings } from "../../security-automation/security-automation-store.js";
import { config } from "../../config.js";

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

/** Phase 1291–1320 — Release Gate 状態（dry-run 構造 + gate メタ） */
deployRouter.get("/release-gate", (_req, res) => {
  const dryRun = buildDeployDryRun();
  res.json({
    ...dryRun,
    releaseGate: buildReleaseGateInfo(dryRun),
  });
});
