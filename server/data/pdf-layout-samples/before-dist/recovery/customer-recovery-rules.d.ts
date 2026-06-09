export interface CustomerRecoveryRule {
    id: string;
    customer_id: string;
    name: string;
    condition_type: string;
    condition_device_type: string | null;
    action_type: string;
    action_target: string | null;
    enabled: number;
    priority: number;
    created_at: string;
    updated_at: string;
}
export declare function listCustomerRecoveryRules(customerId: string): CustomerRecoveryRule[];
export declare function createCustomerRecoveryRule(input: {
    customerId: string;
    name: string;
    conditionType: string;
    conditionDeviceType?: string | null;
    actionType: string;
    actionTarget?: string | null;
    enabled?: boolean;
    priority?: number;
}): CustomerRecoveryRule;
export declare function getCustomerRecoveryRule(customerId: string, id: string): CustomerRecoveryRule | null;
export declare function updateCustomerRecoveryRule(customerId: string, id: string, patch: Partial<{
    name: string;
    conditionType: string;
    conditionDeviceType: string | null;
    actionType: string;
    actionTarget: string | null;
    enabled: boolean;
    priority: number;
}>): CustomerRecoveryRule | null;
export declare function deleteCustomerRecoveryRule(customerId: string, id: string): boolean;
