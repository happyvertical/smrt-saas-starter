import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_OWNER_EMAIL, starterData } from "$lib/server/starter-data";
import { isSuperUserEmail, requireSuperUser, resolveSuperUserContext } from "./super-users";

describe("super-user access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("matches configured super-user emails case-insensitively", () => {
    vi.stubEnv("SMRT_STARTER_DEV_AUTH", "false");
    vi.stubEnv("SMRT_STARTER_SUPERUSER_EMAILS", " owner@example.com,Admin@Example.com ");

    expect(isSuperUserEmail("admin@example.com")).toBe(true);
    expect(isSuperUserEmail("member@example.com")).toBe(false);
  });

  it("treats the demo owner as a local super user when dev fallback is enabled", () => {
    vi.stubEnv("SMRT_STARTER_DEV_AUTH", "true");

    expect(resolveSuperUserContext({})).toEqual({
      userId: starterData.demoTenant.ownerUser.id,
      email: DEMO_OWNER_EMAIL,
    });
  });

  it("rejects signed-in users who are not configured super users", () => {
    vi.stubEnv("SMRT_STARTER_DEV_AUTH", "false");
    vi.stubEnv("SMRT_STARTER_SUPERUSER_EMAILS", "owner@example.com");

    expect(
      resolveSuperUserContext({
        user: { id: "11111111-1111-4111-8111-111111111111", email: "member@example.com" },
      }),
    ).toBeNull();

    try {
      requireSuperUser({
        user: { id: "11111111-1111-4111-8111-111111111111", email: "member@example.com" },
      });
      throw new Error("Expected requireSuperUser to reject the account.");
    } catch (error) {
      expect(error).toMatchObject({
        status: 403,
        body: { message: "Super-user access is required." },
      });
    }
  });
});
