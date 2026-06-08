import { error as httpError, json, type RequestHandler } from "@sveltejs/kit";
import { listMobileAuthProviders, MobileAuthError } from "$lib/server/mobile-auth";

export const GET: RequestHandler = async () => {
  try {
    return json({ providers: listMobileAuthProviders() });
  } catch (error) {
    throw asHttpError(error);
  }
};

function asHttpError(error: unknown): Error {
  if (error instanceof MobileAuthError) {
    throw httpError(error.status, error.message);
  }
  throw error;
}
