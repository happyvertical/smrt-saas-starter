#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  hashRoots,
  hashTrackedRoots,
  inputRoots,
  outputRoots,
  provenancePath,
} from "./ci-context-lib.mjs";

const provenance = {
  schemaVersion: 1,
  sourceCommit: process.env.CI_SOURCE_SHA || process.env.GITHUB_SHA || "local",
  generatedAt: new Date().toISOString(),
  generator: "pnpm ci:context:prepare",
  inputs: await hashTrackedRoots(inputRoots),
  outputs: await hashRoots(outputRoots),
};

await mkdir(dirname(provenancePath), { recursive: true });
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`Prepared generated context ${provenance.inputs.sha256.slice(0, 12)}`);
