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

export function isQnapSmbConfigured(): boolean {
  return Boolean(
    config.qnap.host && config.qnap.share && config.qnap.username && config.qnap.password
  );
}

export async function smbWritePlaceholder(req: SmbWriteRequest): Promise<SmbWriteResult> {
  if (!isQnapSmbConfigured()) {
    return {
      ok: true,
      remotePath: req.remotePath,
      mode: "local-mock",
      message: "QNAP SMB 未設定 — ローカル mock のみ（data/qnap-archive/）",
    };
  }

  return {
    ok: false,
    remotePath: req.remotePath,
    mode: "smb",
    message: `SMB write pending: //${config.qnap.host}/${config.qnap.share}${req.remotePath}`,
  };
}
