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
  "androidApp/src/main/kotlin/com/happyvertical/starter/AndroidDeviceCapabilityAdapter.kt",
  "shared/src/commonMain/kotlin/com/happyvertical/starter/DeviceCapabilities.kt",
  "shared/src/commonMain/kotlin/com/happyvertical/starter/StarterClient.kt",
  "iosApp/Info.plist",
  "iosApp/SmrtStarterApp.swift",
];

for (const file of required) {
  await access(join(root, file));
}

const readme = await readFile(join(root, "README.md"), "utf8");
if (
  !readme.includes("Kotlin Multiplatform") ||
  !readme.includes("SwiftUI") ||
  !readme.includes("microphone") ||
  !readme.includes("camera")
) {
  throw new Error("Mobile README must document KMP and native shell strategy");
}

const sharedCapabilities = await readFile(
  join(root, "shared/src/commonMain/kotlin/com/happyvertical/starter/DeviceCapabilities.kt"),
  "utf8",
);
if (!sharedCapabilities.includes("DeviceCapabilityAdapter")) {
  throw new Error("Shared mobile code must define the device capability adapter boundary");
}

const androidManifest = await readFile(
  join(root, "androidApp/src/main/AndroidManifest.xml"),
  "utf8",
);
if (
  !androidManifest.includes("android.permission.CAMERA") ||
  !androidManifest.includes("android.permission.RECORD_AUDIO") ||
  !androidManifest.includes('android.hardware.camera.any" android:required="false"') ||
  !androidManifest.includes('android.hardware.microphone" android:required="false"')
) {
  throw new Error("Android shell must declare optional camera and microphone access");
}

const androidAdapter = await readFile(
  join(
    root,
    "androidApp/src/main/kotlin/com/happyvertical/starter/AndroidDeviceCapabilityAdapter.kt",
  ),
  "utf8",
);
if (
  !androidAdapter.includes("FEATURE_CAMERA_ANY") ||
  !androidAdapter.includes("FEATURE_MICROPHONE")
) {
  throw new Error("Android shell must expose native camera and microphone capability checks");
}

const iosApp = await readFile(join(root, "iosApp/SmrtStarterApp.swift"), "utf8");
if (
  !iosApp.includes("DeviceCapabilityBridge") ||
  !iosApp.includes("AVCaptureDevice.authorizationStatus")
) {
  throw new Error("iOS shell must expose native camera and microphone capability checks");
}

const iosPlist = await readFile(join(root, "iosApp/Info.plist"), "utf8");
if (
  !iosPlist.includes("NSCameraUsageDescription") ||
  !iosPlist.includes("NSMicrophoneUsageDescription")
) {
  throw new Error("iOS shell must declare camera and microphone usage descriptions");
}

console.log("Mobile shell validation passed.");
