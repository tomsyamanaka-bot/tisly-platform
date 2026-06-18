import type {
  StorageProvider,
  StorageProviderConfig,
  StorageProviderGetResult,
  StorageProviderPutOptions,
  StorageProviderPutResult,
  StorageProviderTestResult,
} from "../storage-provider.js";

/** QNAP StorageProvider — WebDAV ラッパー（インターフェース先行） */
export class QnapStorageProvider implements StorageProvider {
  readonly kind = "qnap" as const;
  private config: StorageProviderConfig;

  constructor(config: StorageProviderConfig) {
    this.config = config;
  }

  private buildUrl(): string {
    const host = this.config.host?.trim() || "";
    const port = this.config.port ?? 8080;
    const share = (this.config.shareName || "TiSLY").replace(/^\/+|\/+$/g, "");
    const proto = port === 443 || port === 5001 ? "https" : "http";
    return `${proto}://${host}:${port}/${share}`;
  }

  private get mockMode(): boolean {
    return process.env.NODE_ENV === "test" || process.env.STORAGE_PROVIDER_MOCK === "true";
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    if (!this.config.host?.trim()) {
      return {
        ok: false,
        provider: "qnap",
        message: "QNAP ホストが未設定です",
        testedAt: new Date().toISOString(),
        mock: this.mockMode,
      };
    }
    return {
      ok: true,
      provider: "qnap",
      message: this.mockMode
        ? `QNAP モック接続 OK — ${this.buildUrl()}`
        : `QNAP 設定確認済み — ${this.buildUrl()}（実接続は storage-settings-v1 経由）`,
      testedAt: new Date().toISOString(),
      mock: this.mockMode,
    };
  }

  async put(_buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult> {
    if (this.mockMode) {
      return {
        ok: true,
        remotePath: options.remotePath,
        message: "QNAP mock put",
        mock: true,
      };
    }
    return {
      ok: false,
      remotePath: options.remotePath,
      message: "QNAP 実送信は qnap-pdf-backup-service 経由で利用",
    };
  }

  async get(_remotePath: string): Promise<StorageProviderGetResult> {
    return { ok: false, message: "QNAP get は次フェーズ" };
  }

  async delete(_remotePath: string): Promise<{ ok: boolean; message?: string }> {
    return { ok: false, message: "QNAP delete は次フェーズ" };
  }

  async exists(_remotePath: string): Promise<boolean> {
    return false;
  }
}
