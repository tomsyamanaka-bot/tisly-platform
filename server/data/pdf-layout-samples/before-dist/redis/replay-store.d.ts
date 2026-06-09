export declare function replayStoreHas(signature: string, eventId?: string): Promise<boolean>;
export declare function replayStoreAdd(signature: string, eventId?: string, timestamp?: string): Promise<void>;
export declare function resetReplayStoreForTests(): void;
