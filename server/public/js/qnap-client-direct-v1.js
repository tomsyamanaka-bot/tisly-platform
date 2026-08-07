/**
 * QNAP クライアント直接 WebDAV（診断・互換用）
 * — 見積一覧の保存は VPS プロキシ一本化（本モジュールの PUT は使わない）
 * — ストレージ設定のローカル Ping 等でホスト／ポートヘルパーを再利用
 * — 既定宛先: 書類保存用 NAS nastoms (192.168.1.134)
 * — スマートポートフォールバック: 8080（パス付き）→ 5005 → 5006 → 5000
 */

export const DOCUMENT_NAS_NAME = "nastoms";
export const DOCUMENT_NAS_HOST = "192.168.1.134";
/** 未設定時の既定ポート（8080 管理/WebDAV 優先） */
export const DOCUMENT_NAS_DEFAULT_PORT = 8080;
export const SYSTEM_NAS_NAME = "TiSLYNAS";
export const SYSTEM_NAS_HOST = "192.168.1.10";

/** 設定ポートの次に試す候補（重複は listDocumentNasPortCandidates で除去） */
export const DOCUMENT_NAS_FALLBACK_PORTS = [8080, 5005, 5006, 5000];
/** 8080 向け WebDAV ルートパス候補 */
export const DOCUMENT_NAS_WEBDAV_PATHS = ["/", "/Public/", "/TiSLY/"];

const LS_DOCUMENT_NAS_HOST = "tisly_qnap_local_host_v1";
/** v3: スマートポート探索で発見したポートを優先 */
const LS_DOCUMENT_NAS_PORT = "tisly_qnap_local_port_v3";
const LS_DOCUMENT_NAS_PATH = "tisly_qnap_local_webdav_path_v1";

const QNAP_WEBDAV_USER_AGENT = "TiSLY-PWA";

function withQnapWebDavHeaders(extra = {}) {
  return {
    "User-Agent": QNAP_WEBDAV_USER_AGENT,
    Translate: "f",
    ...extra,
  };
}

function isWebDavMethodAcceptedStatus(status) {
  const s = Number(status);
  if (!Number.isFinite(s) || s <= 0 || s === 501) return false;
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

function normalizeWebDavRootPath(pathname) {
  const raw = String(pathname || "").trim() || "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

export function listWebDavRootPathCandidates(configuredPath, port) {
  const configured = normalizeWebDavRootPath(configuredPath || "/TiSLY/");
  const portNum = Number(port);
  const preferProbe = !Number.isFinite(portNum) || portNum === 8080 || portNum === 80;
  const ordered = preferProbe
    ? [configured, ...DOCUMENT_NAS_WEBDAV_PATHS]
    : [configured, "/TiSLY/", "/Public/", "/"];
  const seen = new Set();
  const out = [];
  for (const p of ordered) {
    const n = normalizeWebDavRootPath(p);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function getStoredDocumentNasHost() {
  try {
    const v = localStorage.getItem(LS_DOCUMENT_NAS_HOST);
    if (v != null && String(v).trim()) return String(v).trim();
  } catch {
    /* private mode 等 */
  }
  return DOCUMENT_NAS_HOST;
}

export function setStoredDocumentNasHost(host) {
  const next = String(host || "").trim() || DOCUMENT_NAS_HOST;
  try {
    localStorage.setItem(LS_DOCUMENT_NAS_HOST, next);
  } catch {
    /* */
  }
  return next;
}

export function getStoredDocumentNasPort() {
  try {
    const n = Number(localStorage.getItem(LS_DOCUMENT_NAS_PORT));
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* */
  }
  return DOCUMENT_NAS_DEFAULT_PORT;
}

export function setStoredDocumentNasPort(port) {
  const n = Number(port);
  const next = Number.isFinite(n) && n > 0 ? n : DOCUMENT_NAS_DEFAULT_PORT;
  try {
    localStorage.setItem(LS_DOCUMENT_NAS_PORT, String(next));
  } catch {
    /* */
  }
  return next;
}

/** 5006 / 5001 / 443 は HTTPS WebDAV（5005 は HTTP） */
export function webDavProtocolForPort(port) {
  const p = Number(port);
  if (p === 443 || p === 5001 || p === 5006) return "https";
  return "http";
}

export function buildDocumentNasWebDavUrl(host, port, shareName = "TiSLY") {
  const h = String(host || DOCUMENT_NAS_HOST).trim() || DOCUMENT_NAS_HOST;
  const p = Number(port);
  const portNum = Number.isFinite(p) && p > 0 ? p : DOCUMENT_NAS_DEFAULT_PORT;
  let share = String(shareName || "TiSLY").trim();
  if (!share || share === "/") {
    return `${webDavProtocolForPort(portNum)}://${h}:${portNum}/`;
  }
  share = share.replace(/^\/+|\/+$/g, "") || "TiSLY";
  return `${webDavProtocolForPort(portNum)}://${h}:${portNum}/${share}`;
}

/**
 * ポート候補順:
 * 1. 8080（パス付き WebDAV）
 * 2. 5005 → 5006 → 5000
 * 3. localStorage / 設定値
 */
export function listDocumentNasPortCandidates(configuredPort) {
  const stored = (() => {
    try {
      const n = Number(localStorage.getItem(LS_DOCUMENT_NAS_PORT));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  })();
  const configured = Number(configuredPort);
  const configuredOk =
    Number.isFinite(configured) && configured > 0 ? configured : null;
  const order = [
    ...DOCUMENT_NAS_FALLBACK_PORTS,
    stored,
    configuredOk,
  ];
  const seen = new Set();
  const out = [];
  for (const p of order) {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** 既定の保存先フォルダ（MotherShip） */
export const DOCUMENT_NAS_SAVE_FOLDER = "Invoices_Estimates";
export const DOCUMENT_NAS_SAVE_ABSOLUTE_PREFIX = "/TiSLY/Invoices_Estimates";
export const DOCUMENT_NAS_SAVE_PUBLIC_ABSOLUTE_PREFIX =
  "/Public/TiSLY/Invoices_Estimates";

/**
 * 成功トースト — nastoms への接続に成功しました（ポート N）
 */
export function documentNasConnectSuccessMessage(port) {
  const p = Number(port);
  const portNum =
    Number.isFinite(p) && p > 0 ? p : DOCUMENT_NAS_DEFAULT_PORT;
  return `${DOCUMENT_NAS_NAME} への接続に成功しました（ポート ${portNum}）`;
}

/**
 * 成功トースト（保存完了）
 */
export function documentNasSaveSuccessMessage(_host, _port, folderPath) {
  const path = String(folderPath || "").trim();
  if (path) return `QNAP保存成功: ${path}`;
  return "QNAP保存成功";
}

export function documentNasPdfSaveSuccessMessage(absolutePaths) {
  const paths = Array.isArray(absolutePaths)
    ? absolutePaths.map((p) => String(p || "").trim()).filter(Boolean)
    : String(absolutePaths || "").trim()
      ? [String(absolutePaths).trim()]
      : [];
  if (paths.length > 0) return `QNAP保存成功: ${paths.join(" / ")}`;
  return "QNAP保存成功";
}

export function documentNasPdfSavePendingMessage() {
  return "一時保存完了（QNAPへ自動同期待ち）";
}

/** API 受付直後（非同期開始） */
export function documentNasPdfSaveAcceptedMessage() {
  return "QNAPへの保存処理を開始しました（キュー保存完了）";
}

/** PWA 即時フィードバック */
export function documentNasPdfSaveRequestSentMessage() {
  return `${DOCUMENT_NAS_NAME} へ保存要求を送信しました`;
}

/** remotePath / displayPath から保存先フォルダを抽出 */
export function normalizeSaveFolderPath(folderPath) {
  const raw = String(folderPath || DOCUMENT_NAS_SAVE_FOLDER)
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
  if (!raw) return DOCUMENT_NAS_SAVE_FOLDER;
  // ファイル名付きなら親ディレクトリまで
  if (/\.[a-z0-9]+$/i.test(raw.split("/").pop() || "")) {
    const parts = raw.split("/").filter(Boolean);
    parts.pop();
    const dir = parts.join("/");
    return dir || DOCUMENT_NAS_SAVE_FOLDER;
  }
  return raw;
}

/** 成功ログ用の宛先文字列 */
export function formatDocumentNasSaveDest(host, port, folderPath) {
  const h =
    String(host || getStoredDocumentNasHost() || DOCUMENT_NAS_HOST).trim() ||
    DOCUMENT_NAS_HOST;
  const p = Number(port);
  const portNum =
    Number.isFinite(p) && p > 0 ? p : getStoredDocumentNasPort();
  return `${h}:${portNum}/${normalizeSaveFolderPath(folderPath)}`;
}

function basicAuthHeader(username, password) {
  const token = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  return `Basic ${token}`;
}

function joinWebDavUrl(baseUrl, remotePath) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const rel = String(remotePath || "").replace(/^\/+/, "");
  return `${base}/${rel}`.replace(/([^:]\/)\/+/g, "$1");
}

export function parseWebDavUrlParts(webdavUrl) {
  try {
    const u = new URL(String(webdavUrl || "").trim());
    const portNum =
      Number(u.port) ||
      (u.protocol === "https:" ? 443 : 80);
    const share =
      u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)[0] ||
      "TiSLY";
    return {
      host: u.hostname || DOCUMENT_NAS_HOST,
      port: portNum,
      shareName: share,
      protocol: u.protocol,
    };
  } catch {
    return {
      host: DOCUMENT_NAS_HOST,
      port: DOCUMENT_NAS_DEFAULT_PORT,
      shareName: "TiSLY",
      protocol: "http:",
    };
  }
}

/**
 * MKCOL（フォルダ作成）— 既存なら無視
 */
async function ensureWebDavCollection(url, authHeader) {
  try {
    const res = await fetch(url, {
      method: "MKCOL",
      headers: withQnapWebDavHeaders({ Authorization: authHeader }),
      mode: "cors",
    });
    if (res.ok || res.status === 405 || res.status === 409 || res.status === 301) {
      return { ok: true, status: res.status };
    }
    const mapped = mapWebDavHttpStatus(res.status);
    return {
      ok: false,
      status: res.status,
      errorCode: mapped.errorCode,
      message: mapped.message,
    };
  } catch (e) {
    const errorCode = classifyClientError(e, { forWrite: true });
    return {
      ok: false,
      status: null,
      message: formatClientErrorMessage(errorCode, e?.message),
      errorCode,
    };
  }
}

/**
 * PUT/POST/MKCOL の HTTP ステータス → 現場向けメッセージ
 */
export function mapWebDavHttpStatus(status) {
  const s = Number(status);
  if (s === 401 || s === 403) {
    return {
      errorCode: s === 401 ? "401 Unauthorized" : "403 Forbidden",
      message:
        "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください",
    };
  }
  if (s === 404) {
    return {
      errorCode: "404 Not Found",
      message:
        "保存先の共有フォルダ（例: /Invoices_Estimates/）が存在しません",
    };
  }
  return {
    errorCode: `HTTP ${s}`,
    message: `WebDAV 書き込み失敗 (HTTP ${s})`,
  };
}

/**
 * @param {unknown} err
 * @param {{ forWrite?: boolean }} [opts] forWrite=true なら Failed to fetch / TypeError を CORS 扱い
 */
export function classifyClientError(err, opts = {}) {
  const msg = String(err?.message || err || "");
  const name = String(err?.name || "");
  if (/mixed content|insecure/i.test(msg)) return "MIXED_CONTENT";
  if (/timeout|aborted/i.test(msg) || name === "AbortError") return "ETIMEDOUT";
  if (/CORS|cross-origin/i.test(msg)) return "CORS";
  // PUT/POST 時の TypeError / Failed to fetch は CORS・アクセス許可の可能性が高い
  if (
    opts.forWrite &&
    (name === "TypeError" ||
      err instanceof TypeError ||
      /Failed to fetch|NetworkError|Load failed/i.test(msg))
  ) {
    return "CORS";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "CLIENT_NETWORK";
  if (name === "TypeError" || err instanceof TypeError) return "CORS";
  return "CLIENT_ERROR";
}

export function formatClientErrorMessage(errorCode, detail) {
  if (errorCode === "MIXED_CONTENT") {
    return "HTTPS ページから HTTP の QNAP へ直接接続できません。QNAP 側 HTTPS(WebDAV) または QNAP_LOCAL_WEBDAV_URL を確認してください";
  }
  if (errorCode === "CORS") {
    return "QNAP側のWebDAV許可設定（CORS/アクセス許可）を確認してください";
  }
  if (errorCode === "CLIENT_NETWORK") {
    return `ローカル QNAP に到達できません。同一 Wi-Fi・IP・ポート (${DOCUMENT_NAS_HOST}:${DOCUMENT_NAS_DEFAULT_PORT} 他) を確認してください`;
  }
  if (errorCode === "ETIMEDOUT") {
    return "ローカル QNAP への接続がタイムアウトしました";
  }
  if (
    errorCode === "401 Unauthorized" ||
    errorCode === "403 Forbidden" ||
    errorCode === 401 ||
    errorCode === 403
  ) {
    return "QNAP認証エラー: ストレージ設定画面で QNAP (nastoms) のログインパスワードを確認・入力してください";
  }
  if (errorCode === "404 Not Found" || errorCode === 404) {
    return "保存先の共有フォルダ（例: /Invoices_Estimates/）が存在しません";
  }
  return detail || "ローカル直接保存に失敗しました";
}

/**
 * ブラウザから QNAP WebDAV へ OPTIONS → PROPFIND で導通確認
 * （HTTP 501 は WebDAV 非対応として失敗）
 */
export async function pingLocalWebDav({ webdavUrl, username, password, timeoutMs = 8000 }) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const authHeader = basicAuthHeader(username, password);
  const base = String(webdavUrl || "").replace(/\/+$/, "");
  try {
    let res = await fetch(base || webdavUrl, {
      method: "OPTIONS",
      headers: withQnapWebDavHeaders({ Authorization: authHeader }),
      mode: "cors",
      signal: ctrl.signal,
    });
    if (!isWebDavMethodAcceptedStatus(res.status) && res.status !== 401 && res.status !== 403) {
      res = await fetch(base || webdavUrl, {
        method: "PROPFIND",
        headers: withQnapWebDavHeaders({
          Authorization: authHeader,
          Depth: "0",
          "Content-Type": "application/xml",
        }),
        mode: "cors",
        signal: ctrl.signal,
      });
    }
    const latencyMs = Date.now() - started;
    if (res.status === 401 || res.status === 403) {
      const mapped = mapWebDavHttpStatus(res.status);
      return {
        ok: false,
        latencyMs,
        httpStatus: res.status,
        errorCode: mapped.errorCode,
        message: mapped.message,
      };
    }
    if (res.status === 501) {
      return {
        ok: false,
        latencyMs,
        httpStatus: 501,
        errorCode: "HTTP 501",
        message:
          "HTTP 501 Not Implemented — WebDAV パス（/ /Public/ /TiSLY/）を確認してください",
      };
    }
    const ok = isWebDavMethodAcceptedStatus(res.status);
    return {
      ok,
      latencyMs,
      httpStatus: res.status,
      errorCode: ok ? null : `HTTP ${res.status}`,
      message: ok
        ? documentNasConnectSuccessMessage(
            Number((() => {
              try {
                return new URL(base || webdavUrl).port;
              } catch {
                return DOCUMENT_NAS_DEFAULT_PORT;
              }
            })())
          )
        : `ローカル応答 HTTP ${res.status}`,
    };
  } catch (e) {
    const errorCode = e?.name === "AbortError" ? "ETIMEDOUT" : classifyClientError(e);
    return {
      ok: false,
      latencyMs: Date.now() - started,
      httpStatus: null,
      errorCode,
      message: formatClientErrorMessage(errorCode, e?.message),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * マルチポート＋パス自動試行 — 最初に応答したポート/パスを localStorage に保存
 * 順序: 8080（/, /Public/, /TiSLY/）→ 5005 → 5006 → 5000
 */
export async function resolveLocalWebDavWithPortFallback({
  host,
  configuredPort,
  shareName = "TiSLY",
  username,
  password,
  timeoutMs = 4000,
}) {
  const h = String(host || getStoredDocumentNasHost() || DOCUMENT_NAS_HOST).trim() || DOCUMENT_NAS_HOST;
  const share = String(shareName || "TiSLY").replace(/^\/+|\/+$/g, "") || "TiSLY";
  const ports = listDocumentNasPortCandidates(configuredPort);
  const attempts = [];

  let storedPath = null;
  try {
    storedPath = localStorage.getItem(LS_DOCUMENT_NAS_PATH);
  } catch {
    /* */
  }

  for (const port of ports) {
    const pathCandidates = listWebDavRootPathCandidates(
      storedPath || `/${share}/`,
      port
    );
    for (const rootPath of pathCandidates) {
      const pathShare =
        rootPath === "/" ? "/" : rootPath.replace(/^\/+|\/+$/g, "");
      const webdavUrl = buildDocumentNasWebDavUrl(h, port, pathShare);
      const ping = await pingLocalWebDav({
        webdavUrl,
        username,
        password,
        timeoutMs,
      });
      attempts.push({
        port,
        path: rootPath,
        webdavUrl,
        ok: ping.ok,
        latencyMs: ping.latencyMs,
        errorCode: ping.errorCode,
        message: ping.message,
        httpStatus: ping.httpStatus,
      });
      if (
        ping.ok ||
        ping.errorCode === "401 Unauthorized" ||
        ping.errorCode === "403 Forbidden"
      ) {
        setStoredDocumentNasHost(h);
        setStoredDocumentNasPort(port);
        try {
          localStorage.setItem(LS_DOCUMENT_NAS_PATH, rootPath);
        } catch {
          /* */
        }
        return {
          ok: ping.ok,
          reachable: true,
          host: h,
          port,
          webdavUrl,
          shareName: pathShare === "/" ? "" : pathShare,
          path: rootPath,
          ping,
          attempts,
          authFailed:
            ping.errorCode === "401 Unauthorized" ||
            ping.errorCode === "403 Forbidden",
        };
      }
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    reachable: false,
    host: h,
    port: null,
    webdavUrl: null,
    shareName: share,
    ping: last
      ? {
          ok: false,
          latencyMs: last.latencyMs,
          httpStatus: last.httpStatus,
          errorCode: last.errorCode,
          message: last.message,
        }
      : {
          ok: false,
          latencyMs: 0,
          httpStatus: null,
          errorCode: "CLIENT_NETWORK",
          message: formatClientErrorMessage("CLIENT_NETWORK"),
        },
    attempts,
    authFailed: false,
  };
}

async function putFile(fullUrl, authHeader, blob) {
  try {
    const res = await fetch(fullUrl, {
      method: "PUT",
      headers: withQnapWebDavHeaders({
        Authorization: authHeader,
        "Content-Type": "application/pdf",
      }),
      body: blob,
      mode: "cors",
    });
    if (res.ok || res.status === 201 || res.status === 204) {
      return { ok: true, status: res.status };
    }
    const mapped = mapWebDavHttpStatus(res.status);
    return {
      ok: false,
      status: res.status,
      errorCode: mapped.errorCode,
      message: mapped.message,
    };
  } catch (e) {
    const errorCode = classifyClientError(e, { forWrite: true });
    return {
      ok: false,
      status: null,
      errorCode,
      message: formatClientErrorMessage(errorCode, e?.message),
    };
  }
}

/**
 * 親フォルダを順に MKCOL — 権限不足・不存在は即失敗
 */
async function ensureParentDirs(webdavUrl, remotePath, authHeader) {
  const parts = String(remotePath).replace(/^\/+/, "").split("/").filter(Boolean);
  parts.pop();
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const url = joinWebDavUrl(webdavUrl, acc);
    const mk = await ensureWebDavCollection(url, authHeader);
    if (!mk.ok) {
      return mk;
    }
  }
  return { ok: true };
}

/**
 * 見積・請求 PDF をローカル QNAP へ直接保存（スマートポート探索付き）
 * @param {{ token: string, projectId: string, apiBase?: string }} opts
 */
export async function saveProjectPdfsViaLocalWebDav(opts) {
  const apiBase = opts.apiBase || "/api/estimate/v1";
  const token = opts.token || "";
  const projectId = opts.projectId;

  const manifestRes = await fetch(
    `${apiBase}/projects/${encodeURIComponent(projectId)}/qnap-direct-manifest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  const manifest = await manifestRes.json().catch(() => ({}));
  if (!manifestRes.ok) {
    return {
      ok: false,
      route: "local_wifi",
      message: manifest.error || `マニフェスト取得失敗 (HTTP ${manifestRes.status})`,
      files: [],
    };
  }

  const direct = manifest.clientDirect;
  if (!direct?.available || !direct.webdavUrl || !direct.username || !direct.password) {
    return {
      ok: false,
      route: "local_wifi",
      message: direct?.reason || "ローカル Wi-Fi 直接保存の設定が不足しています",
      files: [],
      errorCode: "NOT_CONFIGURED",
    };
  }

  const parts = parseWebDavUrlParts(direct.webdavUrl);
  const host = direct.host || parts.host || getStoredDocumentNasHost();
  const configuredPort =
    Number(direct.port) > 0 ? Number(direct.port) : parts.port;
  const shareName = direct.shareName || parts.shareName || "TiSLY";

  const resolved = await resolveLocalWebDavWithPortFallback({
    host,
    configuredPort,
    shareName,
    username: direct.username,
    password: direct.password,
  });

  if (!resolved.ok || !resolved.webdavUrl) {
    const tried = (resolved.attempts || []).map((a) => a.port).join(",");
    const authCode = resolved.authFailed
      ? resolved.ping?.errorCode || "401 Unauthorized"
      : resolved.ping?.errorCode || "CLIENT_NETWORK";
    return {
      ok: false,
      route: "local_wifi",
      host,
      port: resolved.port,
      message:
        resolved.authFailed
          ? formatClientErrorMessage(
              resolved.ping?.errorCode || "401 Unauthorized"
            )
          : `${resolved.ping?.message || "ローカル到達失敗"}（試行ポート: ${tried || "なし"}）`,
      errorCode: authCode,
      latencyMs: resolved.ping?.latencyMs,
      files: [],
      portAttempts: resolved.attempts,
    };
  }

  const webdavUrl = resolved.webdavUrl;
  const authHeader = basicAuthHeader(direct.username, direct.password);
  const results = [];

  for (const file of manifest.files || []) {
    try {
      const pdfRes = await fetch(file.downloadPath, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pdfRes.ok) {
        results.push({
          kind: file.kind,
          ok: false,
          displayPath: file.displayPath,
          error: `PDF 取得失敗 HTTP ${pdfRes.status}`,
        });
        continue;
      }
      const blob = await pdfRes.blob();
      const dirs = await ensureParentDirs(webdavUrl, file.remotePath, authHeader);
      if (!dirs.ok) {
        results.push({
          kind: file.kind,
          ok: false,
          displayPath: file.displayPath,
          remotePath: file.remotePath,
          error: dirs.message || formatClientErrorMessage(dirs.errorCode),
          errorCode: dirs.errorCode,
        });
        continue;
      }
      const putUrl = joinWebDavUrl(webdavUrl, file.remotePath);
      const put = await putFile(putUrl, authHeader, blob);
      results.push({
        kind: file.kind,
        ok: put.ok,
        displayPath: file.displayPath,
        remotePath: file.remotePath,
        error: put.ok ? undefined : put.message,
        errorCode: put.errorCode,
      });
    } catch (e) {
      const errorCode = classifyClientError(e, { forWrite: true });
      results.push({
        kind: file.kind,
        ok: false,
        displayPath: file.displayPath,
        error: formatClientErrorMessage(errorCode, e?.message),
        errorCode,
      });
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.ok);
  const savedHost = resolved.host || DOCUMENT_NAS_HOST;
  const savedPort = resolved.port;
  const folderPath = normalizeSaveFolderPath(
    results.find((r) => r.ok)?.remotePath ||
      results.find((r) => r.ok)?.displayPath ||
      (manifest.files || [])[0]?.remotePath ||
      DOCUMENT_NAS_SAVE_FOLDER
  );
  const destLabel = formatDocumentNasSaveDest(savedHost, savedPort, folderPath);
  if (allOk) {
    console.info(`[QNAP local save] OK — ${destLabel}`);
    try {
      setStoredDocumentNasHost(savedHost);
      setStoredDocumentNasPort(savedPort);
    } catch {
      /* */
    }
  } else {
    const fail = results.find((r) => !r.ok);
    console.error(
      `[QNAP local save] FAIL — ${savedHost}:${savedPort} errorCode=${fail?.errorCode || "?"} message=${fail?.error || "?"}`
    );
  }
  return {
    ok: allOk,
    route: "local_wifi",
    host: savedHost,
    port: savedPort,
    folderPath,
    saveDest: destLabel,
    webdavUrl,
    message: allOk
      ? documentNasSaveSuccessMessage(savedHost, savedPort, folderPath)
      : results.find((r) => !r.ok)?.error || "ローカル直接保存に失敗しました",
    errorCode: allOk ? null : results.find((r) => !r.ok)?.errorCode || null,
    latencyMs: resolved.ping?.latencyMs,
    files: results,
    portAttempts: resolved.attempts,
  };
}

/**
 * 見積一覧保存は VPS プロキシのみ — ブラウザ直通信フォールバックは無効
 */
export function shouldTryClientDirectFallback(_vpsResult, _saveRoute) {
  return false;
}
