import { withTenant } from "@happyvertical/smrt-tenancy";
import { describe, expect, it } from "vitest";
import { StarterAppSetting } from "../models/StarterAppSetting.js";

class TestStarterAppSetting extends StarterAppSetting {
  stampActor(): void {
    this.stampUpdatedByFromAmbientContext();
  }
}

describe("StarterAppSetting audit attribution", () => {
  it("stamps the actor from the ambient principal instead of caller input", async () => {
    const setting = new TestStarterAppSetting({ updatedByUserId: "forged-user" });

    await withTenant(
      {
        tenantId: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
      },
      async () => setting.stampActor(),
    );

    expect(setting.updatedByUserId).toBe("22222222-2222-4222-8222-222222222222");
  });
});
