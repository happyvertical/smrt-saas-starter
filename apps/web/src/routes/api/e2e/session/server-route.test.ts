import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  class AccountFlowError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "AccountFlowError";
      this.status = status;
    }
  }
  return {
    AccountFlowError,
    signInWithEmail: vi.fn(),
    startAccountSession: vi.fn(),
  };
});

vi.mock("$lib/server/accounts", () => ({
  AccountFlowError: routeMocks.AccountFlowError,
  signInWithEmail: routeMocks.signInWithEmail,
}));

vi.mock("$lib/server/session", () => ({
  startAccountSession: routeMocks.startAccountSession,
}));

import { POST } from "./+server";

type PostEvent = Parameters<typeof POST>[0];

function makeEvent(header?: string | null): PostEvent {
  return {
    request: {
      headers: { get: (name: string) => (name === "x-e2e-auth" ? (header ?? null) : null) },
    },
  } as unknown as PostEvent;
}

const target = {
  userId: "00000000-0000-4000-8000-0000000000aa",
  userEmail: "e2e@example.com",
  tenantId: "00000000-0000-4000-8000-000000000001",
  tenantSlug: "demo",
  tenantLabel: "Demo",
};

describe("POST /api/e2e/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.signInWithEmail.mockResolvedValue(target);
    routeMocks.startAccountSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is invisible (404) when E2E_AUTH_SECRET is not set", async () => {
    vi.stubEnv("E2E_AUTH_SECRET", "");
    vi.stubEnv("E2E_USER_EMAIL", "e2e@example.com");
    await expect(POST(makeEvent("anything"))).rejects.toMatchObject({ status: 404 });
    expect(routeMocks.signInWithEmail).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only E2E_AUTH_SECRET as unset (404)", async () => {
    vi.stubEnv("E2E_AUTH_SECRET", "   ");
    vi.stubEnv("E2E_USER_EMAIL", "e2e@example.com");
    await expect(POST(makeEvent("   "))).rejects.toMatchObject({ status: 404 });
    expect(routeMocks.signInWithEmail).not.toHaveBeenCalled();
  });

  it("rejects a request without the matching secret", async () => {
    vi.stubEnv("E2E_AUTH_SECRET", "super-secret");
    vi.stubEnv("E2E_USER_EMAIL", "e2e@example.com");
    await expect(POST(makeEvent("wrong"))).rejects.toMatchObject({ status: 401 });
    await expect(POST(makeEvent(null))).rejects.toMatchObject({ status: 401 });
    expect(routeMocks.startAccountSession).not.toHaveBeenCalled();
  });

  it("errors when no e2e identity is configured (empty or whitespace)", async () => {
    vi.stubEnv("E2E_AUTH_SECRET", "super-secret");
    vi.stubEnv("E2E_USER_EMAIL", "");
    await expect(POST(makeEvent("super-secret"))).rejects.toMatchObject({ status: 500 });
    vi.stubEnv("E2E_USER_EMAIL", "   ");
    await expect(POST(makeEvent("super-secret"))).rejects.toMatchObject({ status: 500 });
  });

  it("mints a session for the configured identity only", async () => {
    vi.stubEnv("E2E_AUTH_SECRET", "super-secret");
    vi.stubEnv("E2E_USER_EMAIL", "e2e@example.com");
    const event = makeEvent("super-secret");
    const response = await POST(event);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      tenantId: target.tenantId,
    });
    // Identity is taken from config, never the request.
    expect(routeMocks.signInWithEmail).toHaveBeenCalledWith("e2e@example.com");
    expect(routeMocks.startAccountSession).toHaveBeenCalledWith(event, target);
  });

  it("maps an AccountFlowError (e.g. user not seeded) to its status", async () => {
    vi.stubEnv("E2E_AUTH_SECRET", "super-secret");
    vi.stubEnv("E2E_USER_EMAIL", "missing@example.com");
    routeMocks.signInWithEmail.mockRejectedValue(
      new routeMocks.AccountFlowError(404, "No active user exists for that email."),
    );
    await expect(POST(makeEvent("super-secret"))).rejects.toMatchObject({ status: 404 });
  });
});
