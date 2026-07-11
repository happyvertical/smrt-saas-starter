import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRuntimeCandidate, validateRuntimeCandidate } from "../runtime-candidate-lib.mjs";

const sha = "a".repeat(40);
const testedSha = "c".repeat(40);
const tree = "d".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;

describe("runtime candidate manifests", () => {
  it("records immutable provenance for both verified images", () => {
    const candidate = createRuntimeCandidate({
      sourceCommit: sha,
      testedCommit: testedSha,
      testedTree: tree,
      web: { name: "ghcr.io/acme/app-web", digest },
      worker: { name: "ghcr.io/acme/app-worker", digest },
    });
    assert.equal(
      validateRuntimeCandidate(candidate, {
        expectedSourceCommit: sha,
        expectedTestedTree: tree,
      }),
      candidate,
    );
  });

  it("rejects stale, duplicate, and unverified candidates", () => {
    const candidate = createRuntimeCandidate({
      sourceCommit: sha,
      testedCommit: testedSha,
      testedTree: tree,
      web: { name: "ghcr.io/acme/app-web", digest },
      worker: { name: "ghcr.io/acme/app-worker", digest },
    });
    assert.throws(() =>
      validateRuntimeCandidate(candidate, { expectedSourceCommit: "e".repeat(40) }),
    );
    assert.throws(() =>
      validateRuntimeCandidate(candidate, { expectedTestedTree: "e".repeat(40) }),
    );
    candidate.images[1].name = candidate.images[0].name;
    assert.throws(() => validateRuntimeCandidate(candidate));
    candidate.images[1].name = "ghcr.io/acme/app-worker";
    candidate.images[1].verification = "failed";
    assert.throws(() => validateRuntimeCandidate(candidate));
  });
});
