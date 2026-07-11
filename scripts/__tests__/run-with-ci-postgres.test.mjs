import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatabaseName, databaseEnvironment, databaseUrl } from "../run-with-ci-postgres.mjs";

describe("CI PostgreSQL isolation", () => {
  it("names databases by run, attempt, suite, and process", () => {
    assert.equal(
      createDatabaseName({ epoch: 123, runId: "456", attempt: "2", suite: "DB Smoke", pid: 99 }),
      "smrt_ci_123_456_2_db_smoke_99",
    );
  });

  it("preserves connection parameters and exports standard libpq variables", () => {
    const url = databaseUrl(
      "postgresql://ci_user:secret@db.internal:5433/postgres?sslmode=require&application_name=ci",
      "smrt_ci_test",
    );
    const environment = databaseEnvironment(url, { KEEP: "yes" });

    assert.equal(environment.DATABASE_URL, url);
    assert.equal(environment.PGDATABASE, "smrt_ci_test");
    assert.equal(environment.PGHOST, "db.internal");
    assert.equal(environment.PGPORT, "5433");
    assert.equal(environment.PGUSER, "ci_user");
    assert.equal(environment.PGPASSWORD, "secret");
    assert.equal(environment.PGSSLMODE, "require");
    assert.equal(environment.PGAPPNAME, "ci");
    assert.equal(environment.KEEP, "yes");
  });
});
