import { json, type RequestHandler } from "@sveltejs/kit";

// Unauthenticated liveness + version probe. Deploy pipelines poll this until
// the reported version matches the commit they shipped, so it must stay
// dependency-free: no auth, no membership resolution, no database access.
export const GET: RequestHandler = async () => {
  return json(
    {
      status: "ok",
      version: process.env.APP_VERSION?.trim() || null,
    },
    // Deploy automation polls this to detect rollouts; never let an
    // intermediary cache serve a stale version to the wait loop.
    { headers: { "cache-control": "no-store" } },
  );
};
