export interface SiteRow {
    id: string;
    tenant_id: string;
    customer_id: string | null;
    name: string;
    address: string | null;
    timezone: string | null;
    site_type: string | null;
    status: string | null;
    lat: number | null;
    lng: number | null;
    created_at: string;
    updated_at: string;
}
export declare function listSitesForCustomerId(customerId: string, tenantId?: string | null): SiteRow[];
export declare function getSiteById(siteId: string): SiteRow | null;
export declare function createSite(input: {
    tenantId: string;
    customerId: string;
    name: string;
    address?: string | null;
    timezone?: string;
    siteType?: string;
}): SiteRow;
export declare function updateSite(siteId: string, patch: Partial<{
    name: string;
    address: string | null;
    timezone: string;
    status: string;
}>): SiteRow | null;
export declare function deleteSite(siteId: string): boolean;
