import { fail, redirect } from "@sveltejs/kit";
import { submitAccessRequest, toAccessRequestMessage } from "$lib/server/access-requests";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(303, "/app");
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = readFormString(form, "email").trim();
    const name = readFormString(form, "name").trim();
    const company = readFormString(form, "company").trim();
    const message = readFormString(form, "message").trim();

    if (!email) {
      return fail(400, { email, name, company, message, error: "A work email is required." });
    }

    // NOTE: this endpoint is public and unauthenticated. The model de-dups open
    // requests by email, but that is not abuse protection on its own — add
    // rate-limiting at the edge (ingress/CDN) or here before exposing publicly.
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
