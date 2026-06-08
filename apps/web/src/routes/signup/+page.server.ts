import { fail, redirect } from "@sveltejs/kit";
import { AccountFlowError, onboardTenant } from "$lib/server/accounts";
import { startAccountSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(303, "/app");
  }
  return {};
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = readFormString(form, "email");
    const tenantName = readFormString(form, "tenantName");

    let target: Awaited<ReturnType<typeof onboardTenant>>;
    try {
      target = await onboardTenant({ email, tenantName });
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
