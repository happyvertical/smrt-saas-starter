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

const val MobileContractVersion = "2026-06-08.v4"

data class MobileTenantSummary(
  val id: String,
  val name: String,
  val slug: String,
  val planName: String,
  val subscriptionStatus: String,
)

data class MobileTenantOption(
  val id: String,
  val name: String,
  val slug: String,
  val roleSlug: String,
  val roleLabel: String,
)

data class MobileUsageThreshold(
  val metricKey: String,
  val label: String,
  val used: Double,
  val limit: Double,
  val action: String,
  val state: String? = null,
  val allowed: Boolean? = null,
  val remaining: Double? = null,
)

data class MobileDashboardPayload(
  val tenant: MobileTenantSummary,
  val thresholds: List<MobileUsageThreshold>,
  val enabledFeatures: List<String>,
  val language: String,
)

data class MobileAuthProviderSummary(
  val id: String,
  val label: String,
  val type: String,
  val supportsPkce: Boolean,
)

data class MobileAuthStartRequest(
  val providerId: String? = null,
  val redirectUri: String,
  val scopes: List<String> = emptyList(),
  val state: String? = null,
  val loginHint: String? = null,
)

data class MobileAuthStartResponse(
  val providerId: String,
  val authorizationUrl: String,
  val state: String,
  val codeVerifier: String? = null,
  val nonce: String? = null,
  val redirectUri: String,
)

data class MobileAuthCompleteRequest(
  val providerId: String? = null,
  val code: String,
  val state: String? = null,
  val codeVerifier: String? = null,
  val redirectUri: String,
)

data class MobileUserSummary(
  val id: String,
  val email: String,
  val label: String,
)

data class MobileAuthSession(
  val accessToken: String,
  val tokenType: String,
  val expiresAt: String,
  val user: MobileUserSummary,
  val activeTenant: MobileTenantOption,
  val tenants: List<MobileTenantOption>,
)

data class MobileSessionBootstrap(
  val user: MobileUserSummary,
  val activeTenant: MobileTenantOption,
  val tenants: List<MobileTenantOption>,
  val dashboard: MobileDashboardPayload,
)

data class MobileDevicePermissionState(
  val status: String,
  val canRequest: Boolean,
  val reason: String? = null,
)

data class MobileDeviceCapability(
  val surface: String,
  val label: String,
  val supported: Boolean,
  val permission: MobileDevicePermissionState,
  val preferredInput: String,
)

data class MobileDeviceCapabilities(
  val camera: MobileDeviceCapability,
  val microphone: MobileDeviceCapability,
  val checkedAtEpochMillis: Long? = null,
)
`,
);

await writeFile(
  jsonOut,
  JSON.stringify(
    {
      version: "2026-06-08.v4",
      generatedAt: new Date(0).toISOString(),
      models: [
        "MobileTenantSummary",
        "MobileTenantOption",
        "MobileUsageThreshold",
        "MobileDashboardPayload",
        "MobileAuthProviderSummary",
        "MobileAuthStartRequest",
        "MobileAuthStartResponse",
        "MobileAuthCompleteRequest",
        "MobileUserSummary",
        "MobileAuthSession",
        "MobileSessionBootstrap",
        "MobileDevicePermissionState",
        "MobileDeviceCapability",
        "MobileDeviceCapabilities",
      ],
    },
    null,
    2,
  ),
);

console.log(`Generated mobile contract in ${generatedRoot}`);
