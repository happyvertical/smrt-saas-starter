import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
  return {
    tenantId: locals.tenantId ?? "demo",
    userLabel: "Demo Owner",
    activePath: url.pathname,
  };
};
