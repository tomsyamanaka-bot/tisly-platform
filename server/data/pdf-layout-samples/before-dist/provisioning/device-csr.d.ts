/**
 * Device CSR registration and certificate issue/revoke (self-signed placeholder — Phase 381–400).
 */
import { type DeviceCertificatePlaceholder, type DeviceCertStatus } from "./device-certificates.js";
export interface DeviceCsrRecord {
    deviceId: string;
    csrPem: string;
    subject: string;
    registeredAt: string;
    registeredBy: string | null;
}
export interface DeviceCertStatusResponse {
    deviceId: string;
    certStatus: DeviceCertStatus;
    trustLevel: string | null;
    fingerprint: string | null;
    csrRegistered: boolean;
    certIssued: boolean;
    revoked: boolean;
    issuedAt: string | null;
    rotationDueAt: string | null;
}
export declare function registerDeviceCsr(customerId: string, deviceId: string, csrPem: string, actor?: string): DeviceCsrRecord;
export declare function issueDeviceCertFromCsr(customerId: string, deviceId: string): DeviceCertificatePlaceholder;
export declare function revokeDeviceCert(customerId: string, deviceId: string): {
    deviceId: string;
    certStatus: DeviceCertStatus;
};
export declare function getDeviceCertStatus(customerId: string, deviceId: string): DeviceCertStatusResponse;
