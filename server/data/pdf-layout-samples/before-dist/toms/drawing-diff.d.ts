export interface DrawingDeviceRef {
    id: string;
    label: string;
    assetType: string;
    posX?: number;
    posY?: number;
}
export type DrawingDiffChangeType = "added" | "removed" | "moved";
export interface DrawingDiffItem {
    changeType: DrawingDiffChangeType;
    device: DrawingDeviceRef;
    from?: DrawingDeviceRef;
    to?: DrawingDeviceRef;
    posX?: number;
    posY?: number;
}
export interface DrawingDiffResult {
    survey: DrawingDeviceRef[];
    construction: DrawingDeviceRef[];
    as_built: DrawingDeviceRef[];
    added: DrawingDeviceRef[];
    removed: DrawingDeviceRef[];
    moved: Array<{
        from: DrawingDeviceRef;
        to: DrawingDeviceRef;
    }>;
    items: DrawingDiffItem[];
}
export declare function compareDrawingVersions(projectId: string): DrawingDiffResult;
