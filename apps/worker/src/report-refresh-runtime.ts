import { createHmacDurableJobPayloadSigner } from "@happyvertical/smrt-jobs";
import { AuditLogCollection, ProfileCollection } from "@happyvertical/smrt-profiles";
import {
  type ReportExecutionPrincipalReference,
  type ReportRefreshExecutionAuditEvent,
  type ReportRefreshExecutionAuthorityContext,
  registerReportRefreshExecutionAuthorityHost,
  registerReportRefreshJobIntegritySigner,
} from "@happyvertical/smrt-reports";
import { withSystemContext, withTenant } from "@happyvertical/smrt-tenancy";

export const REPORT_REFRESH_AUTHORITY_HOST_ID = "smrt-saas-starter.report-refresh.v1";

export interface ReportRefreshDatabase {
  query(sql: string, ...params: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Registers live application authority before the native TaskRunner polls. */
export function registerWorkerReportRefreshRuntime(database: ReportRefreshDatabase): () => void {
  const unregisterSigner = registerReportRefreshJobIntegritySigner(reportRefreshSigner());
  const unregisterAuthority = registerReportRefreshExecutionAuthorityHost(
    REPORT_REFRESH_AUTHORITY_HOST_ID,
    createWorkerReportRefreshAuthority(database),
  );
  return () => {
    unregisterAuthority();
    unregisterSigner();
  };
}

function reportRefreshSigner() {
  const key = process.env.REPORT_REFRESH_SIGNING_KEY?.trim();
  const keyId = process.env.REPORT_REFRESH_SIGNING_KEY_ID?.trim();
  if (!key || !keyId) {
    throw new Error("REPORT_REFRESH_SIGNING_KEY and REPORT_REFRESH_SIGNING_KEY_ID are required");
  }
  return createHmacDurableJobPayloadSigner({ key, keyId });
}

function createWorkerReportRefreshAuthority(database: ReportRefreshDatabase) {
  return {
    async authorize(
      principal: Readonly<ReportExecutionPrincipalReference>,
      context: Readonly<ReportRefreshExecutionAuthorityContext>,
    ): Promise<void> {
      if (
        !principal.tenantId ||
        principal.tenantId !== context.tenantId ||
        principal.onBehalfOfUserId !== principal.actorUserId ||
        !principal.actsAsProfileId
      ) {
        throw new Error("Report refresh execution authority is invalid");
      }
      const result = await database.query(
        `SELECT users.profile_id AS profile_id
           FROM memberships
           INNER JOIN users ON users.id = memberships.user_id
           INNER JOIN profiles ON profiles.id = users.profile_id
           INNER JOIN tenants ON tenants.id = memberships.tenant_id
           INNER JOIN roles ON roles.id = memberships.role_id
          WHERE memberships.user_id = ? AND memberships.tenant_id = ?
            AND memberships.status = 'active' AND users.status = 'active'
            AND profiles.tenant_id IS NULL
            AND profiles._meta_type = '@happyvertical/smrt-profiles:Person'
            AND profiles.email_key IS NOT NULL AND users.email_key IS NOT NULL
            AND profiles.email_key = users.email_key AND tenants.status = 'active'
            AND roles.slug IN ('owner', 'admin')
            AND NOT EXISTS (SELECT 1 FROM profiles AS other_profiles
              WHERE other_profiles.email_key = users.email_key AND other_profiles.id <> users.profile_id)
            AND NOT EXISTS (SELECT 1 FROM users AS other_users
              WHERE other_users.profile_id = users.profile_id AND other_users.id <> users.id)
          LIMIT 1`,
        principal.actorUserId,
        principal.tenantId,
      );
      const profileId = readRowString(result.rows[0], "profile_id");
      if (!profileId || profileId !== principal.actsAsProfileId) {
        throw new Error("Report refresh execution authority has been revoked");
      }
    },
    async audit(event: Readonly<ReportRefreshExecutionAuditEvent>): Promise<void> {
      const profileId = event.principal.actsAsProfileId;
      const tenantId = event.principal.tenantId;
      if (!profileId || !tenantId) return;
      const profiles = await ProfileCollection.create({ db: database as never });
      const profile = await withSystemContext(() => profiles.get({ id: profileId }));
      if (!profile) return;
      const logs = await AuditLogCollection.create({ db: database as never });
      await withTenant({ tenantId }, async () => {
        await logs.record({
          profile,
          action: `report.refresh.execute.${event.outcome}`,
          resourceType: "Report",
          resourceId: event.reportClass,
          source: "cli",
          metadata: {
            trigger: event.trigger,
            mode: event.mode,
            reason: event.reason ?? null,
            actorUserId: event.principal.actorUserId,
          },
        });
      });
    },
  };
}

function readRowString(row: unknown, key: string): string | null {
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
