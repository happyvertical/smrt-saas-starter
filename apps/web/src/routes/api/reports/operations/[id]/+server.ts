import { json } from "@sveltejs/kit";
import { getReportOperation } from "$lib/server/report-operations";
import type { RequestHandler } from "./$types";
export const GET: RequestHandler = async ({ locals, params }) =>
  json({ operation: await getReportOperation(locals, params.id) });
