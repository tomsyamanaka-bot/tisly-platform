/**
 * release-gate-last.json — 生成・読み取り・ビルド時 commit 同期
 */
export declare const serverRoot: any;
export declare const repoRoot: any;
export declare const RELEASE_GATE_MARKER: any;
export interface ReleaseGateMarker {
    generatedAt?: string;
    build?: boolean;
    test?: boolean;
    tsc?: boolean;
    phase?: string;
    commit?: string;
    buildNumber?: string;
}
export declare function resolveGitCommit(): string;
export declare function readReleaseGateMarker(): ReleaseGateMarker | null;
export declare function writeReleaseGateMarker(payload: ReleaseGateMarker): void;
/** npm run build 後 — commit を現在 HEAD に同期（test/tsc は未実行のため false） */
export declare function syncReleaseGateCommitOnBuild(): ReleaseGateMarker;
/** npm run release:gate 全ステップ合格後 */
export declare function writeReleaseGateSuccessMarker(): ReleaseGateMarker;
