import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("$lib/server/authz", () => ({
  requirePermission: mocks.requirePermission,
  starterPermissions: { appAccess: "app.access" },
}));
vi.mock("$lib/server/super-users", () => ({ resolveSuperUserContext: () => null }));

import { load } from "./+layout.server";

describe("shell principal identity", () => {
  it("returns authorized stable user identity independently of email presentation", async () => {
    const event = {
      locals: { user: { id: "untrusted-local-id" } },
      url: new URL("http://localhost/app"),
    } as unknown as Parameters<typeof load>[0];
    const membership = {
      userId: "00000000-0000-4000-8000-000000000011",
      userEmail: "same@example.test",
      permissions: [],
    };
    mocks.requirePermission.mockResolvedValue(membership);
    const first = await load(event);
    mocks.requirePermission.mockResolvedValue({
      ...membership,
      userId: "00000000-0000-4000-8000-000000000022",
    });
    const second = await load(event);
    expect(first).toMatchObject({ userId: membership.userId, userLabel: "same@example.test" });
    expect(second).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000022",
      userLabel: "same@example.test",
    });
    mocks.requirePermission.mockResolvedValue({ ...membership, userEmail: "renamed@example.test" });
    expect(await load(event)).toMatchObject({
      userId: membership.userId,
      userLabel: "renamed@example.test",
    });
  });
});
