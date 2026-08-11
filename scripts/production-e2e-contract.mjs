export const REQUIRED_PRODUCTION_TABLES = Object.freeze([
  "_smrt_field_policies",
  "_smrt_migrations",
  "_smrt_schema_migrations",
  "memberships",
  "starter_app_settings",
  "tenants",
  "users",
]);

export function assertRequiredProductionTables(actualTables) {
  const actual = new Set(actualTables);
  const missing = REQUIRED_PRODUCTION_TABLES.filter((table) => !actual.has(table));
  if (missing.length > 0) {
    throw new Error(`Production migration is missing required tables: ${missing.join(", ")}`);
  }
}

export function assertDocumentStatus(route, status) {
  if (!Number.isInteger(status) || status < 100) {
    throw new Error(`No valid document response for ${route}.`);
  }
  if (status >= 500) {
    throw new Error(`Document ${route} returned HTTP ${status}; HTML error shells are failures.`);
  }
}

export function assertHealthPayload(payload, expectedVersion) {
  if (!payload || typeof payload !== "object" || payload.status !== "ok") {
    throw new Error("Health endpoint did not report status=ok.");
  }
  if (payload.version !== expectedVersion) {
    throw new Error(
      `Health endpoint version mismatch: expected ${expectedVersion}, received ${String(payload.version)}.`,
    );
  }
}

export function assertSeedSnapshot(beforeRestart, afterRestart) {
  if (beforeRestart.signupAccessMode !== "public") {
    throw new Error(
      `Production seed signup mode mismatch: expected public, received ${String(beforeRestart.signupAccessMode)}.`,
    );
  }
  if (JSON.stringify(afterRestart) !== JSON.stringify(beforeRestart)) {
    throw new Error("Production seed changed after a second entrypoint startup.");
  }
}

export function redactProductionDiagnostics(value) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^:\s"'@]+:[^@\s"']+@/gu, "postgresql://[REDACTED]@")
    .replace(/(POSTGRES_PASSWORD=)[^\s"\\]+/gu, "$1[REDACTED]");
}
