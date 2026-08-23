import { createOidcLoginHandler } from "@happyvertical/smrt-users/sveltekit";
import type { RequestHandler } from "@sveltejs/kit";
import { isHappyVerticalIdpEnabled } from "$lib/server/identity-providers";
import { getSmrtConfig } from "$lib/server/smrt";
import { loadStarterConfig } from "$lib/server/starter-config";

await loadStarterConfig();

const oidcLogin = createOidcLoginHandler({
  ...getSmrtConfig("User"),
  callbackPath: (provider) => `/auth/${provider}/callback`,
});

export const GET: RequestHandler = async (event) => {
  if (event.params.provider === "happyvertical" && !isHappyVerticalIdpEnabled()) {
    return new Response("Not Found", { status: 404 });
  }
  return oidcLogin(event as unknown as Parameters<typeof oidcLogin>[0]);
};
