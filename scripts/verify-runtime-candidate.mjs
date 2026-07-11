#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { validateRuntimeCandidate } from "./runtime-candidate-lib.mjs";

const [path = ".ci/runtime-candidate.json", expectedCommit = process.env.GITHUB_SHA] =
  process.argv.slice(2);
const candidate = JSON.parse(await readFile(path, "utf8"));
validateRuntimeCandidate(candidate, { expectedCommit });
console.log(`Verified runtime candidate for ${candidate.sourceCommit}`);
