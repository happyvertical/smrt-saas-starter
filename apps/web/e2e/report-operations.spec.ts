import { expect, type Page, test } from "@playwright/test";

test.setTimeout(75_000);

test.skip(
  process.env.E2E_PRODUCTION_IMAGE !== "true",
  "Needs the isolated production worker and database.",
);

type Operation = {
  id: string;
  status: string;
  payloadFingerprint: string;
  snapshot?: { rows: Record<string, unknown>[]; total: number };
};
type NativeTool = { name: string };
type NativeContext = {
  getTools(): Promise<NativeTool[]>;
  executeTool(tool: NativeTool, input: string): Promise<string>;
};

async function createThroughUi(page: Page, label: string): Promise<Operation> {
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/reports/operations") && value.request().method() === "POST",
  );
  await page.getByRole("button", { name: label, exact: true }).click();
  const http = await response;
  expect(http.ok()).toBe(true);
  return (await http.json()).operation;
}

async function waitForPrepared(page: Page, id: string) {
  const card = page.locator(`[data-report-operation-id="${id}"]`);
  await expect(async () => {
    await page.getByRole("button", { name: "Refresh operations", exact: true }).click();
    await expect(card.locator("[data-report-operation-status]")).toHaveAttribute(
      "data-report-operation-status",
      "committed",
    );
  }).toPass({ timeout: 45_000, intervals: [500, 1_000, 2_000] });
  return card;
}

test("ordinary report preparation commits an immutable result without approval", async ({
  page,
}) => {
  await page.goto("/app/reports?metricKey=mcp.calls&pageSize=1&sort=quantity&direction=asc");
  const operation = await createThroughUi(page, "Prepare current report");
  expect(operation.status).not.toBe("awaiting_approval");
  const card = await waitForPrepared(page, operation.id);
  await expect(card.getByRole("button", { name: "Approve demo" })).toHaveCount(0);
  const response = await page.request.get(`/api/reports/operations/${operation.id}`);
  expect(response.ok()).toBe(true);
  const prepared = (await response.json()).operation as Operation;
  expect(prepared.snapshot?.rows).toHaveLength(1);
  expect(Object.keys(prepared.snapshot?.rows[0] ?? {}).sort()).toEqual([
    "id",
    "metric_key",
    "quantity",
    "window_start",
  ]);
  await page.reload();
  await expect(page.locator(`[data-report-operation-id="${operation.id}"]`)).toBeVisible();
});

test("synthetic approval requires a real human session and the exact displayed proposal", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/app/reports");
  const pending = await createThroughUi(page, "Start synthetic approval demo");
  expect(pending.status).toBe("awaiting_approval");
  const origin = new URL(baseURL ?? "").origin;
  const denied = await page.request.post(`/api/reports/operations/${pending.id}/decision`, {
    headers: { origin },
    form: { decision: "approve", payloadFingerprint: pending.payloadFingerprint },
  });
  expect(denied.status()).toBe(401);

  const session = process.env.E2E_REPORT_HUMAN_SESSION;
  if (!session) throw new Error("Production runner did not mint the isolated human session.");
  await context.addCookies([
    { name: "sid", value: session, url: origin, httpOnly: true, sameSite: "Lax" },
  ]);
  await page.reload();
  const stale = await page.request.post(`/api/reports/operations/${pending.id}/decision`, {
    headers: { origin },
    form: { decision: "approve", payloadFingerprint: "stale-proposal" },
  });
  expect(stale.status()).toBe(409);
  const card = page.locator(`[data-report-operation-id="${pending.id}"]`);
  await card.getByRole("button", { name: "Approve demo", exact: true }).click();
  await waitForPrepared(page, pending.id);
});

test("native browser tools request, inspect and cancel a demo without an approval capability", async ({
  page,
}) => {
  await page.goto("/app/reports");
  const names = () =>
    page.evaluate(async () => {
      const context = document.modelContext as unknown as NativeContext;
      return (await context.getTools()).map((tool) => tool.name);
    });
  await expect.poll(names).toContain("tenant_activity_report_operation_submit");
  expect(
    (await names()).filter(
      (name) => name.startsWith("tenant_activity_report") && /approve|decline|decision/.test(name),
    ),
  ).toEqual([]);
  const execute = (name: string, input: Record<string, unknown>) =>
    page.evaluate(
      async ({ name, input }) => {
        const context = document.modelContext as unknown as NativeContext;
        const tool = (await context.getTools()).find((value) => value.name === name);
        if (!tool) throw new Error(`Missing tool ${name}`);
        return JSON.parse(await context.executeTool(tool, JSON.stringify(input)));
      },
      { name, input },
    );
  const requested = await execute("tenant_activity_report_operation_submit", {
    kind: "approval-demo",
    requestId: crypto.randomUUID(),
  });
  expect(requested).toMatchObject({
    ok: true,
    acknowledgement: "visible_operation",
    operation: { status: "awaiting_approval" },
  });
  const id = requested.operation.id;
  await expect(page.locator(`[data-report-operation-id="${id}"]`)).toBeVisible();
  expect(await execute("tenant_activity_report_operation_status", { id })).toMatchObject({
    ok: true,
    operation: { id, status: "awaiting_approval" },
  });
  expect(await execute("tenant_activity_report_operation_cancel", { id })).toMatchObject({
    ok: true,
    operation: { id, status: "cancelled" },
  });
  await expect(
    page.locator(`[data-report-operation-id="${id}"] [data-report-operation-status]`),
  ).toHaveAttribute("data-report-operation-status", "cancelled");
});
