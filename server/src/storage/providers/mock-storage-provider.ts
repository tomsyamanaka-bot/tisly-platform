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

/** Mock StorageProvider — .env 未設定時・テスト用ローカルミラー */
export class MockStorageProvider implements StorageProvider {
  readonly kind = "mock" as const;
  private config: StorageProviderConfig;

  constructor(config: StorageProviderConfig) {
    this.config = config;
  }

  private mirrorRoot(): string {
    return path.join(process.cwd(), "uploads", "qnap-storage-v1-mock");
  }

  private resolveLocalPath(remotePath: string): string {
    const rel = remotePath.replace(/^\/+/, "").replace(/\\/g, "/");
    return path.join(this.mirrorRoot(), rel);
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    const root = this.mirrorRoot();
    fs.mkdirSync(root, { recursive: true });
    const testedAt = new Date().toISOString();
    const labels = [
      "WebDAV疎通",
      "TiSLYベースフォルダ確認",
      "テストフォルダ作成",
      "テストファイル保存",
      "テストファイル読み取り",
      "テストファイル削除",
      "結果ログ保存",
    ];
    const steps = labels.map((label, i) => ({
      step: i + 1,
      label,
      ok: true,
      message: `Mock OK — ${label}`,
    }));
    return {
      ok: true,
      provider: "mock",
      message: `Mock 接続テスト成功（7/7）— ${root}`,
      testedAt,
      mock: true,
      steps,
    };
  }

  async put(buffer: Buffer, options: StorageProviderPutOptions): Promise<StorageProviderPutResult> {
    const dest = this.resolveLocalPath(options.remotePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
    return {
      ok: true,
      remotePath: options.remotePath,
      message: `Mock 保存 — ${dest}`,
      mock: true,
    };
  }

  async get(remotePath: string): Promise<StorageProviderGetResult> {
    const local = this.resolveLocalPath(remotePath);
    if (!fs.existsSync(local)) {
      return { ok: false, message: "not found" };
    }
    return { ok: true, data: fs.readFileSync(local) };
  }

  async delete(remotePath: string): Promise<{ ok: boolean; message?: string }> {
    const local = this.resolveLocalPath(remotePath);
    if (fs.existsSync(local)) fs.unlinkSync(local);
    return { ok: true };
  }

  async exists(remotePath: string): Promise<boolean> {
    return fs.existsSync(this.resolveLocalPath(remotePath));
  }
}
