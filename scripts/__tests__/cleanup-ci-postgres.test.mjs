import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanupQuery, main } from "../cleanup-ci-postgres.mjs";

describe("CI PostgreSQL janitor", () => {
  it("only selects aged isolated CI database names", () => {
    const query = cleanupQuery(123);
    assert.match(query, /\^smrt_ci_\[0-9\]\+_\[a-z0-9_\]\+\$/u);
    assert.match(query, /split_part\(datname, '_', 3\)::bigint < 123/u);
  });

  it("uses the Compose client for janitor work when host PostgreSQL binaries are absent", () => {
    const baseUrl = "postgresql://smrt_saas:localdev@127.0.0.1:5432/postgres";
    const calls = [];
    const spawn = (command, args) => {
      calls.push([command, args]);
      if (command === "psql" || command === "dropdb") {
        const error = new Error(`${command} not found`);
        error.code = "ENOENT";
        return { error, status: null };
      }
      return {
        status: 0,
        stdout: args[4] === "psql" ? "smrt_ci_123_local_1_starter_99\n" : "",
      };
    };

    assert.equal(main({ CI_POSTGRES_BASE_URL: baseUrl }, spawn), 0);
    assert.deepEqual(
      calls.map(([command]) => command),
      ["psql", "docker", "dropdb", "docker"],
    );
  });
});
