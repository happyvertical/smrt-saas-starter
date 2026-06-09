import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class TenantChatError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "TenantChatError";
      this.status = status;
    }
  }

  return {
    TenantChatError,
    getTenantChatState: vi.fn(),
    requirePermission: vi.fn(async (locals: { tenantId?: string | null }) => ({
      tenantId: locals.tenantId ?? "demo-tenant",
    })),
    sendTenantChatMessage: vi.fn(),
    starterPermissions: {
      chatUse: "tenant.chat.use",
    },
  };
});

vi.mock("$lib/server/agent-chat", () => ({
  TenantChatError: routeMocks.TenantChatError,
  getTenantChatState: routeMocks.getTenantChatState,
  sendTenantChatMessage: routeMocks.sendTenantChatMessage,
}));

vi.mock("$lib/server/authz", () => ({
  requirePermission: routeMocks.requirePermission,
  starterPermissions: routeMocks.starterPermissions,
}));

import { GET, POST } from "./+server";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("/api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps tenant chat errors from GET to HTTP errors", async () => {
    routeMocks.getTenantChatState.mockRejectedValueOnce(
      new routeMocks.TenantChatError(403, "Agent chat is not available"),
    );

    await expect(GET({ locals: { tenantId } } as Parameters<typeof GET>[0])).rejects.toMatchObject({
      status: 403,
      body: {
        message: "Agent chat is not available",
      },
    });
    expect(routeMocks.requirePermission).toHaveBeenCalledWith(
      { tenantId },
      routeMocks.starterPermissions.chatUse,
    );
  });

  it("rejects invalid JSON bodies before sending chat messages", async () => {
    const request = new Request("http://localhost/api/chat", {
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
    expect(routeMocks.sendTenantChatMessage).not.toHaveBeenCalled();
    expect(routeMocks.requirePermission).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON bodies", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "null",
      headers: { "content-type": "application/json" },
    });

    await expect(
      POST({ locals: { tenantId }, request } as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message: "Expected JSON object",
      },
    });
  });
});
