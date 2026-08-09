import { fail } from "@sveltejs/kit";
import {
  AccessRequestStatus,
  approveAccessRequest,
  declineAccessRequest,
  graduateAccessRequest,
  listAccessRequests,
  toAccessRequestMessage,
} from "$lib/server/access-requests";
import { listTenants } from "$lib/server/accounts";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { resolveStarterAppSettingPolicy } from "$lib/server/field-policy";
import {
  createTenantOwnerInvitation,
  getSignupAccessSetting,
  listTenantOwnerInvitations,
  revokeTenantOwnerInvitation,
  toAccountFlowMessage,
} from "$lib/server/invitations";
import { requireSuperUser } from "$lib/server/super-users";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const superUser = requireSuperUser(locals);
  const membership = await requirePermission(locals, starterPermissions.settingsManage);

  return {
    superUser,
    signupAccess: await getSignupAccessSetting(),
    signupPolicy: await resolveStarterAppSettingPolicy(membership),
    invitations: await listTenantOwnerInvitations(),
    tenants: await listTenants(),
    accessRequests: await listAccessRequests(superUser, {
      status: [AccessRequestStatus.REQUESTED, AccessRequestStatus.APPROVED],
    }),
  };
};

export const actions: Actions = {
  inviteTenantOwner: async ({ request, locals, url }) => {
    const superUser = requireSuperUser(locals);
    const data = await request.formData();
    const email = String(data.get("email") ?? "").trim();

    try {
      const result = await createTenantOwnerInvitation({
        email,
        invitedByUserId: superUser.userId,
        origin: url.origin,
      });
      return {
        kind: "inviteTenantOwner",
        success: true,
        email: result.invitation.email,
        acceptUrl: result.acceptUrl,
      };
    } catch (error) {
      const message = toAccountFlowMessage(error) ?? "Could not create invitation.";
      return fail(400, {
        kind: "inviteTenantOwner",
        success: false,
        email,
        message,
      });
    }
  },

  revokeInvitation: async ({ request, locals }) => {
    requireSuperUser(locals);
    const data = await request.formData();
    const invitationId = String(data.get("invitationId") ?? "").trim();
    if (!invitationId) {
      return fail(400, {
        kind: "revokeInvitation",
        success: false,
        message: "Invitation id is required.",
      });
    }

    try {
      await revokeTenantOwnerInvitation(invitationId);
      return { kind: "revokeInvitation", success: true };
    } catch (error) {
      const message = toAccountFlowMessage(error) ?? "Could not revoke invitation.";
      return fail(400, {
        kind: "revokeInvitation",
        success: false,
        message,
      });
    }
  },

  approveAccessRequest: async ({ request, locals }) => {
    const superUser = requireSuperUser(locals);
    const id = String((await request.formData()).get("id") ?? "").trim();
    return await runAccessRequestAction("approveAccessRequest", id, () =>
      approveAccessRequest(superUser, id),
    );
  },

  declineAccessRequest: async ({ request, locals }) => {
    const superUser = requireSuperUser(locals);
    const data = await request.formData();
    const id = String(data.get("id") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim() || null;
    return await runAccessRequestAction("declineAccessRequest", id, () =>
      declineAccessRequest(superUser, id, reason),
    );
  },

  graduateAccessRequest: async ({ request, locals, url }) => {
    const superUser = requireSuperUser(locals);
    const data = await request.formData();
    const id = String(data.get("id") ?? "").trim();
    const tenantName = String(data.get("tenantName") ?? "").trim() || null;
    const existingTenantId = String(data.get("existingTenantId") ?? "").trim() || null;
    const role = String(data.get("role") ?? "").trim() || null;
    return await runAccessRequestAction("graduateAccessRequest", id, () =>
      graduateAccessRequest(superUser, id, {
        tenantName,
        tenant: existingTenantId ? { tenantId: existingTenantId, role } : null,
        origin: url.origin,
      }),
    );
  },
};

async function runAccessRequestAction(
  kind: string,
  id: string,
  run: () => Promise<{ email: string }>,
) {
  if (!id) {
    return fail(400, { kind, success: false, message: "Access request id is required." });
  }
  try {
    const result = await run();
    return { kind, success: true, email: result.email };
  } catch (error) {
    const message = toAccessRequestMessage(error) ?? "Could not update the access request.";
    return fail(400, { kind, success: false, message });
  }
}
