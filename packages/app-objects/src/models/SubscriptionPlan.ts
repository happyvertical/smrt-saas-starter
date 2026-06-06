import { SmrtObject, smrt } from "@happyvertical/smrt-core";
import { TenantScoped, tenantId } from "@happyvertical/smrt-tenancy";

export type ThresholdAction = "observe" | "warn" | "block";
export type ThresholdWindow = "day" | "month" | "billing_period";

export interface PlanFeatureDefinition {
  key: string;
  enabled: boolean;
  label?: string;
}

export interface PlanThresholdDefinition {
  metricKey: string;
  limit: number;
  window: ThresholdWindow;
  action: ThresholdAction;
  label?: string;
}

@TenantScoped({ mode: "optional" })
@smrt({
  conflictColumns: ["tenant_id", "slug"],
  api: { include: ["list", "get", "create", "update"] },
  mcp: { include: ["list", "get"] },
  cli: true,
})
export class SubscriptionPlan extends SmrtObject {
  @tenantId({ nullable: true })
  tenantId: string | null = null;

  name = "";
  description = "";
  stripePriceId = "";
  currency = "USD";
  monthlyPrice = 0.0;
  annualPrice = 0.0;
  sortOrder = 0;
  isPublic = true;
  isDefault = false;
  featureJson = "[]";
  thresholdJson = "[]";

  getFeatures(): PlanFeatureDefinition[] {
    return parseJsonArray<PlanFeatureDefinition>(this.featureJson);
  }

  setFeatures(features: PlanFeatureDefinition[]): void {
    this.featureJson = JSON.stringify(features);
  }

  getThresholds(): PlanThresholdDefinition[] {
    return parseJsonArray<PlanThresholdDefinition>(this.thresholdJson);
  }

  setThresholds(thresholds: PlanThresholdDefinition[]): void {
    this.thresholdJson = JSON.stringify(thresholds);
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
