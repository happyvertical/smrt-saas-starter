import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateImageDigest } from "../manifest-digests-lib.mjs";

const digest = `sha256:${"a".repeat(64)}`;

describe("deployment manifest image updates", () => {
  it("rewrites the starter image name for downstream clones", () => {
    const overlay = `images:
  - name: ghcr.io/happyvertical/smrt-saas-starter-web
    newTag: dev-latest
    digest: sha256:${"0".repeat(64)}
  - name: ghcr.io/happyvertical/smrt-saas-starter-worker
    newTag: dev-latest
`;

    const updated = updateImageDigest(overlay, {
      role: "web",
      name: "ghcr.io/acme/cloned-starter-web",
      digest,
    });

    assert.match(updated, /name: ghcr\.io\/acme\/cloned-starter-web/);
    assert.match(updated, new RegExp(`digest: ${digest}`));
    assert.doesNotMatch(updated, /name: ghcr\.io\/happyvertical\/smrt-saas-starter-web/);
    assert.match(updated, /name: ghcr\.io\/happyvertical\/smrt-saas-starter-worker/);
  });

  it("rejects ambiguous role entries", () => {
    const overlay = `images:
  - name: ghcr.io/acme/first-web
  - name: ghcr.io/acme/second-web
`;
    assert.throws(
      () => updateImageDigest(overlay, { role: "web", name: "ghcr.io/acme/app-web", digest }),
      /multiple web image entries/,
    );
  });
});
