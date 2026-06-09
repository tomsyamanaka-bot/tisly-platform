export type DrawingVersionKind = "survey" | "construction" | "as_built";
export interface DrawingVersion {
    id: string;
    projectId: string;
    versionKind: DrawingVersionKind;
    versionNo: number;
    title: string;
    filePath: string;
    drawingPlanId: string | null;
    notes: string;
    devices: Array<{
        id: string;
        label: string;
        assetType: string;
        posX?: number;
        posY?: number;
    }>;
    createdAt: string;
}
export declare function createDrawingVersion(input: {
    projectId: string;
    versionKind: DrawingVersionKind;
    title: string;
    filePath?: string;
    drawingPlanId?: string;
    notes?: string;
    devices?: Array<{
        id: string;
        label: string;
        assetType: string;
        posX?: number;
        posY?: number;
    }>;
}): DrawingVersion;
export declare function getDrawingVersion(id: string): DrawingVersion | null;
export declare function listDrawingVersions(projectId: string): DrawingVersion[];
