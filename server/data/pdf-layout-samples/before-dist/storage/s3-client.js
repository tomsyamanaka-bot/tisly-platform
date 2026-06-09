/**
 * S3-compatible storage placeholder (Phase 381–400).
 * Production: wire @aws-sdk/client-s3 or MinIO client when STORAGE_PROVIDER=s3.
 */
import { config } from "../config.js";
export function isS3Configured() {
    return config.storage.provider === "s3" && !!config.storage.s3.bucket;
}
export async function putObjectPlaceholder(key, _body) {
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
