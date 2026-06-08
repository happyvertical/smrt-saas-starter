import { type RequestHandler, redirect } from "@sveltejs/kit";
import { AccountFlowError, verifySignInLink } from "$lib/server/accounts";
import { startAccountSession } from "$lib/server/session";

export const GET: RequestHandler = async (event) => {
  const token = event.url.searchParams.get("token") ?? "";
  const returnTo = normalizeReturnTo(event.url.searchParams.get("returnTo"));

  try {
    const target = await verifySignInLink(token);
    await startAccountSession(event, target);
  } catch (error) {
    if (error instanceof AccountFlowError) {
      throw redirect(303, buildLoginUrl(returnTo, error.message));
    }
    throw error;
  }

  throw redirect(303, returnTo);
};

function buildLoginUrl(returnTo: string, message: string): string {
  const url = new URL("http://local/login");
  url.pathname = "/login";
  if (returnTo !== "/app") {
    url.searchParams.set("returnTo", returnTo);
  }
  url.searchParams.set("error", message);
  return `${url.pathname}${url.search}`;
}

function normalizeReturnTo(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}
