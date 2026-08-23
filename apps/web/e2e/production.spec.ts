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

for (const route of APP_NAVIGATION) {
  test(`production navigation route ${route.href} loads without server failures`, async ({
    page,
  }) => {
    const assertHealthy = await expectHealthyDocument(page, route.href);
    await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
    await assertHealthy();
  });
}

test("signup-form-fields page loads server data and supports create/update/read", async ({
  page,
}, testInfo) => {
  const assertHealthy = await expectHealthyDocument(page, "/app/settings/signup-form-fields");
  await expect(page.getByRole("heading", { name: "Signup form fields" })).toBeVisible();
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
