/**
 * Phase 1441–1460 — ビルドバージョン・コミット追跡（/app 右下・/api/health）
 */
import { readReleaseGateMarker, resolveGitCommit, } from "./release-gate-marker.js";
export function getBuildVersion() {
    const marker = readReleaseGateMarker();
    const liveCommit = resolveGitCommit();
    const commit = liveCommit || marker?.commit || "unknown";
    const commitShort = commit === "unknown" ? "unknown" : commit.slice(0, 7);
    const date = marker?.generatedAt
        ? marker.generatedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    return {
        label: "TiSLY RC2",
        build: marker?.buildNumber || "1460",
        commit,
        commitShort,
        date,
        phase: marker?.phase || "1461-1500-conoha-vps-auto-deploy",
    };
}
