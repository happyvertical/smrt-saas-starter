import { describe, expect, it } from "vitest";
import { isHappyVerticalIdpEnabled } from "./identity-providers";

describe("isHappyVerticalIdpEnabled", () => {
  it("requires an issuer before exposing the provider", () => {
    expect(isHappyVerticalIdpEnabled({})).toBe(false);
    expect(isHappyVerticalIdpEnabled({ SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED: "true" })).toBe(
      false,
    );
  });

  it("enables a configured provider by default", () => {
    expect(
      isHappyVerticalIdpEnabled({
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
  ])("disables a configured provider for %s", (value) => {
    expect(
      isHappyVerticalIdpEnabled({
        HAPPYVERTICAL_IDP_ISSUER: "https://idp.example.test/oauth2/openid/starter",
        SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED: value,
      }),
    ).toBe(false);
  });
});
