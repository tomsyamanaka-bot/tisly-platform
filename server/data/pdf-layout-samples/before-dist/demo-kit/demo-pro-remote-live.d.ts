export declare function getProRemoteLiveFloorPreview(customerCode?: string): {
    deviceMode: "mock" | "esp" | "shelly" | "mixed";
    live: boolean;
    statusColors: {
        ONLINE: string;
        WARNING: string;
        OFFLINE: string;
    };
    layers: {
        pins: {
            status: "ONLINE" | "OFFLINE" | "WARNING";
            statusColor: string;
            live: boolean;
            kind: import("../device/device-adapter.js").DeviceKind;
            id: string;
            pinType: string;
            label: string | null;
            posX: number;
            posY: number;
            deviceId: string | null;
        }[];
        layerId: string;
        tier: string;
        displayName: string;
        sortOrder: number;
        imageUrl: string;
    }[];
    deviceSummary: {
        online: number;
        warning: number;
        offline: number;
    };
    customerCode: string;
    customerName: string;
    alert: {
        tier: string | null;
        layerId: string | null;
        reason: string;
    };
};
