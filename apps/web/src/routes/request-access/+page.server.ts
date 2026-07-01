import { fail, redirect } from "@sveltejs/kit";
import { submitAccessRequest, toAccessRequestMessage } from "$lib/server/access-requests";
import { requestAccessRateLimiter } from "$lib/server/rate-limit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(303, "/app");
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    const form = await request.formData();
    const email = readFormString(form, "email").trim();
    const name = readFormString(form, "name").trim();
    const company = readFormString(form, "company").trim();
    const message = readFormString(form, "message").trim();

    if (!email) {
      return fail(400, { email, name, company, message, error: "A work email is required." });
    }

    // This endpoint is public and unauthenticated. The model de-dups open
    // requests by email, but that is not abuse protection on its own. Bound
    // floods per-instance by client IP and email — this is defense-in-depth;
    // multi-replica / production deployments MUST also rate-limit at the
    // edge/ingress (the in-memory limiter is not shared across replicas). See
    // $lib/server/rate-limit.ts.
    const ipLimit = requestAccessRateLimiter.check(`ip:${getClientAddress()}`);
    const emailLimit = requestAccessRateLimiter.check(`email:${email.toLowerCase()}`);
    if (!ipLimit.ok || !emailLimit.ok) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
      return fail(429, {
        email,
        name,
        company,
        message,
        error: `Too many requests. Please try again in ${retryAfter} seconds.`,
      });
    }

    try {
      await submitAccessRequest({ email, name, company, message });
    } catch (error) {
      const friendly = toAccessRequestMessage(error);
      if (friendly) {
        return fail(400, { email, name, company, message, error: friendly });
      }
      throw error;
    }

    return { submitted: true, email };
  },
};

function readFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
