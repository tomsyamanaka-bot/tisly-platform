/** NFC UID claim — smartphone NFC read is TODO; UID string input for now. */
export interface NfcClaimInput {
    customerId: string;
    nfcUid: string;
    deviceId?: string;
    deviceType?: string;
    serialNumber?: string;
    siteId?: string;
    floorId?: string;
    zoneId?: string;
    claimedBy?: string;
}
export declare function claimNfcProvisioning(input: NfcClaimInput): {
    deviceRowId: string;
    deviceId: string;
};
