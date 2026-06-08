import { error } from "@sveltejs/kit";
import { getAppDatabase } from "$lib/server/db";
import { DEMO_OWNER_EMAIL, getActiveTenantId, isUuid, starterData } from "$lib/server/starter-data";

export const starterPermissions = {
  appAccess: "app.access",
  tenantRead: "tenant.read",
  billingRead: "tenant.billing.read",
  billingManage: "tenant.billing.manage",
  usageRead: "tenant.usage.read",
  settingsRead: "tenant.settings.read",
  settingsManage: "tenant.settings.manage",
  membershipManage: "tenant.members.manage",
  mcpRead: "tenant.mcp.read",
  mcpCall: "tenant.mcp.call",
  chatUse: "tenant.chat.use",
} as const;

export type StarterPermission = (typeof starterPermissions)[keyof typeof starterPermissions];

export interface TenantMembershipOption {
  tenantId: string;
  tenantSlug: string;
  tenantLabel: string;
  roleId: string;
  roleSlug: string;
  roleLabel: string;
}

export interface StarterMembershipContext extends TenantMembershipOption {
  membershipId: string;
  userId: string;
  userEmail: string;
  permissions: string[];
  availableTenants: TenantMembershipOption[];
  devFallback: boolean;
}

interface RequestLocals {
  tenantId?: string | null;
  user?: unknown;
  permissions?: string[];
  membership?: StarterMembershipContext | null;
}

interface MembershipRow extends Record<string, unknown> {
  membership_id?: unknown;
  membershipId?: unknown;
  user_id?: unknown;
  userId?: unknown;
  user_email?: unknown;
  userEmail?: unknown;
  tenant_id?: unknown;
  tenantId?: unknown;
  tenant_slug?: unknown;
  tenantSlug?: unknown;
  tenant_name?: unknown;
  tenantName?: unknown;
  role_id?: unknown;
  roleId?: unknown;
  role_slug?: unknown;
  roleSlug?: unknown;
  role_name?: unknown;
  roleName?: unknown;
}

const allPermissions = Object.values(starterPermissions);

const permissionsByRole: Record<string, readonly StarterPermission[]> = {
  owner: allPermissions,
  admin: allPermissions,
  member: [
    starterPermissions.appAccess,
    starterPermissions.tenantRead,
    starterPermissions.usageRead,
    starterPermissions.settingsRead,
    starterPermissions.mcpRead,
    starterPermissions.mcpCall,
    starterPermissions.chatUse,
  ],
  viewer: [
    starterPermissions.appAccess,
    starterPermissions.tenantRead,
    starterPermissions.usageRead,
    starterPermissions.settingsRead,
    starterPermissions.mcpRead,
  ],
};

export function isDevAuthFallbackEnabled(): boolean {
  return process.env.SMRT_STARTER_DEV_AUTH !== "false" && process.env.NODE_ENV !== "production";
}

export async function resolveMembershipContext(
  locals: RequestLocals,
  tenantIdInput?: string | null,
): Promise<StarterMembershipContext | null> {
  const activeTenantId = getActiveTenantId(tenantIdInput ?? locals.tenantId);
  if (locals.membership?.tenantId === activeTenantId) {
    return locals.membership;
  }

  const identity = resolveRequestIdentity(locals);
  if (!identity) {
    return null;
  }

  const rows = await findMembershipRows(identity.userId);
  const availableTenants = rows.map(toTenantMembershipOption);
  const activeRow = rows.find(
    (row) => readRequiredString(row, "tenant_id", "tenantId") === activeTenantId,
  );
  if (!activeRow) {
    return null;
  }

  const roleSlug = readRequiredString(activeRow, "role_slug", "roleSlug");
  const requestPermissions = Array.isArray(locals.permissions) ? locals.permissions : [];
  const permissions = Array.from(
    new Set([...requestPermissions, ...(permissionsByRole[roleSlug] ?? [])]),
  ).sort();

  return {
    ...toTenantMembershipOption(activeRow),
    membershipId: readRequiredString(activeRow, "membership_id", "membershipId"),
    userId: readRequiredString(activeRow, "user_id", "userId"),
    userEmail:
      readString(activeRow, "user_email", "userEmail") ?? identity.email ?? DEMO_OWNER_EMAIL,
    permissions,
    availableTenants,
    devFallback: identity.devFallback,
  };
}

export async function requirePermission(
  locals: RequestLocals,
  permission: StarterPermission,
  tenantIdInput?: string | null,
): Promise<StarterMembershipContext> {
  const membership = await resolveMembershipContext(locals, tenantIdInput);
  if (!membership) {
    throw error(resolveRequestIdentity(locals) ? 403 : 401, "No active membership for this tenant");
  }
  if (!hasStarterPermission(membership, permission)) {
    throw error(403, `Missing permission: ${permission}`);
  }
  return membership;
}

export async function requireTenantMembership(
  locals: RequestLocals,
  tenantIdInput: string | null,
): Promise<StarterMembershipContext> {
  const membership = await resolveMembershipContext(locals, tenantIdInput);
  if (!membership) {
    throw error(resolveRequestIdentity(locals) ? 403 : 401, "No active membership for this tenant");
  }
  return membership;
}

export function hasStarterPermission(
  membership: Pick<StarterMembershipContext, "permissions"> | null | undefined,
  permission: StarterPermission,
): boolean {
  return Boolean(membership?.permissions.includes(permission));
}

function resolveRequestIdentity(
  locals: Pick<RequestLocals, "user">,
): { userId: string; email?: string; devFallback: boolean } | null {
  const user = locals.user;
  if (user && typeof user === "object") {
    const userId = readString(user as Record<string, unknown>, "id", "userId");
    if (userId && isUuid(userId)) {
      return {
        userId,
        email: readString(user as Record<string, unknown>, "email") ?? undefined,
        devFallback: false,
      };
    }
  }

  if (!isDevAuthFallbackEnabled()) {
    return null;
  }

  return {
    userId: starterData.demoTenant.ownerUser.id,
    email: starterData.demoTenant.ownerUser.email,
    devFallback: true,
  };
}

async function findMembershipRows(userId: string): Promise<MembershipRow[]> {
  try {
    const db = await getAppDatabase();
    const result = await db.query(
      `
        SELECT
          memberships.id AS membership_id,
          memberships.user_id AS user_id,
          users.email AS user_email,
          tenants.id AS tenant_id,
          tenants.slug AS tenant_slug,
          tenants.name AS tenant_name,
          roles.id AS role_id,
          roles.slug AS role_slug,
          roles.name AS role_name
        FROM memberships
        INNER JOIN users ON users.id = memberships.user_id
        INNER JOIN tenants ON tenants.id = memberships.tenant_id
        INNER JOIN roles ON roles.id = memberships.role_id
        WHERE memberships.user_id = ?
          AND memberships.status = 'active'
          AND users.status = 'active'
          AND tenants.status = 'active'
        ORDER BY tenants.name ASC, memberships.created_at ASC
      `,
      userId,
    );
    return result.rows as MembershipRow[];
  } catch (queryError) {
    if (isMissingAuthTableError(queryError)) {
      return [];
    }
    throw queryError;
  }
}

function toTenantMembershipOption(row: MembershipRow): TenantMembershipOption {
  return {
    tenantId: readRequiredString(row, "tenant_id", "tenantId"),
    tenantSlug: readRequiredString(row, "tenant_slug", "tenantSlug"),
    tenantLabel: readRequiredString(row, "tenant_name", "tenantName"),
    roleId: readRequiredString(row, "role_id", "roleId"),
    roleSlug: readRequiredString(row, "role_slug", "roleSlug"),
    roleLabel: readRequiredString(row, "role_name", "roleName"),
  };
}

function readRequiredString(row: MembershipRow, key: string, fallback?: string) {
  const value = readString(row, key, fallback);
  if (!value) {
    throw new Error(`Membership query is missing ${String(key)}`);
  }
  return value;
}

function readString(row: Record<string, unknown>, key: string, fallback?: string): string | null {
  const value = row[key] ?? (fallback ? row[fallback] : undefined);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isMissingAuthTableError(queryError: unknown): boolean {
  if (!(queryError instanceof Error)) {
    return false;
  }
  const code = (queryError as Error & { code?: string }).code;
  return (
    code === "42P01" ||
    queryError.message.includes('relation "memberships" does not exist') ||
    queryError.message.includes('relation "roles" does not exist') ||
    queryError.message.includes('relation "users" does not exist') ||
    queryError.message.includes('relation "tenants" does not exist') ||
    queryError.message.includes("no such table: memberships") ||
    queryError.message.includes("no such table: roles") ||
    queryError.message.includes("no such table: users") ||
    queryError.message.includes("no such table: tenants")
  );
}
