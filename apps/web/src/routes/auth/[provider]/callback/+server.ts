import { createOidcCallbackHandler } from "@happyvertical/smrt-users/sveltekit";
import { getSmrtConfig } from "$lib/server/smrt";

export const GET = createOidcCallbackHandler({
  ...getSmrtConfig("User"),
  callbackPath: (provider) => `/auth/${provider}/callback`,
  successRedirect: "/app",
});
