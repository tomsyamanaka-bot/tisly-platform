/**
 * Phase 1921–1960 — Production Launch Verification & Browser Test
 * （Phase 1881–1920 本番起動後の確認手順を拡張）
 */
export type RehearsalBadgeStatus = "ready" | "not_ready" | "set" | "not_set" | "deployed" | "not_deployed" | "checked" | "not_checked";
export interface RehearsalStatusRow {
    id: string;
    label: string;
    displayLabel: string;
    status: RehearsalBadgeStatus;
    message: string;
}
export type EnvCheckState = "required" | "optional" | "missing" | "set";
export interface EnvChecklistRow {
    key: string;
    label: string;
    requirement: "required" | "optional";
    state: EnvCheckState;
    message: string;
}
export interface VpsCommandStep {
    id: string;
    title: string;
    commands: string[];
    note?: string;
}
export interface ProductionStartInfo {
    method: "systemd";
    methodLabel: string;
    packageJson: string;
    startScript: string;
    entryPoint: string;
    systemdUnit: string;
    nginxConf: string;
    envTemplate: string;
    oneBlock: string[];
    note: string;
}
export interface VpsFailureBranch {
    id: string;
    symptom: string;
    likelyCause: string;
    checkCommands: string[];
    fix: string;
}
export interface ProductionLaunchGuide {
    phase: string;
    title: string;
    sectionA_now: string;
    sectionB_vpsCommands: string;
    sectionC_envExample: string;
    sectionD_success: string;
    sectionE_failure: string;
    sectionF_urls: string[];
    envPrepBlock: string[];
    startBlock: string[];
    verifyBlock: string[];
    failureBranches: VpsFailureBranch[];
}
export interface ProductionVerificationGuide {
    phase: string;
    title: string;
    sectionA_urls: string[];
    sectionB_success: string;
    sectionC_failure: string;
    sectionD_nextPhase: string;
    gitPullStartBlock: string[];
    postDeployVerifyBlock: string[];
    checklistStatusVerifyBlock: string[];
    browserTestUrls: {
        path: string;
        label: string;
        priority: number;
    }[];
    failureBranches: VpsFailureBranch[];
}
export interface DeployRehearsalChecklistReport {
    phase: string;
    title: string;
    generatedAt: string;
    rehearsalReady: boolean;
    rehearsalReadyLabel: string;
    statusRows: RehearsalStatusRow[];
    envChecklist: EnvChecklistRow[];
    vpsCommands: VpsCommandStep[];
    productionStart: ProductionStartInfo;
    productionLaunch: ProductionLaunchGuide;
    productionVerification: ProductionVerificationGuide;
    pwaInstallReady: {
        ready: number;
        total: number;
        label: string;
    };
}
/** .env 準備（秘密生成 · プレースホルダのみ · VNC 用） */
export declare const VPS_ENV_PREP_ONE_BLOCK: string[];
/** VNC コンソールへ貼る本番起動コマンド（.env 完了後 · 1 ブロック） */
export declare const VPS_PRODUCTION_START_ONE_BLOCK: string[];
/** 手動起動（スクリプト不可時の代替 · 秘密値なし） */
export declare const VPS_PRODUCTION_START_MANUAL_BLOCK: string[];
/** git pull 後の本番起動（.env 入力済み · Phase 1881–1920） */
export declare const VPS_GIT_PULL_START_ONE_BLOCK: string[];
/** 起動後の確認コマンド（Phase 1961–2000） */
export declare const VPS_PRODUCTION_VERIFY_ONE_BLOCK: string[];
/** /deployment/checklist ステータス行の VPS / SSL / PWA 確認（VPS 上） */
export declare const VPS_CHECKLIST_STATUS_VERIFY_BLOCK: string[];
/** 9 URL 一括 HTTP 確認（PC または VPS） */
export declare const VPS_BROWSER_SMOKE_ONE_BLOCK: string[];
/** 失敗時の分岐表 */
export declare const VPS_FAILURE_BRANCHES: VpsFailureBranch[];
/** .env 入力例（実値なし · プレースホルダのみ） */
export declare const PRODUCTION_ENV_EXAMPLE_PLACEHOLDER = "# --- \u5FC5\u9808\uFF08\u270B \u667A\u7D00\u3055\u3093\u304C\u5165\u529B\uFF09 ---\nNODE_ENV=production\nTISLY_PUBLIC_URL=https://tisly.jp\n\n# JWT_SECRET \u2190 openssl rand -base64 48\nJWT_SECRET=\u3053\u3053\u306B\u5165\u308C\u308B\n# ADMIN_PASSWORD_HASH \u2190 hashPassword\uFF08scrypt:... \u5F62\u5F0F\uFF09\nADMIN_PASSWORD_HASH=\u3053\u3053\u306B\u5165\u308C\u308B\n# INGEST_SECRET \u2190 openssl rand -base64 48\uFF08JWT \u3068\u5225\u5024\uFF09\nINGEST_SECRET=\u3053\u3053\u306B\u5165\u308C\u308B\n# DEPLOY_OPS_TOKEN \u2190 openssl rand -hex 32\nDEPLOY_OPS_TOKEN=\u3053\u3053\u306B\u5165\u308C\u308B\n\n# --- \u521D\u56DE\u516C\u958B\u306F mock \u5B89\u5168\u5024\uFF08\u30C6\u30F3\u30D7\u30EC\u306E\u307E\u307E\u53EF\uFF09 ---\nPORT=3080\nTISLY_PORT=3080\nDB_PROVIDER=sqlite\nMQTT_MODE=mock\nMQTT_MOCK_MODE=true\nSHELLY_MODE=mock\nQNAP_MODE=mock\nGMAIL_SEND_MODE=mock\nDEMO_RESET_ENABLED=false\nADMIN_USERNAME=admin";
/** VPS 投入コマンド（秘密値はすべてプレースホルダ） */
export declare const VPS_DEPLOY_COMMAND_STEPS: VpsCommandStep[];
export declare function buildProductionStartInfo(): ProductionStartInfo;
export declare const PRODUCTION_BROWSER_TEST_URLS: {
    path: string;
    label: string;
    priority: number;
}[];
export declare function buildProductionVerificationGuide(): ProductionVerificationGuide;
export declare function buildProductionLaunchGuide(): ProductionLaunchGuide;
export declare function buildDeployRehearsalChecklist(source?: NodeJS.ProcessEnv): DeployRehearsalChecklistReport;
