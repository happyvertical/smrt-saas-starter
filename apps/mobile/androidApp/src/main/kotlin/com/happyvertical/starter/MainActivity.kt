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
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(32, 32, 32, 32)
    }
    layout.addView(TextView(this).apply {
      text = "SMRT Starter"
      textSize = 24f
    })
    layout.addView(TextView(this).apply {
      text = "OIDC PKCE login starts at ${client.authEndpoints.start}"
      textSize = 16f
    })
    layout.addView(TextView(this).apply {
      text = "Session bootstrap uses ${client.authEndpoints.session}"
      textSize = 16f
    })
    layout.addView(TextView(this).apply {
      text = "Demo tenant: ${tenant.name} (${tenant.planName})"
      textSize = 16f
    })
    setContentView(layout)
  }
}
