import { fail, redirect } from "@sveltejs/kit";
import { AccountFlowError, requestEmailLink } from "$lib/server/accounts";
import { isHappyVerticalWebIdpEnabled } from "$lib/server/identity-providers";
import { getSignupAccessMode } from "$lib/server/invitations";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) {
    throw redirect(303, "/app");
  }
  const signupMode = await getSignupAccessMode();
  return {
    errorMessage: url.searchParams.get("error") ?? "",
    returnTo: normalizeReturnTo(url.searchParams.get("returnTo")),
    idpEnabled: isHappyVerticalWebIdpEnabled(),
    signupMode,
  };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = readFormString(form, "email");
    const tenantName = readFormString(form, "tenantName");
    const returnTo = normalizeReturnTo(readFormString(form, "returnTo"));

    try {
      const link = await requestEmailLink({
        email,
        tenantName,
        origin: event.url.origin,
        returnTo,
      });
      return {
        email: link.email,
        tenantName,
        returnTo,
        message: link.verificationUrl
          ? "Use the local development link below to continue."
          : "Check your email for a link to continue.",
        verificationUrl: link.verificationUrl,
        expiresAt: link.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof AccountFlowError) {
        const signupMode = await getSignupAccessMode();
        const message =
          error.status === 403
            ? signupMode === "request-access"
              ? "Open signup is closed. Request access and an operator will follow up."
              : "Signup is invite-only. Use an invitation link to create a workspace."
            : error.message;
        return fail(error.status, { email, tenantName, returnTo, message });
      }
      throw error;
    }
  },
};

function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function normalizeReturnTo(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}
