#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import {
  hashRoots,
  hashTrackedRoots,
  inputRoots,
  outputRoots,
  provenancePath,
} from "./ci-context-lib.mjs";

const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
if (provenance.schemaVersion !== 1) throw new Error("Unsupported generated-context schema");

const inputs = await hashTrackedRoots(inputRoots);
if (inputs.sha256 !== provenance.inputs.sha256) {
  throw new Error("Generated context input hash does not match the checked-out source");
}

const outputs = await hashRoots(outputRoots);
if (outputs.sha256 !== provenance.outputs.sha256) {
  throw new Error("Generated context output hash does not match its provenance");
}

console.log(`Verified generated context ${inputs.sha256.slice(0, 12)}`);
