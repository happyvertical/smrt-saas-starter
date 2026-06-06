plugins {
  kotlin("multiplatform")
  id("com.android.library")
}

kotlin {
  androidTarget()
  iosX64()
  iosArm64()
  iosSimulatorArm64()

  sourceSets {
    val commonMain by getting
    val commonTest by getting
  }
}

android {
  namespace = "com.happyvertical.starter.shared"
  compileSdk = 36
}
