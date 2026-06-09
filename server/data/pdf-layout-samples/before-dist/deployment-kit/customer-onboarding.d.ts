import { type DeploymentSiteType } from "./site-wizard.js";
import { type DeploymentDeviceKind } from "./device-provision.js";
import type { CustomerPlan } from "../customer/types.js";
export interface OnboardingDeviceInput {
    name: string;
    location: string;
    kind: DeploymentDeviceKind;
    deviceId?: string;
}
export interface CustomerOnboardingInput {
    customerName: string;
    customerCode?: string;
    siteName: string;
    plan?: CustomerPlan;
    address?: string;
    siteType?: DeploymentSiteType;
    devices: OnboardingDeviceInput[];
}
export interface CustomerOnboardingResult {
    phase: string;
    customer: {
        customerId: string;
        customerCode: string;
        customerName: string;
        plan: string;
        initialPassword: string;
        loginUsername: string;
    };
    site: {
        id: string;
        name: string;
        zones: Array<{
            id: string;
            name: string;
        }>;
    };
    devices: Array<{
        deviceId: string;
        assetId: string;
        name: string;
        kind: string;
        qrDataUrl: string;
    }>;
    qrLinks: Array<{
        assetId: string;
        deviceId: string;
        url: string;
        qrPageUrl: string;
    }>;
    checklistUrl: string;
    deployUrl: string;
    installUrl: string;
    onboardingWizardUrl: string;
}
export declare function createCustomerOnboarding(input: CustomerOnboardingInput): CustomerOnboardingResult;
