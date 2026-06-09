/**
 * Phase 2161–2200 — 顧客ログイン本番確認 API
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PWA_SHELL_TAG, PWA_SHELL_VERSION } from "../pwa/pwa-shell-version.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");
const serverSrcDir = path.join(__dirname, "..");
const DEMO_CUSTOMER_CODE = "TOMS001";
const DEMO_USER_ROLES = ["owner", "admin", "manager", "installer", "surveyor", "maintenance", "viewer"];
function readText(rel) {
    const p = path.join(publicDir, rel);
    if (!fs.existsSync(p))
        return null;
    return fs.readFileSync(p, "utf8");
}
function fileExists(rel) {
    return fs.existsSync(path.join(publicDir, rel));
}
export function buildVpsCustomerLoginDeployBlock() {
    return [
        "cd /opt/tisly",
        "git pull origin master",
        "cd server",
        "npm ci",
        "npm run build",
        "npm run release:gate",
        "npm run db:init",
        "systemctl restart tisly-server",
        "nginx -t && systemctl reload nginx",
        "curl -s https://tisly.jp/api/health",
        "curl -sI https://tisly.jp/customer/TOMS001 | head -20",
        "curl -s https://tisly.jp/api/deploy/customer-login-check | head -c 600",
    ];
}
export function buildCustomerLoginCheck() {
    const portalHtml = readText("customer-portal.html") ?? "";
    const portalJs = readText("js/customer-portal.js") ?? "";
    const swJs = readText("service-worker.js") ?? "";
    const authRoutePath = path.join(serverSrcDir, "api", "routes", "auth.ts");
    const authRouteSrc = fs.existsSync(authRoutePath) ? fs.readFileSync(authRoutePath, "utf8") : "";
    const customerPortalHtmlOk = portalHtml.length > 0 && fileExists("customer-portal.html");
    const customerJsOk = portalJs.length > 0 && fileExists("js/customer-portal.js");
    const customerCssOk = fileExists("css/customer-portal.css");
    const loginFormExists = customerPortalHtmlOk && /id="login-form"/.test(portalHtml) && /id="login-username"/.test(portalHtml);
    const submitButtonExists = customerPortalHtmlOk && /type="submit"[^>]*id="btn-login"/.test(portalHtml);
    const portalNavHiddenBeforeLogin = customerPortalHtmlOk && /id="portal-nav"[^>]*hidden/.test(portalHtml);
    const submitHandlerOk = customerJsOk &&
        /loginForm\?\.addEventListener\("submit"/.test(portalJs) &&
        /performLogin/.test(portalJs) &&
        /e\.preventDefault\(\)/.test(portalJs);
    const authEndpointOk = /\.post\(["']\/customer\/login["']/.test(authRouteSrc);
    const postLoginRedirectOk = customerJsOk && /location\.replace/.test(portalJs) && /setCustomerToken/.test(portalJs);
    const demoUsers = DEMO_USER_ROLES.map((role) => `${DEMO_CUSTOMER_CODE.toLowerCase()}.${role}`);
    const demoPasswordConfigured = Boolean(process.env.CUSTOMER_DEMO_PASSWORD?.trim()) || process.env.NODE_ENV !== "production";
    const demoAccountOk = customerPortalHtmlOk && /demo-user-hint/.test(portalHtml) && demoPasswordConfigured;
    const customerRouteOk = customerPortalHtmlOk && fileExists("customer-portal.html");
    const authApiOk = authEndpointOk && submitHandlerOk && /\/api\/auth\/customer\/login/.test(portalJs);
    const customerPortalPrecached = swJs.includes("customer-portal.html") &&
        swJs.includes("customer-portal.js") &&
        swJs.includes("customer-portal.css") &&
        swJs.includes(PWA_SHELL_TAG);
    const shellVersionOk = portalHtml.includes(`data-shell-version="${PWA_SHELL_VERSION}"`) && customerPortalPrecached;
    const checks = [
        {
            id: "customer-route",
            label: "customer route OK",
            ok: customerRouteOk,
            detail: `/customer/${DEMO_CUSTOMER_CODE} → customer-portal.html`,
        },
        {
            id: "auth-endpoint",
            label: "auth endpoint OK",
            ok: authEndpointOk,
            detail: "POST /api/auth/customer/login",
        },
        {
            id: "portal-html",
            label: "customer portal html OK",
            ok: customerPortalHtmlOk,
            detail: "customer-portal.html",
        },
        {
            id: "portal-js",
            label: "customer JS OK",
            ok: customerJsOk,
            detail: "js/customer-portal.js",
        },
        {
            id: "portal-css",
            label: "customer CSS OK",
            ok: customerCssOk,
            detail: "css/customer-portal.css",
        },
        {
            id: "login-form",
            label: "login form exists",
            ok: loginFormExists,
        },
        {
            id: "submit-button",
            label: "submit button exists",
            ok: submitButtonExists,
        },
        {
            id: "nav-hidden",
            label: "portal nav hidden before login",
            ok: portalNavHiddenBeforeLogin,
        },
        {
            id: "submit-handler",
            label: "submit handler OK",
            ok: submitHandlerOk,
        },
        {
            id: "auth-api",
            label: "auth API OK",
            ok: authApiOk,
        },
        {
            id: "demo-account",
            label: "demo account OK",
            ok: demoAccountOk,
        },
        {
            id: "post-login-redirect",
            label: "post-login redirect OK",
            ok: postLoginRedirectOk,
        },
        {
            id: "shell-precache",
            label: "customer portal precached in SW",
            ok: customerPortalPrecached,
            detail: PWA_SHELL_TAG,
        },
        {
            id: "shell-version",
            label: "shell version marker",
            ok: shellVersionOk,
            detail: PWA_SHELL_VERSION,
        },
    ];
    const ready = checks.every((c) => c.ok);
    return {
        phase: "2161-2200",
        ready,
        customerRouteOk,
        authEndpointOk,
        customerPortalHtmlOk,
        customerJsOk,
        loginFormExists,
        submitButtonExists,
        portalNavHiddenBeforeLogin,
        submitHandlerOk,
        authApiOk,
        demoAccountOk,
        postLoginRedirectOk,
        demoUsers,
        demoPasswordConfigured,
        shellVersion: PWA_SHELL_VERSION,
        shellTag: PWA_SHELL_TAG,
        customerPortalPrecached,
        checks,
        curlVerifyBlock: [
            `curl -sI https://tisly.jp/customer/${DEMO_CUSTOMER_CODE} | head -20`,
            "curl -s https://tisly.jp/api/deploy/customer-login-check",
            "curl -s https://tisly.jp/js/customer-portal.js | head -c 200",
        ],
    };
}
