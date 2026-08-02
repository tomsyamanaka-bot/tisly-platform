/**
 * QNAP クライアント直接 WebDAV 保存 v1
 * — 事務所 LAN（同一 Wi-Fi）からブラウザが QNAP へ直接 PUT
 * — VPS→Tailscale 失敗時のフォールバック用
 */

function basicAuthHeader(username, password) {
  const token = btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  return `Basic ${token}`;
}

function joinWebDavUrl(baseUrl, remotePath) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const rel = String(remotePath || "").replace(/^\/+/, "");
  // base が .../TiSLY で remote も TiSLY_Storage/... の場合はそのまま結合
  return `${base}/${rel}`.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * MKCOL（フォルダ作成）— 既存なら無視
 */
async function ensureWebDavCollection(url, authHeader) {
  try {
    const res = await fetch(url, {
      method: "MKCOL",
      headers: { Authorization: authHeader },
      mode: "cors",
    });
    // 201 Created / 405 Method Not Allowed(既存) / 409 Conflict は許容
    if (res.ok || res.status === 405 || res.status === 409 || res.status === 301) {
      return { ok: true, status: res.status };
    }
    return { ok: false, status: res.status, message: `MKCOL HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      status: null,
      message: e?.message || "MKCOL failed",
      errorCode: classifyClientError(e),
    };
  }
}

export function classifyClientError(err) {
  const msg = String(err?.message || err || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "CLIENT_NETWORK";
  if (/CORS|cross-origin/i.test(msg)) return "CORS";
  if (/mixed content|insecure/i.test(msg)) return "MIXED_CONTENT";
  if (/timeout|aborted/i.test(msg)) return "ETIMEDOUT";
  return "CLIENT_ERROR";
}

export function formatClientErrorMessage(errorCode, detail) {
  if (errorCode === "MIXED_CONTENT") {
    return "HTTPS ページから HTTP の QNAP へ直接接続できません。QNAP 側 HTTPS(WebDAV) または QNAP_LOCAL_WEBDAV_URL を確認してください";
  }
  if (errorCode === "CORS") {
    return "ブラウザの CORS 制限で QNAP に直接保存できません。QNAP WebDAV の CORS 設定、または VPS 経由保存を使用してください";
  }
  if (errorCode === "CLIENT_NETWORK") {
    return "ローカル QNAP に到達できません。同一 Wi-Fi・IP・ポート(5006/8080)を確認してください";
  }
  if (errorCode === "ETIMEDOUT") {
    return "ローカル QNAP への接続がタイムアウトしました";
  }
  if (errorCode === "401 Unauthorized") {
    return "認証に失敗しました（401）。ユーザー名／パスワードを確認してください";
  }
  return detail || "ローカル直接保存に失敗しました";
}

/**
 * ブラウザから QNAP WebDAV へ OPTIONS で導通確認
 */
export async function pingLocalWebDav({ webdavUrl, username, password, timeoutMs = 8000 }) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(webdavUrl.replace(/\/+$/, ""), {
      method: "OPTIONS",
      headers: { Authorization: basicAuthHeader(username, password) },
      mode: "cors",
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - started;
    if (res.status === 401) {
      return {
        ok: false,
        latencyMs,
        httpStatus: 401,
        errorCode: "401 Unauthorized",
        message: formatClientErrorMessage("401 Unauthorized"),
      };
    }
    const ok = res.ok || res.status === 405 || res.status === 207;
    return {
      ok,
      latencyMs,
      httpStatus: res.status,
      errorCode: ok ? null : `HTTP ${res.status}`,
      message: ok
        ? `ローカル到達 OK (${latencyMs}ms, HTTP ${res.status})`
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

async function putFile(fullUrl, authHeader, blob) {
  const res = await fetch(fullUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/pdf",
    },
    body: blob,
    mode: "cors",
  });
  if (res.ok || res.status === 201 || res.status === 204) {
    return { ok: true, status: res.status };
  }
  if (res.status === 401) {
    return { ok: false, status: 401, errorCode: "401 Unauthorized", message: formatClientErrorMessage("401 Unauthorized") };
  }
  return {
    ok: false,
    status: res.status,
    errorCode: `HTTP ${res.status}`,
    message: `WebDAV PUT 失敗 (HTTP ${res.status})`,
  };
}

/**
 * 親フォルダを順に MKCOL
 */
async function ensureParentDirs(webdavUrl, remotePath, authHeader) {
  const parts = String(remotePath).replace(/^\/+/, "").split("/").filter(Boolean);
  parts.pop(); // ファイル名除去
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const url = joinWebDavUrl(webdavUrl, acc);
    await ensureWebDavCollection(url, authHeader);
  }
}

/**
 * 見積・請求 PDF をローカル QNAP へ直接保存
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

  const ping = await pingLocalWebDav({
    webdavUrl: direct.webdavUrl,
    username: direct.username,
    password: direct.password,
  });
  if (!ping.ok) {
    return {
      ok: false,
      route: "local_wifi",
      message: ping.message,
      errorCode: ping.errorCode,
      latencyMs: ping.latencyMs,
      files: [],
    };
  }

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
      await ensureParentDirs(direct.webdavUrl, file.remotePath, authHeader);
      const putUrl = joinWebDavUrl(direct.webdavUrl, file.remotePath);
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
      const errorCode = classifyClientError(e);
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
  return {
    ok: allOk,
    route: "local_wifi",
    message: allOk
      ? `ローカルWi-Fi経由で QNAP へ保存しました（${results.length}件）`
      : results.find((r) => !r.ok)?.error || "ローカル直接保存に失敗しました",
    errorCode: allOk ? null : results.find((r) => !r.ok)?.errorCode || null,
    latencyMs: ping.latencyMs,
    files: results,
  };
}

/**
 * VPS 保存が失敗したとき、または local_wifi 指定時にフォールバック実行するか
 */
export function shouldTryClientDirectFallback(vpsResult, saveRoute) {
  if (saveRoute === "local_wifi") return true;
  if (saveRoute === "vps") return false;
  // auto
  if (!vpsResult) return true;
  if (vpsResult.clientDirectFallback) return true;
  if (vpsResult.ok) return false;
  const err = String(vpsResult.error || vpsResult.message || "");
  return /502|timeout|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|fetch failed|接続|失敗|use_client_direct/i.test(
    err
  );
}
