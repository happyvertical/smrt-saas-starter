import { SmrtObject, smrt } from "@happyvertical/smrt-core";
import { TenantScoped, tenantId } from "@happyvertical/smrt-tenancy";

export type TenantSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled"
  | "incomplete";

@TenantScoped({ mode: "required" })
@smrt({
  conflictColumns: ["tenant_id"],
  api: { include: ["list", "get", "create", "update"] },
  mcp: { include: ["list", "get"] },
  cli: true,
})
export class TenantSubscription extends SmrtObject {
  @tenantId()
  tenantId = "";

  planId = "";
  status: TenantSubscriptionStatus = "trialing";
  stripeCustomerId = "";
  stripeSubscriptionId = "";
  currentPeriodStart: Date | null = null;
  currentPeriodEnd: Date | null = null;
  cancelAtPeriodEnd = false;
  trialEndsAt: Date | null = null;
  metadataJson = "{}";

  isEntitled(now = new Date()): boolean {
    if (this.status === "active" || this.status === "trialing") {
      return !this.currentPeriodEnd || this.currentPeriodEnd.getTime() >= now.getTime();
    }

    return false;
  }

  getMetadata(): Record<string, string> {
    try {
      const parsed = JSON.parse(this.metadataJson);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  }

  setMetadata(metadata: Record<string, string>): void {
    this.metadataJson = JSON.stringify(metadata);
  }
}
