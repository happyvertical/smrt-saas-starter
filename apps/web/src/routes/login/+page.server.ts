import { fail, redirect } from "@sveltejs/kit";
import { AccountFlowError, requestSignInLink } from "$lib/server/accounts";
import { isHappyVerticalIdpEnabled } from "$lib/server/identity-providers";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) {
    throw redirect(303, "/app");
  }
  return {
    errorMessage: url.searchParams.get("error") ?? "",
    returnTo: normalizeReturnTo(url.searchParams.get("returnTo")),
    idpEnabled: isHappyVerticalIdpEnabled(),
  };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = readFormString(form, "email");
    const returnTo = normalizeReturnTo(readFormString(form, "returnTo"));

    try {
      const link = await requestSignInLink({
        email,
        origin: event.url.origin,
        returnTo,
      });
      return {
        email: link.email,
        returnTo,
        message: link.verificationUrl
          ? "Use the local development sign-in link below."
          : "Check your email for a sign-in link.",
        verificationUrl: link.verificationUrl,
        expiresAt: link.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof AccountFlowError) {
        return fail(error.status, { email, returnTo, message: error.message });
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
