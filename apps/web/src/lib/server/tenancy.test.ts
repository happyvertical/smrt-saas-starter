import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({
  getAppDatabase: vi.fn(),
}));

import { resolveTenant } from "$lib/server/tenancy";

const tenantId = "11111111-1111-4111-8111-111111111111";

function makeEvent(options: { header?: string | null; cookie?: string | null; hostname?: string }) {
  return {
    request: {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "x-tenant-id" ? (options.header ?? null) : null,
      },
    },
    cookies: { get: () => options.cookie ?? undefined },
    url: { hostname: options.hostname ?? "localhost" },
  } as unknown as Parameters<typeof resolveTenant>[0];
}

describe("resolveTenant tenant header gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores the unauthenticated x-tenant-id header by default", async () => {
    await expect(resolveTenant(makeEvent({ header: tenantId }))).resolves.toEqual({
      tenantId: null,
    });
  });

  it("honors x-tenant-id only when the trusted-header flag is enabled", async () => {
    vi.stubEnv("SMRT_STARTER_TRUST_TENANT_HEADER", "true");
    await expect(resolveTenant(makeEvent({ header: tenantId }))).resolves.toEqual({
      tenantId,
    });
  });
});
