import { type RequestHandler, redirect } from "@sveltejs/kit";
import { clearAccountSession } from "$lib/server/session";

export const POST: RequestHandler = async (event) => {
  await clearAccountSession(event);
  throw redirect(303, "/login");
};
