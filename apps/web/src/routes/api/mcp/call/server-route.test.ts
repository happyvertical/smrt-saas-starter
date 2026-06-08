import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class RuntimeToolExecutionError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "RuntimeToolExecutionError";
      this.status = status;
    }
  }

  return {
    RuntimeToolExecutionError,
    executeRuntimeToolForTenant: vi.fn(),
    getActiveTenantId: vi.fn((tenantId: string | null | undefined) => tenantId ?? "demo-tenant"),
  };
});

vi.mock("$lib/server/mcp", () => ({
  RuntimeToolExecutionError: routeMocks.RuntimeToolExecutionError,
  executeRuntimeToolForTenant: routeMocks.executeRuntimeToolForTenant,
}));

vi.mock("$lib/server/starter-data", () => ({
  getActiveTenantId: routeMocks.getActiveTenantId,
}));

import { POST } from "./+server";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("/api/mcp/call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid JSON bodies before executing tools", async () => {
    const request = new Request("http://localhost/api/mcp/call", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    await expect(
      POST({ locals: { tenantId }, request } as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message: "Invalid JSON body",
      },
    });
    expect(routeMocks.executeRuntimeToolForTenant).not.toHaveBeenCalled();
  });

  it("rejects missing tool names from object bodies", async () => {
    const request = new Request("http://localhost/api/mcp/call", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });

    await expect(
      POST({ locals: { tenantId }, request } as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message: "Missing tool name",
      },
    });
  });

  it("trims tool names before execution and maps runtime errors", async () => {
    routeMocks.executeRuntimeToolForTenant.mockRejectedValueOnce(
      new routeMocks.RuntimeToolExecutionError(429, "Tenant exceeded the MCP calls threshold"),
    );
    const request = new Request("http://localhost/api/mcp/call", {
      method: "POST",
      body: JSON.stringify({ name: " tenant.usage.summary ", input: { message: "usage" } }),
      headers: { "content-type": "application/json" },
    });

    await expect(
      POST({ locals: { tenantId }, request } as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({
      status: 429,
      body: {
        message: "Tenant exceeded the MCP calls threshold",
      },
    });
    expect(routeMocks.executeRuntimeToolForTenant).toHaveBeenCalledWith(
      "tenant.usage.summary",
      { message: "usage" },
      tenantId,
    );
  });
});
