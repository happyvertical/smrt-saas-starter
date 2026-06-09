package com.happyvertical.starter

object DeviceCaptureSurface {
  const val CAMERA = "camera"
  const val MICROPHONE = "microphone"
}

object DevicePermissionStatus {
  const val GRANTED = "granted"
  const val DENIED = "denied"
  const val NOT_DETERMINED = "not_determined"
  const val UNAVAILABLE = "unavailable"
}

object DeviceInputKind {
  const val NATIVE_CAMERA = "native_camera"
  const val NATIVE_MICROPHONE = "native_microphone"
  const val NATIVE_PICKER = "native_picker"
  const val UNAVAILABLE = "unavailable"
}

fun MobileDeviceCapability.summaryLine(): String {
  val support = if (supported) "supported" else "unavailable"
  val permissionText = permission.status.replace('_', ' ')
  return "$label: $support, permission $permissionText, input $preferredInput"
}

fun MobileDeviceCapabilities.summaryLines(): List<String> = listOf(
  camera.summaryLine(),
  microphone.summaryLine(),
)

fun unavailableDeviceCapabilities(): MobileDeviceCapabilities = MobileDeviceCapabilities(
  camera = unavailableCapability(
    surface = DeviceCaptureSurface.CAMERA,
    label = "Camera",
  ),
  microphone = unavailableCapability(
    surface = DeviceCaptureSurface.MICROPHONE,
    label = "Microphone",
  ),
)

private fun unavailableCapability(
  surface: String,
  label: String,
): MobileDeviceCapability = MobileDeviceCapability(
  surface = surface,
  label = label,
  supported = false,
  permission = MobileDevicePermissionState(
    status = DevicePermissionStatus.UNAVAILABLE,
    canRequest = false,
    reason = "platform_adapter_unavailable",
  ),
  preferredInput = DeviceInputKind.UNAVAILABLE,
)

interface DeviceCapabilityAdapter {
  fun currentCapabilities(): MobileDeviceCapabilities
}

object NoopDeviceCapabilityAdapter : DeviceCapabilityAdapter {
  override fun currentCapabilities(): MobileDeviceCapabilities =
    unavailableDeviceCapabilities()
}
