import fs from "fs";
import path from "path";
import type { QnapUploadConfig } from "./qnapBusinessArchive.js";
import {
  formatFetchError,
  listWebDavUrlCandidates,
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

  constructor(private readonly cfg: QnapUploadConfig) {}

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

    const candidates = listWebDavUrlCandidates(this.cfg.webdavUrl);
    const attempts: string[] = [];
    let lastError = "WebDAV unreachable";
    let allRefused = candidates.length > 0;

    for (const candidate of candidates) {
      try {
        const res = await qnapWebDavFetch(candidate, {
          method: "OPTIONS",
          headers: this.headers(),
        });
        allRefused = false;
        if (res.ok || res.status === 401 || res.status === 405 || res.status === 207) {
          this.effectiveWebDavUrl = candidate.replace(/\/+$/, "");
          rememberDiscoveredWebDavUrl(this.effectiveWebDavUrl);
          const via =
            candidate.replace(/\/+$/, "") !== this.cfg.webdavUrl.replace(/\/+$/, "")
              ? ` (${this.effectiveWebDavUrl})`
              : "";
          return {
            ok: true,
            message: `WebDAV reachable (${res.status})${via}`,
            webdavUrl: this.effectiveWebDavUrl,
          };
        }
        lastError = `WebDAV OPTIONS failed: ${res.status}`;
        attempts.push(`${candidate} → HTTP ${res.status}`);
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
   */
  async mkcol(remoteDir: string): Promise<void> {
    const normalized = this.normalizeRemotePath(remoteDir);
    const parts = normalized.split("/").filter(Boolean);
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
      if (!res.ok && !isWebDavMkcolSuccessStatus(res.status)) {
        throw new Error(`MKCOL ${segment} failed: HTTP ${res.status}`);
      }
    }
  }

  async putFile(localPath: string, remotePath: string, attempt = 1): Promise<void> {
    const normalized = this.normalizeRemotePath(remotePath);
    const url = buildWebDavFullUrl(this.baseUrl(), normalized);
    const body = fs.readFileSync(localPath);
    const maxAttempts = 3;
    console.log(
      `[QNAP WebDAV PUT] fullUrl=${url} remotePath=${remotePath} bytes=${body.length} attempt=${attempt}`
    );
    try {
      const res = await qnapWebDavFetch(url, {
        method: "PUT",
        headers: {
          ...this.headers({ "Content-Type": "application/octet-stream" }),
        },
        body,
      });
      if (!res.ok) {
        throw new Error(`PUT ${remotePath} failed: HTTP ${res.status}`);
      }
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      const delayMs = 1500 * attempt;
      await new Promise((r) => setTimeout(r, delayMs));
      return this.putFile(localPath, remotePath, attempt + 1);
    }
  }

  async uploadLocalFiles(
    files: Array<{ localPath: string; remotePath: string }>
  ): Promise<number> {
    const dirs = new Set<string>();
    for (const f of files) {
      const dir = path.posix.dirname(f.remotePath.replace(/\\/g, "/"));
      if (dir && dir !== ".") dirs.add(dir);
    }
    for (const d of dirs) {
      await this.mkcol(d);
    }
    let count = 0;
    for (const f of files) {
      if (!fs.existsSync(f.localPath)) {
        throw new Error(`Local file missing for WebDAV PUT: ${f.localPath}`);
      }
      await this.putFile(f.localPath, f.remotePath);
      count++;
    }
    return count;
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
