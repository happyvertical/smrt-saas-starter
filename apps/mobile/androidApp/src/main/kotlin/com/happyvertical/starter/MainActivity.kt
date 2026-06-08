package com.happyvertical.starter

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    title = "SMRT Starter"

    val client = StarterClient()
    val tenant = client.demoTenant()
    val capabilities = client.deviceCapabilities(AndroidDeviceCapabilityAdapter(this))
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(32, 32, 32, 32)
    }
    layout.addLine("SMRT Starter", 24f)
    layout.addLine("OIDC PKCE login starts at ${client.authEndpoints.start}")
    layout.addLine("Session bootstrap uses ${client.authEndpoints.session}")
    layout.addLine("Demo tenant: ${tenant.name} (${tenant.planName})")
    layout.addLine("Device interfaces", 20f)
    capabilities.summaryLines().forEach { line ->
      layout.addLine(line)
    }
    setContentView(layout)
  }

  private fun LinearLayout.addLine(
    value: String,
    size: Float = 16f,
  ) {
    addView(TextView(this@MainActivity).apply {
      text = value
      textSize = size
    })
  }
}
