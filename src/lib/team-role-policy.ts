/** A foreign role must never contribute permissions, even for legacy assignments. */
import { basePermissions, type TeamRole } from "./permissions";

export function canGrantBaseRole(target: TeamRole, permissions: string[]) {
  return basePermissions(target).every((permission) => permissions.includes(permission));
}

export function scopedRolePermissions(tenantId: string, role: { tenant_id?: string; permissions?: string[] } | null) {
  return role?.tenant_id === tenantId ? role.permissions ?? [] : [];
}

export function canAssignCustomRole(tenantId: string, granter: string[], role: { tenant_id: string; permissions: string[] } | null) {
  return Boolean(role && role.tenant_id === tenantId && role.permissions.every((permission) => granter.includes(permission)));
}