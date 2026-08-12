import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCleanupTarget } from "../cleanup-ci-postgres.mjs";

describe("CI PostgreSQL janitor target", () => {
  const environment = {
    CI_POSTGRES_EXPECTED_HOST: "ci-postgres.internal",
    CI_POSTGRES_EXPECTED_USER: "smrt_ci",
  };

  it("accepts only the configured CI host and role", () => {
    assert.doesNotThrow(() =>
      validateCleanupTarget(
        "postgresql://smrt_ci:secret@ci-postgres.internal/postgres",
        environment,
      ),
    );
    assert.throws(() =>
      validateCleanupTarget(
        "postgresql://smrt_ci:secret@production.internal/postgres",
        environment,
      ),
    );
    assert.throws(() =>
      validateCleanupTarget("postgresql://admin:secret@ci-postgres.internal/postgres", environment),
    );
  });

  it("fails closed when the allowlist is absent", () => {
    assert.throws(() =>
      validateCleanupTarget("postgresql://smrt_ci:secret@ci-postgres.internal/postgres", {}),
    );
  });
});
