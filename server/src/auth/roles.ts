export const PLATFORM_ROLES = ["super_admin", "admin"] as const;
export const CUSTOMER_ROLES = [
  "owner",
  "admin",
  "manager",
  "installer",
  "surveyor",
  "maintenance",
  "viewer",
  "super_admin",
] as const;
export type AppRole = (typeof CUSTOMER_ROLES)[number];

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  surveyor: 1,
  maintenance: 2,
  installer: 2,
  manager: 3,
  admin: 4,
  owner: 5,
  super_admin: 5,
};

/** Field surveyor — Survey PWA only. */
export function isSurveyorRole(role: string): boolean {
  return normalizeRole(role) === "surveyor";
}

/** Maintenance technician — Maintenance PWA + install history. */
export function isMaintenanceRole(role: string): boolean {
  return normalizeRole(role) === "maintenance";
}

/** Roles that may change customer settings (portal admin actions). */
export function canChangeCustomerSettings(role: string): boolean {
  const n = normalizeRole(role);
  return n === "owner" || n === "admin" || n === "super_admin";
}

export function normalizeRole(role: string): AppRole {
  if (role === "admin" && !role.includes("customer")) return "super_admin";
  return (CUSTOMER_ROLES.includes(role as AppRole) ? role : "viewer") as AppRole;
}

export function roleMeetsRequirement(actorRole: string, required: AppRole): boolean {
  const a = ROLE_RANK[normalizeRole(actorRole)] ?? 0;
  const r = ROLE_RANK[normalizeRole(required)] ?? 99;
  return a >= r;
}

export function isPlatformSuperAdmin(role: string): boolean {
  const n = normalizeRole(role);
  return n === "super_admin";
}

/** Field installer: claim devices, map placement, connectivity tests — not billing or user admin. */
export function canInstallerAct(role: string): boolean {
  return roleMeetsRequirement(role, "installer");
}

export function canViewBilling(role: string): boolean {
  const n = normalizeRole(role);
  return n === "owner" || n === "admin" || n === "manager" || n === "super_admin";
}

export function canManageCustomerUsers(role: string): boolean {
  const r = role === "super_admin" ? "owner" : normalizeRole(role);
  return r === "owner" || r === "admin";
}

/** Installer-only role — field PWA; no billing, user admin, plan, or settings. */
export function isInstallerOnlyRole(role: string): boolean {
  return normalizeRole(role) === "installer";
}
