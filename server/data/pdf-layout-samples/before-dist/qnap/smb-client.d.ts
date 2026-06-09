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
export declare function getQnapMode(): "mock" | "real";
export declare function isQnapSmbConfigured(): boolean;
export declare function smbWritePlaceholder(req: SmbWriteRequest): Promise<SmbWriteResult>;
