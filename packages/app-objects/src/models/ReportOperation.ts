import { crossPackageRef, field, SmrtObject, smrt } from "@happyvertical/smrt-core";
import { TenantScoped, tenantId } from "@happyvertical/smrt-tenancy";

export type ReportOperationKind = "prepare" | "approval-demo";
export type ReportOperationStatus =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "committed"
  | "cancelled"
  | "declined"
  | "failed"
  | "recovery_required";

/** Starter-owned durable record for a caller's immutable activity-report view. */
@TenantScoped({ mode: "required" })
@smrt({ tableName: "starter_report_operations", api: false, cli: false, mcp: false })
export class ReportOperation extends SmrtObject {
  @tenantId()
  tenantId?: string;

  @field({ required: true })
  kind: ReportOperationKind = "prepare";

  @field({ required: true })
  status: ReportOperationStatus = "queued";

  @crossPackageRef("@happyvertical/smrt-users:User", { nullable: false })
  requesterUserId = "";

  @crossPackageRef("@happyvertical/smrt-profiles:Profile", { nullable: false })
  requesterProfileId = "";

  @field({ type: "text", required: true })
  payloadFingerprint = "";

  @field({ type: "text", required: true, unique: true })
  requestId = "";

  @field({ type: "json", required: true })
  request = "{}";

  @field({ type: "json", nullable: true })
  snapshot: string | null = null;

  @field({ nullable: true })
  jobId: string | null = null;

  @crossPackageRef("@happyvertical/smrt-users:User", { nullable: true })
  decidedByUserId: string | null = null;

  @field({ type: "datetime", nullable: true })
  decidedAt: Date | null = null;

  @field({ nullable: true })
  errorCode: string | null = null;

  @field({ type: "text", nullable: true })
  approvedFingerprint: string | null = null;

  @field({ type: "json", nullable: true })
  executionEvidence: string | null = null;
}
