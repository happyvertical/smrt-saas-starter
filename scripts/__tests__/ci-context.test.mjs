import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inputRoots, outputRoots } from "../ci-context-lib.mjs";

describe("generated CI context", () => {
  it("tracks source inputs and reusable generated outputs", () => {
    assert.ok(inputRoots.includes("apps/web/src"));
    assert.ok(inputRoots.includes("packages/app-objects/src"));
    assert.ok(outputRoots.includes("apps/web/.smrt"));
    assert.ok(outputRoots.includes("packages/mobile-contract/generated"));
  });
});
