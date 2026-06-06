export interface MobileTenantSummary {
  id: string;
  name: string;
  slug: string;
  planName: string;
  subscriptionStatus: string;
}

export interface MobileUsageThreshold {
  metricKey: string;
  label: string;
  used: number;
  limit: number;
  action: "observe" | "warn" | "block";
}

export interface MobileDashboardPayload {
  tenant: MobileTenantSummary;
  thresholds: MobileUsageThreshold[];
  enabledFeatures: string[];
  language: string;
}

export const mobileContractVersion = "2026-06-06.v1";
