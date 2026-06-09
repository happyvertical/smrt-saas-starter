import {
  type AuthInterface,
  type AuthResult,
  type GetAuthOptions,
  getAuth,
} from "@happyvertical/auth";
import { type SessionContext, SessionService } from "@happyvertical/smrt-users";
import { AccountFlowError, type AccountSessionTarget, signInWithEmail } from "$lib/server/accounts";
import { resolveMembershipContext, type StarterMembershipContext } from "$lib/server/authz";
import { getSmrtConfig } from "$lib/server/smrt";
import { getBillingOverview } from "$lib/server/subscriptions";

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

interface MobileTenantOption {
  id: string;
  name: string;
  slug: string;
  roleSlug: string;
  roleLabel: string;
}

interface MobileUsageThreshold {
  metricKey: string;
  label: string;
  used: number;
  limit: number;
  action: "observe" | "warn" | "block";
  state?: "ok" | "warn" | "blocked";
  allowed?: boolean;
  remaining?: number;
}

interface MobileDashboardPayload {
  tenant: {
    id: string;
    name: string;
    slug: string;
    planName: string;
    subscriptionStatus: string;
  };
  thresholds: MobileUsageThreshold[];
  enabledFeatures: string[];
  language: string;
}

interface MobileUserSummary {
  id: string;
  email: string;
  label: string;
}

interface MobileAuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: MobileUserSummary;
  activeTenant: MobileTenantOption;
  tenants: MobileTenantOption[];
}

interface MobileSessionBootstrap {
  user: MobileUserSummary;
  activeTenant: MobileTenantOption;
  tenants: MobileTenantOption[];
  dashboard: MobileDashboardPayload;
}

export class MobileAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MobileAuthError";
  }
}

interface MobileAuthProviderConfig extends MobileAuthProviderSummary {
  options: GetAuthOptions;
  allowedRedirectUris: string[];
}

interface CompleteMobileAuthOptions {
  request: MobileAuthCompleteRequest;
  userAgent?: string;
  ipAddress?: string;
}

const defaultScopes = ["openid", "profile", "email"];
const providerTypes = new Set<MobileAuthProviderType>([
  "keycloak",
  "kanidm",
  "cognito",
  "google",
  "github",
]);

let mobileSessionService: Promise<SessionService> | null = null;

export function listMobileAuthProviders(): MobileAuthProviderSummary[] {
  return getMobileAuthProviders().map(
    ({ options: _options, allowedRedirectUris: _allowedRedirectUris, ...summary }) => summary,
  );
}

export async function startMobileAuth(
  input: MobileAuthStartRequest,
): Promise<MobileAuthStartResponse> {
  try {
    const provider = resolveProvider(input.providerId);
    const redirectUri = normalizeRedirectUri(input.redirectUri, provider);
    const auth = await createAuthClient(provider, redirectUri);
    const result = await auth.getAuthorizationUrl({
      redirectUri,
      scopes: input.scopes?.length ? input.scopes : getProviderScopes(provider),
      state: normalizeOptionalString(input.state) ?? undefined,
      loginHint: normalizeOptionalString(input.loginHint) ?? undefined,
    });

    return {
      providerId: provider.id,
      authorizationUrl: result.url,
      state: result.state,
      codeVerifier: result.codeVerifier,
      nonce: result.nonce,
      redirectUri,
    };
  } catch (error) {
    throw toMobileAuthError(error);
  }
}

export async function completeMobileAuth(
  options: CompleteMobileAuthOptions,
): Promise<MobileAuthSession> {
  const provider = resolveProvider(options.request.providerId);
  const redirectUri = normalizeRedirectUri(options.request.redirectUri, provider);
  const code = normalizeRequiredString(options.request.code, "Missing authorization code");

  try {
    const auth = await createAuthClient(provider, redirectUri);
    const authResult = await auth.exchangeCode({
      code,
      state: normalizeOptionalString(options.request.state) ?? undefined,
      codeVerifier: normalizeOptionalString(options.request.codeVerifier) ?? undefined,
      redirectUri,
    });
    const identity = await resolveExternalIdentity(auth, authResult);
    const target = await signInWithEmail(identity.email);
    const session = await createMobileSession(target, {
      providerId: provider.id,
      providerType: provider.type,
      externalUserId: identity.externalUserId,
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
    });

    return buildMobileAuthSession(session.sessionId, session.expiresAt, target);
  } catch (error) {
    throw toMobileAuthError(error);
  }
}

export async function getMobileSessionBootstrap(
  authorizationHeader: string | null,
): Promise<MobileSessionBootstrap> {
  const sessionId = readBearerToken(authorizationHeader);
  if (!sessionId) {
    throw new MobileAuthError(401, "Missing mobile bearer token");
  }

  const context = await loadMobileSessionContext(sessionId);
  if (!context) {
    throw new MobileAuthError(401, "Invalid or expired mobile bearer token");
  }

  const membership = await resolveMembershipForSession(context);
  if (!membership) {
    throw new MobileAuthError(403, "No active tenant membership for this mobile session");
  }

  return buildMobileSessionBootstrap(membership);
}

export async function destroyMobileSession(authorizationHeader: string | null): Promise<boolean> {
  const sessionId = readBearerToken(authorizationHeader);
  if (!sessionId) {
    return false;
  }

  const service = await getMobileSessionService();
  return await service.destroySession(sessionId);
}

export function resetMobileAuthStateForTests() {
  mobileSessionService = null;
}

async function createMobileSession(
  target: AccountSessionTarget,
  options: {
    providerId: string;
    providerType: MobileAuthProviderType;
    externalUserId: string;
    userAgent?: string;
    ipAddress?: string;
  },
) {
  const ttl = getMobileSessionTtlSeconds();
  const service = await getMobileSessionService();
  const sessionId = await service.createSession(target.userId, target.tenantId, {
    ttl,
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
    data: {
      source: "mobile",
      providerId: options.providerId,
      providerType: options.providerType,
      externalUserId: options.externalUserId,
    },
  });

  return {
    sessionId,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

async function buildMobileAuthSession(
  sessionId: string,
  expiresAt: string,
  target: AccountSessionTarget,
): Promise<MobileAuthSession> {
  const membership = await resolveMembershipContext(
    {
      user: { id: target.userId, email: target.userEmail },
      tenantId: target.tenantId,
      sessionId,
      permissions: [],
    },
    target.tenantId,
  );

  if (!membership) {
    throw new MobileAuthError(403, "No active tenant membership for this mobile session");
  }

  return {
    accessToken: sessionId,
    tokenType: "Bearer",
    expiresAt,
    user: toMobileUser(membership),
    activeTenant: toMobileTenantOption(membership),
    tenants: membership.availableTenants.map(toMobileTenantOption),
  };
}

async function buildMobileSessionBootstrap(
  membership: StarterMembershipContext,
): Promise<MobileSessionBootstrap> {
  return {
    user: toMobileUser(membership),
    activeTenant: toMobileTenantOption(membership),
    tenants: membership.availableTenants.map(toMobileTenantOption),
    dashboard: await buildMobileDashboard(membership),
  };
}

async function buildMobileDashboard(
  membership: StarterMembershipContext,
): Promise<MobileDashboardPayload> {
  const overview = await getBillingOverview(membership.tenantId);

  return {
    tenant: {
      id: membership.tenantId,
      name: membership.tenantLabel,
      slug: membership.tenantSlug,
      planName: overview.currentPlan.name,
      subscriptionStatus: overview.snapshot.status,
    },
    thresholds: overview.snapshot.thresholdEvaluations.map(toMobileUsageThreshold),
    enabledFeatures: overview.snapshot.featureKeys,
    language: "en",
  };
}

function toMobileUsageThreshold(evaluation: {
  threshold: {
    metricKey: string;
    label?: string;
    limit: number;
    enforcement: "observe" | "warn" | "block";
  };
  usage: { quantity: number };
  state: "ok" | "warn" | "blocked";
  allowed: boolean;
  remaining: number;
}): MobileUsageThreshold {
  return {
    metricKey: evaluation.threshold.metricKey,
    label: evaluation.threshold.label ?? evaluation.threshold.metricKey,
    used: evaluation.usage.quantity,
    limit: evaluation.threshold.limit,
    action: evaluation.threshold.enforcement,
    state: evaluation.state,
    allowed: evaluation.allowed,
    remaining: evaluation.remaining,
  };
}

async function resolveMembershipForSession(
  context: SessionContext,
): Promise<StarterMembershipContext | null> {
  const user = context.user as unknown as Record<string, unknown>;
  const userId = readString(user, "id", "userId");
  if (!userId) {
    return null;
  }

  return await resolveMembershipContext(
    {
      user: {
        id: userId,
        email: readString(user, "email") ?? undefined,
      },
      tenantId: context.tenantId,
      sessionId: context.sessionId,
      permissions: context.permissions,
    },
    context.tenantId,
  );
}

async function resolveExternalIdentity(auth: AuthInterface, authResult: AuthResult) {
  const profile = await auth.getProfile(authResult.accessToken).catch(() => null);
  const email = normalizeOptionalString(profile?.email);
  if (email) {
    if (profile?.emailVerified === false) {
      throw new MobileAuthError(401, "Mobile auth provider did not verify that email");
    }
    return {
      email: email.toLowerCase(),
      externalUserId: profile?.id ?? authResult.userId,
    };
  }

  const claims = await auth
    .validateToken(authResult.idToken ?? authResult.accessToken)
    .catch(() => null);
  const claimsEmail = normalizeOptionalString(claims?.email);
  if (claimsEmail) {
    if (claims?.email_verified === false) {
      throw new MobileAuthError(401, "Mobile auth provider did not verify that email");
    }
    return {
      email: claimsEmail.toLowerCase(),
      externalUserId: claims?.sub ?? authResult.userId,
    };
  }

  throw new MobileAuthError(401, "Mobile auth provider did not return a verified email");
}

async function loadMobileSessionContext(sessionId: string): Promise<SessionContext | null> {
  const service = await getMobileSessionService();
  return await service.loadSessionContext(sessionId);
}

async function getMobileSessionService(): Promise<SessionService> {
  mobileSessionService ??= SessionService.create({
    ...getSmrtConfig("Session"),
    defaultTTL: getMobileSessionTtlSeconds(),
    cookieName: "sid",
  });
  return await mobileSessionService;
}

async function createAuthClient(
  provider: MobileAuthProviderConfig,
  redirectUri: string,
): Promise<AuthInterface> {
  return await getAuth({
    ...provider.options,
    redirectUri,
  } as GetAuthOptions);
}

function resolveProvider(providerId?: string): MobileAuthProviderConfig {
  const providers = getMobileAuthProviders();
  const requestedId =
    normalizeOptionalString(providerId) ??
    normalizeOptionalString(process.env.MOBILE_AUTH_DEFAULT_PROVIDER) ??
    providers[0]?.id;
  if (!requestedId) {
    throw new MobileAuthError(503, "No mobile auth providers are configured");
  }

  const provider = providers.find((candidate) => candidate.id === requestedId);
  if (!provider) {
    throw new MobileAuthError(400, `Unknown mobile auth provider: ${requestedId}`);
  }
  return provider;
}

function getMobileAuthProviders(): MobileAuthProviderConfig[] {
  const providers = [...readJsonProviders()];
  const happyvertical = readHappyVerticalProvider();
  if (happyvertical) {
    providers.push(happyvertical);
  }

  const deduped = new Map<string, MobileAuthProviderConfig>();
  for (const provider of providers) {
    if (deduped.has(provider.id)) {
      throw new MobileAuthError(500, `Duplicate mobile auth provider id: ${provider.id}`);
    }
    deduped.set(provider.id, provider);
  }

  return [...deduped.values()];
}

function readJsonProviders(): MobileAuthProviderConfig[] {
  const raw = normalizeOptionalString(process.env.MOBILE_AUTH_PROVIDERS_JSON);
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MobileAuthError(500, "MOBILE_AUTH_PROVIDERS_JSON is not valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new MobileAuthError(500, "MOBILE_AUTH_PROVIDERS_JSON must be an array");
  }

  return parsed.map((provider, index) => {
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
      throw new MobileAuthError(500, `Mobile auth provider ${index + 1} must be an object`);
    }
    return normalizeProviderConfig(provider as Record<string, unknown>, `provider ${index + 1}`);
  });
}

function readHappyVerticalProvider(): MobileAuthProviderConfig | null {
  const clientId =
    normalizeOptionalString(process.env.MOBILE_OIDC_CLIENT_ID) ??
    normalizeOptionalString(process.env.OIDC_CLIENT_ID);
  const serverUrl =
    normalizeOptionalString(process.env.MOBILE_AUTH_HAPPYVERTICAL_SERVER_URL) ??
    normalizeOptionalString(process.env.HAPPYVERTICAL_IDP_ISSUER);
  if (!clientId || !serverUrl) {
    return null;
  }

  const type =
    readProviderType(process.env.MOBILE_AUTH_HAPPYVERTICAL_TYPE) ??
    ("kanidm" satisfies MobileAuthProviderType);

  return normalizeProviderConfig(
    {
      id: "happyvertical",
      label: "HappyVertical IDP",
      type,
      serverUrl,
      realm: process.env.MOBILE_AUTH_HAPPYVERTICAL_REALM,
      clientId,
      clientSecret:
        normalizeOptionalString(process.env.MOBILE_OIDC_CLIENT_SECRET) ??
        normalizeOptionalString(process.env.OIDC_CLIENT_SECRET),
      scopes: readScopes(process.env.MOBILE_AUTH_HAPPYVERTICAL_SCOPES) ?? defaultScopes,
      allowedRedirectUris: process.env.MOBILE_AUTH_HAPPYVERTICAL_REDIRECT_URIS,
      usePKCE: true,
    },
    "HappyVertical mobile provider",
  );
}

function normalizeProviderConfig(
  input: Record<string, unknown>,
  labelForError: string,
): MobileAuthProviderConfig {
  const id = normalizeRequiredString(readString(input, "id"), `${labelForError} is missing id`);
  const label = normalizeOptionalString(readString(input, "label")) ?? id;
  const type = readProviderType(readString(input, "type"));
  if (!type) {
    throw new MobileAuthError(500, `${labelForError} has an unsupported auth provider type`);
  }

  const scopes = readScopes(input.scopes) ?? defaultScopes;
  const base = {
    id,
    label,
    type,
    supportsPkce: supportsPkce(type),
    allowedRedirectUris: readRedirectUriAllowList(input.allowedRedirectUris),
  };

  if (type === "keycloak") {
    return {
      ...base,
      options: {
        type,
        serverUrl: readRequiredConfig(input, "serverUrl", labelForError),
        realm: readRequiredConfig(input, "realm", labelForError),
        clientId: readRequiredConfig(input, "clientId", labelForError),
        clientSecret: normalizeOptionalString(readString(input, "clientSecret")) ?? undefined,
        scopes,
        usePKCE: readBoolean(input.usePKCE) ?? true,
      },
    };
  }

  if (type === "kanidm") {
    return {
      ...base,
      options: {
        type,
        serverUrl: readRequiredConfig(input, "serverUrl", labelForError),
        clientId: readRequiredConfig(input, "clientId", labelForError),
        clientSecret: normalizeOptionalString(readString(input, "clientSecret")) ?? undefined,
        scopes,
        usePKCE: readBoolean(input.usePKCE) ?? true,
      },
    };
  }

  if (type === "cognito") {
    return {
      ...base,
      options: {
        type,
        region: readRequiredConfig(input, "region", labelForError),
        userPoolId: readRequiredConfig(input, "userPoolId", labelForError),
        clientId: readRequiredConfig(input, "clientId", labelForError),
        clientSecret: normalizeOptionalString(readString(input, "clientSecret")) ?? undefined,
        domain: normalizeOptionalString(readString(input, "domain")) ?? undefined,
        scopes,
      },
    };
  }

  if (type === "google" || type === "github") {
    return {
      ...base,
      options: {
        type,
        clientId: readRequiredConfig(input, "clientId", labelForError),
        clientSecret: readRequiredConfig(input, "clientSecret", labelForError),
        scopes,
        ...(type === "google" ? { usePKCE: readBoolean(input.usePKCE) ?? true } : {}),
      } as GetAuthOptions,
    };
  }

  throw new MobileAuthError(500, `${labelForError} has an unsupported auth provider type`);
}

function toMobileUser(membership: StarterMembershipContext): MobileUserSummary {
  return {
    id: membership.userId,
    email: membership.userEmail,
    label: membership.userEmail,
  };
}

function toMobileTenantOption(input: {
  tenantId: string;
  tenantLabel: string;
  tenantSlug: string;
  roleSlug: string;
  roleLabel: string;
}): MobileTenantOption {
  return {
    id: input.tenantId,
    name: input.tenantLabel,
    slug: input.tenantSlug,
    roleSlug: input.roleSlug,
    roleLabel: input.roleLabel,
  };
}

function getProviderScopes(provider: MobileAuthProviderConfig): string[] {
  const scopes = "scopes" in provider.options ? provider.options.scopes : undefined;
  return Array.isArray(scopes) && scopes.length > 0 ? scopes : defaultScopes;
}

function getMobileSessionTtlSeconds() {
  const configured = Number(process.env.MOBILE_SESSION_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 60 * 60 * 24 * 30;
}

function readBearerToken(authorizationHeader: string | null): string | null {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/iu);
  return normalizeOptionalString(match?.[1]) ?? null;
}

// Schemes that can execute script or read local resources if a redirect ever
// reaches a browser context. Rejected regardless of any configured allow list.
const dangerousRedirectSchemes = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "about:",
]);

function normalizeRedirectUri(value: string, provider: MobileAuthProviderConfig): string {
  const redirectUri = normalizeRequiredString(value, "Missing mobile redirect URI");

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new MobileAuthError(400, "Mobile redirect URI must be an absolute URL");
  }

  const scheme = parsed.protocol.toLowerCase();
  if (dangerousRedirectSchemes.has(scheme)) {
    throw new MobileAuthError(400, "Mobile redirect URI uses an unsupported scheme");
  }
  // Plain http is only permitted for native loopback redirects (RFC 8252).
  // https and private-use app schemes (e.g. com.example.app://) are allowed.
  if (scheme === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new MobileAuthError(
      400,
      "Mobile redirect URI must use https, a loopback address, or an app scheme",
    );
  }

  // When an allow list is configured (globally and/or per provider), the
  // requested URI must match it exactly. This is the primary defense against
  // redirecting authorization responses to an attacker-controlled URI.
  const allowList = [...getGlobalAllowedRedirectUris(), ...provider.allowedRedirectUris];
  if (allowList.length > 0 && !isAllowedRedirectUri(redirectUri, allowList)) {
    throw new MobileAuthError(400, "Mobile redirect URI is not allowed for this provider");
  }

  return redirectUri;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function isAllowedRedirectUri(candidate: string, allowList: string[]): boolean {
  const normalized = candidate.trim();
  return allowList.some((entry) => {
    const allowed = entry.trim();
    if (!allowed) {
      return false;
    }
    if (normalized === allowed) {
      return true;
    }
    // An allow-list entry ending in "/" is treated as a path prefix so a single
    // registered origin can cover its callback sub-paths without wildcards.
    return allowed.endsWith("/") && normalized.startsWith(allowed);
  });
}

function getGlobalAllowedRedirectUris(): string[] {
  return readRedirectUriAllowList(process.env.MOBILE_AUTH_ALLOWED_REDIRECT_URIS);
}

function readRedirectUriAllowList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/u)
      .map((uri) => uri.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0)
      .map((uri) => uri.trim());
  }

  return [];
}

function normalizeRequiredString(value: unknown, message: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new MobileAuthError(400, message);
  }
  return normalized;
}

function readRequiredConfig(
  input: Record<string, unknown>,
  key: string,
  labelForError: string,
): string {
  const value = normalizeOptionalString(readString(input, key));
  if (!value) {
    throw new MobileAuthError(500, `${labelForError} is missing ${key}`);
  }
  return value;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readString(input: Record<string, unknown>, key: string, fallback?: string): string | null {
  return normalizeOptionalString(input[key] ?? (fallback ? input[fallback] : undefined));
}

function readProviderType(value: unknown): MobileAuthProviderType | null {
  const type = normalizeOptionalString(value);
  return type && providerTypes.has(type as MobileAuthProviderType)
    ? (type as MobileAuthProviderType)
    : null;
}

function readScopes(value: unknown): string[] | null {
  if (typeof value === "string") {
    const scopes = value
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
    return scopes.length > 0 ? scopes : null;
  }

  if (Array.isArray(value)) {
    const scopes = value.filter(
      (scope): scope is string => typeof scope === "string" && scope.trim().length > 0,
    );
    return scopes.map((scope) => scope.trim());
  }

  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function supportsPkce(type: MobileAuthProviderType): boolean {
  return type === "keycloak" || type === "kanidm" || type === "google";
}

function toMobileAuthError(error: unknown): Error {
  if (error instanceof MobileAuthError) {
    return error;
  }
  if (error instanceof AccountFlowError) {
    return new MobileAuthError(error.status, error.message);
  }
  if (error instanceof Error && error.name === "NotImplementedError") {
    return new MobileAuthError(501, error.message);
  }
  if (
    error instanceof Error &&
    /configuration|configured|unsupported|provider type|client|redirect uri/iu.test(error.message)
  ) {
    return new MobileAuthError(503, error.message);
  }
  if (
    error instanceof Error &&
    /invalid|expired|denied|unauthorized|forbidden/iu.test(error.message)
  ) {
    return new MobileAuthError(401, error.message);
  }
  return error instanceof Error ? error : new Error("Mobile authentication failed");
}
