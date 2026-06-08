import { type Actions, fail } from "@sveltejs/kit";
import { AccountFlowError, inviteTenantMember, listTenantMembers } from "$lib/server/accounts";
import { requirePermission, starterPermissions } from "$lib/server/authz";
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
  const membership = await requirePermission(locals, starterPermissions.settingsRead);
  const [billing, customization] = await Promise.all([
    getBillingOverview(membership.tenantId),
    getTenantCustomizationOverview(membership.tenantId),
  ]);
  const features = new Set(billing.snapshot.featureKeys);
  const canManageMembers = membership.permissions.includes(starterPermissions.membershipManage);

  return {
    ...customization,
    planName: billing.currentPlan.name,
    canManagePrompts: features.has(promptFeatureKey),
    canManageLanguages: features.has(languageFeatureKey),
    canManageMembers,
    members: await listTenantMembers(membership.tenantId),
  };
};

export const actions: Actions = {
  invite: async ({ locals, request }) => {
    const membership = await requirePermission(locals, starterPermissions.membershipManage);
    const form = await request.formData();
    const email = readFormString(form, "email");
    const roleSlug = readFormString(form, "roleSlug");

    try {
      const result = await inviteTenantMember({
        tenantId: membership.tenantId,
        email,
        roleSlug,
      });
      return {
        kind: "invite",
        message: messageForInvite(result.action, result.member.email, result.member.roleLabel),
      };
    } catch (error) {
      if (error instanceof AccountFlowError) {
        return fail(error.status, { kind: "invite", message: error.message, email, roleSlug });
      }
      throw error;
    }
  },
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
    if (!key) {
      return fail(400, { kind: "prompt", message: "Missing prompt key." });
    }

    let result: Awaited<ReturnType<typeof saveTenantPromptOverride>>;
    try {
      result = await saveTenantPromptOverride(membership.tenantId, { key, template });
    } catch (error) {
      if (isUnknownStarterExperienceError(error)) {
        return fail(400, { kind: "prompt", message: error.message });
      }
      throw error;
    }
    return { kind: "prompt", message: messageForResult("Prompt override", result.action) };
  },
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

    let result: Awaited<ReturnType<typeof saveTenantLanguageOverride>>;
    try {
      result = await saveTenantLanguageOverride(membership.tenantId, {
        key,
        locale,
        template,
      });
    } catch (error) {
      if (isUnknownStarterExperienceError(error)) {
        return fail(400, { kind: "language", message: error.message });
      }
      throw error;
    }
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

function messageForInvite(
  action: "created" | "already-member" | "updated",
  email: string,
  roleLabel: string,
): string {
  if (action === "already-member") {
    return `${email} already has ${roleLabel} access.`;
  }
  if (action === "updated") {
    return `${email} now has ${roleLabel} access.`;
  }
  return `${email} was added with ${roleLabel} access.`;
}

function isUnknownStarterExperienceError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Unknown starter ");
}
