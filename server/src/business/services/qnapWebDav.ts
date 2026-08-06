import fs from "fs";
import path from "path";
import type { QnapUploadConfig } from "./qnapBusinessArchive.js";
import {
  formatFetchError,
  isWebDavMethodAcceptedStatus,
  listWebDavUrlCandidates,
  probeWebDavEndpoint,
  qnapWebDavFetch,
  rememberDiscoveredWebDavUrl,
} from "./qnap-webdav-fetch-v1.js";
import {
  buildWebDavFullUrl,
  encodeWebDavPath,
  isWebDavMkcolSuccessStatus,
  stripDuplicateWebDavSharePrefix,
} from "./webdav-path-encoding-v1.js";
import { qnapBasicAuthHeaders } from "../../storage/qnap-basic-auth-v1.js";

export { encodeWebDavPath, buildWebDavFullUrl, stripDuplicateWebDavSharePrefix };

export class QnapWebDavClient {
  private effectiveWebDavUrl: string | null = null;
  /** true のときポート再探索せず指定 URL のみ使用 */
  private exactUrlOnly = false;

  constructor(
    private readonly cfg: QnapUploadConfig & { exactUrlOnly?: boolean }
  ) {
    if (cfg.exactUrlOnly) this.exactUrlOnly = true;
  }

  /** 多重フォールバック用 — 指定 URL に固定（再探索なし） */
  lockToExactUrl(url: string): void {
    const base = String(url || "").replace(/\/+$/, "");
    if (!base) return;
    this.effectiveWebDavUrl = base;
    this.exactUrlOnly = true;
  }

  private baseUrl(): string {
    return (this.effectiveWebDavUrl ?? this.cfg.webdavUrl).replace(/\/+$/, "");
  }

  /** Basic 認証ヘッダー（ユーザー未設定時は Authorization 省略） */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return qnapBasicAuthHeaders(this.cfg.username, this.cfg.password, extra);
  }

  /** WebDAV 送信前に共有名の二重付与を除去 */
  private normalizeRemotePath(remotePath: string): string {
    return stripDuplicateWebDavSharePrefix(this.baseUrl(), remotePath);
  }

  /** ポート探索後に確定したベース URL（なければ設定値） */
  getEffectiveWebDavUrl(): string {
    return this.baseUrl();
  }

  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    webdavUrl?: string;
  }> {
    if (!this.cfg.webdavUrl) {
      return { ok: false, message: "QNAP_WEBDAV_URL not set" };
    }

    const candidates = this.exactUrlOnly
      ? [this.baseUrl()]
      : listWebDavUrlCandidates(this.cfg.webdavUrl);
    const attempts: string[] = [];
    let lastError = "WebDAV unreachable";
    let allRefused = candidates.length > 0;

    for (const candidate of candidates) {
      try {
        // PUT 前と同様に OPTIONS → PROPFIND で WebDAV 対応を検証（501 回避）
        const probe = await probeWebDavEndpoint(candidate, this.headers());
        allRefused = false;
        if (probe.ok && isWebDavMethodAcceptedStatus(probe.status)) {
          this.effectiveWebDavUrl = candidate.replace(/\/+$/, "");
          rememberDiscoveredWebDavUrl(this.effectiveWebDavUrl);
          const via =
            candidate.replace(/\/+$/, "") !== this.cfg.webdavUrl.replace(/\/+$/, "")
              ? ` (${this.effectiveWebDavUrl})`
              : "";
          return {
            ok: true,
            message: `WebDAV reachable via ${probe.method} (${probe.status})${via}`,
            webdavUrl: this.effectiveWebDavUrl,
          };
        }
        lastError =
          probe.status === 501
            ? `WebDAV Not Implemented (HTTP 501) at ${candidate}`
            : `WebDAV ${probe.method} failed: ${probe.status}`;
        attempts.push(`${candidate} → ${probe.message}`);
      } catch (e) {
        lastError = formatFetchError(e);
        attempts.push(`${candidate} → ${lastError}`);
        if (!/ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ENETUNREACH/i.test(lastError)) {
          allRefused = false;
        }
      }
    }

    if (attempts.length > 1) {
      lastError = `${lastError} — tried: ${attempts.join("; ")}`;
    }
    if (allRefused) {
      lastError = `ECONNREFUSED ${lastError}`;
    }

    return { ok: false, message: lastError };
  }

  /** 共有フォルダ（WebDAV ルート）の存在確認 */
  async verifyShareFolder(): Promise<{ ok: boolean; message: string }> {
    if (!this.cfg.webdavUrl) {
      return { ok: false, message: "WebDAV URL not configured" };
    }
    try {
      const res = await qnapWebDavFetch(this.baseUrl(), {
        method: "PROPFIND",
        headers: this.headers({
          Depth: "0",
          "Content-Type": "application/xml",
        }),
      });
      if (res.status === 404) {
        return { ok: false, message: "共有フォルダが見つかりません（404）" };
      }
      if (res.ok || res.status === 207 || res.status === 401) {
        return { ok: true, message: "共有フォルダを確認しました" };
      }
      return { ok: false, message: `PROPFIND failed: HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: formatFetchError(e) };
    }
  }

  /**
   * 親ディレクトリを最下層まで逐次 MKCOL。
   * 405/409（既存）・201（作成）は成功扱い。
   * 戻り値に各セグメントの HTTP ステータスを含める（デバッグログ用）。
   */
  async mkcol(remoteDir: string): Promise<{
    ok: boolean;
    steps: Array<{
      method: "MKCOL";
      url: string;
      segment: string;
      status: number;
      ok: boolean;
    }>;
  }> {
    const normalized = this.normalizeRemotePath(remoteDir);
    const parts = normalized.split("/").filter(Boolean);
    const steps: Array<{
      method: "MKCOL";
      url: string;
      segment: string;
      status: number;
      ok: boolean;
    }> = [];
    if (parts.length === 0) {
      return { ok: true, steps };
    }
    for (let i = 0; i < parts.length; i += 1) {
      const partial = parts.slice(0, i + 1).join("/");
      const url = buildWebDavFullUrl(this.baseUrl(), partial);
      const segment = parts[i];
      console.log(
        `[QNAP WebDAV MKCOL] fullUrl=${url} remoteDir=${remoteDir} segment=${segment}`
      );
      const res = await qnapWebDavFetch(url, {
        method: "MKCOL",
        headers: this.headers(),
      });
      const ok =
        res.ok || isWebDavMkcolSuccessStatus(res.status);
      steps.push({
        method: "MKCOL",
        url,
        segment,
        status: res.status,
        ok,
      });
      if (!ok) {
        const err = new Error(
          `MKCOL ${segment} failed: HTTP ${res.status}`
        ) as Error & { status?: number; mkcolSteps?: typeof steps };
        err.status = res.status;
        err.mkcolSteps = steps;
        throw err;
      }
    }
    return { ok: true, steps };
  }

  async putFile(
    localPath: string,
    remotePath: string,
    attempt = 1
  ): Promise<{ url: string; status: number }> {
    const normalized = this.normalizeRemotePath(remotePath);
    const body = fs.readFileSync(localPath);
    const maxAttempts = 3;
    try {
      // PUT 前にエンドポイント検証（未探索時はポート/パス再発見）
      if (!this.effectiveWebDavUrl) {
        const conn = await this.testConnection();
        if (!conn.ok) {
          throw new Error(`WebDAV preflight failed: ${conn.message}`);
        }
      } else {
        const preflight = await probeWebDavEndpoint(this.baseUrl(), this.headers());
        if (!preflight.ok) {
          if (this.exactUrlOnly) {
            throw new Error(`WebDAV preflight failed: ${preflight.message}`);
          }
          // キャッシュ切れの可能性 — 再探索
          this.effectiveWebDavUrl = null;
          const conn = await this.testConnection();
          if (!conn.ok) {
            throw new Error(
              `WebDAV preflight failed: ${preflight.message}; rediscover: ${conn.message}`
            );
          }
        }
      }

      const putUrl = buildWebDavFullUrl(this.baseUrl(), normalized);
      console.log(
        `[QNAP WebDAV PUT] fullUrl=${putUrl} remotePath=${remotePath} bytes=${body.length} attempt=${attempt}`
      );
      const res = await qnapWebDavFetch(putUrl, {
        method: "PUT",
        headers: {
          ...this.headers({ "Content-Type": "application/octet-stream" }),
        },
        body,
      });
      if (!res.ok) {
        const err = new Error(
          `PUT ${remotePath} failed: HTTP ${res.status}`
        ) as Error & { status?: number; url?: string };
        err.status = res.status;
        err.url = putUrl;
        throw err;
      }
      return { url: putUrl, status: res.status };
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      const delayMs = 1500 * attempt;
      await new Promise((r) => setTimeout(r, delayMs));
      return this.putFile(localPath, remotePath, attempt + 1);
    }
  }

  async uploadLocalFiles(
    files: Array<{ localPath: string; remotePath: string }>
  ): Promise<{
    count: number;
    steps: Array<{
      method: string;
      urlOrPath: string;
      status?: number | null;
      ok: boolean;
      detail?: string;
    }>;
  }> {
    const steps: Array<{
      method: string;
      urlOrPath: string;
      status?: number | null;
      ok: boolean;
      detail?: string;
    }> = [];
    const dirs = new Set<string>();
    for (const f of files) {
      const dir = path.posix.dirname(f.remotePath.replace(/\\/g, "/"));
      if (dir && dir !== ".") dirs.add(dir);
    }
    for (const d of dirs) {
      const mk = await this.mkcol(d);
      for (const s of mk.steps) {
        steps.push({
          method: "MKCOL",
          urlOrPath: s.url,
          status: s.status,
          ok: s.ok,
          detail: `segment=${s.segment}`,
        });
      }
    }
    let count = 0;
    for (const f of files) {
      if (!fs.existsSync(f.localPath)) {
        throw new Error(`Local file missing for WebDAV PUT: ${f.localPath}`);
      }
      const put = await this.putFile(f.localPath, f.remotePath);
      steps.push({
        method: "PUT",
        urlOrPath: put.url,
        status: put.status,
        ok: true,
        detail: f.remotePath,
      });
      count++;
    }
    return { count, steps };
  }

  async deleteFile(remotePath: string): Promise<void> {
    const normalized = this.normalizeRemotePath(remotePath);
    const url = buildWebDavFullUrl(this.baseUrl(), normalized);
    const res = await qnapWebDavFetch(url, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`DELETE ${remotePath} failed: ${res.status}`);
    }
  }
}
