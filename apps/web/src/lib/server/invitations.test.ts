import { describe, expect, it, vi } from "vitest";

vi.mock("@happyvertical/smrt-saas-objects", () => ({
  StarterAppSettingCollection: { create: vi.fn() },
  StarterInvitationCollection: { create: vi.fn() },
  StarterInvitationError: class StarterInvitationError extends Error {},
  createStarterInvitation: vi.fn(),
  redeemStarterInvitationToken: vi.fn(),
  revokeStarterInvitation: vi.fn(),
  validateStarterInvitationToken: vi.fn(),
}));
vi.mock("@happyvertical/smrt-tenancy", () => ({ withSystemContext: vi.fn() }));
vi.mock("$lib/server/smrt", () => ({ getSmrtConfig: vi.fn() }));

import { resolveSignupAccessMode } from "$lib/server/invitations";

describe("signup access policy", () => {
  it("allows public enrollment only when the policy explicitly says public", () => {
    expect(resolveSignupAccessMode("public", true)).toBe("public");
  });

  it.each([
    undefined,
    null,
    "",
    "unexpected-mode",
  ])("fails closed in production for missing or invalid policy %j", (value) => {
    expect(resolveSignupAccessMode(value, true)).toBe("invite-only");
  });

  it("preserves the explicit public-reference development default", () => {
    expect(resolveSignupAccessMode(undefined, false)).toBe("public");
  });
});
