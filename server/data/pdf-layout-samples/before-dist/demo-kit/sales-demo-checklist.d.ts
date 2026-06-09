export interface ChecklistItem {
    id: string;
    label: string;
    ok: boolean;
    detail: string;
}
export declare function buildSalesDemoChecklist(): Promise<{
    phase: string;
    ready: boolean;
    items: ChecklistItem[];
}>;
export declare function getShellyLabStatus(): {
    envMode: import("../device/shelly-real-client.js").ShellyEnvMode;
    deviceMode: "mock" | "esp" | "shelly" | "mixed";
    confirmRequired: boolean;
    qnapMockRoot: any;
    pdfRenderMode: import("../business/pdf/render.js").PdfRenderMode;
};
