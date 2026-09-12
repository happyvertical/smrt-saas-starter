import { type Actions, fail } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { getTenantCustomizationOverview, saveTenantPromptOverride } from "$lib/server/experience";
import { getBillingOverview } from "$lib/server/subscriptions";
import type { PageServerLoad } from "./$types";

const promptFeatureKey = "prompts.tenant_overrides";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.settingsRead);
  const [billing, customization] = await Promise.all([
    getBillingOverview(membership.tenantId),
    getTenantCustomizationOverview(membership.tenantId),
  ]);
  return {
    canManagePrompts:
      billing.snapshot.featureKeys.includes(promptFeatureKey) &&
      membership.permissions.includes(starterPermissions.settingsManage),
    prompts: customization.prompts,
  };
};

export const actions: Actions = {
  prompt: async ({ locals, request }) => {
    const membership = await requirePermission(locals, starterPermissions.settingsManage);
    const billing = await getBillingOverview(membership.tenantId);
    if (!billing.snapshot.featureKeys.includes(promptFeatureKey)) {
      return fail(403, {
        kind: "prompt",
        message: "Prompt overrides require a plan with tenant prompt management.",
      });
    }

    const form = await request.formData();
    const key = readFormString(form, "key");
    const template = readFormString(form, "template");
    if (!key) return fail(400, { kind: "prompt", message: "Missing prompt key." });

    try {
      const result = await saveTenantPromptOverride(membership.tenantId, { key, template });
      return { kind: "prompt", message: messageForResult("Prompt override", result.action) };
    } catch (error) {
      if (isUnknownStarterExperienceError(error)) {
        return fail(400, { kind: "prompt", message: error.message });
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
