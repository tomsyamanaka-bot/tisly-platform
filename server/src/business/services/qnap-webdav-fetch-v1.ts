import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const DEFAULT_WEBDAV_TIMEOUT_MS = Number(process.env.QNAP_WEBDAV_TIMEOUT_MS || "30000");

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

/** 設定ポート → 5000 / 5006 / 8080 / 55222 などの候補 URL */
export function listWebDavUrlCandidates(primary: string): string[] {
  const out: string[] = [primary.trim()];
  try {
    const u = new URL(primary);
    const path = `${u.pathname}${u.search}`;
    const host = u.hostname;
    const add = (protocol: string, port: string) => {
      const next = new URL(primary);
      next.protocol = protocol;
      next.hostname = host;
      next.port = port;
      next.pathname = path;
      out.push(next.toString());
    };
    // nastoms スマートポートフォールバック順
    const fallbacks: Array<{ protocol: string; port: string }> = [
      { protocol: "http:", port: "5000" },
      { protocol: "https:", port: "5006" },
      { protocol: "http:", port: "8080" },
      { protocol: "http:", port: "55222" },
      { protocol: "https:", port: "5001" },
    ];
    for (const fb of fallbacks) {
      if (u.port === fb.port && u.protocol === fb.protocol) continue;
      add(fb.protocol, fb.port);
    }
  } catch {
    /* invalid URL */
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

async function nodeFetchWithOptionalAgent(
  url: string,
  init: RequestInit,
  agent?: https.Agent
): Promise<Response> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const lib = isHttps ? https : http;
  const headers = init.headers as Record<string, string> | undefined;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? "GET",
        headers,
        agent: isHttps ? agent : undefined,
        timeout: DEFAULT_WEBDAV_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve(
            new Response(buf, {
              status: res.statusCode ?? 0,
              headers: res.headers as HeadersInit,
            })
          );
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`WebDAV timeout after ${DEFAULT_WEBDAV_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    try {
      writeRequestBody(req, init.body);
    } catch (e) {
      req.destroy();
      reject(e);
      return;
    }
    req.end();
  });
}

/** QNAP WebDAV 向け fetch — オレオレ証明書・Tailscale 経路を許容 */
export async function qnapWebDavFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const insecure = shouldUseInsecureTls(url);
  try {
    return await nodeFetchWithOptionalAgent(
      url,
      init,
      insecure ? insecureHttpsAgent : undefined
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!insecure && isCertificateFetchError(msg)) {
      return nodeFetchWithOptionalAgent(url, init, insecureHttpsAgent);
    }
    throw e;
  }
}

export { formatFetchError };
