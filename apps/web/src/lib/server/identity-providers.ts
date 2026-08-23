type Environment = Readonly<Record<string, string | undefined>>;

const disabledValues = new Set(["0", "false", "no", "off"]);

/**
 * Deployments can turn off HappyVertical identity flows without removing their
 * credentials. Individual clients still decide whether they have enough
 * configuration to offer the provider.
 */
export function isHappyVerticalIdpEnabled(environment: Environment = process.env): boolean {
  const requestedState = environment.SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED?.trim().toLowerCase();
  return !requestedState || !disabledValues.has(requestedState);
}

/** The browser OIDC route additionally needs its issuer and client ID. */
export function isHappyVerticalWebIdpEnabled(environment: Environment = process.env): boolean {
  return (
    Boolean(environment.HAPPYVERTICAL_IDP_ISSUER?.trim()) &&
    Boolean(environment.OIDC_CLIENT_ID?.trim()) &&
    isHappyVerticalIdpEnabled(environment)
  );
}
