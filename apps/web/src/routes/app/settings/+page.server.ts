import { type Actions, fail } from "@sveltejs/kit";
import {
  getTenantCustomizationOverview,
  saveTenantLanguageOverride,
  saveTenantPromptOverride,
} from "$lib/server/experience";
import { getBillingOverview } from "$lib/server/subscriptions";
import type { PageServerLoad } from "./$types";

const promptFeatureKey = "prompts.tenant_overrides";
const languageFeatureKey = "languages.ai_translate";

export const load: PageServerLoad = async ({ locals }) => {
  const [billing, customization] = await Promise.all([
    getBillingOverview(locals.tenantId),
    getTenantCustomizationOverview(locals.tenantId),
  ]);
  const features = new Set(billing.snapshot.featureKeys);

  return {
    ...customization,
    planName: billing.currentPlan.name,
    canManagePrompts: features.has(promptFeatureKey),
    canManageLanguages: features.has(languageFeatureKey),
  };
};

export const actions: Actions = {
  prompt: async ({ locals, request }) => {
    const billing = await getBillingOverview(locals.tenantId);
    if (!billing.snapshot.featureKeys.includes(promptFeatureKey)) {
      return fail(403, {
        kind: "prompt",
        message: "Prompt overrides require a plan with tenant prompt management.",
      });
    }

    const form = await request.formData();
    const key = readFormString(form, "key");
    const template = readFormString(form, "template");
    if (!key) {
      return fail(400, { kind: "prompt", message: "Missing prompt key." });
    }

    const result = await saveTenantPromptOverride(locals.tenantId, { key, template });
    return { kind: "prompt", message: messageForResult("Prompt override", result.action) };
  },
  language: async ({ locals, request }) => {
    const billing = await getBillingOverview(locals.tenantId);
    if (!billing.snapshot.featureKeys.includes(languageFeatureKey)) {
      return fail(403, {
        kind: "language",
        message: "Language overrides require a plan with AI translation.",
      });
    }

    const form = await request.formData();
    const key = readFormString(form, "key");
    const locale = readFormString(form, "locale");
    const template = readFormString(form, "template");
    if (!key || !locale) {
      return fail(400, { kind: "language", message: "Missing language key or locale." });
    }

    const result = await saveTenantLanguageOverride(locals.tenantId, {
      key,
      locale,
      template,
    });
    return { kind: "language", message: messageForResult("Language override", result.action) };
  },
};

function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function messageForResult(label: string, action: "saved" | "deleted" | "unchanged"): string {
  if (action === "deleted") {
    return `${label} cleared.`;
  }
  if (action === "unchanged") {
    return `${label} unchanged.`;
  }
  return `${label} saved.`;
}
