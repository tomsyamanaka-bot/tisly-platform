export interface HubWorkflowLink {
    id: string;
    label: string;
    description: string;
    href: string;
    count?: number;
}
export interface HubNotificationLink {
    id: string;
    label: string;
    description: string;
    href: string;
    themeColor: string;
}
export declare function buildHubWorkflowLinks(customerCode: string, role: string): HubWorkflowLink[];
/** owner / admin 向け Push・通知導線（RC2 App Hub） */
export declare function buildHubNotificationLinks(role: string): HubNotificationLink[];
