export interface FloorRow {
    id: string;
    site_id: string;
    name: string;
    order_no: number;
    floor_plan_path: string | null;
    created_at: string;
    updated_at: string;
}
export declare function listFloorsForSite(siteId: string): FloorRow[];
export declare function getFloorById(floorId: string): FloorRow | null;
export declare function createFloor(input: {
    siteId: string;
    name: string;
    orderNo?: number;
}): FloorRow;
export declare function updateFloor(floorId: string, patch: Partial<{
    name: string;
    orderNo: number;
    floorPlanPath: string | null;
}>): FloorRow | null;
export declare function deleteFloor(floorId: string): boolean;
export declare function setFloorPlanPath(floorId: string, relativePath: string): FloorRow | null;
