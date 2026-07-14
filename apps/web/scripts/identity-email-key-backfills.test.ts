import { describe, expect, it, vi } from "vitest";
import { backfillIdentityEmailKeys } from "./identity-email-key-backfills.mjs";

describe("identity email-key deployment backfills", () => {
  it("runs Profile keys before User keys", async () => {
    const order: string[] = [];
    const result = await backfillIdentityEmailKeys({} as never, {
      backfillProfiles: vi.fn(async () => {
        order.push("profiles");
        return { updated: 2 } as never;
      }),
      backfillUsers: vi.fn(async () => {
        order.push("users");
        return { updated: 3 } as never;
      }),
    });

    expect(order).toEqual(["profiles", "users"]);
    expect(result).toEqual({
      profileEmailKeys: { updated: 2 },
      userEmailKeys: { updated: 3 },
    });
  });

  it("stops before User keys when the Profile backfill fails", async () => {
    const backfillUsers = vi.fn();

    await expect(
      backfillIdentityEmailKeys({} as never, {
        backfillProfiles: vi.fn(async () => {
          throw new Error("duplicate Profile email");
        }),
        backfillUsers,
      }),
    ).rejects.toThrow("duplicate Profile email");

    expect(backfillUsers).not.toHaveBeenCalled();
  });
});
