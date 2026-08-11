import { defineConfig } from "@playwright/test";

// One suite, selected by environment:
// - Local (default): boots the dev server and runs everything EXCEPT @authed
//   (the dev-auth fallback already covers authenticated flows locally). Set
//   E2E_AUTH_SECRET (+ E2E_USER_EMAIL for a seeded user) to also run @authed
//   via the /api/e2e/session mint endpoint.
// - Remote (PLAYWRIGHT_BASE_URL set): runs against a deployed environment.
//   Deployed envs have real auth, so only @public runs by default; when
//   E2E_AUTH_SECRET is configured, @authed runs too — it mints a real session
//   for the seeded e2e user instead of relying on the dev-auth fallback.
const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const e2eAuthConfigured = Boolean(process.env.E2E_AUTH_SECRET?.trim());
const productionImage = process.env.E2E_PRODUCTION_IMAGE === "true";
const productionRunId = process.env.E2E_PRODUCTION_RUN_ID?.trim();
const productionOrigin = productionImage && remoteBaseUrl ? new URL(remoteBaseUrl) : null;

if (productionImage) {
  if (!productionOrigin) {
    throw new Error("Production-image E2E requires PLAYWRIGHT_BASE_URL.");
  }
  if (
    productionOrigin.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(productionOrigin.hostname)
  ) {
    throw new Error("Production-image E2E mutations are restricted to a loopback HTTP origin.");
  }
  if (!productionRunId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(productionRunId)) {
    throw new Error("Production-image E2E requires a normalized E2E_PRODUCTION_RUN_ID.");
  }
  if (productionRunId.length > 42) {
    throw new Error("Production-image E2E run ids are limited to 42 characters.");
  }
}

export default defineConfig({
  testDir: "e2e",
  ...(productionImage ? { globalSetup: "./e2e/production-global-setup.ts" } : {}),
  ...(productionImage
    ? e2eAuthConfigured
      ? {}
      : { grepInvert: /@authed/u }
    : remoteBaseUrl
      ? { grep: e2eAuthConfigured ? /@public|@authed/u : /@public/u }
      : {
          // Local: only include @authed when the mint endpoint is configured.
          ...(e2eAuthConfigured ? {} : { grepInvert: /@authed/u }),
          webServer: {
            command: "pnpm dev -- --port 5173",
            url: "http://127.0.0.1:5173",
            reuseExistingServer: !process.env.CI,
          },
        }),
  use: {
    baseURL: remoteBaseUrl || "http://127.0.0.1:5173",
    ...(productionOrigin
      ? {
          extraHTTPHeaders: {
            "x-forwarded-host": productionOrigin.host,
            "x-forwarded-proto": productionOrigin.protocol.replace(":", ""),
          },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  outputDir: productionRunId ? `test-results/${productionRunId}` : "test-results",
  reporter: process.env.CI
    ? [
        ["line"],
        [
          "html",
          {
            open: "never",
            ...(productionRunId ? { outputFolder: `playwright-report/${productionRunId}` } : {}),
          },
        ],
      ]
    : "list",
});
