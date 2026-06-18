import fs from "fs";
import path from "path";
import type {
  StorageProvider,
  StorageProviderConfig,
  StorageProviderGetResult,
  StorageProviderPutOptions,
  StorageProviderPutResult,
  StorageProviderTestResult,
} from "../storage-provider.js";

export class LocalStorageProvider implements StorageProvider {
  readonly kind = "local" as const;
  private root: string;

  constructor(config: StorageProviderConfig) {
    this.root = path.resolve(config.basePath || path.join(process.cwd(), "uploads", "master-v1-storage"));
    fs.mkdirSync(this.root, { recursive: true });
  }

  private resolve(remotePath: string): string {
    const clean = remotePath.replace(/^\/+/, "").replace(/\.\./g, "");
    return path.join(this.root, clean);
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    fs.mkdirSync(this.root, { recursive: true });
    return {
      ok: true,
      provider: "local",
      message: `ローカル保存先: ${this.root}`,
      testedAt: new Date().toISOString(),
    };
  }

  async put(buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult> {
    const filePath = this.resolve(options.remotePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return { ok: true, remotePath: options.remotePath, message: `saved to ${filePath}` };
  }

  async get(remotePath: string): Promise<StorageProviderGetResult> {
    const filePath = this.resolve(remotePath);
    if (!fs.existsSync(filePath)) {
      return { ok: false, message: "not found" };
    }
    return {
      ok: true,
      data: fs.readFileSync(filePath),
      contentType: "application/octet-stream",
    };
  }

  async delete(remotePath: string): Promise<{ ok: boolean; message?: string }> {
    const filePath = this.resolve(remotePath);
    if (!fs.existsSync(filePath)) return { ok: false, message: "not found" };
    fs.unlinkSync(filePath);
    return { ok: true };
  }

  async exists(remotePath: string): Promise<boolean> {
    return fs.existsSync(this.resolve(remotePath));
  }
}
