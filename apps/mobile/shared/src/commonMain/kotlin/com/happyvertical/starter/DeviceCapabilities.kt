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

data class DevicePermissionState(
  val status: String,
  val canRequest: Boolean,
  val reason: String = "",
)

data class DeviceCaptureCapability(
  val surface: String,
  val label: String,
  val supported: Boolean,
  val permission: DevicePermissionState,
  val preferredInput: String,
) {
  fun summaryLine(): String {
    val support = if (supported) "supported" else "unavailable"
    val permissionText = permission.status.replace('_', ' ')
    return "$label: $support, permission $permissionText, input $preferredInput"
  }
}

data class DeviceCapabilityReport(
  val camera: DeviceCaptureCapability,
  val microphone: DeviceCaptureCapability,
  val checkedAtEpochMillis: Long = 0L,
) {
  fun summaryLines(): List<String> = listOf(
    camera.summaryLine(),
    microphone.summaryLine(),
  )

  companion object {
    fun unavailable(): DeviceCapabilityReport = DeviceCapabilityReport(
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
    ): DeviceCaptureCapability = DeviceCaptureCapability(
      surface = surface,
      label = label,
      supported = false,
      permission = DevicePermissionState(
        status = DevicePermissionStatus.UNAVAILABLE,
        canRequest = false,
        reason = "platform_adapter_unavailable",
      ),
      preferredInput = DeviceInputKind.UNAVAILABLE,
    )
  }
}

interface DeviceCapabilityAdapter {
  fun currentCapabilities(): DeviceCapabilityReport
}

object NoopDeviceCapabilityAdapter : DeviceCapabilityAdapter {
  override fun currentCapabilities(): DeviceCapabilityReport =
    DeviceCapabilityReport.unavailable()
}
