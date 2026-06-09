import { error } from "@sveltejs/kit";
import { isDevAuthFallbackEnabled } from "$lib/server/authz";
import { DEMO_OWNER_EMAIL, starterData } from "$lib/server/starter-data";

interface SuperUserLocals {
  user?: unknown;
  membership?: {
    userId: string;
    userEmail: string;
  } | null;
}

export interface SuperUserContext {
  userId: string;
  email: string;
}

export function isSuperUserEmail(emailInput: string | null | undefined): boolean {
  const email = normalizeEmail(emailInput);
  if (!email) {
    return false;
  }

  return getConfiguredSuperUserEmails().has(email);
}

export function resolveSuperUserContext(locals: SuperUserLocals): SuperUserContext | null {
  const identity = resolveLocalIdentity(locals);
  if (!identity || !isSuperUserEmail(identity.email)) {
    return null;
  }
  return identity;
}

export function requireSuperUser(locals: SuperUserLocals): SuperUserContext {
  const identity = resolveLocalIdentity(locals);
  if (!identity) {
    throw error(401, "Super-user access requires a signed-in account.");
  }
  if (!isSuperUserEmail(identity.email)) {
    throw error(403, "Super-user access is required.");
  }
  return identity;
}

function resolveLocalIdentity(locals: SuperUserLocals): SuperUserContext | null {
  const user = locals.user;
  if (user && typeof user === "object") {
    const userRecord = user as Record<string, unknown>;
    const userId = readString(userRecord, "id", "userId");
    const email = readString(userRecord, "email");
    if (userId && email) {
      return { userId, email };
    }
  }

  if (locals.membership?.userId && locals.membership.userEmail) {
    return {
      userId: locals.membership.userId,
      email: locals.membership.userEmail,
    };
  }

  if (isDevAuthFallbackEnabled()) {
    return {
      userId: starterData.demoTenant.ownerUser.id,
      email: DEMO_OWNER_EMAIL,
    };
  }

  return null;
}

function getConfiguredSuperUserEmails(): Set<string> {
  const emails = new Set(
    (process.env.SMRT_STARTER_SUPERUSER_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter((email): email is string => Boolean(email)),
  );

  if (isDevAuthFallbackEnabled()) {
    emails.add(DEMO_OWNER_EMAIL);
  }

  return emails;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function readString(row: Record<string, unknown>, key: string, fallback?: string): string | null {
  const value = row[key] ?? (fallback ? row[fallback] : undefined);
  return typeof value === "string" && value.length > 0 ? value : null;
}
