import { getTenantId, withTenant } from "@happyvertical/smrt-tenancy";
import { DEMO_TENANT_ID, getActiveTenantId } from "$lib/server/starter-data";

export async function withActiveTenant<T>(
  tenantId: string | null | undefined,
  fn: (tenantId: string) => Promise<T>,
): Promise<T> {
  const currentTenantId = getTenantId();
  const activeTenantId = tenantId
    ? getActiveTenantId(tenantId)
    : (currentTenantId ?? DEMO_TENANT_ID);

  if (currentTenantId && currentTenantId !== activeTenantId) {
    throw new Error(
      `Requested tenant ${activeTenantId} does not match active tenant context ${currentTenantId}`,
    );
  }

  if (currentTenantId === activeTenantId) {
    return await fn(activeTenantId);
  }

  return await withTenant({ tenantId: activeTenantId }, () => fn(activeTenantId));
}
