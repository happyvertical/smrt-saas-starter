import { redirect } from "@sveltejs/kit";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  await requirePermission(locals, starterPermissions.fieldPolicyManage);
  throw redirect(308, `/app/settings/signup-form-fields${url.search}`);
};
