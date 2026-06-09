export declare function customerFilesDir(customerCode: string): string;
export declare function isAllowedInstallPhotoFile(fileName?: string): boolean;
/** Field install photo categories (Phase 401–420). */
export declare const INSTALL_PHOTO_TYPES: readonly ["before", "after", "wiring", "device_label", "panel", "test_result", "install", "construction"];
export type InstallPhotoType = (typeof INSTALL_PHOTO_TYPES)[number];
export declare function isValidInstallPhotoType(t: string | undefined): t is InstallPhotoType;
export interface InstallPhotoRow {
    id: string;
    customerId: string;
    deviceId: string | null;
    siteId: string | null;
    photoPath: string;
    photoType: string;
    uploadedBy: string | null;
    createdAt: string;
}
export declare function saveInstallPhoto(params: {
    customerId: string;
    customerCode: string;
    deviceId?: string;
    siteId?: string;
    photoType?: string;
    imageBase64: string;
    fileName?: string;
    uploadedBy?: string;
}): {
    id: string;
    photoPath: string;
    photoType: string;
    storage: string;
};
export declare function listInstallPhotos(customerId: string): InstallPhotoRow[];
export declare function deleteInstallPhoto(customerId: string, photoId: string): boolean;
export declare function getInstallPhotoUrl(photoPath: string): string;
