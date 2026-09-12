import { parseFieldPolicyCatalogQuery } from "@happyvertical/smrt-fields";
import { requirePermission, starterPermissions } from "$lib/server/authz";
import { loadFieldPolicySettings } from "$lib/server/field-policy";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  const membership = await requirePermission(locals, starterPermissions.fieldPolicyManage);
  return {
    permissions: membership.permissions,
    fieldPolicies: await loadFieldPolicySettings(
      membership,
      parseFieldPolicyCatalogQuery(url.searchParams),
    ),
  };
};
