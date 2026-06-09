/**
 * Phase 1381–1400 — 本番 URL 監査（localhost / 127.0.0.1 / 192.168. / ws:// 検索）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RC2_PRODUCTION_ROUTES } from "../config/production-routes.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const publicDir = path.join(serverRoot, "public");
const PATTERNS = [
    { kind: "localhost", re: /localhost/i },
    { kind: "127.0.0.1", re: /127\.0\.0\.1/ },
    { kind: "192.168.", re: /192\.168\./ },
    { kind: "ws://", re: /ws:\/\// },
];
/** 監査対象ルートと関連 HTML */
export const PRODUCTION_ROUTE_FILES = {
    "/app": ["app-hub.html", "js/app-hub.js"],
    "/survey": ["survey.html", "js/survey-app.js", "js/survey-sync.js"],
    "/business": ["business.html", "js/business-app.js"],
    "/customer/:code": ["customer-portal.html", "js/customer-portal.js"],
    "/customer/:code/install/home": ["installer-home.html", "js/installer-mode.js", "js/installer-pwa.js"],
    "/customer/:code/pro-remote": ["pro-remote.html", "js/pro-remote-floor-map.js"],
    "/deployment/checklist": ["deployment-checklist.html", "js/deployment-checklist.js"],
};
const ACCEPTABLE_PATH_SEGMENTS = [
    "server/test/",
    "server\\test\\",
    "/docs/",
    "\\docs\\",
    "node-red/",
    "rp2350/",
    "tv-app/",
    "esp32/",
    "data/deploy-dry-run-last.json",
    "production-url-audit.ts",
    "pwa-publish-audit.ts",
    "production-env-checker.ts",
];
const ACCEPTABLE_SNIPPET_HINTS = [
    "未設定または localhost",
    "localhost URL は使用不可",
    "localUrl",
    "localBase",
    "http://localhost:${",
    "`http://localhost:${",
];
function isAcceptablePath(relPath) {
    const norm = relPath.replace(/\\/g, "/");
    return ACCEPTABLE_PATH_SEGMENTS.some((s) => norm.includes(s.replace(/\\/g, "/")));
}
function isAcceptableSnippet(snippet) {
    return ACCEPTABLE_SNIPPET_HINTS.some((h) => snippet.includes(h));
}
function scanFile(absPath, relPath, route) {
    if (!fs.existsSync(absPath))
        return [];
    const content = fs.readFileSync(absPath, "utf8");
    const lines = content.split("\n");
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*"))
            continue;
        for (const { kind, re } of PATTERNS) {
            if (!re.test(line))
                continue;
            const snippet = line.trim().slice(0, 120);
            if (isAcceptableSnippet(snippet))
                continue;
            const underPublic = relPath.replace(/\\/g, "/").startsWith("public/");
            const blocking = underPublic && !isAcceptablePath(relPath);
            violations.push({
                file: relPath.replace(/\\/g, "/"),
                line: i + 1,
                kind,
                snippet,
                route,
                blocking,
            });
        }
    }
    return violations;
}
function collectRouteFiles() {
    const items = [];
    for (const [route, files] of Object.entries(PRODUCTION_ROUTE_FILES)) {
        items.push({ route, files });
    }
    return items;
}
/** server/public 配下の本番 PWA 関連ファイルをスキャン */
export function buildProductionUrlAudit() {
    const violations = [];
    const routes = RC2_PRODUCTION_ROUTES.map((r) => r.path);
    for (const { route, files } of collectRouteFiles()) {
        for (const file of files) {
            const abs = path.join(publicDir, file);
            const rel = path.join("public", file);
            violations.push(...scanFile(abs, rel, route));
        }
    }
    // 共有 JS（WebSocket 等）
    const sharedJs = [
        "js/tisly-pwa-shell.js",
        "js/tv-dashboard.js",
        "js/sales-realtime.js",
        "js/project-dashboard.js",
    ];
    for (const file of sharedJs) {
        const abs = path.join(publicDir, file);
        violations.push(...scanFile(abs, path.join("public", file)));
    }
    const blockingCount = violations.filter((v) => v.blocking).length;
    const acceptableCount = violations.length - blockingCount;
    return {
        scannedAt: new Date().toISOString(),
        routes,
        violations,
        blockingCount,
        acceptableCount,
        publicFacingClean: blockingCount === 0,
    };
}
