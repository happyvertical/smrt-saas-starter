import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await access(join(root, "gradlew"));
await access(join(root, "gradle/wrapper/gradle-wrapper.properties"));
await access(join(root, "androidApp/build.gradle.kts"));
await access(join(root, "shared/build.gradle.kts"));

const androidSdk = firstExisting([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  "/usr/local/lib/android/sdk",
  "/opt/homebrew/share/android-commandlinetools",
]);

if (!androidSdk) {
  throw new Error(
    "Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT before running native Android validation.",
  );
}

const javaHome = findJava21Home();
if (!javaHome) {
  throw new Error(
    "Java 21 not found. Set JAVA_HOME to a Java 21 runtime before running native Android validation.",
  );
}

run("./gradlew", ["--no-daemon", ":androidApp:assembleDebug"], {
  ANDROID_HOME: androidSdk,
  ANDROID_SDK_ROOT: androidSdk,
  JAVA_HOME: javaHome,
});

console.log("Android native validation passed.");

function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate));
}

function findJava21Home() {
  for (const candidate of javaHomeCandidates()) {
    if (candidate && javaMajorVersion(candidate) === 21) {
      return candidate;
    }
  }

  return undefined;
}

function javaHomeCandidates() {
  return [
    process.env.JAVA_HOME,
    process.env.JAVA21_HOME,
    process.env.JDK_21,
    process.env.JAVA_HOME_21_X64,
    macJavaHome("21"),
    "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home",
    "/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home",
    "/usr/lib/jvm/temurin-21-jdk-amd64",
    "/usr/lib/jvm/java-21-openjdk-amd64",
    ...nixJava21Candidates(),
  ];
}

function javaMajorVersion(javaHome) {
  const javaBinary = join(javaHome, "bin/java");
  if (!existsSync(javaBinary)) {
    return undefined;
  }

  const result = spawnSync(javaBinary, ["-version"], {
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;
  const version = output.match(/version "(\d+)/)?.[1];
  return version ? Number.parseInt(version, 10) : undefined;
}

function macJavaHome(version) {
  if (process.platform !== "darwin") {
    return undefined;
  }

  const result = spawnSync("/usr/libexec/java_home", ["-v", version], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function nixJava21Candidates() {
  try {
    return readdirSync("/nix/store").flatMap((entry) => {
      if (!entry.includes("jdk-21")) {
        return [];
      }

      const storePath = join("/nix/store", entry);
      return [
        storePath,
        join(storePath, "lib/openjdk"),
        join(storePath, "Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home"),
      ];
    });
  } catch {
    return [];
  }
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
