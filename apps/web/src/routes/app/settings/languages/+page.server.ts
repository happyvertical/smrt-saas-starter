import { type Actions, fail } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getTenantCustomizationOverview, saveTenantLanguageOverride } from "$lib/server/experience";
import { getBillingOverview } from "$lib/server/subscriptions";
import type { PageServerLoad } from "./$types";

const languageFeatureKey = "languages.ai_translate";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.settingsRead);
  const [billing, customization] = await Promise.all([
    getBillingOverview(membership.tenantId),
    getTenantCustomizationOverview(membership.tenantId),
  ]);
  return {
    canManageLanguages:
      billing.snapshot.featureKeys.includes(languageFeatureKey) &&
      membership.permissions.includes(starterPermissions.settingsManage),
    languages: customization.languages,
  };
};

export const actions: Actions = {
  language: async ({ locals, request }) => {
    const membership = await requirePermission(locals, starterPermissions.settingsManage);
    const billing = await getBillingOverview(membership.tenantId);
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

    try {
      const result = await saveTenantLanguageOverride(membership.tenantId, {
        key,
        locale,
        template,
      });
      return { kind: "language", message: messageForResult("Language override", result.action) };
    } catch (error) {
      if (isUnknownStarterExperienceError(error)) {
        return fail(400, { kind: "language", message: error.message });
      }
      throw error;
    }
  },
};

function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function messageForResult(label: string, action: "saved" | "deleted" | "unchanged"): string {
  if (action === "deleted") return `${label} cleared.`;
  if (action === "unchanged") return `${label} unchanged.`;
  return `${label} saved.`;
}

function isUnknownStarterExperienceError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Unknown starter ");
}
