import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const webTag = process.env.WEB_IMAGE_TAG ?? "smrt-saas-starter-web:local";
const workerTag = process.env.WORKER_IMAGE_TAG ?? "smrt-saas-starter-worker:local";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const webSmoke = `
set -eu
# Guard for happyvertical/smrt#1506 & #1507 (fixed upstream in smrt 0.37.5 via
# smrt#1747): SMRT packages now inline their field metadata into the bundled
# __smrt-register__ chunks at build time (registerPackageManifest(JSON.parse(...))),
# so the production server registers declared fields with no runtime manifest.json
# lookup. A regression (stale smrt, or a bundler change that strips the inline)
# would drop declared fields on create() and reject them in WHERE validation.
# Assert the inlined registration survived bundling into the server chunks.
grep -rq 'registerPackageManifest(JSON.parse' build/server/chunks || { echo "smoke: inlined SMRT field manifest missing from build/server/chunks (smrt#1506/#1507 regression)"; exit 1; }
node build/index.js >/tmp/smrt-web.log 2>&1 &
pid=$!
sleep 3
if ! kill -0 "$pid" 2>/dev/null; then
  cat /tmp/smrt-web.log
  wait "$pid"
  exit $?
fi
kill -TERM "$pid" 2>/dev/null || true
status=0
wait "$pid" || status=$?
cat /tmp/smrt-web.log
if [ "$status" -ne 0 ] && [ "$status" -ne 143 ]; then
  exit "$status"
fi
`;

run("docker", ["run", "--rm", "--entrypoint", "/bin/sh", webTag, "-c", webSmoke]);
run("docker", [
  "run",
  "--rm",
  "--entrypoint",
  "node",
  workerTag,
  "-e",
  "import('./dist/index.js').then(() => console.log('worker import ok'))",
]);

console.log("Runtime image smoke checks passed.");
