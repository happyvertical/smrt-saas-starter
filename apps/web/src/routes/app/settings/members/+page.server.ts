import { type Actions, fail } from "@sveltejs/kit";
import { AccountFlowError, inviteTenantMember, listTenantMembers } from "$lib/server/accounts";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const membership = await requirePermission(locals, starterPermissions.settingsRead);
  const canManageMembers = membership.permissions.includes(starterPermissions.membershipManage);
  return {
    canManageMembers,
    members: canManageMembers ? await listTenantMembers(membership.tenantId) : [],
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
};

function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function messageForInvite(
  action: "created" | "already-member" | "updated",
  email: string,
  roleLabel: string,
): string {
  if (action === "already-member") return `${email} already has ${roleLabel} access.`;
  if (action === "updated") return `${email} now has ${roleLabel} access.`;
  return `${email} was added with ${roleLabel} access.`;
}
