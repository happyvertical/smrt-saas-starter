import { describe, expect, it } from "vitest";
import { isHappyVerticalIdpEnabled, isHappyVerticalWebIdpEnabled } from "./identity-providers";

describe("isHappyVerticalIdpEnabled", () => {
  it("enables the provider by default", () => {
    expect(isHappyVerticalIdpEnabled({})).toBe(true);
    expect(isHappyVerticalIdpEnabled({ SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED: "true" })).toBe(
      true,
    );
  });

  it("requires an issuer before exposing the browser provider", () => {
    expect(isHappyVerticalWebIdpEnabled({})).toBe(false);
    expect(
      isHappyVerticalWebIdpEnabled({
        HAPPYVERTICAL_IDP_ISSUER: "https://idp.example.test/oauth2/openid/starter",
      }),
    ).toBe(true);
  });

  it.each([
    "0",
    "false",
    "no",
    "off",
    " FALSE ",
  ])("disables every HappyVertical identity flow for %s", (value) => {
    expect(
      isHappyVerticalIdpEnabled({
        SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED: value,
      }),
    ).toBe(false);
    expect(
      isHappyVerticalWebIdpEnabled({
        HAPPYVERTICAL_IDP_ISSUER: "https://idp.example.test/oauth2/openid/starter",
        SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED: value,
      }),
    ).toBe(false);
  });
});
