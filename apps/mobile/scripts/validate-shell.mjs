import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const required = [
  "settings.gradle.kts",
  "build.gradle.kts",
  "shared/build.gradle.kts",
  "androidApp/build.gradle.kts",
  "androidApp/src/main/AndroidManifest.xml",
  "androidApp/src/main/res/values/styles.xml",
  "shared/src/commonMain/kotlin/com/happyvertical/starter/StarterClient.kt",
  "iosApp/SmrtStarterApp.swift",
];

for (const file of required) {
  await access(join(root, file));
}

const readme = await readFile(join(root, "README.md"), "utf8");
if (!readme.includes("Kotlin Multiplatform") || !readme.includes("SwiftUI")) {
  throw new Error("Mobile README must document KMP and native shell strategy");
}

console.log("Mobile shell validation passed.");
