import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDocumentStatus,
  assertHealthPayload,
  assertRequiredProductionTables,
  assertSeedSnapshot,
  REQUIRED_PRODUCTION_TABLES,
  redactProductionDiagnostics,
} from "../production-e2e-contract.mjs";

describe("production E2E fail-closed contracts", () => {
  it("rejects an empty database or a migration missing field policies", () => {
    assert.throws(
      () =>
        assertRequiredProductionTables(
          REQUIRED_PRODUCTION_TABLES.filter((table) => table !== "_smrt_field_policies"),
        ),
      /missing required tables: _smrt_field_policies/u,
    );
  });

  it("rejects signup and field-policy 500s even when the response is HTML", () => {
    assert.throws(() => assertDocumentStatus("/signup", 500), /HTML error shells are failures/u);
    assert.throws(() => assertDocumentStatus("/app/settings/field-policies", 500), /HTTP 500/u);
  });

  it("requires the built image version from health", () => {
    assert.doesNotThrow(() => assertHealthPayload({ status: "ok", version: "abc" }, "abc"));
    assert.throws(
      () => assertHealthPayload({ status: "ok", version: "old" }, "abc"),
      /version mismatch/u,
    );
  });

  it("requires public signup and an idempotent second startup", () => {
    const snapshot = {
      tenantIds: ["tenant-1"],
      userIds: ["user-1"],
      membershipIds: ["membership-1"],
      settingIds: ["setting-1"],
      signupAccessMode: "public",
    };
    assert.doesNotThrow(() => assertSeedSnapshot(snapshot, structuredClone(snapshot)));
    assert.throws(
      () => assertSeedSnapshot(snapshot, { ...snapshot, membershipIds: ["membership-1", "2"] }),
      /changed after a second entrypoint/u,
    );
    assert.throws(
      () =>
        assertSeedSnapshot(
          { ...snapshot, signupAccessMode: "invite-only" },
          { ...snapshot, signupAccessMode: "invite-only" },
        ),
      /expected public/u,
    );
  });

  it("redacts database credentials from uploaded diagnostics", () => {
    const input =
      'DATABASE_URL=postgresql://smrt_saas:localdev@postgres:5432/smrt_saas POSTGRES_PASSWORD=localdev"';
    const output = redactProductionDiagnostics(input);
    assert.doesNotMatch(output, /localdev/u);
    assert.match(output, /postgresql:\/\/\[REDACTED\]@postgres/u);
    assert.match(output, /POSTGRES_PASSWORD=\[REDACTED\]/u);
  });
});
