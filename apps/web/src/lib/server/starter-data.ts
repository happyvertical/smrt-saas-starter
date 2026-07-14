import type { PromptAIInput, PromptEditableConfig } from "@happyvertical/smrt-prompts";
import type {
  BillingInterval,
  PlanFeatureGrant,
  PlanThreshold,
} from "@happyvertical/smrt-subscriptions";
import starterDataJson from "./starter-data.json";

export interface StarterFeatureGrant extends PlanFeatureGrant {
  metadata: {
    label: string;
    [key: string]: unknown;
  };
}

export interface StarterPlanSeed {
  id: string;
  planKey: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  billingInterval: BillingInterval;
  stripePriceEnvKey: string;
  features: StarterFeatureGrant[];
  thresholds: PlanThreshold[];
}

export interface StarterPromptSeed {
  key: string;
  label: string;
  description: string;
  template: string;
  ai: PromptAIInput;
  editable: Partial<PromptEditableConfig>;
}

export interface StarterPromptOverrideSeed {
  id: string;
  slug: string;
  key: string;
  template: string;
  profile?: string | null;
  model?: string | null;
  params?: Record<string, unknown> | null;
}

export interface StarterLanguageStringSeed {
  key: string;
  locale: string;
  label: string;
  description: string;
  template: string;
}

export interface StarterLanguageSettingSeed {
  key: string;
  locale: string;
}

export interface StarterLanguageOverrideSeed {
  id: string;
  slug: string;
  key: string;
  locale: string;
  template: string;
}

export interface StarterData {
  identity: {
    personProfileType: {
      id: string;
      slug: string;
      name: string;
      description: string;
    };
  };
  demoTenant: {
    id: string;
    slug: string;
    name: string;
    description: string;
    ownerUser: {
      id: string;
      slug: string;
      email: string;
    };
    ownerProfile: {
      id: string;
      slug: string;
      name: string;
      email: string;
    };
    ownerMembership: {
      id: string;
      slug: string;
    };
  };
  roles: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
  }>;
  plans: StarterPlanSeed[];
  demoSubscription: {
    id: string;
    slug: string;
    planKey: string;
    stripeCustomerId: string;
  };
  appSettings: Array<{
    id: string;
    slug: string;
    key: string;
    value: string;
  }>;
  usageSeeds: Array<{
    id: string;
    slug: string;
    metricKey: string;
    quantity: number;
    source: string;
  }>;
  aiUsageSeeds: Array<{
    id: string;
    provider: string;
    model: string;
    operation: string;
    className: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
    durationMs: number;
  }>;
  prompts: StarterPromptSeed[];
  promptOverrides: StarterPromptOverrideSeed[];
  languageStrings: StarterLanguageStringSeed[];
  languageSettings: StarterLanguageSettingSeed[];
  languageOverrides: StarterLanguageOverrideSeed[];
}

export const starterData = starterDataJson as StarterData;
export const DEMO_TENANT_ID = starterData.demoTenant.id;
export const DEMO_TENANT_SLUG = starterData.demoTenant.slug;
export const DEMO_OWNER_EMAIL = starterData.demoTenant.ownerUser.email;

export function getActiveTenantId(tenantId: string | null | undefined): string {
  return tenantId && isUuid(tenantId) ? tenantId : DEMO_TENANT_ID;
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

export function getCurrentMonthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function readFeatureLabel(feature: PlanFeatureGrant): string {
  const label = feature.metadata?.label;
  return typeof label === "string" && label.length > 0
    ? label
    : titleizeFeatureKey(feature.featureKey);
}

function titleizeFeatureKey(featureKey: string): string {
  return featureKey
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
