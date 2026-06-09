/**
 * release-gate-last.json — 生成・読み取り・ビルド時 commit 同期
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.join(__dirname, "..", "..");
export const repoRoot = path.join(serverRoot, "..");
export const RELEASE_GATE_MARKER = process.env.TISLY_RELEASE_GATE_MARKER_PATH ??
    path.join(serverRoot, "data", "release-gate-last.json");
export function resolveGitCommit() {
    try {
        return execSync("git rev-parse HEAD", {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
        }).trim();
    }
    catch {
        return "";
    }
}
export function readReleaseGateMarker() {
    try {
        if (!fs.existsSync(RELEASE_GATE_MARKER))
            return null;
        return JSON.parse(fs.readFileSync(RELEASE_GATE_MARKER, "utf8"));
    }
    catch {
        return null;
    }
}
export function writeReleaseGateMarker(payload) {
    const dir = path.dirname(RELEASE_GATE_MARKER);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(RELEASE_GATE_MARKER, JSON.stringify(payload, null, 2), "utf8");
}
/** npm run build 後 — commit を現在 HEAD に同期（test/tsc は未実行のため false） */
export function syncReleaseGateCommitOnBuild() {
    const existing = readReleaseGateMarker();
    const payload = {
        generatedAt: new Date().toISOString(),
        build: true,
        tsc: false,
        test: false,
        phase: existing?.phase ?? "1461-1500-conoha-vps-auto-deploy",
        buildNumber: existing?.buildNumber ?? "RC2-1500",
        commit: resolveGitCommit() || "unknown",
    };
    writeReleaseGateMarker(payload);
    return payload;
}
/** npm run release:gate 全ステップ合格後 */
export function writeReleaseGateSuccessMarker() {
    const payload = {
        generatedAt: new Date().toISOString(),
        build: true,
        tsc: true,
        test: true,
        phase: "1461-1500-conoha-vps-auto-deploy",
        buildNumber: "RC2-1500",
        commit: resolveGitCommit() || "unknown",
    };
    writeReleaseGateMarker(payload);
    return payload;
}
