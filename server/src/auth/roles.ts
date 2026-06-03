export const PLATFORM_ROLES = ["super_admin", "admin"] as const;
export const CUSTOMER_ROLES = ["owner", "admin", "manager", "viewer", "super_admin"] as const;
export type AppRole = (typeof CUSTOMER_ROLES)[number];

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
  owner: 4,
  super_admin: 4,
};

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
