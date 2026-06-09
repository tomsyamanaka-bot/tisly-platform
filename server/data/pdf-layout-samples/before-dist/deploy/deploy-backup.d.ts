/**
 * Phase 1461–1500 — デプロイ前バックアップ（.env / DB / uploads）
 */
export interface DeployBackupResult {
    ok: boolean;
    backupDir: string;
    files: string[];
    errors: string[];
}
export declare function runDeployBackup(rootDir?: any): DeployBackupResult;
