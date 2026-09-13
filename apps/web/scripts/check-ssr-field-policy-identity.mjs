import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { ObjectRegistry } from "@happyvertical/smrt-core";

const expectedTableName = "_smrt_field_policies";
const chunksDirectory = new URL("../.svelte-kit/output/server/chunks/", import.meta.url);
const chunkName = (await readdir(chunksDirectory)).find((name) =>
  name.startsWith("FieldPolicyCollection-"),
);

assert.ok(chunkName, "The SSR build did not emit the FieldPolicy collection chunk.");
await import(new URL("../.svelte-kit/output/server/entries/hooks.server.js", import.meta.url).href);
const chunk = await import(new URL(chunkName, chunksDirectory).href);
const exportedClasses = Object.values(chunk).filter(
  (value) =>
    typeof value === "function" &&
    (value.name === "FieldPolicy" || value.name === "FieldPolicyCollection"),
);

assert.equal(
  exportedClasses.length,
  2,
  "The SSR bundle must export FieldPolicy and its collection.",
);
assert.equal(
  ObjectRegistry.getSchema("@happyvertical/smrt-fields:FieldPolicy")?.tableName,
  expectedTableName,
  "Generated SSR registration must retain the fields provider schema.",
);
for (const exportedClass of exportedClasses) {
  assert.equal(
    new exportedClass().tableName,
    expectedTableName,
    `Compiled ${exportedClass.name} must retain the canonical field-policy table.`,
  );
}

console.log("SSR FieldPolicy identity check passed.");
