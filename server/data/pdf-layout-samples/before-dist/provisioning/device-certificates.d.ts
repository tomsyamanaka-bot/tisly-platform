/**
 * Device mTLS certificate provisioning (placeholder — Phase 361–380 design).
 * See docs/device_mtls_provisioning.md
 */
export type DeviceCertStatus = "none" | "provisioned" | "trusted" | "expired" | "revoked";
export type DeviceTrustLevel = "none" | "bootstrap" | "provisioned" | "trusted";
export interface DeviceCertificatePlaceholder {
    deviceId: string;
    csrPem: string | null;
    certPem: string | null;
    caChain: string[];
    certStatus: DeviceCertStatus;
    trustLevel: DeviceTrustLevel;
    fingerprint: string | null;
    mqttTlsPort: number;
    rotationDueAt: string | null;
}
export declare function generateCsrPlaceholder(deviceId: string): {
    csrPem: string;
    subject: string;
};
export declare function issueDeviceCertificatePlaceholder(deviceId: string): DeviceCertificatePlaceholder;
export declare function rotateCertificatePlaceholder(deviceId: string): DeviceCertificatePlaceholder;
export declare function revokeCertificatePlaceholder(deviceId: string): {
    deviceId: string;
    certStatus: DeviceCertStatus;
};
export declare function applyTrustToDeviceRow(deviceId: string, customerId: string, cert: DeviceCertificatePlaceholder): void;
