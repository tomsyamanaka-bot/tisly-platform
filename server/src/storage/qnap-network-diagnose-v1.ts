/**
 * QNAP WebDAV ネットワーク診断 v1
 * — Reachability / 応答時間 / エラーコードを詳細ログ付きで返す
 */
import { config } from "../config.js";
import {
  formatFetchError,
  listWebDavUrlCandidates,
  probeWebDavEndpoint,
  rememberDiscoveredWebDavUrl,
} from "../business/services/qnap-webdav-fetch-v1.js";
import {
  getQnapWebDavEnvConfig,
  maskWebDavUrlPreview,
} from "./qnap-storage-v1-config.js";
import {
  buildWebDavUrl,
  settingsToWebDavConfig,
} from "./qnap-storage-service.js";
import {
  getStorageSettingsV1,
  type QnapSaveRouteV1,
} from "./storage-settings-store.js";
import {
  DOCUMENT_NAS_DEFAULT_PORT,
  DOCUMENT_NAS_HOST,
  DOCUMENT_NAS_SHARE,
  documentNasConnectSuccessMessage,
  resolveDocumentNasLocalHost,
  resolveDocumentNasLocalPort,
} from "./qnap-nas-hosts-v1.js";
import {
  QNAP_DEFAULT_BASIC_USER,
  qnapBasicAuthHeaders,
  resolveQnapBasicAuthCredentials,
} from "./qnap-basic-auth-v1.js";

export type { QnapSaveRouteV1 };

export interface QnapPingCandidateResultV1 {
  urlPreview: string;
  ok: boolean;
  latencyMs: number;
  httpStatus: number | null;
  errorCode: string | null;
  message: string;
}

export interface QnapPingResultV1 {
  ok: boolean;
  reachable: boolean;
  urlPreview: string | null;
  primaryUrlConfigured: boolean;
  latencyMs: number | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorReason: string | null;
  message: string;
  logs: string[];
  candidates: QnapPingCandidateResultV1[];
  testedAt: string;
  envConfigured: boolean;
  saveRoute: QnapSaveRouteV1;
  localDirectAvailable: boolean;
}

/** ECONNREFUSED / ETIMEDOUT / 401 Unauthorized 等を正規化 */
export function classifyQnapNetworkError(raw: string, httpStatus?: number | null): {
  errorCode: string;
  errorReason: string;
} {
  const msg = raw || "";
  if (httpStatus === 401 || /401|unauthorized/i.test(msg)) {
    return {
      errorCode: "401 Unauthorized",
      errorReason:
        "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください",
    };
  }
  if (httpStatus === 403 || /403|forbidden/i.test(msg)) {
    return {
      errorCode: "403 Forbidden",
      errorReason:
        "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください",
    };
  }
  if (httpStatus === 404 || /404|not found/i.test(msg)) {
    return {
      errorCode: "404 Not Found",
      errorReason: "共有フォルダまたはパスが見つかりません",
    };
  }
  if (/ECONNREFUSED|code=ECONNREFUSED/i.test(msg)) {
    return {
      errorCode: "ECONNREFUSED",
      errorReason: "接続が拒否されました。QNAP の WebDAV サービス／ポートが起動しているか確認してください",
    };
  }
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|timeout|timed out|code=ETIMEDOUT/i.test(msg)) {
    return {
      errorCode: "ETIMEDOUT",
      errorReason:
        "VPSから nastoms への接続がタイムアウトしました。Tailscale / LAN接続状態を確認してください",
    };
  }
  if (/ENOTFOUND|getaddrinfo|code=ENOTFOUND/i.test(msg)) {
    return {
      errorCode: "ENOTFOUND",
      errorReason: "ホスト名を解決できません。URL・DNS を確認してください",
    };
  }
  if (/EHOSTUNREACH|ENETUNREACH|code=EHOSTUNREACH|code=ENETUNREACH/i.test(msg)) {
    return {
      errorCode: "EHOSTUNREACH",
      errorReason: "ホストに到達できません。VPN（Tailscale）やルーティングを確認してください",
    };
  }
  if (/certificate|UNABLE_TO_VERIFY|SELF_SIGNED|SSL|TLS/i.test(msg)) {
    return {
      errorCode: "TLS_CERT",
      errorReason: "SSL 証明書を検証できません（自己署名の可能性）。QNAP_WEBDAV_TLS_INSECURE を確認してください",
    };
  }
  if (/CORS|Failed to fetch|NetworkError|mixed content/i.test(msg)) {
    return {
      errorCode: "PROXY_NETWORK",
      errorReason:
        "VPSからQNAPへ到達できません（ネットワーク／VPN／WebDAV）。ブラウザ直通信は使いません",
    };
  }
  if (httpStatus === 501 || /501|not implemented/i.test(msg)) {
    return {
      errorCode: "HTTP 501",
      errorReason:
        "HTTP 501 Not Implemented — WebDAV パス（/ /Public/ /TiSLY/）またはポート 5005/5006 を確認してください",
    };
  }
  if (httpStatus && httpStatus >= 500) {
    return {
      errorCode: `HTTP ${httpStatus}`,
      errorReason: `QNAP 側エラー (HTTP ${httpStatus})`,
    };
  }
  if (httpStatus && httpStatus >= 400) {
    return {
      errorCode: `HTTP ${httpStatus}`,
      errorReason: `WebDAV 応答エラー (HTTP ${httpStatus})`,
    };
  }
  return {
    errorCode: "UNKNOWN",
    errorReason: msg || "不明な接続エラー",
  };
}

function resolvePingTarget(): {
  webdavUrl: string;
  username: string;
  password: string;
  source: "env" | "settings" | "none";
} {
  const env = getQnapWebDavEnvConfig();
  const settings = getStorageSettingsV1();
  const q = settings.qnap;
  const auth = resolveQnapBasicAuthCredentials({
    settingsUsername: q.username,
    settingsPassword: q.password,
    allowDefaultUser: true,
  });

  if (env.webdavUrl.trim()) {
    return {
      webdavUrl: env.webdavUrl,
      username: auth.username || env.username || QNAP_DEFAULT_BASIC_USER,
      password: auth.password || env.password || "",
      source: "env",
    };
  }
  if (q.host.trim()) {
    const cfg = settingsToWebDavConfig(settings);
    return {
      webdavUrl: cfg.webdavUrl,
      username: auth.username || QNAP_DEFAULT_BASIC_USER,
      password: auth.password,
      source: "settings",
    };
  }
  return { webdavUrl: "", username: "", password: "", source: "none" };
}

function portFromWebDavUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const p = Number(
      u.port || (u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : "")
    );
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

async function probeOne(
  url: string,
  username: string,
  password: string
): Promise<QnapPingCandidateResultV1> {
  const started = Date.now();
  const urlPreview = maskWebDavUrlPreview(url) || url;
  try {
    const probe = await probeWebDavEndpoint(
      url,
      qnapBasicAuthHeaders(username, password)
    );
    const latencyMs = Date.now() - started;
    if (probe.status === 401) {
      const classified = classifyQnapNetworkError("401", 401);
      return {
        urlPreview,
        ok: false,
        latencyMs,
        httpStatus: 401,
        errorCode: classified.errorCode,
        message: classified.errorReason,
      };
    }
    if (probe.ok) {
      rememberDiscoveredWebDavUrl(url);
      const port = portFromWebDavUrl(url);
      return {
        urlPreview,
        ok: true,
        latencyMs,
        httpStatus: probe.status,
        errorCode: null,
        message: documentNasConnectSuccessMessage(port),
      };
    }
    const classified = classifyQnapNetworkError(
      probe.message || `HTTP ${probe.status}`,
      probe.status || null
    );
    return {
      urlPreview,
      ok: false,
      latencyMs,
      httpStatus: probe.status || null,
      errorCode: classified.errorCode,
      message: classified.errorReason,
    };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const raw = formatFetchError(e);
    const classified = classifyQnapNetworkError(raw, null);
    return {
      urlPreview,
      ok: false,
      latencyMs,
      httpStatus: null,
      errorCode: classified.errorCode,
      message: `${classified.errorReason} (${raw})`,
    };
  }
}

export function getQnapSaveRouteV1(): QnapSaveRouteV1 {
  const settings = getStorageSettingsV1();
  const route = settings.saveRoute;
  if (route === "vps" || route === "local_wifi" || route === "auto") return route;
  return "auto";
}

/** クライアント直接保存用の LAN WebDAV 設定（認証済み API 向け） */
export function getQnapClientDirectConfigV1(): {
  available: boolean;
  webdavUrl: string | null;
  username: string | null;
  password: string | null;
  shareName: string;
  baseDir: string;
  saveRoute: QnapSaveRouteV1;
  host: string;
  port: number;
  reason?: string;
} {
  const saveRoute = getQnapSaveRouteV1();
  const settings = getStorageSettingsV1();
  const localEnv = (process.env.QNAP_LOCAL_WEBDAV_URL || "").trim();
  const q = settings.qnap;
  const host = resolveDocumentNasLocalHost(q.host);
  const port = resolveDocumentNasLocalPort(q.port || DOCUMENT_NAS_DEFAULT_PORT);
  const shareName = q.shareName || DOCUMENT_NAS_SHARE;

  let webdavUrl = "";
  if (localEnv) {
    webdavUrl = localEnv.replace(/\/+$/, "");
  } else {
    webdavUrl = buildWebDavUrl(host, port, shareName);
  }

  const username =
    q.username.trim() ||
    config.qnapWebDav.username ||
    (process.env.QNAP_WEBDAV_USER || "").trim() ||
    "";
  const password =
    q.password ||
    config.qnapWebDav.password ||
    process.env.QNAP_WEBDAV_PASSWORD ||
    "";

  if (!webdavUrl) {
    return {
      available: false,
      webdavUrl: null,
      username: null,
      password: null,
      shareName,
      baseDir: config.qnapWebDav.baseDir || "/TiSLY",
      saveRoute,
      host: host || DOCUMENT_NAS_HOST,
      port,
      reason:
        "ローカル Wi-Fi 用ホストが未設定です。ストレージ設定の IP、または QNAP_LOCAL_WEBDAV_URL / QNAP_LOCAL_HOST を設定してください",
    };
  }
  if (!username || !password) {
    return {
      available: false,
      webdavUrl,
      username: null,
      password: null,
      shareName,
      baseDir: config.qnapWebDav.baseDir || "/TiSLY",
      saveRoute,
      host,
      port,
      reason: "ローカル直接保存用のユーザー名／パスワードが不足しています",
    };
  }

  return {
    available: true,
    webdavUrl,
    username,
    password,
    shareName,
    baseDir: config.qnapWebDav.baseDir || "/TiSLY",
    saveRoute,
    host,
    port,
  };
}

/**
 * QNAP_WEBDAV_URL（または設定 UI）への Reachability 診断
 */
export async function runQnapWebDavPingV1(): Promise<QnapPingResultV1> {
  const testedAt = new Date().toISOString();
  const logs: string[] = [];
  const saveRoute = getQnapSaveRouteV1();
  const localDirect = getQnapClientDirectConfigV1();
  const target = resolvePingTarget();
  const env = getQnapWebDavEnvConfig();

  logs.push(`[ping] started at ${testedAt}`);
  logs.push(`[ping] target source=${target.source}`);
  logs.push(`[ping] saveRoute=${saveRoute}`);
  logs.push(`[ping] localDirectAvailable=${localDirect.available}`);

  const mockMode =
    process.env.STORAGE_PROVIDER_MOCK === "true" ||
    process.env.QNAP_STORAGE_MOCK === "true" ||
    process.env.NODE_ENV === "test";

  if (mockMode) {
    logs.push("[ping] mock/test mode — skip real network probe");
    const preview = target.webdavUrl ? maskWebDavUrlPreview(target.webdavUrl) : null;
    return {
      ok: Boolean(target.webdavUrl),
      reachable: Boolean(target.webdavUrl),
      urlPreview: preview,
      primaryUrlConfigured: Boolean(target.webdavUrl),
      latencyMs: target.webdavUrl ? 1 : null,
      httpStatus: target.webdavUrl ? 200 : null,
      errorCode: target.webdavUrl ? null : "NOT_CONFIGURED",
      errorReason: target.webdavUrl ? null : "QNAP_WEBDAV_URL が未設定です",
      message: target.webdavUrl
        ? `✅ Mock Ping成功 — ${preview} (1ms)`
        : "QNAP_WEBDAV_URL が未設定です。.env またはストレージ設定を確認してください",
      logs,
      candidates: target.webdavUrl
        ? [
            {
              urlPreview: preview || "",
              ok: true,
              latencyMs: 1,
              httpStatus: 200,
              errorCode: null,
              message: "Mock reachable",
            },
          ]
        : [],
      testedAt,
      envConfigured: env.configured,
      saveRoute,
      localDirectAvailable: localDirect.available,
    };
  }

  if (!target.webdavUrl) {
    logs.push("[ping] QNAP_WEBDAV_URL / ストレージ設定ともに未設定");
    return {
      ok: false,
      reachable: false,
      urlPreview: null,
      primaryUrlConfigured: false,
      latencyMs: null,
      httpStatus: null,
      errorCode: "NOT_CONFIGURED",
      errorReason: "QNAP_WEBDAV_URL が未設定です",
      message: "QNAP_WEBDAV_URL が未設定です。.env またはストレージ設定を確認してください",
      logs,
      candidates: [],
      testedAt,
      envConfigured: env.configured,
      saveRoute,
      localDirectAvailable: localDirect.available,
    };
  }

  const urlPreview = maskWebDavUrlPreview(target.webdavUrl);
  logs.push(`[ping] primary=${urlPreview}`);

  const candidates = listWebDavUrlCandidates(target.webdavUrl);
  logs.push(`[ping] candidates=${candidates.length}`);

  const results: QnapPingCandidateResultV1[] = [];
  for (const candidate of candidates) {
    logs.push(`[ping] probing ${maskWebDavUrlPreview(candidate)} …`);
    const one = await probeOne(candidate, target.username, target.password);
    results.push(one);
    logs.push(
      `[ping] → ${one.ok ? "OK" : "FAIL"} ${one.latencyMs}ms` +
        (one.errorCode ? ` code=${one.errorCode}` : "") +
        (one.httpStatus != null ? ` http=${one.httpStatus}` : "")
    );
    if (one.ok) {
      logs.push(`[ping] success via ${one.urlPreview}`);
      const successPort = portFromWebDavUrl(candidate);
      const successMsg = documentNasConnectSuccessMessage(successPort);
      return {
        ok: true,
        reachable: true,
        urlPreview: one.urlPreview,
        primaryUrlConfigured: true,
        latencyMs: one.latencyMs,
        httpStatus: one.httpStatus,
        errorCode: null,
        errorReason: null,
        message: successMsg,
        logs,
        candidates: results,
        testedAt,
        envConfigured: env.configured,
        saveRoute,
        localDirectAvailable: localDirect.available,
      };
    }
  }

  const best = results[results.length - 1];
  const errorCode = best?.errorCode ?? "UNREACHABLE";
  const errorReason = best?.message ?? "すべての候補 URL に到達できません";
  logs.push(`[ping] all candidates failed — ${errorCode}`);

  return {
    ok: false,
    reachable: false,
    urlPreview,
    primaryUrlConfigured: true,
    latencyMs: best?.latencyMs ?? null,
    httpStatus: best?.httpStatus ?? null,
    errorCode,
    errorReason,
    message: `❌ 接続失敗 — ${errorCode}: ${errorReason}`,
    logs,
    candidates: results,
    testedAt,
    envConfigured: env.configured,
    saveRoute,
    localDirectAvailable: localDirect.available,
  };
}
