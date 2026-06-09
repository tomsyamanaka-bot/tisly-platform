export declare function buildWebhookSignaturePayload(timestamp: string, rawBody: string): string;
export declare function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string;
export declare function webhookSignatureHeaders(secret: string, rawBody: string): Record<string, string>;
export declare function verifyWebhookSignature(secret: string, timestamp: string, signature: string, rawBody: string, maxSkewSec?: number): boolean;
