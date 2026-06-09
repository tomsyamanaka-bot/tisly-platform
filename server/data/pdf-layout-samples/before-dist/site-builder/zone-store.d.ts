export interface ZoneRow {
    id: string;
    site_id: string;
    floor_id: string | null;
    name: string;
    zone_type: string | null;
    sort_order: number;
    metadata_json: string | null;
    created_at: string;
}
export declare function listZonesForSite(siteId: string): ZoneRow[];
export declare function listZonesForFloor(floorId: string): ZoneRow[];
export declare function getZoneById(zoneId: string): ZoneRow | null;
export declare function createZone(input: {
    siteId: string;
    floorId?: string | null;
    name: string;
    type?: string;
    sortOrder?: number;
}): ZoneRow;
export declare function updateZone(zoneId: string, patch: Partial<{
    name: string;
    type: string;
    floorId: string | null;
    sortOrder: number;
}>): ZoneRow | null;
export declare function deleteZone(zoneId: string): boolean;
