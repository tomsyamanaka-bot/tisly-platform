import type { NextFunction, Request, Response } from "express";
export interface SignatureRequest extends Request {
    rawBody?: string;
}
declare function hmacSha256(secret: string, message: string): string;
export declare function verifyEventSignature(deviceId: string, timestamp: string, rawBody: string, signature: string, headerSecret?: string): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/** Optional HMAC verification when signature headers present or SIGNATURE_CHECK_ENABLED */
export declare function requireEventSignature(req: SignatureRequest, res: Response, next: NextFunction): void;
export { hmacSha256 };
