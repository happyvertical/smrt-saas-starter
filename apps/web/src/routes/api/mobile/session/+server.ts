import { error as httpError, json, type RequestHandler } from "@sveltejs/kit";
import {
  destroyMobileSession,
  getMobileSessionBootstrap,
  MobileAuthError,
} from "$lib/server/mobile-auth";

export const GET: RequestHandler = async ({ request }) => {
  try {
    return json(await getMobileSessionBootstrap(request.headers.get("authorization")));
  } catch (error) {
    throw asHttpError(error);
  }
};

export const DELETE: RequestHandler = async ({ request }) => {
  await destroyMobileSession(request.headers.get("authorization"));
  return json({ authenticated: false });
};

function asHttpError(error: unknown): never {
  if (error instanceof MobileAuthError) {
    throw httpError(error.status, error.message);
  }
  throw error;
}
