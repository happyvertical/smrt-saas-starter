import { fail, redirect } from "@sveltejs/kit";
import { AccountFlowError, onboardTenant } from "$lib/server/accounts";
import {
  getSignupAccessMode,
  toAccountFlowMessage,
  validateTenantOwnerInvitationToken,
} from "$lib/server/invitations";
import { startAccountSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) {
    throw redirect(303, "/app");
  }

  const signupMode = await getSignupAccessMode();
  const invitationToken = readInviteToken(url.searchParams);
  const invitationResult = invitationToken
    ? await validateTenantOwnerInvitationToken(invitationToken).catch((error: unknown) => ({
        error: toAccountFlowMessage(error) ?? "Invitation could not be validated.",
      }))
    : null;
  const invitationValid = Boolean(invitationResult && !("error" in invitationResult));
  const invitationEmail =
    invitationResult && !("error" in invitationResult) ? invitationResult.email : "";
  const invitationError =
    invitationResult && "error" in invitationResult ? invitationResult.error : "";

  return {
    signupMode,
    invitationToken,
    invitationValid,
    invitationEmail,
    invitationError,
    canSignup: signupMode === "public" || invitationValid,
  };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = readFormString(form, "email");
    const tenantName = readFormString(form, "tenantName");
    const invitationToken = readFormString(form, "invitationToken").trim();
    const signupMode = await getSignupAccessMode();

    if (signupMode !== "public" && !invitationToken) {
      return fail(403, {
        email,
        tenantName,
        message:
          signupMode === "request-access"
            ? "Open signup is closed. Request access and an operator will follow up."
            : "Signup is invite-only. Use an invitation link to create a workspace.",
      });
    }

    let target: Awaited<ReturnType<typeof onboardTenant>>;
    try {
      target = await onboardTenant({ email, tenantName, invitationToken });
    } catch (error) {
      if (error instanceof AccountFlowError) {
        return fail(error.status, { email, tenantName, message: error.message });
      }
      throw error;
    }

    await startAccountSession(event, target);
    throw redirect(303, "/app");
  },
};

function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function readInviteToken(searchParams: URLSearchParams): string {
  return searchParams.get("invitation")?.trim() || searchParams.get("invite")?.trim() || "";
}
