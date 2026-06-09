import { type SiteTemplateId } from "./site-templates.js";
export interface CreateSiteInput {
    name: string;
    tenantId?: string;
    templateId?: SiteTemplateId | string;
    address?: string;
    lat?: number;
    lng?: number;
    actorId?: string;
    actorLabel?: string;
}
export interface ProvisionedSite {
    site: {
        id: string;
        tenantId: string;
        name: string;
        templateId: string | null;
        siteType: string | null;
        dashboard: Record<string, unknown>;
    };
    zones: Array<{
        id: string;
        name: string;
        zoneType: string | null;
    }>;
    devices: Array<{
        id: string;
        deviceId: string;
        label: string;
        zoneId: string | null;
    }>;
}
export declare function ensureTenant(tenantId: string, name?: string): void;
export declare function createSite(input: CreateSiteInput): ProvisionedSite;
export declare function listSites(tenantId?: string): {
    id: string;
    tenantId: string;
    name: string;
    templateId: string | null;
    siteType: string | null;
    address: string | null;
    status: string;
    dashboard: any;
    createdAt: string;
}[];
export declare function getSiteDetail(siteId: string): {
    id: unknown;
    tenantId: unknown;
    name: unknown;
    templateId: unknown;
    siteType: unknown;
    address: unknown;
    status: unknown;
    dashboard: any;
    zones: any;
    devices: ({
        metadata_json: string | null;
    } & Record<string, unknown>)[];
    createdAt: unknown;
} | null;
export declare function hashSecret(secret: string): string;
