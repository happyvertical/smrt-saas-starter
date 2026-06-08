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

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
  }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
  compilerOptions {
    jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
  }
}

dependencies {
  implementation(project(":shared"))
}
