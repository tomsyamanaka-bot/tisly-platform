/** Sync check — memory store (always); Redis when provider=redis and already connected */
export declare function isReplay(signature: string, eventId?: string, _timestamp?: string): boolean;
export declare function isReplayAsync(signature: string, eventId?: string, _timestamp?: string): Promise<boolean>;
export declare function recordReplay(signature: string, eventId?: string, timestamp?: string): void;
export declare function recordReplayAsync(signature: string, eventId?: string, timestamp?: string): Promise<void>;
export declare function recordReplayBlocked(): void;
export declare function getReplayBlockedCount(): number;
export declare function resetReplayStoreForTests(): void;
