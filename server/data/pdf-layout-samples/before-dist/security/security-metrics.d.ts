export declare function recordSignatureError(reason: string): void;
export declare function getSignatureErrorCount(): number;
export declare function getRateLimitProviderStatusAsync(): Promise<{
    provider: string;
    redisReachable: boolean;
}>;
export declare function getRateLimitProviderStatus(): {
    provider: string;
    redisReachable: boolean;
};
