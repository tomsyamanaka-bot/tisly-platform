import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

/** 各接続試行の上限（VPS Gateway Timeout 504 回避） */
export const DEFAULT_WEBDAV_TIMEOUT_MS = Number(
  process.env.QNAP_WEBDAV_TIMEOUT_MS || "3000"
);

function formatFetchError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.message];
  const err = e as NodeJS.ErrnoException;
  if (err.code) parts.push(`code=${err.code}`);
  const cause = (e as { cause?: Error }).cause;
  if (cause?.message) parts.push(`cause=${cause.message}`);
  return parts.join(" · ");
}

const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

function envFlag(key: string): boolean | null {
  const v = (process.env[key] ?? "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

/** Tailscale CGNAT (100.64.0.0/10) — QNAP オレオレ証明書を許容 */
export function isTailscaleOrPrivateHost(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function shouldUseInsecureTls(url: string): boolean {
  const forced = envFlag("QNAP_WEBDAV_TLS_INSECURE");
  if (forced !== null) return forced;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return isTailscaleOrPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

export function isCertificateFetchError(message: string): boolean {
  return /certificate|UNABLE_TO_VERIFY|SELF_SIGNED|self signed|cert|SSL|TLS|rejectUnauthorized|DEPTH_ZERO/i.test(
    message
  );
}

/**
 * QNAP WebDAV ポート探索順（8080 管理/WebDAV 優先）
 * 1. http:8080 → 2. http:5005 → 3. https:5006 → 4. http:5000
 */
export const WEBDAV_PORT_FALLBACKS: ReadonlyArray<{
  protocol: string;
  port: string;
}> = [
  { protocol: "http:", port: "8080" },
  { protocol: "http:", port: "5005" },
  { protocol: "https:", port: "5006" },
  { protocol: "http:", port: "5000" },
];

/**
 * 8080（Web 管理と WebDAV が同居し得る）向けパス候補。
 * ルートが HTTP 501 の場合でも /Public/ や /TiSLY/ で WebDAV が応答することがある。
 */
export const WEBDAV_ROOT_PATH_CANDIDATES: readonly string[] = [
  "/",
  "/Public/",
  "/TiSLY/",
];

export const QNAP_WEBDAV_USER_AGENT = "TiSLY-PWA";

/** QNAP / IIS 系 WebDAV でファイル操作として扱うための標準ヘッダー */
export function withQnapWebDavHeaders(
  headers?: HeadersInit | Record<string, string> | null
): Record<string, string> {
  const merged: Record<string, string> = {
    "User-Agent": QNAP_WEBDAV_USER_AGENT,
    Translate: "f",
  };
  if (!headers) return merged;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      merged[key] = value;
    });
    return merged;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      merged[key] = value;
    }
    return merged;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    merged[key] = String(value);
  }
  return merged;
}

/**
 * OPTIONS / PROPFIND が WebDAV として扱える応答か。
 * HTTP 501（Not Implemented）は管理 UI 等で WebDAV 未対応と判定。
 */
export function isWebDavMethodAcceptedStatus(status: number): boolean {
  const s = Number(status);
  if (!Number.isFinite(s) || s <= 0) return false;
  if (s === 501) return false;
  return (
    s === 200 ||
    s === 201 ||
    s === 204 ||
    s === 207 ||
    s === 401 ||
    s === 403 ||
    s === 405
  );
}

/** ホスト別・成功した WebDAV ベース URL（プロセス内キャッシュ） */
const discoveredWebDavByHost = new Map<string, string>();

export function rememberDiscoveredWebDavUrl(url: string): void {
  const raw = String(url || "").trim();
  if (!raw) return;
  try {
    const u = new URL(raw);
    const base = raw.replace(/\/+$/, "");
    discoveredWebDavByHost.set(u.hostname, base);
    const port =
      u.port ||
      (u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : "");
    if (port) process.env.QNAP_WEBDAV_DISCOVERED_PORT = port;
    process.env.QNAP_WEBDAV_DISCOVERED_URL = base;
  } catch {
    /* invalid URL */
  }
}

export function getDiscoveredWebDavUrl(hostname?: string): string | null {
  const host = String(hostname || "").trim();
  if (host && discoveredWebDavByHost.has(host)) {
    return discoveredWebDavByHost.get(host) || null;
  }
  const fromEnv = (process.env.QNAP_WEBDAV_DISCOVERED_URL || "").trim();
  if (fromEnv) {
    if (!host) return fromEnv;
    try {
      if (new URL(fromEnv).hostname === host) return fromEnv;
    } catch {
      /* */
    }
  }
  return null;
}

export function clearDiscoveredWebDavUrlCache(): void {
  discoveredWebDavByHost.clear();
  delete process.env.QNAP_WEBDAV_DISCOVERED_PORT;
  delete process.env.QNAP_WEBDAV_DISCOVERED_URL;
}

/** pathname を正規化（末尾スラッシュ維持、空は /） */
export function normalizeWebDavRootPath(pathname: string): string {
  const raw = String(pathname || "").trim() || "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

/** ポート向けのルートパス候補（設定パス + /, /Public/, /TiSLY/） */
export function listWebDavRootPathCandidates(
  configuredPathname?: string,
  port?: string | number
): string[] {
  const configured = normalizeWebDavRootPath(configuredPathname || "/");
  const portStr = String(port ?? "");
  // 8080 は管理 UI 同居のためパス探索を必須化。他ポートも同様に候補を試す。
  const preferPathProbe = !portStr || portStr === "8080" || portStr === "80";
  const ordered = preferPathProbe
    ? [configured, ...WEBDAV_ROOT_PATH_CANDIDATES]
    : [configured, "/TiSLY/", "/Public/", "/"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ordered) {
    const n = normalizeWebDavRootPath(p);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** ポート番号を省略せずに候補 URL を組み立てる（:80 も明示） */
function buildWebDavCandidateUrl(
  protocol: string,
  host: string,
  port: string,
  pathname: string,
  search = ""
): string {
  const proto = protocol.endsWith(":") ? protocol : `${protocol}:`;
  const path = normalizeWebDavRootPath(pathname).replace(/\/+$/, "") || "";
  // ルートは /、共有名は /TiSLY（末尾スラッシュなしで保持。呼び出し側で調整可）
  const pathPart = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return `${proto}//${host}:${port}${pathPart}${search}`;
}

function pushPortPathCandidates(
  out: string[],
  protocol: string,
  host: string,
  port: string,
  configuredPathname: string,
  search = ""
): void {
  for (const pathname of listWebDavRootPathCandidates(configuredPathname, port)) {
    out.push(buildWebDavCandidateUrl(protocol, host, port, pathname, search));
  }
}

/**
 * 接続試行順: 8080（パス付き）→ 5005 → 5006 → 5000
 * 各ポートで /, /Public/, /TiSLY/（＋設定パス）を展開。
 */
export function listWebDavUrlCandidates(primary: string): string[] {
  const out: string[] = [];
  const primaryTrim = String(primary || "").trim();
  try {
    const u = new URL(primaryTrim);
    const host = u.hostname;
    const pathname = u.pathname || "/";
    const search = u.search || "";
    const addPort = (protocol: string, port: string) => {
      pushPortPathCandidates(out, protocol, host, port, pathname, search);
    };

    // 1. 前回成功 URL（パス込み）を最優先近くに
    const cached = getDiscoveredWebDavUrl(host);
    if (cached) {
      out.push(cached.replace(/\/+$/, "") || cached);
    }

    // 2. 固定順フォールバック（8080 → 5005 → 5006 → 5000）＋パス展開
    for (const fb of WEBDAV_PORT_FALLBACKS) {
      addPort(fb.protocol, fb.port);
    }

    // 3. 設定の primary（上記以外のポートの場合）
    const primaryPort =
      u.port ||
      (u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : "");
    const known = new Set(WEBDAV_PORT_FALLBACKS.map((f) => `${f.protocol}${f.port}`));
    if (primaryPort && !known.has(`${u.protocol}${primaryPort}`)) {
      addPort(u.protocol, primaryPort);
    } else if (!primaryPort && primaryTrim) {
      out.push(primaryTrim);
    }
  } catch {
    if (primaryTrim) out.push(primaryTrim);
  }
  return [...new Set(out.filter(Boolean))];
}

function writeRequestBody(
  req: http.ClientRequest,
  body: RequestInit["body"]
): void {
  if (body == null) return;
  if (typeof body === "string") {
    req.write(body);
    return;
  }
  if (Buffer.isBuffer(body)) {
    req.write(body);
    return;
  }
  if (body instanceof Uint8Array) {
    req.write(Buffer.from(body));
    return;
  }
  throw new Error("Unsupported WebDAV request body type");
}

function resolveRequestTimeoutMs(): number {
  return DEFAULT_WEBDAV_TIMEOUT_MS;
}

async function nodeFetchWithOptionalAgent(
  url: string,
  init: RequestInit,
  agent?: https.Agent
): Promise<Response> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const lib = isHttps ? https : http;
  const headers = withQnapWebDavHeaders(
    init.headers as Record<string, string> | undefined
  );
  const timeoutMs = resolveRequestTimeoutMs();
  const externalSignal = init.signal ?? null;

  return new Promise((resolve, reject) => {
    if (externalSignal?.aborted) {
      reject(externalSignal.reason ?? new Error("WebDAV request aborted"));
      return;
    }

    const controller = new AbortController();
    let settled = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            controller.abort(
              new Error(`WebDAV timeout after ${timeoutMs}ms`)
            );
          }, timeoutMs)
        : null;

    const onExternalAbort = () => {
      controller.abort(
        externalSignal?.reason ?? new Error("WebDAV request aborted")
      );
    };
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const succeed = (res: Response) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? "GET",
        headers,
        agent: isHttps ? agent : undefined,
        timeout: timeoutMs > 0 ? timeoutMs : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          succeed(
            new Response(buf, {
              status: res.statusCode ?? 0,
              headers: res.headers as HeadersInit,
            })
          );
        });
        res.on("error", fail);
      }
    );

    const abortReq = () => {
      const reason =
        controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new Error(`WebDAV timeout after ${timeoutMs}ms`);
      req.destroy(reason);
      fail(reason);
    };

    if (controller.signal.aborted) {
      abortReq();
      return;
    }
    controller.signal.addEventListener("abort", abortReq, { once: true });

    req.on("timeout", () => {
      const err = new Error(`WebDAV timeout after ${timeoutMs}ms`);
      req.destroy(err);
      fail(err);
    });
    req.on("error", fail);
    try {
      writeRequestBody(req, init.body);
    } catch (e) {
      req.destroy();
      fail(e);
      return;
    }
    req.end();
  });
}

/**
 * QNAP WebDAV / File Station 向け fetch。
 * 各試行は AbortController により最大 DEFAULT_WEBDAV_TIMEOUT_MS（既定 3000ms）。
 */
export async function qnapWebDavFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const nextInit: RequestInit = {
    ...init,
    headers: withQnapWebDavHeaders(init.headers as HeadersInit),
  };
  const insecure = shouldUseInsecureTls(url);
  try {
    return await nodeFetchWithOptionalAgent(
      url,
      nextInit,
      insecure ? insecureHttpsAgent : undefined
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!insecure && isCertificateFetchError(msg)) {
      return nodeFetchWithOptionalAgent(url, nextInit, insecureHttpsAgent);
    }
    throw e;
  }
}

/**
 * PUT 前の接続検証 — OPTIONS → 失敗時 PROPFIND。
 * HTTP 501 は WebDAV 非対応として失敗扱い。
 */
export async function probeWebDavEndpoint(
  url: string,
  headers?: Record<string, string>
): Promise<{ ok: boolean; status: number; method: "OPTIONS" | "PROPFIND"; message: string }> {
  const base = String(url || "").replace(/\/+$/, "") || url;
  const hdrs = withQnapWebDavHeaders(headers);

  try {
    const opt = await qnapWebDavFetch(base, { method: "OPTIONS", headers: hdrs });
    if (isWebDavMethodAcceptedStatus(opt.status)) {
      return {
        ok: true,
        status: opt.status,
        method: "OPTIONS",
        message: `OPTIONS OK (HTTP ${opt.status})`,
      };
    }
    if (opt.status === 501) {
      // 501 のまま PROPFIND も試す（一部 QNAP は OPTIONS のみ未実装）
    } else if (opt.status > 0 && opt.status < 500) {
      // 他 4xx は PROPFIND で再確認
    }
  } catch {
    /* fall through to PROPFIND */
  }

  try {
    const prop = await qnapWebDavFetch(base, {
      method: "PROPFIND",
      headers: {
        ...hdrs,
        Depth: "0",
        "Content-Type": "application/xml",
      },
    });
    if (isWebDavMethodAcceptedStatus(prop.status)) {
      return {
        ok: true,
        status: prop.status,
        method: "PROPFIND",
        message: `PROPFIND OK (HTTP ${prop.status})`,
      };
    }
    return {
      ok: false,
      status: prop.status,
      method: "PROPFIND",
      message:
        prop.status === 501
          ? "HTTP 501 Not Implemented（WebDAV エンドポイントではありません）"
          : `PROPFIND failed: HTTP ${prop.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      method: "PROPFIND",
      message: formatFetchError(e),
    };
  }
}

export { formatFetchError };
