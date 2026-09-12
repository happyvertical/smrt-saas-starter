import { error } from "@sveltejs/kit";
import { downloadActivityReportExport } from "$lib/server/report-actions";
import { isUuid } from "$lib/server/starter-data";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!params.id || !isUuid(params.id)) throw error(404, "Report export not found");
  return await downloadActivityReportExport(locals, params.id);
};
