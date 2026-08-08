/**
 * QNAP 多重ホスト・ポート並行探索 v1
 *
 * Tailscale IP / MagicDNS / LAN を同時プローブし、
 * 最速で HTTP 応答したルートを採択する。
 */
import {
  DEFAULT_WEBDAV_TIMEOUT_MS,
  qnapWebDavFetch,
  withQnapWebDavHeaders,
} from "../business/services/qnap-webdav-fetch-v1.js";
import {
  DOCUMENT_NAS_HOST,
  DOCUMENT_NAS_NAME,
  webDavProtocolForPort,
} from "./qnap-nas-hosts-v1.js";

/** 既定 Tailscale CGNAT IP（nastoms） */
export const QNAP_PARALLEL_PROBE_DEFAULT_TS = "100.99.31.120";

/** MagicDNS / mDNS ホスト名候補 */
export const DOCUMENT_NAS_MAGIC_DNS_HOSTS = [
  DOCUMENT_NAS_NAME,
  `${DOCUMENT_NAS_NAME}.local`,
] as const;

function resolveProbeTailscaleHost(explicit?: string | null): string {
  const fromArg = String(explicit || "").trim();
  if (fromArg) return fromArg;
  const fromEnv = String(
    process.env.QNAP_TAILSCALE_HOST || process.env.QNAP_HOST || ""
  ).trim();
  if (fromEnv && /^100\./.test(fromEnv)) return fromEnv;
  const url = String(process.env.QNAP_WEBDAV_URL || "").trim();
  if (url) {
    try {
      const h = new URL(url).hostname;
      if (h) return h;
    } catch {
      /* */
    }
  }
  if (fromEnv) return fromEnv;
  return QNAP_PARALLEL_PROBE_DEFAULT_TS;
}

export type QnapParallelProbeTargetV1 = {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: "http" | "https";
  /** プローブ URL（ルート） */
  url: string;
  /** WebDAV ベース（/TiSLY） */
  webdavUrl: string;
};

export type QnapParallelProbeHitV1 = {
  target: QnapParallelProbeTargetV1;
  ok: boolean;
  reachable: boolean;
  latencyMs: number;
  httpStatus: number | null;
  errorCode: string | null;
  message: string;
};

export type QnapParallelProbeResultV1 = {
  ok: boolean;
  /** 最速で応答した到達可能ターゲット（無ければ null） */
  fastest: QnapParallelProbeHitV1 | null;
  /** 到達可能を latency 昇順 */
  reachable: QnapParallelProbeHitV1[];
  hits: QnapParallelProbeHitV1[];
  /** トースト／API 用 1 行サマリー */
  summary: string;
  testedAt: string;
};

/**
 * HTTP 応答があれば「ホスト到達」とみなす（WebDAV 可否は別判定）。
 * 200 / 301 / 401 / 501 等を含む。
 */
export function isHostReachableHttpStatus(status: number): boolean {
  const s = Number(status);
  if (!Number.isFinite(s) || s <= 0) return false;
  if (s === 200 || s === 201 || s === 204 || s === 207) return true;
  if (s === 301 || s === 302 || s === 303 || s === 307 || s === 308) return true;
  if (s === 401 || s === 403 || s === 404 || s === 405) return true;
  if (s === 501) return true;
  return s >= 200 && s < 600;
}

export function listQnapParallelProbeTargetsV1(options?: {
  tailscaleHost?: string | null;
  lanHost?: string | null;
  magicDnsHosts?: string[] | null;
  shareName?: string | null;
}): QnapParallelProbeTargetV1[] {
  const ts = resolveProbeTailscaleHost(options?.tailscaleHost);
  const lan =
    String(options?.lanHost || "").trim() ||
    String(process.env.QNAP_LOCAL_HOST || "").trim() ||
    DOCUMENT_NAS_HOST;
  const magic =
    Array.isArray(options?.magicDnsHosts) && options!.magicDnsHosts!.length > 0
      ? options!.magicDnsHosts!.map((h) => String(h || "").trim()).filter(Boolean)
      : [...DOCUMENT_NAS_MAGIC_DNS_HOSTS];
  const share =
    String(options?.shareName || "").trim().replace(/^\/+|\/+$/g, "") || "TiSLY";

  const specs: Array<{
    id: string;
    label: string;
    host: string;
    port: number;
  }> = [
    {
      id: "ts_8080",
      label: `Tailscale ${ts}:8080`,
      host: ts,
      port: 8080,
    },
    {
      id: "ts_5005",
      label: `Tailscale ${ts}:5005`,
      host: ts,
      port: 5005,
    },
    {
      id: "ts_5006",
      label: `Tailscale ${ts}:5006 HTTPS`,
      host: ts,
      port: 5006,
    },
  ];

  for (const h of magic) {
    specs.push({
      id: `magic_${h}_8080`,
      label: `MagicDNS ${h}:8080`,
      host: h,
      port: 8080,
    });
  }

  if (lan && lan !== ts && !magic.includes(lan)) {
    specs.push({
      id: "lan_8080",
      label: `LAN ${lan}:8080`,
      host: lan,
      port: 8080,
    });
  }

  const seen = new Set<string>();
  const out: QnapParallelProbeTargetV1[] = [];
  for (const s of specs) {
    const protocol = webDavProtocolForPort(s.port);
    const key = `${protocol}://${s.host}:${s.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: s.id,
      label: s.label,
      host: s.host,
      port: s.port,
      protocol,
      url: `${protocol}://${s.host}:${s.port}/`,
      webdavUrl: `${protocol}://${s.host}:${s.port}/${share}`,
    });
  }
  return out;
}

function classifyProbeError(raw: string): string {
  const msg = raw || "";
  if (/ECONNREFUSED/i.test(msg)) return "ECONNREFUSED";
  if (/ETIMEDOUT|timeout/i.test(msg)) return "ETIMEDOUT";
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return "ENOTFOUND";
  if (/EHOSTUNREACH|ENETUNREACH/i.test(msg)) return "EHOSTUNREACH";
  if (/certificate|UNABLE_TO_VERIFY|SELF_SIGNED|SSL|TLS/i.test(msg)) {
    return "TLS_CERT";
  }
  return "ERROR";
}

async function probeOneTarget(
  target: QnapParallelProbeTargetV1,
  headers?: Record<string, string>
): Promise<QnapParallelProbeHitV1> {
  const started = Date.now();
  const hdrs = withQnapWebDavHeaders(headers);
  try {
    // 到達性: OPTIONS → 失敗時 GET（管理 UI でも応答すればホスト生存）
    let status = 0;
    let method = "OPTIONS";
    try {
      const opt = await qnapWebDavFetch(target.url, {
        method: "OPTIONS",
        headers: hdrs,
      });
      status = opt.status;
    } catch {
      method = "GET";
      const get = await qnapWebDavFetch(target.url, {
        method: "GET",
        headers: hdrs,
      });
      status = get.status;
    }
    if (!status) {
      method = "GET";
      const get = await qnapWebDavFetch(target.url, {
        method: "GET",
        headers: hdrs,
      });
      status = get.status;
    }
    const latencyMs = Date.now() - started;
    const reachable = isHostReachableHttpStatus(status);
    return {
      target,
      ok: reachable,
      reachable,
      latencyMs,
      httpStatus: status,
      errorCode: reachable ? null : `HTTP ${status}`,
      message: reachable
        ? `${method} HTTP ${status} (${latencyMs}ms)`
        : `${method} failed: HTTP ${status}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      target,
      ok: false,
      reachable: false,
      latencyMs: Date.now() - started,
      httpStatus: null,
      errorCode: classifyProbeError(msg),
      message: msg.slice(0, 180),
    };
  }
}

/** 失敗ホスト:ポート を短い一覧にする */
export function formatQnapProbeFailureSummaryV1(
  hits: QnapParallelProbeHitV1[]
): string {
  const failed = hits.filter((h) => !h.reachable);
  if (failed.length === 0) return "";
  return failed
    .map((h) => {
      const code = h.errorCode || (h.httpStatus ? `HTTP${h.httpStatus}` : "FAIL");
      return `${h.target.host}:${h.target.port}=${code}`;
    })
    .join(" / ");
}

/** 成功時: 採択ルート + 失敗ルート概要 */
export function formatQnapProbeResultSummaryV1(
  result: Pick<QnapParallelProbeResultV1, "fastest" | "hits" | "ok">
): string {
  const failPart = formatQnapProbeFailureSummaryV1(result.hits);
  if (result.fastest?.reachable) {
    const f = result.fastest;
    const win = `${f.target.host}:${f.target.port} (${f.latencyMs}ms)`;
    if (failPart) return `到達: ${win}｜不通: ${failPart}`;
    return `到達: ${win}`;
  }
  if (failPart) {
    return `全ホスト不通: ${failPart}`;
  }
  return "全ホスト不通（詳細なし）";
}

/**
 * 指定ターゲットを並行プローブし、最速到達ルートを返す。
 * 各試行は DEFAULT_WEBDAV_TIMEOUT_MS（既定 3s）で打ち切る。
 */
export async function probeQnapHostsInParallelV1(options?: {
  tailscaleHost?: string | null;
  lanHost?: string | null;
  magicDnsHosts?: string[] | null;
  shareName?: string | null;
  headers?: Record<string, string> | null;
  /** テスト用にターゲット上書き */
  targets?: QnapParallelProbeTargetV1[] | null;
}): Promise<QnapParallelProbeResultV1> {
  const targets =
    options?.targets && options.targets.length > 0
      ? options.targets
      : listQnapParallelProbeTargetsV1(options);

  const hits = await Promise.all(
    targets.map((t) => probeOneTarget(t, options?.headers || undefined))
  );

  const reachable = hits
    .filter((h) => h.reachable)
    .sort((a, b) => a.latencyMs - b.latencyMs);
  const fastest = reachable[0] || null;
  const summary = formatQnapProbeResultSummaryV1({
    ok: Boolean(fastest),
    fastest,
    hits,
  });

  console.log(
    `[QNAP parallel-probe] ${summary} (timeout=${DEFAULT_WEBDAV_TIMEOUT_MS}ms targets=${targets.length})`
  );

  return {
    ok: Boolean(fastest),
    fastest,
    reachable,
    hits,
    summary,
    testedAt: new Date().toISOString(),
  };
}
