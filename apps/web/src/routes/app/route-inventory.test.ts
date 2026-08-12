import { describe, expect, it } from "vitest";
import { APP_NAVIGATION } from "$lib/app-navigation";

describe("authenticated route inventory", () => {
  it("has unique route contracts with visible headings", () => {
    const routes = APP_NAVIGATION.map((route) => route.href);
    expect(new Set(routes).size).toBe(routes.length);
    expect(APP_NAVIGATION.every((route) => route.heading.trim().length > 0)).toBe(true);
  });
});
