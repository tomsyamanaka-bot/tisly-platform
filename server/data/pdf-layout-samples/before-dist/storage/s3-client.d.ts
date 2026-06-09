/**
 * S3-compatible storage placeholder (Phase 381–400).
 * Production: wire @aws-sdk/client-s3 or MinIO client when STORAGE_PROVIDER=s3.
 */
export interface S3PutResult {
    ok: boolean;
    key: string;
    provider: "s3" | "local";
    placeholder: boolean;
    message: string;
}
export declare function isS3Configured(): boolean;
export declare function putObjectPlaceholder(key: string, _body: Buffer): Promise<S3PutResult>;
