/** Phase 141-160: 現場テンプレート定義 */
export type SiteTemplateId = "kodate" | "minpaku" | "factory" | "warehouse" | "kaigo" | "other" | "garage" | "aquaculture" | "ready-mix";
export interface ZoneTemplate {
    name: string;
    zoneType: string;
}
export interface DefaultDeviceTemplate {
    kind: string;
    suffix: string;
    labelPrefix: string;
    platform: string;
    zoneName: string;
}
export interface SiteTemplate {
    id: SiteTemplateId;
    label: string;
    siteType: string;
    zones: ZoneTemplate[];
    devices: DefaultDeviceTemplate[];
    dashboard: {
        layout: string;
        widgets: string[];
    };
}
export declare const SITE_TEMPLATES: Record<SiteTemplateId, SiteTemplate>;
export declare function listTemplates(): {
    id: SiteTemplateId;
    label: string;
    siteType: string;
    zoneCount: number;
    deviceCount: number;
}[];
export declare function getTemplate(id: string): SiteTemplate | undefined;
