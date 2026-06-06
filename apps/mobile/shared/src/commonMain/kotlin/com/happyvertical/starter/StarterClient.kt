package com.happyvertical.starter

data class TenantSummary(
  val id: String,
  val name: String,
  val planName: String,
  val subscriptionStatus: String,
)

class StarterClient {
  fun demoTenant(): TenantSummary = TenantSummary(
    id = "demo",
    name = "Demo Tenant",
    planName = "Growth",
    subscriptionStatus = "active",
  )
}
