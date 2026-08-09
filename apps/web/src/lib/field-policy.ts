import {
  assertObjectFormCollectionDefinition,
  type ObjectFormCollectionDefinition,
} from "@happyvertical/smrt-fields/svelte";
import { manifest } from "@happyvertical/smrt-virt-manifest";
import { getCollectionDefinition } from "@happyvertical/smrt-virt-web";

export const starterAppSettingsCollectionName = "starterappsettings";

/**
 * Read the object identity from the generated collection definition instead of
 * duplicating a package-qualified name that can differ from the Vite scanner's
 * application registration.
 */
export function getStarterAppSettingDefinition(): ObjectFormCollectionDefinition {
  const definition = getCollectionDefinition(starterAppSettingsCollectionName);
  assertObjectFormCollectionDefinition(definition);
  return definition;
}

export function getStarterAppSettingObjectRef(): string {
  const entry = Object.entries(manifest.objects).find(
    ([, object]) =>
      object.collection === starterAppSettingsCollectionName &&
      object.className === "StarterAppSetting",
  );
  const objectRef = entry?.[0];
  if (!objectRef?.includes(":")) {
    throw new Error(
      "Generated StarterAppSetting manifest is missing its qualified object reference.",
    );
  }
  return objectRef;
}
