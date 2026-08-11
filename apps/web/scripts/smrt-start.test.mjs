import { describe, expect, it, vi } from "vitest";
import { migrateOnStart } from "./smrt-start.mjs";

describe("runtime startup", () => {
  it("does not migrate unless the deployment opts in", () => {
    const run = vi.fn();
    migrateOnStart({ environment: {}, run });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the idempotent migration and seed before startup when enabled", () => {
    const run = vi.fn(() => ({ status: 0 }));
    const environment = { SMRT_STARTER_MIGRATE_ON_START: "true", DATABASE_URL: "postgresql://db" };

    migrateOnStart({ environment, run });

    expect(run.mock.calls).toEqual([
      [process.execPath, ["scripts/smrt-db-migrate.mjs"], { stdio: "inherit", env: environment }],
      [process.execPath, ["scripts/smrt-db-seed.mjs"], { stdio: "inherit", env: environment }],
    ]);
  });

  it("fails closed before seeding when migration fails", () => {
    const run = vi.fn(() => ({ status: 2 }));
    expect(() =>
      migrateOnStart({
        environment: { SMRT_STARTER_MIGRATE_ON_START: "true" },
        run,
      }),
    ).toThrow(/migration failed with status 2/u);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fails closed when seeding fails", () => {
    const run = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 3 });
    expect(() =>
      migrateOnStart({
        environment: { SMRT_STARTER_MIGRATE_ON_START: "true" },
        run,
      }),
    ).toThrow(/seed failed with status 3/u);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
