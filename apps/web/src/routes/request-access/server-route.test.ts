import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  submitAccessRequest: vi.fn(),
  toAccessRequestMessage: vi.fn(),
}));

vi.mock("$lib/server/access-requests", () => ({
  submitAccessRequest: routeMocks.submitAccessRequest,
  toAccessRequestMessage: routeMocks.toAccessRequestMessage,
}));

import { actions } from "./+page.server";

type DefaultAction = NonNullable<typeof actions.default>;
type ActionResult = Awaited<ReturnType<DefaultAction>>;

function makeEvent(fields: Record<string, string>, ip = "127.0.0.1") {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return {
    request: { formData: async () => form },
    getClientAddress: () => ip,
  } as unknown as Parameters<DefaultAction>[0];
}

function status(result: ActionResult): number | undefined {
  return (result as { status?: number }).status;
}

function data(result: ActionResult): Record<string, unknown> | undefined {
  return (result as { data?: Record<string, unknown> }).data;
}

describe("POST /request-access default action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.submitAccessRequest.mockResolvedValue({ id: "ar-1", email: "user@example.com" });
    routeMocks.toAccessRequestMessage.mockReturnValue(null);
  });

  it("requires an email before touching the service", async () => {
    const result = await actions.default(makeEvent({ email: "" }, "ip-empty"));
    expect(status(result)).toBe(400);
    expect(data(result)?.error).toBe("A work email is required.");
    expect(routeMocks.submitAccessRequest).not.toHaveBeenCalled();
  });

  it("submits a valid request and echoes the email", async () => {
    const result = await actions.default(
      makeEvent({ email: "user@example.com", name: "User", company: "Acme" }, "ip-ok"),
    );
    expect(result).toEqual({ submitted: true, email: "user@example.com" });
    expect(routeMocks.submitAccessRequest).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "User",
      company: "Acme",
      message: "",
    });
  });

  it("rate-limits repeated submissions from the same IP with a 429", async () => {
    const ip = "ip-flood";
    for (let i = 0; i < 5; i += 1) {
      const ok = await actions.default(makeEvent({ email: `u${i}@example.com` }, ip));
      expect(ok).toEqual({ submitted: true, email: `u${i}@example.com` });
    }

    const blocked = await actions.default(makeEvent({ email: "overflow@example.com" }, ip));
    expect(status(blocked)).toBe(429);
    expect(String(data(blocked)?.error)).toContain("Too many requests");
    // The blocked attempt never reaches the service (5 successful submits only).
    expect(routeMocks.submitAccessRequest).toHaveBeenCalledTimes(5);
  });

  it("rate-limits repeated submissions for the same email across IPs", async () => {
    const email = "same@example.com";
    for (let i = 0; i < 5; i += 1) {
      const ok = await actions.default(makeEvent({ email }, `email-ip-${i}`));
      expect(ok).toEqual({ submitted: true, email });
    }

    const blocked = await actions.default(makeEvent({ email }, "email-ip-final"));
    expect(status(blocked)).toBe(429);
  });

  it("surfaces a friendly domain error from the service", async () => {
    routeMocks.submitAccessRequest.mockRejectedValue(new Error("boom"));
    routeMocks.toAccessRequestMessage.mockReturnValue("Enter a valid email address.");
    const result = await actions.default(makeEvent({ email: "invalid" }, "ip-friendly"));
    expect(status(result)).toBe(400);
    expect(data(result)?.error).toBe("Enter a valid email address.");
  });

  it("rethrows unexpected (non-domain) errors", async () => {
    routeMocks.submitAccessRequest.mockRejectedValue(new Error("db down"));
    routeMocks.toAccessRequestMessage.mockReturnValue(null);
    await expect(
      actions.default(makeEvent({ email: "boom@example.com" }, "ip-throw")),
    ).rejects.toThrow("db down");
  });
});
