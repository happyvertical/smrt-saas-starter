import { describe, expect, it } from "vitest";
import { isEmptyPostgresApplicationSchema } from "./fresh-postgres-bootstrap.mjs";

describe("fresh PostgreSQL bootstrap guard", () => {
  it("permits the non-pg-safe bootstrap path only for an empty schema", async () => {
    await expect(
      isEmptyPostgresApplicationSchema({ query: async () => ({ rows: [] }) }),
    ).resolves.toBe(true);
  });

  it("retains normal migration defaults for a public relation", async () => {
    await expect(
      isEmptyPostgresApplicationSchema({
        query: async () => ({ rows: [{ schema_name: "public", relname: "unrelated_data" }] }),
      }),
    ).resolves.toBe(false);
  });

  it("retains normal migration defaults for relations in another user schema", async () => {
    await expect(
      isEmptyPostgresApplicationSchema({
        query: async () => ({
          rows: [{ schema_name: "customer_data", relname: "existing_table" }],
        }),
      }),
    ).resolves.toBe(false);
  });

  it("fails closed when introspection is unavailable or invalid", async () => {
    await expect(
      isEmptyPostgresApplicationSchema({
        query: async () => {
          throw new Error("denied");
        },
      }),
    ).rejects.toThrow("denied");
    await expect(
      isEmptyPostgresApplicationSchema({ query: async () => ({ rows: [{}] }) }),
    ).rejects.toThrow("Cannot verify");
  });
});
