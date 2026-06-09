import { customerUrls } from "../customer/customer-store.js";
import type { CustomerPlan, CustomerRow } from "../customer/types.js";
export interface CustomerWizardInput {
    customerName: string;
    siteName: string;
    address?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    plan?: CustomerPlan;
    codePrefix?: string;
    customerCode?: string;
}
export interface CustomerWizardResult {
    customer: CustomerRow;
    customerCode: string;
    siteName: string;
    contact: {
        contactName: string | null;
        phone: string | null;
        email: string | null;
    };
    initialPassword: string;
    loginUsername: string;
    urls: ReturnType<typeof customerUrls>;
}
export declare function generateNextCustomerCode(prefix?: string): string;
export declare function createCustomerWizard(input: CustomerWizardInput): CustomerWizardResult;
export declare function getCustomerContact(customerId: string): {
    customer_id: string;
    customer_code: string;
    site_name: string;
    address: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
} | undefined;
