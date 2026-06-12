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
# Guard for happyvertical/smrt#1507: the bundled server resolves SMRT field
# metadata from build/server/manifest.json (written by the web build step).
# Without it, the production server drops declared fields on create() and
# rejects them in WHERE validation.
test -s build/server/manifest.json
node -e 'const m = require("./build/server/manifest.json"); const n = Object.keys(m.objects ?? {}).length; if (n < 100) { console.error("runtime manifest has only " + n + " objects"); process.exit(1); } console.log("runtime manifest ok: " + n + " objects");'
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
