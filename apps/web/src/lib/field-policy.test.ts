import { ObjectRegistry } from "@happyvertical/smrt-core";
import { manifest } from "@happyvertical/smrt-virt-manifest";
import { describe, expect, it } from "vitest";
import { getStarterAppSettingDefinition, getStarterAppSettingObjectRef } from "$lib/field-policy";
import "$lib/server/smrt-register";

describe("starter field-policy identity", () => {
  it("uses the generated application object reference", () => {
    const definition = getStarterAppSettingDefinition();
    const manifestEntry = Object.entries(manifest.objects).find(
      ([, object]) =>
        object.collection === "starterappsettings" && object.className === "StarterAppSetting",
    );

    expect(definition.objectRef).toBe("@happyvertical/smrt-saas-web:StarterAppSetting");
    expect(getStarterAppSettingObjectRef()).toBe(manifestEntry?.[0]);
    expect(getStarterAppSettingObjectRef()).toBe("@happyvertical/smrt-saas-web:StarterAppSetting");
    expect(
      ObjectRegistry.getClassByQualifiedName("@happyvertical/smrt-saas-web:StarterAppSetting"),
    ).toBeDefined();
  });
});
