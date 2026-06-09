export interface MapSiteMarker {
    siteId: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    deviceCount: number;
    status: "ok" | "warning" | "alarm";
    severity: "info" | "warning" | "critical";
    coordinatesTodo?: string;
}
export interface MapZoneView {
    zoneId: string;
    name: string;
    siteId: string;
    siteName: string;
    floorId: string | null;
    deviceCount: number;
}
export interface OpsMapPayload {
    customerCode: string;
    sites: MapSiteMarker[];
    zones: MapZoneView[];
    floors: Array<{
        floorId: string;
        siteId: string;
        name: string;
        hasFloorPlan: boolean;
    }>;
    devices: Array<{
        deviceId: string;
        label: string | null;
        siteId: string | null;
        siteName: string | null;
        zone: string | null;
        floorId: string | null;
        deviceType: string;
        heartbeatStatus: string;
        online: boolean;
        severity: string;
        mapPosition: {
            x: number;
            y: number;
            iconType: string | null;
            rotation: number | null;
        } | null;
        coordinates: {
            lat: number | null;
            lng: number | null;
            placeholder: boolean;
        };
    }>;
    dataSource: "real";
}
export declare function buildOpsMap(customerCode: string): OpsMapPayload | null;
export declare function buildOpsAlarms(customerCode: string, limit?: number): {
    customerCode: string;
    alarms: any;
    counts: {
        critical: number;
        alarm: number;
        warning: number;
    };
    dataSource: "real";
} | null;
export declare function buildOpsDevices(customerCode: string): {
    customerCode: string;
    dataSource: "real";
    devices: {
        siteName: string | null | undefined;
        floorId: string | null;
        mapPosition: {
            x: number;
            y: number | null;
        } | null;
        anomalyCount: number;
        lastHeartbeatAt: string | null;
        deviceId: string;
        id: string;
        deviceType: string;
        label: string | null;
        siteId: string | null;
        serialNumber: string | null;
        firmwareVersion: string | null;
        lastSeen: string | null;
        firstSeen?: string | null;
        heartbeatStatus: string;
        deviceStatus?: string;
        online: boolean;
    }[];
} | null;
export declare function buildOpsTv(customerCode: string): {
    customerCode: string;
    devices: any;
    dataSource: "real";
} | null;
export declare function buildOpsQnap(customerCode: string): {
    customerCode: string;
    archives: unknown[];
    mode: any;
    dataSource: "real";
} | null;
/** Incident map jump target from device/floor position. */
export declare function resolveIncidentMapLocation(incident: {
    device_id?: string | null;
    floor_id?: string | null;
    pos_x?: number | null;
    pos_y?: number | null;
    site_id?: string | null;
}): {
    floorId: string | null;
    x: number | null;
    y: number | null;
    siteId: string | null;
};
