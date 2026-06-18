import type {
  StorageProvider,
  StorageProviderConfig,
  StorageProviderGetResult,
  StorageProviderPutOptions,
  StorageProviderPutResult,
  StorageProviderTestResult,
} from "../storage-provider.js";
import { WebDavStorageProvider } from "./webdav-storage-provider.js";

/** QNAP StorageProvider — WebDAV ラッパー（.env QNAP_WEBDAV_*） */
export class QnapStorageProvider implements StorageProvider {
  readonly kind = "qnap" as const;
  private inner: WebDavStorageProvider;

  constructor(config: StorageProviderConfig) {
    this.inner = new WebDavStorageProvider(config);
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    const result = await this.inner.testConnection();
    return { ...result, provider: "qnap" };
  }

  async put(buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult> {
    return this.inner.put(buffer, options);
  }

  async get(remotePath: string): Promise<StorageProviderGetResult> {
    return this.inner.get(remotePath);
  }

  async delete(remotePath: string): Promise<{ ok: boolean; message?: string }> {
    return this.inner.delete(remotePath);
  }

  async exists(remotePath: string): Promise<boolean> {
    return this.inner.exists(remotePath);
  }
}
