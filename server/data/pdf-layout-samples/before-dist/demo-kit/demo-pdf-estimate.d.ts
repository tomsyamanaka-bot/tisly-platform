export type DemoEstimateType = "house" | "minpaku" | "factory";
export declare function buildDemoEstimateHtml(type: DemoEstimateType): string;
export declare function getDemoEstimateMeta(type: DemoEstimateType): {
    type: DemoEstimateType;
    title: string;
    customerLabel: string;
    totalYen: number;
    htmlPath: string;
    previewLabel: string;
};
export declare function listDemoEstimateTypes(): DemoEstimateType[];
