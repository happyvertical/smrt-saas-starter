import { fail } from "@sveltejs/kit";
import {
  createTenantOwnerInvitation,
  getSignupAccessMode,
  listTenantOwnerInvitations,
  revokeTenantOwnerInvitation,
  setSignupAccessMode,
  toAccountFlowMessage,
} from "$lib/server/invitations";
import { requireSuperUser } from "$lib/server/super-users";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const superUser = requireSuperUser(locals);

  return {
    superUser,
    signupMode: await getSignupAccessMode(),
    invitations: await listTenantOwnerInvitations(),
  };
};

export const actions: Actions = {
  setSignupMode: async ({ request, locals }) => {
    const superUser = requireSuperUser(locals);
    const data = await request.formData();
    const mode = String(data.get("signupMode") ?? "public");

    try {
      const signupMode = await setSignupAccessMode(mode, superUser.userId);
      return { kind: "signupMode", success: true, signupMode };
    } catch (error) {
      console.error("[admin] Failed to update signup mode:", error);
      return fail(500, {
        kind: "signupMode",
        success: false,
        message: "Could not update signup mode.",
      });
    }
  },

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
};
