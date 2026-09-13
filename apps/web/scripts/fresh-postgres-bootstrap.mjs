/**
 * The non-pg-safe migration mode is valid only before any application relation
 * exists outside PostgreSQL system schemas.
 * Introspection errors and malformed results deliberately refuse that path.
 */
export async function isEmptyPostgresApplicationSchema(db) {
  const result = await db.query(
    "SELECT n.nspname AS schema_name, c.relname FROM pg_class AS c INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')",
  );
  if (!Array.isArray(result?.rows)) {
    throw new Error("Cannot verify whether the PostgreSQL application schema is empty");
  }
  for (const row of result.rows) {
    if (
      !row ||
      typeof row.schema_name !== "string" ||
      row.schema_name.length === 0 ||
      typeof row.relname !== "string" ||
      row.relname.length === 0
    ) {
      throw new Error("Cannot verify whether the PostgreSQL application schema is empty");
    }
  }
  return result.rows.length === 0;
}
