package com.happyvertical.starter

data class AuthEndpointSet(
  val providers: String,
  val start: String,
  val complete: String,
  val session: String,
)

class StarterClient(private val baseUrl: String = "http://localhost:5173") {
  val authEndpoints: AuthEndpointSet
    get() {
      val api = baseUrl.trimEnd('/') + "/api/mobile"
      return AuthEndpointSet(
        providers = "$api/auth/providers",
        start = "$api/auth/start",
        complete = "$api/auth/complete",
        session = "$api/session",
      )
    }

  fun bearerHeader(accessToken: String): Pair<String, String> =
    "Authorization" to "Bearer $accessToken"

  fun deviceCapabilities(
    adapter: DeviceCapabilityAdapter = NoopDeviceCapabilityAdapter,
  ): MobileDeviceCapabilities = adapter.currentCapabilities()

  fun demoTenant(): MobileTenantSummary = MobileTenantSummary(
    id = "demo",
    name = "Demo Tenant",
    slug = "demo-tenant",
    planName = "Growth",
    subscriptionStatus = "active",
  )
}
