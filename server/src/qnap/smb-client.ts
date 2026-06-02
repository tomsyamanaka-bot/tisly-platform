import { config } from "../config.js";

/**
 * QNAP SMB クライアント（プレースホルダー）
 * 実機 NAS 到着後に @marsaud/smb2 等で writeFile を実装する。
 */

export interface SmbWriteRequest {
  remotePath: string;
  content: string | Buffer;
}

export interface SmbWriteResult {
  ok: boolean;
  remotePath: string;
  mode: "local-mock" | "smb";
  message?: string;
}

export function getQnapMode(): "mock" | "real" {
  return config.qnap.mode === "real" ? "real" : "mock";
}

export function isQnapSmbConfigured(): boolean {
  return Boolean(
    config.qnap.host && config.qnap.share && config.qnap.username && config.qnap.password
  );
}

export async function smbWritePlaceholder(req: SmbWriteRequest): Promise<SmbWriteResult> {
  if (getQnapMode() === "mock" || !isQnapSmbConfigured()) {
    return {
      ok: true,
      remotePath: req.remotePath,
      mode: "local-mock",
      message: `QNAP_MODE=${getQnapMode()} — ローカル mock（data/qnap-archive/）`,
    };
  }

  return {
    ok: false,
    remotePath: req.remotePath,
    mode: "smb",
    message: `SMB write pending (real mode): //${config.qnap.host}/${config.qnap.share}${req.remotePath}`,
  };
}
