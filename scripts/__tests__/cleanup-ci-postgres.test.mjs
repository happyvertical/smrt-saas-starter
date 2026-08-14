import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanupQuery } from "../cleanup-ci-postgres.mjs";

describe("CI PostgreSQL janitor", () => {
  it("only selects aged isolated CI database names", () => {
    const query = cleanupQuery(123);
    assert.match(query, /\^smrt_ci_\[0-9\]\+_\[a-z0-9_\]\+\$/u);
    assert.match(query, /split_part\(datname, '_', 3\)::bigint < 123/u);
  });
});
