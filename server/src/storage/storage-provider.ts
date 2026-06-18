/** StorageProvider — local / webdav / qnap 切替可能構造（インターフェース先行） */

export type StorageProviderKind = "local" | "webdav" | "qnap";

export interface StorageProviderPutOptions {
  contentType?: string;
  remotePath: string;
}

export interface StorageProviderGetResult {
  ok: boolean;
  data?: Buffer;
  contentType?: string;
  message?: string;
}

export interface StorageProviderPutResult {
  ok: boolean;
  remotePath: string;
  message?: string;
  mock?: boolean;
}

export interface StorageProviderTestResult {
  ok: boolean;
  provider: StorageProviderKind;
  message: string;
  testedAt: string;
  mock?: boolean;
}

export interface StorageProviderConfig {
  kind: StorageProviderKind;
  basePath?: string;
  webdavUrl?: string;
  username?: string;
  password?: string;
  shareName?: string;
  host?: string;
  port?: number;
}

export interface StorageProvider {
  readonly kind: StorageProviderKind;
  testConnection(): Promise<StorageProviderTestResult>;
  put(buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult>;
  get(remotePath: string): Promise<StorageProviderGetResult>;
  delete(remotePath: string): Promise<{ ok: boolean; message?: string }>;
  exists(remotePath: string): Promise<boolean>;
}
