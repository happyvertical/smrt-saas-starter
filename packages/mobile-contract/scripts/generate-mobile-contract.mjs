import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedRoot = join(packageRoot, "generated");
const kotlinOut = join(generatedRoot, "kotlin/com/happyvertical/starter/Contract.kt");
const jsonOut = join(generatedRoot, "mobile-contract.json");

await mkdir(dirname(kotlinOut), { recursive: true });

await writeFile(
  kotlinOut,
  `package com.happyvertical.starter

const val MobileContractVersion = "2026-06-06.v1"

data class MobileTenantSummary(
  val id: String,
  val name: String,
  val slug: String,
  val planName: String,
  val subscriptionStatus: String,
)

data class MobileUsageThreshold(
  val metricKey: String,
  val label: String,
  val used: Double,
  val limit: Double,
  val action: String,
)
`,
);

await writeFile(
  jsonOut,
  JSON.stringify(
    {
      version: "2026-06-06.v1",
      generatedAt: new Date(0).toISOString(),
      models: ["MobileTenantSummary", "MobileUsageThreshold", "MobileDashboardPayload"],
    },
    null,
    2,
  ),
);

console.log(`Generated mobile contract in ${generatedRoot}`);
