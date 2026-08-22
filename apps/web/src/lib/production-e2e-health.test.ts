import { describe, expect, it } from "vitest";
import { isCancelledDocumentDataLoad } from "./production-e2e-health";

describe("isCancelledDocumentDataLoad", () => {
  const origin = "http://127.0.0.1:5173";
  const route = "/app/settings/field-policies";

  it("accepts only the current document's cancelled SvelteKit data load", () => {
    expect(
      isCancelledDocumentDataLoad(
        `${origin}${route}/__data.json?pageSize=50`,
        "net::ERR_ABORTED",
        origin,
        route,
      ),
    ).toBe(true);
  });

  it("keeps cancelled API and other document data requests visible", () => {
    expect(
      isCancelledDocumentDataLoad(`${origin}/api/__data.json`, "net::ERR_ABORTED", origin, route),
    ).toBe(false);
    expect(
      isCancelledDocumentDataLoad(
        `${origin}/app/settings/__data.json`,
        "net::ERR_ABORTED",
        origin,
        route,
      ),
    ).toBe(false);
    expect(
      isCancelledDocumentDataLoad(
        `${origin}${route}/__data.json`,
        "net::ERR_FAILED",
        origin,
        route,
      ),
    ).toBe(false);
  });
});
