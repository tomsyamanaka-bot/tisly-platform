export type CommissioningStatus = "draft" | "claimed" | "placed" | "tested" | "completed" | "failed";
export interface QrCreateInput {
    customerId: string;
    deviceId: string;
    deviceType: string;
    serialNumber: string;
    createdBy?: string;
    ttlMinutes?: number;
}
export interface QrCreateResult {
    tokenId: string;
    qrPayload: string;
    expiresAt: string;
    deviceId: string;
    deviceType: string;
    serialNumber: string;
}
export interface QrClaimInput {
    customerId: string;
    deviceId: string;
    deviceType: string;
    serialNumber: string;
    provisioningToken: string;
    siteId?: string;
    floorId?: string;
    zoneId?: string;
    claimedBy?: string;
}
export declare function createQrProvisioning(input: QrCreateInput): QrCreateResult;
export declare function claimQrProvisioning(input: QrClaimInput): {
    deviceRowId: string;
    deviceId: string;
};
