import { expect, type Page, test } from "@playwright/test";

interface NativeTool {
  name: string;
}

interface NativeModelContext {
  getTools(): Promise<NativeTool[]>;
  executeTool(tool: NativeTool, args: string): Promise<string>;
}

const reportTool = "tenant_activity_report_query";
const deniedTenant = "00000000-0000-4000-8000-000000000099";

async function toolNames(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const context = document.modelContext as unknown as NativeModelContext | undefined;
    return context ? (await context.getTools()).map((tool) => tool.name) : [];
  });
}

async function executeReport(page: Page, args: Record<string, unknown>): Promise<string> {
  return await page.evaluate(
    async ({ name, args }) => {
      const context = document.modelContext as unknown as NativeModelContext | undefined;
      if (!context) throw new Error("WebMCP is unavailable in this browser");
      const tool = (await context.getTools()).find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      return await context.executeTool(tool, JSON.stringify(args));
    },
    { name: reportTool, args },
  );
}

test("report query updates the visible paged, sorted, and filtered table through native WebMCP", async ({
  page,
}) => {
  await page.goto("/app/reports");
  await expect.poll(() => toolNames(page)).toContain(reportTool);

  const raw = await executeReport(page, {
    page: 1,
    pageSize: 1,
    sort: "quantity",
    direction: "asc",
    metricKey: "mcp.calls",
  });
  const result = JSON.parse(raw) as {
    ok: boolean;
    acknowledgement: string;
    report: { rows: Array<Record<string, unknown>>; total: number };
  };

  expect(result).toMatchObject({ ok: true, acknowledgement: "visible_table" });
  expect(result.report.rows).toHaveLength(1);
  expect(Object.keys(result.report.rows[0]).sort()).toEqual([
    "id",
    "metric_key",
    "quantity",
    "window_start",
  ]);
  await expect(page).toHaveURL(/metricKey=mcp\.calls/);
  await expect(page).toHaveURL(/pageSize=1/);
  await expect(page).toHaveURL(/sort=quantity/);
  await expect(page).toHaveURL(/direction=asc/);
  await expect(page.locator("[data-report-webmcp-ack]")).toContainText(
    "Visible activity table updated:",
  );
  await expect(page.locator("[data-report-total]")).toHaveAttribute(
    "data-report-total",
    String(result.report.total),
  );
  await expect(page.getByRole("cell", { name: "mcp.calls" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: String(result.report.rows[0].quantity), exact: true }),
  ).toBeVisible();
});

test("report query sanitizes unsupported controls and rejects a nonmember tenant", async ({
  page,
}) => {
  await page.goto("/app/reports");
  await expect.poll(() => toolNames(page)).toContain(reportTool);

  const forbidden = JSON.parse(
    await executeReport(page, { fields: ["source", "unknown_column"] }),
  ) as { ok: boolean; reason: string };
  expect(forbidden).toEqual({ ok: false, reason: "query_failed" });
  await expect(page).toHaveURL(/\/app\/reports$/);
  await expect(page.locator("[data-report-webmcp-ack]")).toHaveText("");

  // Chromium's WebMCP testing implementation forwards unsupported keys. The
  // server adapter remains the authorization and validation boundary. Generic
  // extras are ignored, while field-selection keys are rejected above.
  const raw = await executeReport(page, {
    tenantId: deniedTenant,
    source: "private",
    page: -1,
    pageSize: 101,
    sort: "source",
    direction: "sideways",
    metricKey: "proof.cross-tenant.private",
  });
  const result = JSON.parse(raw) as {
    report: { page: number; pageSize: number; total: number; rows: unknown[] };
  };
  expect(result.report).toMatchObject({ page: 1, pageSize: 100, total: 0, rows: [] });
  await expect(page).toHaveURL(
    /\/app\/reports\?page=1&pageSize=100&sort=window_start&direction=desc&metricKey=proof\.cross-tenant\.private$/,
  );
  expect(page.url()).not.toContain("tenantId");
  expect(page.url()).not.toContain("source");

  await page.context().addCookies([
    {
      name: "smrt_starter_tenant_id",
      value: deniedTenant,
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const response = await page.goto("/app/reports");
  expect(response?.status()).toBe(403);
  await expect.poll(() => toolNames(page)).not.toContain(reportTool);
});

test("an in-flight report query cannot update the page after its tool unmounts", async ({
  page,
}) => {
  await page.goto("/app/reports");
  await expect.poll(() => toolNames(page)).toContain(reportTool);

  let releaseRequest!: () => void;
  const requestRelease = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let markRequestSeen!: () => void;
  const requestSeen = new Promise<void>((resolve) => {
    markRequestSeen = resolve;
  });
  await page.route("**/api/mcp/call", async (route) => {
    markRequestSeen();
    await requestRelease;
    await route.continue();
  });

  const pendingReport = executeReport(page, { metricKey: "mcp.calls" }).then(
    () => ({ completed: true, error: "" }),
    (error: unknown) => ({ completed: false, error: String(error) }),
  );
  await requestSeen;
  await page.goto("/");
  releaseRequest();

  await expect(pendingReport).resolves.toMatchObject({
    completed: false,
    error: expect.stringContaining("Execution context was destroyed"),
  });
  await expect.poll(() => toolNames(page)).not.toContain(reportTool);
  await expect(page.locator("[data-report-webmcp-ack]")).toHaveCount(0);
});
