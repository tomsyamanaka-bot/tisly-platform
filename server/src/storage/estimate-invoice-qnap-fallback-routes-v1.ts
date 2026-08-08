/**
 * 見積・請求 PDF — QNAP 多重フォールバックルート v1
 *
 * 事前に並行ホスト探索（Tailscale IP / MagicDNS / LAN）で最速ルートを採択し、
 * 到達済みホストから順に保存を試行する。
 *
 * 候補:
 * 1. http://{tailscale}:8080 WebDAV
 * 2. http://{tailscale}:8080 File Station
 * 3. http://{tailscale}:5005 WebDAV
 * 4. https://{tailscale}:5006 WebDAV
 * 5. http://nastoms:8080 / http://nastoms.local:8080（MagicDNS）
 * 6. http://{lan}:8080 WebDAV
 * 7. VPS ローカル一時保持（pending キュー）
 *
 * 各リモートルートで /TiSLY/Invoices_Estimates/ を MKCOL 作成し、
 * 403/404 時は /Public/TiSLY/Invoices_Estimates/ へフォールバック。
 */
import fs from "fs";
import path from "path";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
import type { QnapUploadConfig } from "../business/services/qnapBusinessArchive.js";
import { probeWebDavEndpoint } from "../business/services/qnap-webdav-fetch-v1.js";
import { qnapBasicAuthHeaders } from "./qnap-basic-auth-v1.js";
import { uploadViaFileStationV1 } from "./qnap-file-station-client-v1.js";
import {
  DOCUMENT_NAS_HOST,
  DOCUMENT_NAS_NAME,
  DOCUMENT_NAS_SHARE,
  documentNasPdfSaveSuccessMessage,
} from "./qnap-nas-hosts-v1.js";
import { classifyQnapNetworkError } from "./qnap-network-diagnose-v1.js";
import {
  DOCUMENT_NAS_MAGIC_DNS_HOSTS,
  formatQnapProbeResultSummaryV1,
  probeQnapHostsInParallelV1,
  QNAP_PARALLEL_PROBE_DEFAULT_TS,
  type QnapParallelProbeResultV1,
} from "./qnap-parallel-host-probe-v1.js";
import { buildWebDavUrl } from "./qnap-storage-service.js";
import {
  listInvoiceEstimatePathCandidatesV1,
  rewriteWebDavBaseForPublicTislyV1,
  shouldFallbackToPublicTislyV1,
  type QnapInvoicePathRootKindV1,
} from "./estimate-invoice-qnap-path-roots-v1.js";

export const DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT = QNAP_PARALLEL_PROBE_DEFAULT_TS;

export type QnapFallbackRouteKindV1 =
  | "webdav_http_8080"
  | "file_station_8080"
  | "webdav_http_5005"
  | "webdav_https_5006"
  | "webdav_magic_dns_8080"
  | "webdav_lan_8080"
  | "local_pending";

export type QnapFallbackRouteV1 = {
  kind: QnapFallbackRouteKindV1;
  label: string;
  /** WebDAV ベース URL（File Station / pending は空） */
  webdavUrl?: string;
  /** File Station utilRequest.cgi */
  fileStationUrl?: string;
};

export type QnapFallbackUploadFileV1 = {
  kind: "estimate" | "invoice";
  localPath: string;
  remotePath: string;
  displayPath: string;
  absolutePath?: string;
  fileName?: string;
};

export type QnapCommStepV1 = {
  at: string;
  method: string;
  urlOrPath: string;
  status?: number | null;
  ok: boolean;
  detail?: string;
};

export type QnapFallbackAttemptV1 = {
  route: QnapFallbackRouteKindV1;
  label: string;
  ok: boolean;
  error?: string;
  host?: string;
  port?: number;
  pathRoot?: QnapInvoicePathRootKindV1;
  absolutePaths?: string[];
};

export type QnapFallbackUploadResultV1 = {
  ok: boolean;
  /** リモート保存成功（pending ではない） */
  remoteOk: boolean;
  pendingSync: boolean;
  route: QnapFallbackRouteKindV1;
  host: string;
  port: number;
  message: string;
  attempts: QnapFallbackAttemptV1[];
  files: Array<
    QnapFallbackUploadFileV1 & {
      ok: boolean;
      error?: string;
      absolutePath?: string;
      pathRoot?: QnapInvoicePathRootKindV1;
    }
  >;
  errorCode?: string | null;
  steps: QnapCommStepV1[];
  /** 実際に書き込んだ絶対パス */
  savedAbsolutePaths: string[];
  /** 並行ホスト探索サマリー（トースト／診断用） */
  probeSummary?: string | null;
  probe?: QnapParallelProbeResultV1 | null;
};

export function resolveDocumentNasTailscaleHost(
  explicit?: string | null
): string {
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
  return DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT;
}

export function listQnapFallbackRoutesV1(options?: {
  tailscaleHost?: string | null;
  lanHost?: string | null;
  shareName?: string | null;
  magicDnsHosts?: string[] | null;
}): QnapFallbackRouteV1[] {
  const ts = resolveDocumentNasTailscaleHost(options?.tailscaleHost);
  const lan =
    String(options?.lanHost || "").trim() ||
    String(process.env.QNAP_LOCAL_HOST || "").trim() ||
    DOCUMENT_NAS_HOST;
  const share =
    String(options?.shareName || "").trim() ||
    String(process.env.QNAP_SHARE || "").trim() ||
    DOCUMENT_NAS_SHARE;
  const magic =
    Array.isArray(options?.magicDnsHosts) && options!.magicDnsHosts!.length > 0
      ? options!.magicDnsHosts!.map((h) => String(h || "").trim()).filter(Boolean)
      : [...DOCUMENT_NAS_MAGIC_DNS_HOSTS];

  const routes: QnapFallbackRouteV1[] = [
    {
      kind: "webdav_http_8080",
      label: `WebDAV HTTP ${ts}:8080`,
      webdavUrl: buildWebDavUrl(ts, 8080, share),
    },
    {
      kind: "file_station_8080",
      label: `File Station ${ts}:8080`,
      fileStationUrl: `http://${ts}:8080/cgi-bin/filemanager/utilRequest.cgi`,
    },
    {
      kind: "webdav_http_5005",
      label: `WebDAV HTTP ${ts}:5005`,
      webdavUrl: buildWebDavUrl(ts, 5005, share),
    },
    {
      kind: "webdav_https_5006",
      label: `WebDAV HTTPS ${ts}:5006`,
      webdavUrl: buildWebDavUrl(ts, 5006, share),
    },
  ];

  for (const h of magic) {
    if (!h || h === ts || h === lan) continue;
    routes.push({
      kind: "webdav_magic_dns_8080",
      label: `WebDAV MagicDNS ${h}:8080`,
      webdavUrl: buildWebDavUrl(h, 8080, share),
    });
  }

  if (lan && lan !== ts) {
    routes.push({
      kind: "webdav_lan_8080",
      label: `WebDAV LAN ${lan}:8080`,
      webdavUrl: buildWebDavUrl(lan, 8080, share),
    });
  }

  routes.push({
    kind: "local_pending",
    label: "VPS ローカル一時保持",
  });
  return routes;
}

/**
 * 並行探索結果に基づき、到達ホストのルートを先頭へ並べ替える。
 * 100.x:8080（WebDAV / File Station）が到達済みなら常に最優先。
 */
export function orderQnapFallbackRoutesByProbeV1(
  routes: QnapFallbackRouteV1[],
  probe: QnapParallelProbeResultV1 | null | undefined
): QnapFallbackRouteV1[] {
  if (!probe?.reachable?.length) return routes;
  const pending = routes.filter((r) => r.kind === "local_pending");
  const remote = routes.filter((r) => r.kind !== "local_pending");

  const score = (route: QnapFallbackRouteV1): number => {
    let host = "";
    let port = 0;
    try {
      if (route.webdavUrl) {
        const u = new URL(route.webdavUrl);
        host = u.hostname;
        port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
      } else if (route.fileStationUrl) {
        const u = new URL(route.fileStationUrl);
        host = u.hostname;
        port = Number(u.port) || 80;
      }
    } catch {
      return 1_000_000;
    }
    const hit = probe.reachable.find(
      (h) =>
        h.target.host === host &&
        (h.target.port === port ||
          (route.kind === "file_station_8080" &&
            h.target.port === 8080 &&
            port === 8080))
    );
    if (!hit) return 900_000;
    // 到達確認済み 8080（WebDAV → File Station）を他ポートより常に優先
    const is8080 =
      port === 8080 ||
      route.kind === "webdav_http_8080" ||
      route.kind === "file_station_8080" ||
      route.kind === "webdav_magic_dns_8080" ||
      route.kind === "webdav_lan_8080";
    const portBias = is8080 ? 0 : 100_000;
    const kindBias =
      route.kind === "webdav_http_8080"
        ? 0
        : route.kind === "file_station_8080"
          ? 0.5
          : 1;
    return portBias + hit.latencyMs + kindBias;
  };

  const ordered = [...remote].sort((a, b) => score(a) - score(b));
  return [...ordered, ...pending];
}

function fileNameOf(f: QnapFallbackUploadFileV1): string {
  if (f.fileName?.trim()) return f.fileName.trim();
  const fromRemote = path.posix.basename(
    String(f.remotePath || "").replace(/\\/g, "/")
  );
  if (fromRemote && fromRemote !== "." && fromRemote !== "/") return fromRemote;
  return path.basename(f.localPath) || "document.pdf";
}

function nowIso(): string {
  return new Date().toISOString();
}

async function uploadBatchViaExactWebDav(
  webdavUrl: string,
  username: string,
  password: string,
  files: QnapFallbackUploadFileV1[]
): Promise<{
  ok: boolean;
  error?: string;
  host: string;
  port: number;
  pathRoot?: QnapInvoicePathRootKindV1;
  absolutePaths: string[];
  steps: QnapCommStepV1[];
  files: Array<
    QnapFallbackUploadFileV1 & {
      ok: boolean;
      error?: string;
      absolutePath?: string;
      pathRoot?: QnapInvoicePathRootKindV1;
    }
  >;
}> {
  let host = DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT;
  let port = 5005;
  const steps: QnapCommStepV1[] = [];
  try {
    const u = new URL(webdavUrl);
    host = u.hostname;
    port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
  } catch {
    /* */
  }

  const headers = qnapBasicAuthHeaders(username, password);
  const probe = await probeWebDavEndpoint(webdavUrl, headers);
  steps.push({
    at: nowIso(),
    method: probe.method,
    urlOrPath: webdavUrl,
    status: probe.status,
    ok: probe.ok,
    detail: probe.message,
  });
  if (!probe.ok) {
    return {
      ok: false,
      error: probe.message,
      host,
      port,
      absolutePaths: [],
      steps,
      files: files.map((f) => ({ ...f, ok: false, error: probe.message })),
    };
  }

  const cfg: QnapUploadConfig & { exactUrlOnly?: boolean } = {
    mode: "real",
    webdavUrl,
    username,
    password,
    basePath: "/",
    exactUrlOnly: true,
  };

  const existing = files.filter(
    (f) => f.localPath && fs.existsSync(f.localPath)
  );
  if (existing.length === 0) {
    return {
      ok: false,
      error: "アップロード対象 PDF がありません",
      host,
      port,
      absolutePaths: [],
      steps,
      files: files.map((f) => ({
        ...f,
        ok: false,
        error: "ローカル PDF 欠落",
      })),
    };
  }

  // primary /TiSLY → 403/404 で /Public/TiSLY（ベース URL も切替）
  const rootKinds: QnapInvoicePathRootKindV1[] = ["tisly", "public_tisly"];
  let lastError = "WebDAV upload failed";

  for (const rootKind of rootKinds) {
    const effectiveUrl =
      rootKind === "public_tisly"
        ? rewriteWebDavBaseForPublicTislyV1(webdavUrl)
        : webdavUrl;
    const payload = existing.map((f) => {
      const name = fileNameOf(f);
      const candidates = listInvoiceEstimatePathCandidatesV1(name, effectiveUrl);
      const chosen =
        candidates.find((c) => c.kind === rootKind) || candidates[0];
      return {
        file: f,
        localPath: f.localPath,
        remotePath: chosen.remoteRel,
        absolutePath: chosen.absolutePath,
        pathRoot: chosen.kind,
      };
    });

    try {
      const clientForRoot = new QnapWebDavClient({
        ...cfg,
        webdavUrl: effectiveUrl,
      });
      clientForRoot.lockToExactUrl(effectiveUrl);
      const result = await clientForRoot.uploadLocalFiles(
        payload.map((p) => ({
          localPath: p.localPath,
          remotePath: p.remotePath,
        }))
      );
      for (const s of result.steps) {
        steps.push({
          at: nowIso(),
          method: s.method,
          urlOrPath: s.urlOrPath,
          status: s.status ?? null,
          ok: s.ok,
          detail: `${rootKind}: ${s.detail || ""}`.trim(),
        });
      }
      if (result.count < payload.length) {
        lastError = `WebDAV PUT 不完全 (${result.count}/${payload.length})`;
        if (rootKind === "tisly") continue;
        break;
      }
      const absolutePaths = payload.map((p) => p.absolutePath);
      console.log(
        `[QNAP WebDAV] saved via ${rootKind}: ${absolutePaths.join(", ")}`
      );
      return {
        ok: true,
        host,
        port,
        pathRoot: rootKind,
        absolutePaths,
        steps,
        files: files.map((f) => {
          const match = payload.find((p) => p.file.kind === f.kind);
          if (!match) return { ...f, ok: false, error: "not uploaded" };
          return {
            ...f,
            ok: true,
            remotePath: match.remotePath,
            displayPath: match.absolutePath,
            absolutePath: match.absolutePath,
            pathRoot: match.pathRoot,
          };
        }),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status =
        typeof (e as { status?: number })?.status === "number"
          ? (e as { status: number }).status
          : null;
      const mkcolSteps = (e as { mkcolSteps?: Array<{ url: string; status: number; ok: boolean; segment: string }> })
        ?.mkcolSteps;
      if (mkcolSteps) {
        for (const s of mkcolSteps) {
          steps.push({
            at: nowIso(),
            method: "MKCOL",
            urlOrPath: s.url,
            status: s.status,
            ok: s.ok,
            detail: `${rootKind}: segment=${s.segment}`,
          });
        }
      } else {
        steps.push({
          at: nowIso(),
          method: "UPLOAD",
          urlOrPath: webdavUrl,
          status,
          ok: false,
          detail: `${rootKind}: ${msg}`,
        });
      }
      lastError = msg;
      const canFallback =
        rootKind === "tisly" &&
        shouldFallbackToPublicTislyV1(status ?? msg);
      console.warn(
        `[QNAP WebDAV] ${rootKind} failed: ${msg}${canFallback ? " → try Public/TiSLY" : ""}`
      );
      if (canFallback) continue;
      break;
    }
  }

  return {
    ok: false,
    error: lastError,
    host,
    port,
    absolutePaths: [],
    steps,
    files: files.map((f) => ({ ...f, ok: false, error: lastError })),
  };
}

async function uploadBatchViaFileStation(
  utilUrl: string,
  username: string,
  password: string,
  files: QnapFallbackUploadFileV1[],
  shareName: string
): Promise<{
  ok: boolean;
  error?: string;
  host: string;
  port: number;
  pathRoot?: QnapInvoicePathRootKindV1;
  absolutePaths: string[];
  steps: QnapCommStepV1[];
  files: Array<
    QnapFallbackUploadFileV1 & {
      ok: boolean;
      error?: string;
      absolutePath?: string;
      pathRoot?: QnapInvoicePathRootKindV1;
    }
  >;
}> {
  let lastHost = DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT;
  let lastPort = 8080;
  let lastError = "File Station upload failed";
  const steps: QnapCommStepV1[] = [];
  const outFiles: Array<
    QnapFallbackUploadFileV1 & {
      ok: boolean;
      error?: string;
      absolutePath?: string;
      pathRoot?: QnapInvoicePathRootKindV1;
    }
  > = [];
  const absolutePaths: string[] = [];
  let pathRoot: QnapInvoicePathRootKindV1 | undefined;

  for (const f of files) {
    if (!f.localPath || !fs.existsSync(f.localPath)) {
      return {
        ok: false,
        error: `ローカル PDF 欠落: ${f.kind}`,
        host: lastHost,
        port: lastPort,
        absolutePaths: [],
        steps,
        files: files.map((x) => ({
          ...x,
          ok: false,
          error: `ローカル PDF 欠落: ${x.kind}`,
        })),
      };
    }

    const name = fileNameOf(f);
    const candidates = listInvoiceEstimatePathCandidatesV1(name, null);
    let uploaded = false;
    let fileError = lastError;

    for (const cand of candidates) {
      const result = await uploadViaFileStationV1({
        utilRequestUrl: utilUrl,
        username,
        password,
        localAbs: f.localPath,
        remoteRel:
          cand.kind === "tisly"
            ? buildInvoicesEstimatesRelForFileStation(name)
            : buildInvoicesEstimatesPublicRelForFileStation(name),
        shareName: cand.kind === "tisly" ? shareName || "TiSLY" : "Public",
      });
      lastHost = result.host;
      lastPort = result.port;
      steps.push({
        at: nowIso(),
        method: "FILE_STATION_UPLOAD",
        urlOrPath: result.destPath || cand.absolutePath,
        status: result.ok ? 200 : null,
        ok: result.ok,
        detail: result.ok
          ? `saved ${cand.absolutePath}`
          : result.error || "fail",
      });
      if (result.ok) {
        uploaded = true;
        pathRoot = cand.kind;
        absolutePaths.push(cand.absolutePath);
        outFiles.push({
          ...f,
          ok: true,
          remotePath: cand.remoteRel,
          displayPath: cand.absolutePath,
          absolutePath: cand.absolutePath,
          pathRoot: cand.kind,
        });
        break;
      }
      fileError = result.error || fileError;
      if (
        cand.kind === "tisly" &&
        shouldFallbackToPublicTislyV1(result.error)
      ) {
        continue;
      }
      // non-403/404 on primary still try public once
      if (cand.kind === "tisly") continue;
    }

    if (!uploaded) {
      lastError = fileError;
      return {
        ok: false,
        error: lastError,
        host: lastHost,
        port: lastPort,
        absolutePaths,
        steps,
        files: [
          ...outFiles,
          ...files
            .slice(outFiles.length)
            .map((x) => ({ ...x, ok: false, error: lastError })),
        ],
      };
    }
  }

  return {
    ok: true,
    host: lastHost,
    port: lastPort,
    pathRoot,
    absolutePaths,
    steps,
    files: outFiles.length === files.length ? outFiles : files.map((f) => {
      const m = outFiles.find((o) => o.kind === f.kind);
      return m || { ...f, ok: false, error: lastError };
    }),
  };
}

function buildInvoicesEstimatesRelForFileStation(fileName: string): string {
  const cand = listInvoiceEstimatePathCandidatesV1(fileName)[0];
  // share=TiSLY のとき dest は /TiSLY/Invoices_Estimates/... → remoteRel = Invoices_Estimates/...
  return cand.remoteRel;
}

function buildInvoicesEstimatesPublicRelForFileStation(fileName: string): string {
  const cand = listInvoiceEstimatePathCandidatesV1(fileName)[1];
  // share=Public のとき remoteRel = TiSLY/Invoices_Estimates/...
  return `TiSLY/${cand.remoteRel.replace(/^Public\/TiSLY\//, "").replace(/^TiSLY\//, "")}`;
}

/**
 * 多重ルートで一括アップロード。全滅時は remoteOk=false / pendingSync 候補。
 * 事前に並行ホスト探索で最速到達ルートを先頭化する。
 */
export async function uploadEstimateInvoiceWithFallbackV1(options: {
  username: string;
  password: string;
  files: QnapFallbackUploadFileV1[];
  tailscaleHost?: string | null;
  lanHost?: string | null;
  shareName?: string | null;
  /** Worker 再送時は local_pending をスキップしてリモートのみ試行 */
  skipLocalPending?: boolean;
  /** 並行探索をスキップ（単体テスト用） */
  skipParallelProbe?: boolean;
}): Promise<QnapFallbackUploadResultV1> {
  const authHeaders = qnapBasicAuthHeaders(options.username, options.password);
  let probe: QnapParallelProbeResultV1 | null = null;
  let probeSummary: string | null = null;

  if (!options.skipParallelProbe) {
    try {
      probe = await probeQnapHostsInParallelV1({
        tailscaleHost: options.tailscaleHost,
        lanHost: options.lanHost,
        shareName: options.shareName,
        headers: authHeaders,
      });
      probeSummary = probe.summary;
    } catch (e) {
      probeSummary = `並行探索失敗: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`[QNAP fallback] parallel probe error:`, probeSummary);
    }
  }

  const listed = listQnapFallbackRoutesV1({
    tailscaleHost: options.tailscaleHost,
    lanHost: options.lanHost,
    shareName: options.shareName,
  });
  const routes = orderQnapFallbackRoutesByProbeV1(listed, probe).filter(
    (r) => !(options.skipLocalPending && r.kind === "local_pending")
  );
  const share =
    String(options.shareName || "").trim() || DOCUMENT_NAS_SHARE;
  const attempts: QnapFallbackAttemptV1[] = [];
  const allSteps: QnapCommStepV1[] = [];
  let lastHost = resolveDocumentNasTailscaleHost(options.tailscaleHost);
  let lastPort = 5005;
  let lastCode: string | null = null;

  if (probeSummary) {
    allSteps.push({
      at: nowIso(),
      method: "PARALLEL_PROBE",
      urlOrPath: "hosts+ports",
      status: probe?.ok ? 200 : null,
      ok: Boolean(probe?.ok),
      detail: probeSummary,
    });
  }

  // 最速到達ホストがあれば、まずその WebDAV URL で直接試行（ルート一覧と重複可）
  if (probe?.fastest?.reachable) {
    const fast = probe.fastest;
    const directUrl = fast.target.webdavUrl;
    try {
      const result = await uploadBatchViaExactWebDav(
        directUrl,
        options.username,
        options.password,
        options.files
      );
      lastHost = result.host;
      lastPort = result.port;
      allSteps.push(...result.steps);
      if (result.ok) {
        attempts.push({
          route: "webdav_http_8080",
          label: `並行採択 ${fast.target.label}`,
          ok: true,
          host: result.host,
          port: result.port,
          pathRoot: result.pathRoot,
          absolutePaths: result.absolutePaths,
        });
        console.log(
          `[QNAP fallback] success via parallel-fastest ${result.host}:${result.port} paths=${result.absolutePaths.join(", ")}`
        );
        return {
          ok: true,
          remoteOk: true,
          pendingSync: false,
          route:
            result.port === 5006
              ? "webdav_https_5006"
              : result.port === 5005
                ? "webdav_http_5005"
                : result.host === DOCUMENT_NAS_HOST
                  ? "webdav_lan_8080"
                  : result.host === DOCUMENT_NAS_NAME ||
                      result.host.endsWith(".local")
                    ? "webdav_magic_dns_8080"
                    : "webdav_http_8080",
          host: result.host,
          port: result.port,
          message: documentNasPdfSaveSuccessMessage(result.absolutePaths),
          attempts,
          files: result.files,
          errorCode: null,
          steps: allSteps,
          savedAbsolutePaths: result.absolutePaths,
          probeSummary,
          probe,
        };
      }
      const classified = classifyQnapNetworkError(result.error || "", null);
      lastCode = classified.errorCode;
      attempts.push({
        route: "webdav_http_8080",
        label: `並行採択 ${fast.target.label}`,
        ok: false,
        error: result.error,
        host: result.host,
        port: result.port,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastCode = classifyQnapNetworkError(msg, null).errorCode;
      attempts.push({
        route: "webdav_http_8080",
        label: `並行採択 ${fast.target.label}`,
        ok: false,
        error: msg,
        host: fast.target.host,
        port: fast.target.port,
      });
    }
  }

  for (const route of routes) {
    if (route.kind === "local_pending") {
      attempts.push({
        route: route.kind,
        label: route.label,
        ok: true,
        host: lastHost,
        port: lastPort,
      });
      const summaryMsg =
        probeSummary ||
        formatQnapProbeResultSummaryV1({
          ok: false,
          fastest: null,
          hits: [],
        });
      return {
        ok: true,
        remoteOk: false,
        pendingSync: true,
        route: "local_pending",
        host: lastHost,
        port: lastPort,
        message: `一時保存完了（QNAPへ自動同期待ち）｜${summaryMsg}`,
        attempts,
        files: options.files.map((f) => ({
          ...f,
          ok: true,
          error: undefined,
        })),
        errorCode: lastCode,
        steps: allSteps,
        savedAbsolutePaths: [],
        probeSummary: summaryMsg,
        probe,
      };
    }

    // 並行採択で既に試した URL はスキップ
    if (
      probe?.fastest?.reachable &&
      route.webdavUrl &&
      route.webdavUrl.replace(/\/+$/, "") ===
        probe.fastest.target.webdavUrl.replace(/\/+$/, "")
    ) {
      continue;
    }

    try {
      let result: Awaited<ReturnType<typeof uploadBatchViaExactWebDav>>;
      if (route.kind === "file_station_8080" && route.fileStationUrl) {
        result = await uploadBatchViaFileStation(
          route.fileStationUrl,
          options.username,
          options.password,
          options.files,
          share
        );
      } else if (route.webdavUrl) {
        result = await uploadBatchViaExactWebDav(
          route.webdavUrl,
          options.username,
          options.password,
          options.files
        );
      } else {
        result = {
          ok: false,
          error: "route misconfigured",
          host: lastHost,
          port: lastPort,
          absolutePaths: [],
          steps: [],
          files: options.files.map((f) => ({
            ...f,
            ok: false,
            error: "route misconfigured",
          })),
        };
      }

      lastHost = result.host;
      lastPort = result.port;
      allSteps.push(...result.steps);

      if (result.ok) {
        attempts.push({
          route: route.kind,
          label: route.label,
          ok: true,
          host: result.host,
          port: result.port,
          pathRoot: result.pathRoot,
          absolutePaths: result.absolutePaths,
        });
        console.log(
          `[QNAP fallback] success via ${route.kind} ${result.host}:${result.port} paths=${result.absolutePaths.join(", ")}`
        );
        return {
          ok: true,
          remoteOk: true,
          pendingSync: false,
          route: route.kind,
          host: result.host,
          port: result.port,
          message: documentNasPdfSaveSuccessMessage(result.absolutePaths),
          attempts,
          files: result.files,
          errorCode: null,
          steps: allSteps,
          savedAbsolutePaths: result.absolutePaths,
          probeSummary,
          probe,
        };
      }

      const classified = classifyQnapNetworkError(result.error || "", null);
      lastCode = classified.errorCode;
      attempts.push({
        route: route.kind,
        label: route.label,
        ok: false,
        error: result.error,
        host: result.host,
        port: result.port,
      });
      console.warn(
        `[QNAP fallback] fail ${route.kind}: ${result.error || "unknown"}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const classified = classifyQnapNetworkError(msg, null);
      lastCode = classified.errorCode;
      attempts.push({
        route: route.kind,
        label: route.label,
        ok: false,
        error: msg,
        host: lastHost,
        port: lastPort,
      });
      allSteps.push({
        at: nowIso(),
        method: "EXCEPTION",
        urlOrPath: route.webdavUrl || route.fileStationUrl || route.kind,
        status: null,
        ok: false,
        detail: msg,
      });
      console.warn(`[QNAP fallback] exception ${route.kind}:`, msg);
    }
  }

  const summaryMsg =
    probeSummary ||
    formatQnapProbeResultSummaryV1({ ok: false, fastest: null, hits: [] });
  return {
    ok: true,
    remoteOk: false,
    pendingSync: true,
    route: "local_pending",
    host: lastHost,
    port: lastPort,
    message: `一時保存完了（QNAPへ自動同期待ち）｜${summaryMsg}`,
    attempts,
    files: options.files.map((f) => ({ ...f, ok: true })),
    errorCode: lastCode,
    steps: allSteps,
    savedAbsolutePaths: [],
    probeSummary: summaryMsg,
    probe,
  };
}
