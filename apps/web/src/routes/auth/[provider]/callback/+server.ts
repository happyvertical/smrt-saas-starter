import { createOidcCallbackHandler } from "@happyvertical/smrt-users/sveltekit";
import type { RequestHandler } from "@sveltejs/kit";
import { getSmrtConfig } from "$lib/server/smrt";
import { loadStarterConfig } from "$lib/server/starter-config";

await loadStarterConfig();

const oidcCallback = createOidcCallbackHandler({
  ...getSmrtConfig("User"),
  callbackPath: (provider) => `/auth/${provider}/callback`,
  successRedirect: "/app",
});

export const GET: RequestHandler = async (event) =>
  oidcCallback(event as unknown as Parameters<typeof oidcCallback>[0]);
