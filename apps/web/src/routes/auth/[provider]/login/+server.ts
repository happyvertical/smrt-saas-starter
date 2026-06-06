import { createOidcLoginHandler } from "@happyvertical/smrt-users/sveltekit";
import { getSmrtConfig } from "$lib/server/smrt";

export const GET = createOidcLoginHandler({
  ...getSmrtConfig("User"),
  callbackPath: (provider) => `/auth/${provider}/callback`,
});
