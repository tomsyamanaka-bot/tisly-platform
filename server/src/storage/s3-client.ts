/**
 * S3-compatible storage placeholder (Phase 381–400).
 * Production: wire @aws-sdk/client-s3 or MinIO client when STORAGE_PROVIDER=s3.
 */

import { config } from "../config.js";

export interface S3PutResult {
  ok: boolean;
  key: string;
  provider: "s3" | "local";
  placeholder: boolean;
  message: string;
}

export function isS3Configured(): boolean {
  return config.storage.provider === "s3" && !!config.storage.s3.bucket;
}

export async function putObjectPlaceholder(key: string, _body: Buffer): Promise<S3PutResult> {
  if (!isS3Configured()) {
    return {
      ok: false,
      key,
      provider: "local",
      placeholder: true,
      message: "S3 not configured — use STORAGE_PROVIDER=local",
    };
  }
  return {
    ok: true,
    key,
    provider: "s3",
    placeholder: true,
    message: `S3 upload placeholder — endpoint ${config.storage.s3.endpoint} bucket ${config.storage.s3.bucket}`,
  };
}
