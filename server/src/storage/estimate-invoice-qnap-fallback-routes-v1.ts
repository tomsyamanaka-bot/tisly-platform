/**
 * 見積・請求 PDF — QNAP 多重フォールバックルート v1
 *
 * 順序:
 * 1. http://{tailscale}:5005  WebDAV HTTP
 * 2. https://{tailscale}:5006 WebDAV HTTPS
 * 3. http://{tailscale}:8080/cgi-bin/filemanager/utilRequest.cgi  File Station
 * 4. http://{lan}:8080 WebDAV（ローカル LAN）
 * 5. VPS ローカル一時保持（pending キュー）
 */
import fs from "fs";
import { QnapWebDavClient } from "../business/services/qnapWebDav.js";
import type { QnapUploadConfig } from "../business/services/qnapBusinessArchive.js";
import {
  probeWebDavEndpoint,
} from "../business/services/qnap-webdav-fetch-v1.js";
import { qnapBasicAuthHeaders } from "./qnap-basic-auth-v1.js";
import { uploadViaFileStationV1 } from "./qnap-file-station-client-v1.js";
import {
  DOCUMENT_NAS_HOST,
  DOCUMENT_NAS_SHARE,
} from "./qnap-nas-hosts-v1.js";
import { classifyQnapNetworkError } from "./qnap-network-diagnose-v1.js";
import { buildWebDavUrl } from "./qnap-storage-service.js";

export const DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT = "100.99.31.120";

export type QnapFallbackRouteKindV1 =
  | "webdav_http_5005"
  | "webdav_https_5006"
  | "file_station_8080"
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
};

export type QnapFallbackAttemptV1 = {
  route: QnapFallbackRouteKindV1;
  label: string;
  ok: boolean;
  error?: string;
  host?: string;
  port?: number;
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
  files: Array<QnapFallbackUploadFileV1 & { ok: boolean; error?: string }>;
  errorCode?: string | null;
};

export function resolveDocumentNasTailscaleHost(
  explicit?: string | null
): string {
  const fromArg = String(explicit || "").trim();
  if (fromArg) return fromArg;
  const fromEnv = String(
    process.env.QNAP_TAILSCALE_HOST ||
      process.env.QNAP_HOST ||
      ""
  ).trim();
  if (fromEnv && /^100\./.test(fromEnv)) return fromEnv;
  // 設定 URL からホスト抽出
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

  return [
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
    {
      kind: "file_station_8080",
      label: `File Station ${ts}:8080`,
      fileStationUrl: `http://${ts}:8080/cgi-bin/filemanager/utilRequest.cgi`,
    },
    {
      kind: "webdav_lan_8080",
      label: `WebDAV LAN ${lan}:8080`,
      webdavUrl: buildWebDavUrl(lan, 8080, share),
    },
    {
      kind: "local_pending",
      label: "VPS ローカル一時保持",
    },
  ];
}

async function uploadBatchViaExactWebDav(
  webdavUrl: string,
  username: string,
  password: string,
  files: QnapFallbackUploadFileV1[]
): Promise<{ ok: boolean; error?: string; host: string; port: number }> {
  let host = DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT;
  let port = 5005;
  try {
    const u = new URL(webdavUrl);
    host = u.hostname;
    port =
      Number(u.port) ||
      (u.protocol === "https:" ? 443 : 80);
  } catch {
    /* */
  }

  const headers = qnapBasicAuthHeaders(username, password);
  const probe = await probeWebDavEndpoint(webdavUrl, headers);
  if (!probe.ok) {
    return { ok: false, error: probe.message, host, port };
  }

  const cfg: QnapUploadConfig & { exactUrlOnly?: boolean } = {
    mode: "real",
    webdavUrl,
    username,
    password,
    basePath: "/",
    exactUrlOnly: true,
  };
  const client = new QnapWebDavClient(cfg);
  client.lockToExactUrl(webdavUrl);

  try {
    const payload = files
      .filter((f) => f.localPath && fs.existsSync(f.localPath))
      .map((f) => ({ localPath: f.localPath, remotePath: f.remotePath }));
    if (payload.length === 0) {
      return { ok: false, error: "アップロード対象 PDF がありません", host, port };
    }
    const count = await client.uploadLocalFiles(payload);
    if (count < payload.length) {
      return {
        ok: false,
        error: `WebDAV PUT 不完全 (${count}/${payload.length})`,
        host,
        port,
      };
    }
    return { ok: true, host, port };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, host, port };
  }
}

async function uploadBatchViaFileStation(
  utilUrl: string,
  username: string,
  password: string,
  files: QnapFallbackUploadFileV1[],
  shareName: string
): Promise<{ ok: boolean; error?: string; host: string; port: number }> {
  let lastHost = DOCUMENT_NAS_TAILSCALE_HOST_DEFAULT;
  let lastPort = 8080;
  let lastError = "File Station upload failed";
  for (const f of files) {
    if (!f.localPath || !fs.existsSync(f.localPath)) {
      return {
        ok: false,
        error: `ローカル PDF 欠落: ${f.kind}`,
        host: lastHost,
        port: lastPort,
      };
    }
    const result = await uploadViaFileStationV1({
      utilRequestUrl: utilUrl,
      username,
      password,
      localAbs: f.localPath,
      remoteRel: f.remotePath,
      shareName,
    });
    lastHost = result.host;
    lastPort = result.port;
    if (!result.ok) {
      lastError = result.error || lastError;
      return { ok: false, error: lastError, host: lastHost, port: lastPort };
    }
  }
  return { ok: true, host: lastHost, port: lastPort };
}

/**
 * 多重ルートで一括アップロード。全滅時は remoteOk=false / pendingSync 候補。
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
}): Promise<QnapFallbackUploadResultV1> {
  const routes = listQnapFallbackRoutesV1({
    tailscaleHost: options.tailscaleHost,
    lanHost: options.lanHost,
    shareName: options.shareName,
  }).filter((r) => !(options.skipLocalPending && r.kind === "local_pending"));
  const share =
    String(options.shareName || "").trim() || DOCUMENT_NAS_SHARE;
  const attempts: QnapFallbackAttemptV1[] = [];
  let lastHost = resolveDocumentNasTailscaleHost(options.tailscaleHost);
  let lastPort = 5005;
  let lastCode: string | null = null;

  for (const route of routes) {
    if (route.kind === "local_pending") {
      attempts.push({
        route: route.kind,
        label: route.label,
        ok: true,
        host: lastHost,
        port: lastPort,
      });
      return {
        ok: true,
        remoteOk: false,
        pendingSync: true,
        route: "local_pending",
        host: lastHost,
        port: lastPort,
        message: "一時保存完了（QNAPへ自動同期待ち）",
        attempts,
        files: options.files.map((f) => ({
          ...f,
          ok: true,
          error: undefined,
        })),
        errorCode: lastCode,
      };
    }

    try {
      let result: { ok: boolean; error?: string; host: string; port: number };
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
        };
      }

      lastHost = result.host;
      lastPort = result.port;
      if (result.ok) {
        attempts.push({
          route: route.kind,
          label: route.label,
          ok: true,
          host: result.host,
          port: result.port,
        });
        console.log(
          `[QNAP fallback] success via ${route.kind} ${result.host}:${result.port}`
        );
        return {
          ok: true,
          remoteOk: true,
          pendingSync: false,
          route: route.kind,
          host: result.host,
          port: result.port,
          message: "nastoms へ見積書・請求書を正常に保存しました",
          attempts,
          files: options.files.map((f) => ({ ...f, ok: true })),
          errorCode: null,
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
      console.warn(`[QNAP fallback] exception ${route.kind}:`, msg);
    }
  }

  // skipLocalPending 時、または local_pending 無しで全滅
  return {
    ok: true,
    remoteOk: false,
    pendingSync: true,
    route: "local_pending",
    host: lastHost,
    port: lastPort,
    message: "一時保存完了（QNAPへ自動同期待ち）",
    attempts,
    files: options.files.map((f) => ({ ...f, ok: true })),
    errorCode: lastCode,
  };
}
