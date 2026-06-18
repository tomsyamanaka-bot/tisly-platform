import fs from "fs";
import os from "os";
import path from "path";
import { QnapWebDavClient } from "../../business/services/qnapWebDav.js";
import type {
  StorageProvider,
  StorageProviderConfig,
  StorageProviderGetResult,
  StorageProviderPutOptions,
  StorageProviderPutResult,
  StorageProviderTestResult,
} from "../storage-provider.js";

/** WebDAV StorageProvider — QNAP 実保存 */
export class WebDavStorageProvider implements StorageProvider {
  readonly kind = "webdav" as const;
  private config: StorageProviderConfig;

  constructor(config: StorageProviderConfig) {
    this.config = config;
  }

  private get mockMode(): boolean {
    return process.env.STORAGE_PROVIDER_MOCK === "true" || process.env.NODE_ENV === "test";
  }

  private client(): QnapWebDavClient | null {
    if (!this.config.webdavUrl?.trim()) return null;
    return new QnapWebDavClient({
      mode: "real",
      webdavUrl: this.config.webdavUrl,
      username: this.config.username ?? "",
      password: this.config.password ?? "",
      basePath: this.config.basePath ?? "/",
    });
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    if (!this.config.webdavUrl?.trim()) {
      return {
        ok: false,
        provider: "webdav",
        message: "WebDAV URL が未設定です",
        testedAt: new Date().toISOString(),
        mock: this.mockMode,
      };
    }
    if (this.mockMode) {
      return {
        ok: true,
        provider: "webdav",
        message: `WebDAV モック接続 OK — ${this.config.webdavUrl}`,
        testedAt: new Date().toISOString(),
        mock: true,
      };
    }
    const client = this.client();
    if (!client) {
      return {
        ok: false,
        provider: "webdav",
        message: "WebDAV クライアントを作成できません",
        testedAt: new Date().toISOString(),
      };
    }
    const base = await client.testConnection();
    if (!base.ok) {
      return {
        ok: false,
        provider: "webdav",
        message: base.message,
        testedAt: new Date().toISOString(),
      };
    }
    const share = await client.verifyShareFolder();
    return {
      ok: share.ok,
      provider: "webdav",
      message: share.ok ? `✅ WebDAV 接続成功 — ${this.config.webdavUrl}` : share.message,
      testedAt: new Date().toISOString(),
    };
  }

  async put(buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult> {
    const remotePath = options.remotePath.replace(/^\/+/, "");
    if (this.mockMode) {
      return {
        ok: true,
        remotePath: options.remotePath,
        message: "WebDAV mock put",
        mock: true,
      };
    }
    const client = this.client();
    if (!client) {
      return {
        ok: false,
        remotePath: options.remotePath,
        message: "WebDAV URL が未設定です",
      };
    }
    try {
      const dir = remotePath.includes("/") ? remotePath.slice(0, remotePath.lastIndexOf("/")) : "";
      if (dir) await client.mkcol(dir);
      const tmp = pathJoinTmp(buffer);
      await client.putFile(tmp, remotePath);
      fs.unlinkSync(tmp);
      return { ok: true, remotePath: options.remotePath, message: "WebDAV PUT success" };
    } catch (e) {
      return {
        ok: false,
        remotePath: options.remotePath,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async get(_remotePath: string): Promise<StorageProviderGetResult> {
    return { ok: false, message: "WebDAV get は次フェーズ" };
  }

  async delete(_remotePath: string): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: "WebDAV delete は次フェーズ" };
  }

  async exists(_remotePath: string): Promise<boolean> {
    return false;
  }
}

function pathJoinTmp(buffer: Buffer): string {
  const f = path.join(os.tmpdir(), `tisly-webdav-${Date.now()}.bin`);
  fs.writeFileSync(f, buffer);
  return f;
}
