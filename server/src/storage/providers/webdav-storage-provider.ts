import type {
  StorageProvider,
  StorageProviderConfig,
  StorageProviderGetResult,
  StorageProviderPutOptions,
  StorageProviderPutResult,
  StorageProviderTestResult,
} from "../storage-provider.js";

/** WebDAV StorageProvider — インターフェース先行（実接続は将来） */
export class WebDavStorageProvider implements StorageProvider {
  readonly kind = "webdav" as const;
  private config: StorageProviderConfig;

  constructor(config: StorageProviderConfig) {
    this.config = config;
  }

  private get mockMode(): boolean {
    return process.env.NODE_ENV === "test" || process.env.STORAGE_PROVIDER_MOCK === "true";
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
    return {
      ok: true,
      provider: "webdav",
      message: this.mockMode
        ? `WebDAV モック接続 OK — ${this.config.webdavUrl}`
        : `WebDAV 設定確認済み — ${this.config.webdavUrl}（実送信は次フェーズ）`,
      testedAt: new Date().toISOString(),
      mock: this.mockMode,
    };
  }

  async put(_buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult> {
    if (this.mockMode) {
      return {
        ok: true,
        remotePath: options.remotePath,
        message: "WebDAV mock put",
        mock: true,
      };
    }
    return {
      ok: false,
      remotePath: options.remotePath,
      message: "WebDAV 実送信は次フェーズで有効化予定",
    };
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
