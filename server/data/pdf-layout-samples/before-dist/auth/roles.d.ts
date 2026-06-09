export declare const PLATFORM_ROLES: readonly ["super_admin", "admin"];
export declare const CUSTOMER_ROLES: readonly ["owner", "admin", "manager", "installer", "surveyor", "maintenance", "viewer", "super_admin"];
export type AppRole = (typeof CUSTOMER_ROLES)[number];
/** Field surveyor — Survey PWA only. */
export declare function isSurveyorRole(role: string): boolean;
/** Maintenance technician — Maintenance PWA + install history. */
export declare function isMaintenanceRole(role: string): boolean;
/** Roles that may change customer settings (portal admin actions). */
export declare function canChangeCustomerSettings(role: string): boolean;
export declare function normalizeRole(role: string): AppRole;
export declare function roleMeetsRequirement(actorRole: string, required: AppRole): boolean;
export declare function isPlatformSuperAdmin(role: string): boolean;
/** Field installer: claim devices, map placement, connectivity tests — not billing or user admin. */
export declare function canInstallerAct(role: string): boolean;
export declare function canViewBilling(role: string): boolean;
export declare function canManageCustomerUsers(role: string): boolean;
/** Installer-only role — field PWA; no billing, user admin, plan, or settings. */
export declare function isInstallerOnlyRole(role: string): boolean;
