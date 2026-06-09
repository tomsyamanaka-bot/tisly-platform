export interface IdempotencyKey {
    tenantId: string;
    siteId: string;
    deviceId: string;
    eventId: string;
}
export declare function findExistingEvent(key: IdempotencyKey): {
    id: string;
} | null;
export declare function recordDuplicateIngest(key: IdempotencyKey, existingId: string): void;
export declare function getIngestDuplicateCount(): number;
