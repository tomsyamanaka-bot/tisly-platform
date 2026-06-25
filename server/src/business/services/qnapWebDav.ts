import fs from "fs";
import path from "path";
import type { QnapUploadConfig } from "./qnapBusinessArchive.js";
import {
  listWebDavUrlCandidates,
  qnapWebDavFetch,
} from "./qnap-webdav-fetch-v1.js";

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function joinUrl(base: string, segment: string): string {
  const b = base.replace(/\/+$/, "");
  const s = segment.replace(/^\/+/, "");
  return `${b}/${s}`;
}

export class QnapWebDavClient {
  private effectiveWebDavUrl: string | null = null;

  constructor(private readonly cfg: QnapUploadConfig) {}

  private baseUrl(): string {
    return (this.effectiveWebDavUrl ?? this.cfg.webdavUrl).replace(/\/+$/, "");
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: basicAuthHeader(this.cfg.username, this.cfg.password),
      ...extra,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.cfg.webdavUrl) {
      return { ok: false, message: "QNAP_WEBDAV_URL not set" };
    }

    const candidates = listWebDavUrlCandidates(this.cfg.webdavUrl);
    let lastError = "WebDAV unreachable";

    for (const candidate of candidates) {
      try {
        const res = await qnapWebDavFetch(candidate, {
          method: "OPTIONS",
          headers: this.headers(),
        });
        if (res.ok || res.status === 401 || res.status === 405 || res.status === 207) {
          this.effectiveWebDavUrl = candidate.replace(/\/+$/, "");
          const via =
            candidate.replace(/\/+$/, "") !== this.cfg.webdavUrl.replace(/\/+$/, "")
              ? ` (${this.effectiveWebDavUrl})`
              : "";
          return { ok: true, message: `WebDAV reachable (${res.status})${via}` };
        }
        lastError = `WebDAV OPTIONS failed: ${res.status}`;
      } catch (e) {
        lastError = (e as Error).message;
      }
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
      return { ok: false, message: (e as Error).message };
    }
  }

  async mkcol(remoteDir: string): Promise<void> {
    const parts = remoteDir.split("/").filter(Boolean);
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      const url = joinUrl(this.baseUrl(), acc);
      const res = await qnapWebDavFetch(url, {
        method: "MKCOL",
        headers: this.headers(),
      });
      if (!res.ok && res.status !== 405 && res.status !== 409) {
        throw new Error(`MKCOL ${acc} failed: ${res.status}`);
      }
    }
  }

  async putFile(localPath: string, remotePath: string): Promise<void> {
    const url = joinUrl(this.baseUrl(), remotePath.replace(/^\/+/, ""));
    const body = fs.readFileSync(localPath);
    const res = await qnapWebDavFetch(url, {
      method: "PUT",
      headers: {
        ...this.headers({ "Content-Type": "application/octet-stream" }),
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`PUT ${remotePath} failed: ${res.status}`);
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
      if (!fs.existsSync(f.localPath)) continue;
      await this.putFile(f.localPath, f.remotePath);
      count++;
    }
    return count;
  }

  async deleteFile(remotePath: string): Promise<void> {
    const url = joinUrl(this.baseUrl(), remotePath.replace(/^\/+/, ""));
    const res = await qnapWebDavFetch(url, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`DELETE ${remotePath} failed: ${res.status}`);
    }
  }
}
