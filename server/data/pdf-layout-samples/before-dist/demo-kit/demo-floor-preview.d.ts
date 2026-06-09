export declare function getDemoFloorPreview(customerCode?: string): {
    customerCode: string;
    customerName: string;
    layers: {
        layerId: string;
        tier: string;
        displayName: string;
        sortOrder: number;
        imageUrl: string;
        pins: {
            id: string;
            pinType: string;
            label: string | null;
            posX: number;
            posY: number;
            deviceId: string | null;
            status: "ONLINE" | "OFFLINE" | "WARNING";
        }[];
    }[];
    alert: {
        tier: string | null;
        layerId: string | null;
        reason: string;
    };
    statusColors: {
        ONLINE: string;
        WARNING: string;
        OFFLINE: string;
    };
};
