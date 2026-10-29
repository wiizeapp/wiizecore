/** A foreign role must never contribute permissions, even for legacy assignments. */
export function scopedRolePermissions(tenantId: string, role: { tenant_id?: string; permissions?: string[] } | null) {
  return role?.tenant_id === tenantId ? role.permissions ?? [] : [];
}

export function canAssignCustomRole(tenantId: string, granter: string[], role: { tenant_id: string; permissions: string[] } | null) {
  return Boolean(role && role.tenant_id === tenantId && role.permissions.every((permission) => granter.includes(permission)));
}