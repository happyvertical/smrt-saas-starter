type Environment = Readonly<Record<string, string | undefined>>;

const disabledValues = new Set(["0", "false", "no", "off"]);

/**
 * The HappyVertical OIDC action is usable only when its issuer is configured.
 * Deployments can additionally turn it off without removing the credentials.
 */
export function isHappyVerticalIdpEnabled(environment: Environment = process.env): boolean {
  const issuer = environment.HAPPYVERTICAL_IDP_ISSUER?.trim();
  if (!issuer) {
    return false;
  }

  const requestedState = environment.SMRT_STARTER_HAPPYVERTICAL_IDP_ENABLED?.trim().toLowerCase();
  return !requestedState || !disabledValues.has(requestedState);
}
