import { createOidcLoginHandler } from "@happyvertical/smrt-users/sveltekit";
import { getSmrtConfig } from "$lib/server/smrt";
import { loadStarterConfig } from "$lib/server/starter-config";

await loadStarterConfig();

export const GET = createOidcLoginHandler({
  ...getSmrtConfig("User"),
  callbackPath: (provider) => `/auth/${provider}/callback`,
});
