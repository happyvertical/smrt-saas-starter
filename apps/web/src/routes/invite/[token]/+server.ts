import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  throw redirect(303, `/signup?invitation=${encodeURIComponent(params.token)}`);
};
