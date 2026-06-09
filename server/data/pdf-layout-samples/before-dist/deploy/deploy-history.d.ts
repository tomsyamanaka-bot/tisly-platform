/**
 * Phase 1461–1500 — デプロイ / ロールバック / ビルド履歴
 */
export type DeployEventType = "deploy" | "rollback" | "build";
export interface DeployHistoryEntry {
    id: string;
    type: DeployEventType;
    commit: string;
    commitShort: string;
    build: string;
    status: "success" | "failed" | "pending" | "rolled_back";
    message?: string;
    actor?: string;
    at: string;
}
export declare function appendDeployHistory(entry: Omit<DeployHistoryEntry, "id" | "at"> & {
    at?: string;
}): DeployHistoryEntry;
export declare function listDeployHistory(limit?: number): DeployHistoryEntry[];
export declare function listByType(type: DeployEventType, limit?: number): DeployHistoryEntry[];
export declare function getLatestDeploy(): DeployHistoryEntry | null;
export declare function getLatestRollback(): DeployHistoryEntry | null;
export interface DeployCenterStatus {
    currentCommit: string;
    currentCommitShort: string;
    currentBuild: string;
    deployDate: string | null;
    deployStatus: "success" | "failed" | "pending" | "never" | "rolled_back";
    deployMessage: string;
    rollbackAvailable: boolean;
    phase: string;
    generatedAt: string;
}
export declare function buildDeployCenterStatus(): DeployCenterStatus;
