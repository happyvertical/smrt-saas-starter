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
    executeRuntimeToolForMembership: vi.fn(),
    requirePermission: vi.fn(async (locals: { tenantId?: string | null }) => ({
      tenantId: locals.tenantId ?? "demo-tenant",
    })),
    requiredRuntimeToolPermission: vi.fn((name: string) =>
      name === "tenant.activity-report.query" ? "tenant.usage.read" : "tenant.mcp.call",
    ),
  };
});

vi.mock("$lib/server/mcp", () => ({
  RuntimeToolExecutionError: routeMocks.RuntimeToolExecutionError,
  executeRuntimeToolForMembership: routeMocks.executeRuntimeToolForMembership,
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: routeMocks.requirePermission,
  requiredRuntimeToolPermission: routeMocks.requiredRuntimeToolPermission,
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
    expect(routeMocks.executeRuntimeToolForMembership).not.toHaveBeenCalled();
    expect(routeMocks.requirePermission).not.toHaveBeenCalled();
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
    routeMocks.executeRuntimeToolForMembership.mockRejectedValueOnce(
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
    expect(routeMocks.executeRuntimeToolForMembership).toHaveBeenCalledWith(
      "tenant.usage.summary",
      { message: "usage" },
      { tenantId },
    );
    expect(routeMocks.requirePermission).toHaveBeenCalledWith({ tenantId }, "tenant.mcp.call");
  });

  it("uses usage read for the exact report query and preserves other tool authority", async () => {
    routeMocks.executeRuntimeToolForMembership.mockResolvedValueOnce({
      response: { content: [] },
    });
    const request = new Request("http://localhost/api/mcp/call", {
      method: "POST",
      body: JSON.stringify({ name: " tenant.activity-report.query ", input: {} }),
      headers: { "content-type": "application/json" },
    });

    await POST({ locals: { tenantId }, request } as Parameters<typeof POST>[0]);

    expect(routeMocks.requiredRuntimeToolPermission).toHaveBeenCalledWith(
      "tenant.activity-report.query",
    );
    expect(routeMocks.requirePermission).toHaveBeenCalledWith({ tenantId }, "tenant.usage.read");
    expect(routeMocks.executeRuntimeToolForMembership).toHaveBeenCalledWith(
      "tenant.activity-report.query",
      {},
      { tenantId },
    );
  });
});
