#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRuntimeCandidate, validateRuntimeCandidate } from "./runtime-candidate-lib.mjs";

const [
  sourceCommit,
  testedCommit,
  testedTree,
  webName,
  webDigest,
  workerName,
  workerDigest,
  output = ".ci/runtime-candidate.json",
] = process.argv.slice(2);
const candidate = createRuntimeCandidate({
  sourceCommit,
  testedCommit,
  testedTree,
  web: { name: webName, digest: webDigest },
  worker: { name: workerName, digest: workerDigest },
});
validateRuntimeCandidate(candidate);

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(candidate, null, 2)}\n`);
console.log(`Wrote verified runtime candidate for ${sourceCommit}`);
