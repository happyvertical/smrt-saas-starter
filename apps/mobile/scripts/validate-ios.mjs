import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  throw new Error("iOS native validation requires macOS with Xcode and XcodeGen.");
}

const root = fileURLToPath(new URL("..", import.meta.url));
const iosRoot = join(root, "iosApp");

await access(join(iosRoot, "project.yml"));
await access(join(iosRoot, "SmrtStarter/Info.plist"));
await access(join(iosRoot, "SmrtStarter/MobileContract.swift"));
await access(join(iosRoot, "SmrtStarter/SmrtStarterApp.swift"));

run("plutil", ["-lint", "SmrtStarter/Info.plist"]);
run("xcrun", [
  "--sdk",
  "iphonesimulator",
  "swiftc",
  "-parse-as-library",
  "-typecheck",
  "-target",
  "arm64-apple-ios17.0-simulator",
  "SmrtStarter/MobileContract.swift",
  "SmrtStarter/SmrtStarterApp.swift",
]);
run("xcodegen", ["generate"]);
run("xcodebuild", [
  "-project",
  "SmrtStarter.xcodeproj",
  "-scheme",
  "SmrtStarter",
  "-sdk",
  "iphonesimulator",
  "-destination",
  "generic/platform=iOS Simulator",
  "build",
  "CODE_SIGNING_ALLOWED=NO",
]);

console.log("iOS native validation passed.");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: iosRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
