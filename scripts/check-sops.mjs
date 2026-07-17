import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sops = await readFile(join(root, ".sops.yaml"), "utf8");
const secret = await readFile(join(root, "manifests/base/app.secret.yaml"), "utf8");

if (!sops.includes("manifests/.*\\.secret\\.ya?ml")) {
  throw new Error(".sops.yaml must cover manifest secret files");
}

if (!secret.includes("sops:")) {
  throw new Error("manifest secret placeholders must be SOPS-encrypted before deploy");
}

console.log("SOPS configuration and secret placeholders are present.");
