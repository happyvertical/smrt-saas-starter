import { error as httpError, isHttpError, json, type RequestHandler } from "@sveltejs/kit";
import {
  MobileAuthError,
  type MobileAuthStartRequest,
  startMobileAuth,
} from "$lib/server/mobile-auth";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await readJsonObject(request);
    return json(await startMobileAuth(body));
  } catch (error) {
    throw asHttpError(error);
  }
};

async function readJsonObject(request: Request): Promise<MobileAuthStartRequest> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw httpError(400, "Expected JSON object");
    }
    return body as MobileAuthStartRequest;
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }
    throw httpError(400, "Invalid JSON body");
  }
}

function asHttpError(error: unknown): Error {
  if (error instanceof MobileAuthError) {
    throw httpError(error.status, error.message);
  }
  throw error;
}
