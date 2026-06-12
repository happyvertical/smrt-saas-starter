import { defineConfig } from "@playwright/test";

// Two targets, one suite:
// - Local (default): boots the dev server and runs everything, including
//   flows that rely on the non-production dev-auth fallback.
// - Remote (PLAYWRIGHT_BASE_URL set): runs against a deployed environment and
//   only executes tests tagged @public — deployed environments have real auth,
//   so dev-auth-dependent flows cannot pass there.
const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();

export default defineConfig({
  testDir: "e2e",
  ...(remoteBaseUrl
    ? { grep: /@public/ }
    : {
        webServer: {
          command: "pnpm dev -- --port 5173",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
        },
      }),
  use: {
    baseURL: remoteBaseUrl || "http://127.0.0.1:5173",
  },
});
