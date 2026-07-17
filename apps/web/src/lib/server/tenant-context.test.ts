import { getTenantId, withTenant } from "@happyvertical/smrt-tenancy";
import { describe, expect, it } from "vitest";
import { DEMO_TENANT_ID } from "$lib/server/starter-data";
import { withActiveTenant } from "$lib/server/tenant-context";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

describe("withActiveTenant", () => {
  it("falls back to the demo tenant outside a tenant context", async () => {
    const result = await withActiveTenant(undefined, async (tenantId) => ({
      activeTenantId: tenantId,
      contextTenantId: getTenantId(),
    }));

    expect(result).toEqual({
      activeTenantId: DEMO_TENANT_ID,
      contextTenantId: DEMO_TENANT_ID,
    });
    expect(getTenantId()).toBeUndefined();
  });

  it("uses the current tenant context when no tenant id is provided", async () => {
    const result = await withTenant({ tenantId: tenantA }, () =>
      withActiveTenant(undefined, async (tenantId) => ({
        activeTenantId: tenantId,
        contextTenantId: getTenantId(),
      })),
    );

    expect(result).toEqual({
      activeTenantId: tenantA,
      contextTenantId: tenantA,
    });
  });

  it("rejects a tenant id that conflicts with the current tenant context", async () => {
    await expect(
      withTenant({ tenantId: tenantA }, () => withActiveTenant(tenantB, async () => null)),
    ).rejects.toThrow("does not match active tenant context");
  });
});
