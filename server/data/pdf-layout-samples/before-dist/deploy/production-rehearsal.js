/**
 * Phase 1581–1620 — Production Deployment Rehearsal
 * ConoHa VPS 投入前の本番同等総点検（判定のみ・新業務機能なし）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RC2_PRODUCTION_ROUTES, resolveProductionRoutePath } from "../config/production-routes.js";
import { checkProductionEnv, hasBlockingEnvErrors, MOCK_REAL_GUARDS, } from "../config/production-env-checker.js";
import { buildPwaPublishAudit, PWA_AUDIT_SPECS } from "../pwa/pwa-publish-audit.js";
import { buildPwaInstallAudit } from "../pwa/pwa-install-audit.js";
import { buildDeployDryRun, buildReleaseGateInfo, REQUIRED_ENV_KEYS, } from "./deploy-dry-run.js";
import { probeHealth } from "./health-monitor.js";
import { buildProductionUrlAudit } from "./production-url-audit.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..", "..");
const publicDir = path.join(serverRoot, "public");
const RELEASE_GATE_MARKER = path.join(serverRoot, "data", "release-gate-last.json");
export const REHEARSAL_PHASE = "1581-1620";
export const DEMO_CUSTOMER = "TOMS001";
const URL_CHECK_SPECS = [
    {
        path: "/app",
        label: "App Hub",
        htmlFile: "app-hub.html",
        manifestFile: "manifest.webmanifest",
        serviceWorker: "/service-worker.js",
        isPwa: true,
    },
    {
        path: "/survey",
        label: "現調 PWA",
        htmlFile: "survey.html",
        manifestFile: "manifest-survey.webmanifest",
        serviceWorker: "/service-worker.js",
        isPwa: true,
    },
    {
        path: "/business",
        label: "TOMS Business",
        htmlFile: "business.html",
        manifestFile: "manifest-business.webmanifest",
        serviceWorker: "/sw-business.js",
        isPwa: true,
    },
    {
        path: "/sales",
        label: "営業デモ",
        htmlFile: "sales.html",
        manifestFile: "manifest.webmanifest",
        serviceWorker: "/service-worker.js",
        isPwa: true,
    },
    {
        path: "/customer/TOMS001",
        label: "顧客ポータル",
        htmlFile: "customer-portal.html",
        manifestFile: null,
        serviceWorker: "/service-worker.js",
        isPwa: true,
        dynamicManifest: true,
    },
    {
        path: "/customer/TOMS001/pro-remote",
        label: "PRO Remote",
        htmlFile: "pro-remote.html",
        manifestFile: null,
        serviceWorker: "/service-worker.js",
        isPwa: true,
        dynamicManifest: true,
    },
    {
        path: "/customer/TOMS001/install/home",
        label: "施工 PWA",
        htmlFile: "installer-home.html",
        manifestFile: null,
        serviceWorker: "/service-worker.js",
        isPwa: true,
        dynamicManifest: true,
    },
    {
        path: "/tv/TOMS001",
        label: "Google TV Web",
        htmlFile: "tv-dashboard.html",
        manifestFile: null,
        serviceWorker: null,
        isPwa: false,
    },
    {
        path: "/deployment/checklist",
        label: "導入チェックリスト",
        htmlFile: "deployment-checklist.html",
        manifestFile: null,
        serviceWorker: null,
        isPwa: false,
    },
];
function fileExists(rel) {
    return fs.existsSync(path.join(publicDir, rel));
}
function readText(rel) {
    const p = path.join(publicDir, rel);
    if (!fs.existsSync(p))
        return null;
    return fs.readFileSync(p, "utf8");
}
function readReleaseGateMarker() {
    try {
        if (!fs.existsSync(RELEASE_GATE_MARKER))
            return null;
        return JSON.parse(fs.readFileSync(RELEASE_GATE_MARKER, "utf8"));
    }
    catch {
        return null;
    }
}
function nginxHasWebSocket() {
    const confPath = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
    if (!fs.existsSync(confPath))
        return false;
    const conf = fs.readFileSync(confPath, "utf8");
    return conf.includes("location /ws") && conf.includes("Upgrade");
}
function nginxHasRoutes() {
    const confPath = path.join(serverRoot, "deploy/nginx/tisly.jp.conf");
    if (!fs.existsSync(confPath))
        return false;
    const conf = fs.readFileSync(confPath, "utf8");
    return ["/app", "/survey", "/business", "/sales", "/customer/", "/tv/", "/api/"].every((p) => conf.includes(p));
}
function swCachesRoute(swContent, routePath) {
    const html = routePath.replace(/^\//, "").replace(/\//g, "-");
    const candidates = [
        routePath,
        `${routePath}.html`,
        routePath.split("/").pop() ?? "",
    ];
    return candidates.some((c) => swContent.includes(c) || swContent.includes(`"${routePath}"`));
}
export function buildUrlCheck() {
    const icon192 = fileExists("icons/icon-192.png");
    const icon512 = fileExists("icons/icon-512.png");
    const iconOk = icon192 && icon512;
    const entries = URL_CHECK_SPECS.map((spec) => {
        const htmlOk = fileExists(spec.htmlFile);
        const routeRegistered = RC2_PRODUCTION_ROUTES.some((r) => {
            const resolved = resolveProductionRoutePath(r);
            return resolved === spec.path || r.path.replace(":code", DEMO_CUSTOMER) === spec.path;
        });
        const http = {
            id: "http",
            label: "HTTP",
            status: htmlOk && routeRegistered ? "pass" : "fail",
            message: htmlOk
                ? routeRegistered
                    ? `${spec.htmlFile} + ルート登録 OK`
                    : `${spec.htmlFile} OK — ルート未登録`
                : `HTML 不足: ${spec.htmlFile}`,
        };
        let manifest;
        if (!spec.isPwa) {
            manifest = {
                id: "manifest",
                label: "manifest",
                status: "pass",
                message: "PWA 対象外",
            };
        }
        else if (spec.dynamicManifest) {
            manifest = {
                id: "manifest",
                label: "manifest",
                status: "pass",
                message: "動的 manifest（Express 配信）",
            };
        }
        else {
            const mfOk = spec.manifestFile ? fileExists(spec.manifestFile) : false;
            manifest = {
                id: "manifest",
                label: "manifest",
                status: mfOk ? "pass" : "fail",
                message: mfOk ? spec.manifestFile : `manifest 不足: ${spec.manifestFile}`,
            };
        }
        let serviceWorker;
        if (!spec.isPwa || !spec.serviceWorker) {
            serviceWorker = {
                id: "service_worker",
                label: "service worker",
                status: "pass",
                message: spec.isPwa ? "SW 未設定" : "PWA 対象外",
            };
        }
        else {
            const swFile = spec.serviceWorker.replace(/^\//, "");
            const swOk = fileExists(swFile);
            serviceWorker = {
                id: "service_worker",
                label: "service worker",
                status: swOk ? "pass" : "fail",
                message: swOk ? spec.serviceWorker : `SW 不足: ${swFile}`,
            };
        }
        const icon = {
            id: "icon",
            label: "icon",
            status: spec.isPwa ? (iconOk ? "pass" : "fail") : "pass",
            message: spec.isPwa
                ? iconOk
                    ? "icon-192 + icon-512 OK"
                    : "icons/icon-192.png または icon-512.png 不足"
                : "PWA 対象外",
        };
        const checks = [http, manifest, serviceWorker, icon];
        const ready = checks.every((c) => c.status === "pass");
        return { path: spec.path, label: spec.label, http, manifest, serviceWorker, icon, ready };
    });
    const readyCount = entries.filter((e) => e.ready).length;
    const total = entries.length;
    return {
        phase: REHEARSAL_PHASE,
        generatedAt: new Date().toISOString(),
        entries,
        readyCount,
        total,
        readyRate: total > 0 ? Math.round((readyCount / total) * 100) : 0,
        verdict: readyCount === total ? "READY" : "NOT READY",
    };
}
export function buildPwaRehearsalAudit(source = process.env) {
    const installAudit = buildPwaInstallAudit();
    const publishAudit = buildPwaPublishAudit(source);
    const swContent = readText("service-worker.js") ?? "";
    const icon192 = fileExists("icons/icon-192.png");
    const icon512 = fileExists("icons/icon-512.png");
    const pwaSpecs = PWA_AUDIT_SPECS.filter((s) => s.isPwa);
    const entries = pwaSpecs.map((spec) => {
        const routePath = spec.pathTemplate.replace(":code", DEMO_CUSTOMER);
        const installEntry = installAudit.entries.find((e) => e.route === spec.pathTemplate || e.route.replace(":code", DEMO_CUSTOMER) === routePath);
        const publishEntry = publishAudit.pwAs.find((p) => p.id === spec.id);
        const installReady = {
            id: "install_ready",
            label: "installReady",
            status: publishEntry?.installReady || installEntry?.installReady ? "pass" : "fail",
            message: publishEntry?.installReady
                ? "本番 URL + アセット完備"
                : installEntry?.installReady
                    ? "ローカルアセット OK — TISLY_PUBLIC_URL 要確認"
                    : `不足: ${(installEntry?.missing ?? publishEntry?.missingItems ?? []).join(", ") || "要確認"}`,
        };
        const manifestFile = spec.staticManifestFile;
        const manifestOk = spec.manifestIsDynamic || (manifestFile ? fileExists(manifestFile) : false);
        const manifest = {
            id: "manifest",
            label: "manifest",
            status: manifestOk ? "pass" : "fail",
            message: spec.manifestIsDynamic
                ? "動的 manifest ルート"
                : manifestOk
                    ? manifestFile
                    : `manifest 不足: ${manifestFile}`,
        };
        const swFile = spec.serviceWorker.replace(/^\//, "");
        const swOk = fileExists(swFile);
        const serviceWorker = {
            id: "service_worker",
            label: "sw",
            status: swOk ? "pass" : "fail",
            message: swOk ? spec.serviceWorker : `SW 不足: ${swFile}`,
        };
        const htmlRoute = RC2_PRODUCTION_ROUTES.find((r) => {
            const resolved = resolveProductionRoutePath(r);
            return resolved === routePath || r.path === spec.pathTemplate;
        });
        const htmlFile = htmlRoute?.htmlFile ?? "";
        const cached = swCachesRoute(swContent, routePath) ||
            (htmlFile ? swContent.includes(htmlFile) : false) ||
            (routePath === "/app" && swContent.includes("/app-hub.html"));
        const offlineCache = {
            id: "offline_cache",
            label: "offline cache",
            status: cached ? "pass" : "warn",
            message: cached
                ? "service-worker.js にシェル URL 登録あり"
                : `${routePath} が SW キャッシュ未登録の可能性`,
        };
        let standalone = {
            id: "standalone",
            label: "standalone",
            status: "warn",
            message: "manifest display 未確認",
        };
        if (manifestFile) {
            try {
                const mf = JSON.parse(readText(manifestFile) ?? "{}");
                const ok = mf.display === "standalone";
                standalone = {
                    id: "standalone",
                    label: "standalone",
                    status: ok ? "pass" : "fail",
                    message: ok ? "display: standalone" : `display=${mf.display ?? "—"}`,
                };
            }
            catch {
                standalone = { id: "standalone", label: "standalone", status: "fail", message: "manifest 解析失敗" };
            }
        }
        else if (spec.manifestIsDynamic) {
            standalone = {
                id: "standalone",
                label: "standalone",
                status: "pass",
                message: "動的 manifest — Express で standalone 配信",
            };
        }
        const icon = {
            id: "icon",
            label: "icon",
            status: icon192 && icon512 ? "pass" : "fail",
            message: icon192 && icon512 ? "icon-192 + icon-512" : "icons 不足",
        };
        const checks = [installReady, manifest, serviceWorker, offlineCache, standalone, icon];
        const ready = checks.filter((c) => c.id !== "offline_cache").every((c) => c.status === "pass");
        return {
            id: spec.id,
            pwaName: spec.pwaName,
            route: routePath,
            installReady,
            manifest,
            serviceWorker,
            offlineCache,
            standalone,
            icon,
            ready,
        };
    });
    const readyCount = entries.filter((e) => e.ready).length;
    return {
        phase: REHEARSAL_PHASE,
        generatedAt: new Date().toISOString(),
        entries,
        readyCount,
        totalPwa: entries.length,
        readyRate: entries.length > 0 ? Math.round((readyCount / entries.length) * 100) : 0,
        verdict: readyCount === entries.length ? "READY" : "NOT READY",
    };
}
export function buildTvRehearsalAudit() {
    const tvHtml = fileExists("tv-dashboard.html");
    const tvJs = readText("js/tv-dashboard.js") ?? "";
    const tvRouteSrc = fs.existsSync(path.join(serverRoot, "src", "app.ts"))
        ? fs.readFileSync(path.join(serverRoot, "src", "app.ts"), "utf8")
        : "";
    const tvRoute = tvRouteSrc.includes('/tv/:customerCode') || tvRouteSrc.includes('"/tv/');
    const focusApi = fs.existsSync(path.join(serverRoot, "src", "api", "routes", "tv.ts")) &&
        fs.readFileSync(path.join(serverRoot, "src", "api", "routes", "tv.ts"), "utf8").includes('"/focus-camera"');
    const cameraFocus = tvJs.includes("camera_focus") || tvJs.includes("focusCamera");
    const wsClient = tvJs.includes("WebSocket") || tvJs.includes("new WebSocket");
    const wsNginx = nginxHasWebSocket();
    const checks = [
        {
            id: "tv_route",
            label: "tv route",
            status: tvHtml && tvRoute ? "pass" : "fail",
            message: tvHtml && tvRoute ? "/tv/:code → tv-dashboard.html" : "TV ルートまたは HTML 不足",
        },
        {
            id: "focus_api",
            label: "focus api",
            status: focusApi ? "pass" : "fail",
            message: focusApi ? "POST /api/tv/focus-camera 登録済み" : "focus-camera API 未登録",
        },
        {
            id: "camera_focus",
            label: "camera focus",
            status: cameraFocus ? "pass" : "fail",
            message: cameraFocus
                ? "tv-dashboard.js が camera_focus / focusCamera 対応"
                : "TV クライアント focus ハンドラ不足",
        },
        {
            id: "ws",
            label: "ws",
            status: wsClient && wsNginx ? "pass" : wsClient ? "warn" : "fail",
            message: wsClient && wsNginx
                ? "TV WebSocket クライアント + nginx /ws"
                : wsClient
                    ? "クライアント OK — nginx /ws 要確認"
                    : "WebSocket クライアント未実装",
        },
    ];
    const blocking = checks.filter((c) => c.status === "fail");
    return {
        phase: REHEARSAL_PHASE,
        generatedAt: new Date().toISOString(),
        checks,
        verdict: blocking.length === 0 ? "READY" : "NOT READY",
    };
}
const INSECURE_VALUES = new Set([
    "",
    "change-me",
    "change-me-before-production",
    "change-me-use-openssl-rand-hex-32",
    "test-jwt-secret-32-characters-long!!",
]);
export function buildSecurityRehearsalAudit(source = process.env) {
    const envExamplePath = path.join(serverRoot, ".env.production.example");
    const envExampleExists = fs.existsSync(envExamplePath);
    const envExampleContent = envExampleExists
        ? fs.readFileSync(envExamplePath, "utf8")
        : "";
    const missingKeys = REQUIRED_ENV_KEYS.filter((k) => !envExampleContent.includes(`${k}=`));
    const envFile = {
        id: "env_file",
        label: ".env",
        status: envExampleExists && missingKeys.length === 0 ? "pass" : "fail",
        message: envExampleExists
            ? missingKeys.length === 0
                ? `.env.production.example — ${REQUIRED_ENV_KEYS.length} キー完備`
                : `不足キー: ${missingKeys.slice(0, 5).join(", ")}${missingKeys.length > 5 ? "…" : ""}`
            : ".env.production.example なし",
    };
    const jwtVal = (source.JWT_SECRET ?? "").trim();
    const jwt = {
        id: "jwt",
        label: "jwt",
        status: jwtVal && !INSECURE_VALUES.has(jwtVal) && jwtVal.length >= 32 ? "pass" : "fail",
        message: jwtVal && !INSECURE_VALUES.has(jwtVal) && jwtVal.length >= 32
            ? "JWT_SECRET 設定済み（32文字以上）"
            : "JWT_SECRET 未設定・デフォルト・短すぎ",
    };
    const ingest = (source.INGEST_SECRET ?? "").trim();
    const secret = {
        id: "secret",
        label: "secret",
        status: ingest && !INSECURE_VALUES.has(ingest) ? "pass" : "fail",
        message: ingest && !INSECURE_VALUES.has(ingest)
            ? "INGEST_SECRET 設定済み"
            : "INGEST_SECRET 未設定またはデフォルト値",
    };
    const adminHash = (source.ADMIN_PASSWORD_HASH ?? "").trim();
    const adminHashCheck = {
        id: "admin_hash",
        label: "admin hash",
        status: adminHash.length > 20 ? "pass" : "fail",
        message: adminHash.length > 20
            ? "ADMIN_PASSWORD_HASH 設定済み"
            : "ADMIN_PASSWORD_HASH 未設定",
    };
    const nodeEnv = (source.NODE_ENV ?? "development").trim();
    const demoMode = (source.TISLY_DEMO_MODE ?? "false").trim() === "true";
    const demoReset = (source.DEMO_RESET_ENABLED ?? "false").trim() === "true";
    const debugFlag = {
        id: "debug_flag",
        label: "debug flag",
        status: nodeEnv === "production" && !demoReset
            ? demoMode
                ? "warn"
                : "pass"
            : nodeEnv === "test"
                ? "pass"
                : "warn",
        message: demoReset
            ? "DEMO_RESET_ENABLED=true — 本番データ消去リスク"
            : nodeEnv !== "production"
                ? `NODE_ENV=${nodeEnv} — 本番は production`
                : demoMode
                    ? "TISLY_DEMO_MODE=true — デモ自動起動注意"
                    : "NODE_ENV=production · デバッグフラグ安全",
    };
    const realServices = [];
    for (const guard of MOCK_REAL_GUARDS) {
        const isReal = guard.envKeys.some((k) => {
            const v = (source[k] ?? "").trim().toLowerCase();
            return v === "real" || v === "true";
        });
        if (isReal)
            realServices.push(guard.service);
    }
    const mockFlag = {
        id: "mock_flag",
        label: "mock flag",
        status: realServices.length === 0 ? "pass" : "warn",
        message: realServices.length === 0
            ? "全サービス mock/安全モード（営業デモ向け）"
            : `real 有効: ${realServices.join(", ")}`,
    };
    const envChecks = checkProductionEnv(source);
    const blockingEnv = envChecks.filter((e) => e.level === "error");
    const checks = [envFile, jwt, secret, adminHashCheck, debugFlag, mockFlag];
    const blockingItems = [
        ...checks.filter((c) => c.status === "fail").map((c) => c.label),
        ...blockingEnv.map((e) => e.key),
    ];
    const verdict = checks.every((c) => c.status !== "fail") && !hasBlockingEnvErrors(source)
        ? "READY"
        : "NOT READY";
    return {
        phase: REHEARSAL_PHASE,
        generatedAt: new Date().toISOString(),
        checks,
        envFile,
        jwt,
        secret,
        adminHash: adminHashCheck,
        debugFlag,
        mockFlag,
        blockingItems,
        verdict,
    };
}
export function calculateReadyScore(input) {
    const ngItems = [];
    const buildScore = input.buildOk ? 15 : 0;
    if (!input.buildOk)
        ngItems.push("Build: dist/index.js 未ビルド");
    const testScore = input.testOk ? 15 : 0;
    if (!input.testOk)
        ngItems.push("Test: npm run test / release:gate 未合格");
    const releaseScore = input.releaseGatePass && input.dryRun.passed ? 15 : 0;
    if (!input.releaseGatePass || !input.dryRun.passed) {
        ngItems.push("Release: dry-run または release gate 不合格");
    }
    const pwaRatio = input.pwaAudit.totalPwa > 0
        ? input.pwaAudit.readyCount / input.pwaAudit.totalPwa
        : 0;
    const pwaScore = Math.round(pwaRatio * 20);
    if (pwaScore < 20)
        ngItems.push(`PWA: ${input.pwaAudit.readyCount}/${input.pwaAudit.totalPwa} READY`);
    const tvPass = input.tvAudit.checks.filter((c) => c.status === "pass").length;
    const tvTotal = input.tvAudit.checks.length;
    const tvScore = Math.round((tvPass / Math.max(tvTotal, 1)) * 10);
    if (tvScore < 10)
        ngItems.push(`TV: ${tvPass}/${tvTotal} チェック合格`);
    const secPass = input.securityAudit.checks.filter((c) => c.status === "pass").length;
    const secTotal = input.securityAudit.checks.length;
    const secScore = Math.round((secPass / Math.max(secTotal, 1)) * 15);
    if (input.securityAudit.verdict === "NOT READY") {
        ngItems.push(`Security: ${input.securityAudit.blockingItems.join(", ") || "要確認"}`);
    }
    const healthScore = input.healthOk ? 10 : 0;
    if (!input.healthOk)
        ngItems.push("Health: probe 異常");
    const total = buildScore + testScore + releaseScore + pwaScore + tvScore + secScore + healthScore;
    const categories = [
        {
            id: "build",
            label: "Build",
            maxPoints: 15,
            score: buildScore,
            status: buildScore === 15 ? "pass" : "fail",
            message: input.buildOk ? "dist/index.js OK" : "npm run build 未実行",
        },
        {
            id: "test",
            label: "Test",
            maxPoints: 15,
            score: testScore,
            status: testScore === 15 ? "pass" : "fail",
            message: input.testOk ? "npm run test 合格" : "release:gate で test 実行推奨",
        },
        {
            id: "release",
            label: "Release",
            maxPoints: 15,
            score: releaseScore,
            status: releaseScore === 15 ? "pass" : "fail",
            message: input.dryRun.passed ? "release gate + dry-run OK" : "dry-run 不合格",
        },
        {
            id: "pwa",
            label: "PWA",
            maxPoints: 20,
            score: pwaScore,
            status: pwaScore >= 18 ? "pass" : pwaScore >= 12 ? "warn" : "fail",
            message: `${input.pwaAudit.readyCount}/${input.pwaAudit.totalPwa} PWA READY`,
        },
        {
            id: "tv",
            label: "TV",
            maxPoints: 10,
            score: tvScore,
            status: tvScore >= 8 ? "pass" : tvScore >= 5 ? "warn" : "fail",
            message: `${tvPass}/${tvTotal} TV チェック`,
        },
        {
            id: "security",
            label: "Security",
            maxPoints: 15,
            score: secScore,
            status: input.securityAudit.verdict === "READY" ? "pass" : "fail",
            message: input.securityAudit.verdict,
        },
        {
            id: "health",
            label: "Health",
            maxPoints: 10,
            score: healthScore,
            status: healthScore === 10 ? "pass" : "fail",
            message: input.healthOk ? "health probe OK" : "health probe 異常",
        },
    ];
    const label = total >= 97
        ? "READY FOR PRODUCTION"
        : total >= 85
            ? "ALMOST READY"
            : "NOT READY FOR PRODUCTION";
    const verdict = total >= 90 &&
        input.dryRun.passed &&
        input.securityAudit.verdict === "READY" &&
        input.urlCheck.verdict === "READY"
        ? "READY"
        : "NOT READY";
    return {
        total,
        maxTotal: 100,
        label,
        verdict,
        categories,
        ngItems,
    };
}
export function buildProductionSimulation(source = process.env) {
    const dryRun = buildDeployDryRun(source, { includeReleaseGate: true });
    const releaseGate = dryRun.releaseGate ?? buildReleaseGateInfo(dryRun);
    const urlCheck = buildUrlCheck();
    const pwaAudit = buildPwaRehearsalAudit(source);
    const tvAudit = buildTvRehearsalAudit();
    const securityAudit = buildSecurityRehearsalAudit(source);
    const healthProbe = probeHealth();
    const marker = readReleaseGateMarker();
    const distExists = fs.existsSync(path.join(serverRoot, "dist/index.js"));
    const urlAudit = buildProductionUrlAudit();
    const buildOk = marker?.build === true || distExists;
    const testOk = marker?.test === true;
    const releaseGatePass = releaseGate.status === "pass";
    const readyScore = calculateReadyScore({
        dryRun,
        urlCheck,
        pwaAudit,
        tvAudit,
        securityAudit,
        healthOk: healthProbe.ok,
        releaseGatePass,
        buildOk,
        testOk,
    });
    const sections = {
        releaseGate: {
            id: "release_gate",
            label: "Release Gate",
            status: releaseGatePass ? "pass" : "fail",
            message: releaseGate.message,
        },
        health: {
            id: "health",
            label: "Health",
            status: healthProbe.ok ? "pass" : "fail",
            message: healthProbe.ok
                ? "DB + HTTPS probe OK"
                : healthProbe.issues.join(", ") || "degraded",
        },
        build: {
            id: "build",
            label: "Build",
            status: buildOk ? "pass" : "warn",
            message: buildOk ? "dist/index.js 存在" : "npm run build 未実行",
        },
        nginx: {
            id: "nginx",
            label: "nginx",
            status: nginxHasRoutes() ? "pass" : "fail",
            message: nginxHasRoutes()
                ? "tisly.jp.conf — RC2 ルート + gzip"
                : "nginx 設定不足",
        },
        ws: {
            id: "ws",
            label: "ws",
            status: nginxHasWebSocket() && urlAudit.publicFacingClean
                ? "pass"
                : "fail",
            message: nginxHasWebSocket()
                ? "nginx /ws + 公開コード wss 準拠"
                : "WebSocket 設定または URL 違反",
        },
        pwa: {
            id: "pwa",
            label: "pwa",
            status: pwaAudit.verdict === "READY" ? "pass" : "fail",
            message: `${pwaAudit.readyCount}/${pwaAudit.totalPwa} PWA installReady`,
        },
        env: {
            id: "env",
            label: "env",
            status: securityAudit.verdict === "READY" ? "pass" : "fail",
            message: securityAudit.envFile.message,
        },
    };
    const sectionList = Object.values(sections);
    const sectionPass = sectionList.filter((s) => s.status === "pass").length;
    return {
        phase: REHEARSAL_PHASE,
        title: "TiSLY Platform Production Deployment Rehearsal",
        generatedAt: new Date().toISOString(),
        verdict: readyScore.verdict,
        readyScore,
        sections,
        urlCheck,
        pwaAudit,
        tvAudit,
        securityAudit,
        dryRun,
        summary: {
            build: sections.build.message,
            health: sections.health.message,
            releaseGate: sections.releaseGate.message,
            pwa: sections.pwa.message,
            tv: tvAudit.verdict,
            security: securityAudit.verdict,
            url: `${urlCheck.readyCount}/${urlCheck.total} URL READY`,
            readyRate: Math.round(((sectionPass + urlCheck.readyCount + pwaAudit.readyCount) /
                (sectionList.length + urlCheck.total + pwaAudit.totalPwa)) *
                100),
        },
    };
}
