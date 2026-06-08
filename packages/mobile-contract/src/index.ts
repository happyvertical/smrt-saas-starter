export interface MobileTenantSummary {
  id: string;
  name: string;
  slug: string;
  planName: string;
  subscriptionStatus: string;
}

export interface MobileTenantOption {
  id: string;
  name: string;
  slug: string;
  roleSlug: string;
  roleLabel: string;
}

export interface MobileUsageThreshold {
  metricKey: string;
  label: string;
  used: number;
  limit: number;
  action: "observe" | "warn" | "block";
  state?: "ok" | "warn" | "blocked";
  allowed?: boolean;
  remaining?: number;
}

export interface MobileDashboardPayload {
  tenant: MobileTenantSummary;
  thresholds: MobileUsageThreshold[];
  enabledFeatures: string[];
  language: string;
}

export type MobileAuthProviderType = "keycloak" | "kanidm" | "cognito" | "google" | "github";

export interface MobileAuthProviderSummary {
  id: string;
  label: string;
  type: MobileAuthProviderType;
  supportsPkce: boolean;
}

export interface MobileAuthStartRequest {
  providerId?: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
  loginHint?: string;
}

export interface MobileAuthStartResponse {
  providerId: string;
  authorizationUrl: string;
  state: string;
  codeVerifier?: string;
  nonce?: string;
  redirectUri: string;
}

export interface MobileAuthCompleteRequest {
  providerId?: string;
  code: string;
  state?: string;
  codeVerifier?: string;
  redirectUri: string;
}

export interface MobileUserSummary {
  id: string;
  email: string;
  label: string;
}

export interface MobileAuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: MobileUserSummary;
  activeTenant: MobileTenantOption;
  tenants: MobileTenantOption[];
}

export interface MobileSessionBootstrap {
  user: MobileUserSummary;
  activeTenant: MobileTenantOption;
  tenants: MobileTenantOption[];
  dashboard: MobileDashboardPayload;
}

export type MobileDeviceCaptureSurface = "camera" | "microphone";

export type MobileDevicePermissionStatus = "granted" | "denied" | "not_determined" | "unavailable";

export interface MobileDevicePermissionState {
  status: MobileDevicePermissionStatus;
  canRequest: boolean;
  reason?: string;
}

export type MobileDeviceInputKind =
  | "native_camera"
  | "native_microphone"
  | "native_picker"
  | "unavailable";

export interface MobileDeviceCapability {
  surface: MobileDeviceCaptureSurface;
  label: string;
  supported: boolean;
  permission: MobileDevicePermissionState;
  preferredInput: MobileDeviceInputKind;
}

export interface MobileDeviceCapabilities {
  camera: MobileDeviceCapability;
  microphone: MobileDeviceCapability;
  checkedAtEpochMillis?: number;
}

export const mobileContractVersion = "2026-06-08.v4";
