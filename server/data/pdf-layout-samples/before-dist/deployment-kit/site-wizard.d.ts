import { type SiteTemplateId } from "../provisioning/site-templates.js";
export type DeploymentSiteType = "kodate" | "minpaku" | "factory" | "warehouse" | "kaigo" | "other";
export declare function listDeploymentSiteTypes(): {
    id: DeploymentSiteType;
    label: string;
    templateId: "kodate" | "minpaku" | "factory" | "warehouse" | "kaigo" | "other";
}[];
export interface SiteWizardInput {
    customerCode: string;
    siteType: DeploymentSiteType;
    name?: string;
    address?: string;
    actorLabel?: string;
}
export declare function createSiteWizard(input: SiteWizardInput): {
    customerCode: string;
    siteType: DeploymentSiteType;
    siteTypeLabel: string;
    site: {
        id: string;
        tenantId: string;
        name: string;
        templateId: string | null;
        siteType: string | null;
        dashboard: Record<string, unknown>;
    };
    zones: {
        id: string;
        name: string;
        zoneType: string | null;
    }[];
    devices: {
        id: string;
        deviceId: string;
        label: string;
        zoneId: string | null;
    }[];
    templates: {
        id: SiteTemplateId;
        label: string;
        siteType: string;
        zoneCount: number;
        deviceCount: number;
    }[];
};
export declare function listSitesForCustomerCode(customerCode: string): any;
export declare function getSiteWizardContext(customerId: string): {
    customer: import("../customer/types.js").CustomerRow;
    siteTypes: {
        id: DeploymentSiteType;
        label: string;
        templateId: "kodate" | "minpaku" | "factory" | "warehouse" | "kaigo" | "other";
    }[];
    sites: any;
} | null;
