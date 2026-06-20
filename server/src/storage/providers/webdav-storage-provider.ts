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
  StorageProviderTestStepV1,
} from "../storage-provider.js";

const TEST_DIR = ".tisly-webdav-connection-test";
const TEST_FILE = "connection-test.txt";
const TEST_PAYLOAD = "TiSLY WebDAV connection test";

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

  private joinRemote(...segments: string[]): string {
    const base = (this.config.basePath ?? "/TiSLY").replace(/^\/+|\/+$/g, "");
    const rest = segments.filter(Boolean).join("/");
    return base ? `${base}/${rest}` : rest;
  }

  private pushStep(
    steps: StorageProviderTestStepV1[],
    step: number,
    label: string,
    ok: boolean,
    message: string
  ): void {
    steps.push({ step, label, ok, message });
  }

  async testConnection(): Promise<StorageProviderTestResult> {
    const testedAt = new Date().toISOString();
    const steps: StorageProviderTestStepV1[] = [];

    if (!this.config.webdavUrl?.trim()) {
      this.pushStep(steps, 1, "WebDAV疎通", false, "QNAP_WEBDAV_URL が未設定です");
      return {
        ok: false,
        provider: "webdav",
        message: "QNAP_WEBDAV_URL が未設定です",
        testedAt,
        steps,
      };
    }

    if (this.mockMode) {
      const labels = [
        "WebDAV疎通",
        "TiSLYベースフォルダ確認",
        "テストフォルダ作成",
        "テストファイル保存",
        "テストファイル読み取り",
        "テストファイル削除",
        "結果ログ保存",
      ];
      labels.forEach((label, i) => {
        this.pushStep(steps, i + 1, label, true, `Mock OK — ${label}`);
      });
      return {
        ok: true,
        provider: "webdav",
        message: `✅ WebDAV モック接続テスト成功（7/7）— ${this.config.webdavUrl}`,
        testedAt,
        mock: true,
        steps,
      };
    }

    const client = this.client();
    if (!client) {
      this.pushStep(steps, 1, "WebDAV疎通", false, "WebDAV クライアントを作成できません");
      return {
        ok: false,
        provider: "webdav",
        message: "WebDAV クライアントを作成できません",
        testedAt,
        steps,
      };
    }

    const testDir = this.joinRemote(TEST_DIR);
    const testRemotePath = `${testDir}/${TEST_FILE}`;

    // 1. WebDAV疎通
    const base = await client.testConnection();
    this.pushStep(
      steps,
      1,
      "WebDAV疎通",
      base.ok,
      base.ok ? base.message : `WebDAV に接続できません: ${base.message}`
    );
    if (!base.ok) {
      return {
        ok: false,
        provider: "webdav",
        message: `WebDAV疎通失敗: ${base.message}`,
        testedAt,
        steps,
      };
    }

    // 2. TiSLYベースフォルダ確認
    const share = await client.verifyShareFolder();
    this.pushStep(
      steps,
      2,
      "TiSLYベースフォルダ確認",
      share.ok,
      share.ok ? `ベースフォルダ OK (${this.config.basePath ?? "/TiSLY"})` : share.message
    );
    if (!share.ok) {
      return {
        ok: false,
        provider: "webdav",
        message: `ベースフォルダ確認失敗: ${share.message}`,
        testedAt,
        steps,
      };
    }

    // 3. テストフォルダ作成
    try {
      await client.mkcol(testDir);
      this.pushStep(steps, 3, "テストフォルダ作成", true, `${testDir} を作成`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.pushStep(steps, 3, "テストフォルダ作成", false, msg);
      return {
        ok: false,
        provider: "webdav",
        message: `テストフォルダ作成失敗: ${msg}`,
        testedAt,
        steps,
      };
    }

    // 4. テストファイル保存
    let tmp = "";
    try {
      tmp = pathJoinTmp(Buffer.from(TEST_PAYLOAD, "utf8"));
      await client.putFile(tmp, testRemotePath);
      this.pushStep(steps, 4, "テストファイル保存", true, testRemotePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.pushStep(steps, 4, "テストファイル保存", false, msg);
      return {
        ok: false,
        provider: "webdav",
        message: `テストファイル保存失敗: ${msg}`,
        testedAt,
        steps,
      };
    } finally {
      if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }

    // 5. テストファイル読み取り
    try {
      const read = await this.get(testRemotePath);
      const text = read.ok && read.data ? read.data.toString("utf8") : "";
      const readOk = read.ok && text === TEST_PAYLOAD;
      this.pushStep(
        steps,
        5,
        "テストファイル読み取り",
        readOk,
        readOk ? "読み取り内容を確認しました" : read.message ?? "読み取り内容が一致しません"
      );
      if (!readOk) {
        await client.deleteFile(testRemotePath).catch(() => {});
        return {
          ok: false,
          provider: "webdav",
          message: "テストファイル読み取り確認に失敗しました",
          testedAt,
          steps,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.pushStep(steps, 5, "テストファイル読み取り", false, msg);
      await client.deleteFile(testRemotePath).catch(() => {});
      return {
        ok: false,
        provider: "webdav",
        message: `テストファイル読み取り失敗: ${msg}`,
        testedAt,
        steps,
      };
    }

    // 6. テストファイル削除
    try {
      await client.deleteFile(testRemotePath);
      this.pushStep(steps, 6, "テストファイル削除", true, testRemotePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.pushStep(steps, 6, "テストファイル削除", false, msg);
      return {
        ok: false,
        provider: "webdav",
        message: `テストファイル削除失敗: ${msg}`,
        testedAt,
        steps,
      };
    }

    // 7. 結果ログ保存（呼び出し元で platform_settings へ保存）
    this.pushStep(steps, 7, "結果ログ保存", true, "接続テスト結果を記録しました");

    return {
      ok: true,
      provider: "webdav",
      message: `✅ WebDAV 接続テスト成功（7/7）— ${this.config.webdavUrl}`,
      testedAt,
      steps,
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

  async get(remotePath: string): Promise<StorageProviderGetResult> {
    const rel = remotePath.replace(/^\/+/, "");
    if (this.mockMode) {
      return { ok: false, message: "WebDAV mock get unavailable" };
    }
    const client = this.client();
    if (!client) return { ok: false, message: "WebDAV URL が未設定です" };
    try {
      const url = `${this.config.webdavUrl!.replace(/\/+$/, "")}/${rel}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.username ?? ""}:${this.config.password ?? ""}`).toString("base64")}`,
        },
      });
      if (!res.ok) {
        return { ok: false, message: `GET failed: HTTP ${res.status}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        ok: true,
        data: buf,
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async delete(remotePath: string): Promise<{ ok: boolean; message?: string }> {
    const rel = remotePath.replace(/^\/+/, "");
    if (this.mockMode) {
      return { ok: true, message: "WebDAV mock delete" };
    }
    const client = this.client();
    if (!client) return { ok: false, message: "WebDAV URL が未設定です" };
    try {
      await client.deleteFile(rel);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    const rel = remotePath.replace(/^\/+/, "");
    if (this.mockMode) return false;
    const client = this.client();
    if (!client) return false;
    try {
      const url = `${this.config.webdavUrl!.replace(/\/+$/, "")}/${rel}`;
      const res = await fetch(url, {
        method: "HEAD",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.username ?? ""}:${this.config.password ?? ""}`).toString("base64")}`,
        },
      });
      return res.ok || res.status === 207;
    } catch {
      return false;
    }
  }
}

function pathJoinTmp(buffer: Buffer): string {
  const f = path.join(os.tmpdir(), `tisly-webdav-${Date.now()}.bin`);
  fs.writeFileSync(f, buffer);
  return f;
}
