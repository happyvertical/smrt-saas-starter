plugins {
  id("com.android.application")
  kotlin("android")
}

android {
  namespace = "com.happyvertical.starter"
  compileSdk = 36

  defaultConfig {
    applicationId = "com.happyvertical.starter"
    minSdk = 26
    targetSdk = 36
    versionCode = 1
    versionName = "0.1.0"
  }
}

dependencies {
  implementation(project(":shared"))
}
