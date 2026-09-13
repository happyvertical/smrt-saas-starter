import {
  type ConsoleMessage,
  expect,
  type Page,
  type Request,
  type Response,
  test,
} from "@playwright/test";
import { APP_NAVIGATION } from "../src/lib/app-navigation";
import { isCancelledDocumentDataLoad } from "../src/lib/production-e2e-health";

test.skip(
  process.env.E2E_PRODUCTION_IMAGE !== "true",
  "production contracts run only against the built image",
);

async function expectHealthyDocument(page: Page, route: string): Promise<() => Promise<void>> {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const serverResponses: string[] = [];
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173").origin;

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onRequestFailed = (request: Request) => {
    const errorText = request.failure()?.errorText;
    const requestUrl = new URL(request.url());
    if (
      requestUrl.origin === origin &&
      !isCancelledDocumentDataLoad(request.url(), errorText, origin, route)
    ) {
      failedRequests.push(`${request.method()} ${request.url()}: ${errorText}`);
    }
  };
  const onResponse = (response: Response) => {
    if (response.url().startsWith(origin) && response.status() >= 500) {
      serverResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  };
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response?.status(), `${route} did not return its intended document`).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  return async () => {
    try {
      await page.waitForLoadState("networkidle");
      expect(serverResponses, `same-origin 5xx responses on ${route}`).toEqual([]);
      expect(failedRequests, `failed same-origin requests on ${route}`).toEqual([]);
      expect(consoleErrors, `browser console errors on ${route}`).toEqual([]);
    } finally {
      page.off("console", onConsole);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    }
  };
}

test("production image serves the public entry and unified email contract", async ({ page }) => {
  const assertPublicHealthy = await expectHealthyDocument(page, "/");
  await expect(
    page.getByRole("heading", { name: "Build the SaaS beneath your next product." }),
  ).toBeVisible();
  await assertPublicHealthy();

  const assertLoginHealthy = await expectHealthyDocument(page, "/login");
  await expect(page.getByRole("heading", { name: "Continue with email." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
  await assertLoginHealthy();
});

test("production report actions queue a refresh and serve tenant-bound CSV and JSON exports", async ({
  page,
}) => {
  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Tenant activity reports" })).toBeVisible();

  const reportActions = page.locator(".report-actions");
  await reportActions.getByRole("button", { name: "Preview refresh" }).click();
  await expect(reportActions.getByRole("status")).toHaveText("Refresh is ready to queue");
  await reportActions.getByRole("button", { name: "Queue refresh" }).click();
  await expect(reportActions.getByRole("status")).toContainText("Refresh queued (");

  await waitForMaterializedSeed(page);
  await page.goto("/app/reports?metricKey=mcp.calls");
  const csvDownload = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/reports/activity/exports/") &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csvResponse = await csvDownload;
  const csvBytes = (await csvResponse.body()).toString();
  expect(csvResponse.ok(), csvBytes).toBeTruthy();
  expect(csvResponse.headers()["content-type"]).toContain("text/csv");
  expect(csvResponse.headers()["content-disposition"]).toContain("attachment");
  expect(csvBytes.trim().split("\n")).toEqual([
    "id,metric_key,window_start,quantity",
    expect.stringMatching(/^[^,]+,mcp\.calls,[^,]+,128$/u),
  ]);

  const json = await requestMaterializedExport(page, "json");
  const jsonDownload = await page.request.get(json.downloadUrl);
  const jsonBytes = await jsonDownload.text();
  expect(jsonDownload.ok(), jsonBytes).toBeTruthy();
  expect(jsonDownload.headers()["content-type"]).toContain("application/json");
  expect(jsonDownload.headers()["content-disposition"]).toContain("attachment");
  const payload = JSON.parse(jsonBytes) as { rows: unknown[]; total: number; asOf: string };
  expect(payload.rows).toEqual([
    expect.objectContaining({ metric_key: "mcp.calls", quantity: 128 }),
  ]);
  expect(payload.total).toBe(1);
  expect(payload.asOf).toEqual(expect.any(String));

  // The demo owner has no membership in this tenant. The download route must
  // re-read active tenant authority instead of trusting the artifact URL.
  await page.context().addCookies([
    {
      name: "smrt_starter_tenant_id",
      value: "00000000-0000-4000-8000-000000000099",
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const denied = await page.request.get(json.downloadUrl);
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain("metric_key");
});

async function waitForMaterializedSeed(page: Page) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/app/reports?metricKey=mcp.calls");
        const document = await response.text();
        return response.ok() && document.includes("mcp.calls") && document.includes("128");
      },
      { timeout: 45_000 },
    )
    .toBe(true);
}

async function requestMaterializedExport(page: Page, format: "csv" | "json") {
  const response = await page.request.post("/api/reports/activity/export", {
    data: { phase: "apply", format, query: { metricKey: "mcp.calls" } },
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBeTruthy();
  const result = JSON.parse(responseBody) as { downloadUrl?: unknown };
  expect(result.downloadUrl).toEqual(expect.any(String));
  return { downloadUrl: result.downloadUrl as string };
}

for (const route of APP_NAVIGATION) {
  test(`production navigation route ${route.href} loads without server failures`, async ({
    page,
  }) => {
    const assertHealthy = await expectHealthyDocument(page, route.href);
    await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
    await assertHealthy();
  });
}

test("signup-form page loads server data and supports create/update/read", async ({
  page,
}, testInfo) => {
  const assertHealthy = await expectHealthyDocument(page, "/app/settings/signup-form-fields");
  await expect(page.getByRole("heading", { name: "Signup form" })).toBeVisible();
  await expect(page.getByText("Stable application setting identifier.")).toBeVisible();
  await page.getByRole("link", { name: /Value StarterAppSetting/u }).click();
  await expect(
    page.getByText("Value applied by the starter application for this setting."),
  ).toBeVisible();

  const objectRef = "@happyvertical/smrt-saas-web:StarterAppSetting";
  const fieldName = ["metadata", "updatedByUserId", "value", "key"][testInfo.retry] ?? "metadata";
  const runId = process.env.E2E_PRODUCTION_RUN_ID;
  if (!runId) throw new Error("E2E_PRODUCTION_RUN_ID is required for mutation isolation.");
  const createdLabel = `Production E2E ${runId} created label`;
  const updatedLabel = `Production E2E ${runId} updated label`;
  const created = await page.request.post("/api/field-policies", {
    data: {
      objectRef,
      fieldName,
      scopeType: "tenant",
      defaultValue: null,
      displayOrder: 77,
      help: "Created by the hermetic production E2E suite.",
      label: createdLabel,
      locked: false,
      visibility: "advanced",
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = (await created.json()) as { id: string | null };
  expect(id).toBeTruthy();
  try {
    const updated = await page.request.put(`/api/field-policies/${id}`, {
      data: {
        objectRef,
        fieldName,
        scopeType: "tenant",
        defaultValue: null,
        displayOrder: 78,
        help: "Updated by the hermetic production E2E suite.",
        label: updatedLabel,
        locked: false,
        visibility: "advanced",
      },
    });
    expect(updated.ok(), await updated.text()).toBeTruthy();

    const editorState = await page.request.post("/api/field-policies/editor-state", {
      data: { objectRef },
    });
    expect(editorState.ok(), await editorState.text()).toBeTruthy();
    expect(await editorState.text()).toContain(updatedLabel);
  } finally {
    try {
      if (id) {
        const deleted = await page.request.delete(`/api/field-policies/${id}`);
        expect(deleted.ok(), await deleted.text()).toBeTruthy();
        const editorStateAfterDelete = await page.request.post("/api/field-policies/editor-state", {
          data: { objectRef },
        });
        expect(editorStateAfterDelete.ok(), await editorStateAfterDelete.text()).toBeTruthy();
        expect(await editorStateAfterDelete.text()).not.toContain(updatedLabel);
      }
    } finally {
      await assertHealthy();
    }
  }
});
