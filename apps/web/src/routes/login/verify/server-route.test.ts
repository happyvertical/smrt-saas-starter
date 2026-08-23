import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSignupAccessMode: vi.fn(),
  startAccountSession: vi.fn(),
  verifyEmailLink: vi.fn(),
}));

vi.mock("$lib/server/accounts", () => ({
  AccountFlowError: class AccountFlowError extends Error {},
  verifyEmailLink: mocks.verifyEmailLink,
}));
vi.mock("$lib/server/invitations", () => ({ getSignupAccessMode: mocks.getSignupAccessMode }));
vi.mock("$lib/server/session", () => ({ startAccountSession: mocks.startAccountSession }));

import { GET } from "./+server";

const target = {
  userId: "user-1",
  userEmail: "founder@example.com",
  tenantId: "tenant-1",
  tenantSlug: "acme",
  tenantLabel: "Acme",
};

describe("email verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permits a signed signup intent only while public signup is enabled", async () => {
    mocks.getSignupAccessMode.mockResolvedValue("public");
    mocks.verifyEmailLink.mockResolvedValue(target);

    await expect(
      GET({
        url: new URL("http://starter.test/login/verify?token=token-1&signup=intent-1"),
      } as Parameters<typeof GET>[0]),
    ).rejects.toMatchObject({ status: 303, location: "/app" });

    expect(mocks.verifyEmailLink).toHaveBeenCalledWith("token-1", {
      signupIntent: "intent-1",
      allowSignup: true,
    });
    expect(mocks.startAccountSession).toHaveBeenCalledWith(expect.anything(), target);
  });

  it("passes a disabled signup state to the verified intent", async () => {
    mocks.getSignupAccessMode.mockResolvedValue("invite-only");
    mocks.verifyEmailLink.mockResolvedValue(target);

    await expect(
      GET({
        url: new URL("http://starter.test/login/verify?token=token-1&signup=intent-1"),
      } as Parameters<typeof GET>[0]),
    ).rejects.toMatchObject({ status: 303 });

    expect(mocks.verifyEmailLink).toHaveBeenCalledWith("token-1", {
      signupIntent: "intent-1",
      allowSignup: false,
    });
  });

  it("keeps ordinary sign-in links independent of the signup policy", async () => {
    mocks.verifyEmailLink.mockResolvedValue(target);

    await expect(
      GET({ url: new URL("http://starter.test/login/verify?token=token-1") } as Parameters<
        typeof GET
      >[0]),
    ).rejects.toMatchObject({ status: 303, location: "/app" });

    expect(mocks.getSignupAccessMode).not.toHaveBeenCalled();
    expect(mocks.verifyEmailLink).toHaveBeenCalledWith("token-1", {
      signupIntent: null,
      allowSignup: false,
    });
  });
});
