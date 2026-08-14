import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCiPostgresTarget,
  createDatabaseName,
  databaseEnvironment,
  databaseUrl,
  main,
} from "../run-with-ci-postgres.mjs";

describe("CI PostgreSQL isolation", () => {
  it("names databases by epoch, run, attempt, suite, and process", () => {
    assert.equal(
      createDatabaseName({ epoch: 123, runId: "456", attempt: "2", suite: "DB Smoke", pid: 99 }),
      "smrt_ci_123_456_2_db_smoke_99",
    );
  });

  it("keeps the unique database identifier within PostgreSQL's 63-byte limit", () => {
    const databaseName = createDatabaseName({
      epoch: "12345678901234567890",
      runId: "a-very-long-run-identifier-that-must-be-trimmed",
      attempt: "a-very-long-attempt",
      suite: "a-very-long-suite-name-that-must-be-trimmed",
      pid: "123456789012345",
    });

    assert.equal(databaseName.length, 63);
    assert.match(databaseName, /_12345678$/u);
  });

  it("preserves connection parameters and exports normal database variables", () => {
    const url = databaseUrl(
      "postgresql://ci_user:secret@db.internal:5433/postgres?sslmode=require&application_name=ci",
      "smrt_ci_test",
    );
    const environment = databaseEnvironment(url, { KEEP: "yes" });

    assert.equal(environment.DATABASE_URL, url);
    assert.equal(environment.TEST_DB_URL, url);
    assert.equal(environment.PGDATABASE, "smrt_ci_test");
    assert.equal(environment.PGHOST, "db.internal");
    assert.equal(environment.PGPORT, "5433");
    assert.equal(environment.PGUSER, "ci_user");
    assert.equal(environment.PGPASSWORD, "secret");
    assert.equal(environment.PGSSLMODE, "require");
    assert.equal(environment.PGAPPNAME, "ci");
    assert.equal(environment.KEEP, "yes");
  });

  it("fails closed for a non-loopback target without the shared CI allowlist", () => {
    assert.throws(() =>
      assertCiPostgresTarget("postgresql://ci:secret@production.internal/postgres"),
    );
    assert.throws(() =>
      assertCiPostgresTarget("postgresql://ci:secret@ci-postgres.internal/postgres", {
        CI_POSTGRES_SHARED_LANE: "true",
      }),
    );
    assert.doesNotThrow(() =>
      assertCiPostgresTarget("postgresql://smrt_ci:secret@ci-postgres.internal/postgres", {
        CI_POSTGRES_EXPECTED_HOST: "ci-postgres.internal",
        CI_POSTGRES_EXPECTED_USER: "smrt_ci",
        CI_POSTGRES_SHARED_LANE: "true",
      }),
    );
  });

  it("rejects unknown runner options before touching PostgreSQL", async () => {
    await assert.rejects(() => main(["--unexpected", "--", "true"], {}), /Unknown PostgreSQL/u);
  });
});
