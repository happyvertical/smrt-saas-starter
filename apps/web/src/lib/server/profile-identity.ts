import { getAppDatabase } from "$lib/server/db";
import {
  backfillMissingUserProfiles as backfillMissingUserProfilesWithDatabase,
  ensureUserProfileWithDatabase,
} from "$lib/server/profile-identity-core";

export type {
  EnsureUserProfileInput,
  EnsureUserProfileResult,
  ProfileIdentityDatabase,
} from "$lib/server/profile-identity-core";
export { ensureUserProfileInTransaction } from "$lib/server/profile-identity-core";

import type {
  EnsureUserProfileInput,
  EnsureUserProfileResult,
  ProfileIdentityDatabase,
} from "$lib/server/profile-identity-core";

/** Provision or bind a canonical global Person for an active User. */
export async function ensureUserProfile(
  input: EnsureUserProfileInput,
  options: { db?: ProfileIdentityDatabase } = {},
): Promise<EnsureUserProfileResult> {
  const db = options.db ?? (await getAppDatabase());
  return await ensureUserProfileWithDatabase(db, input);
}

/** Explicit operator/deployment backfill for active legacy Users. */
export async function backfillMissingUserProfiles(
  options: { db?: ProfileIdentityDatabase } = {},
): Promise<number> {
  const db = options.db ?? (await getAppDatabase());
  return await backfillMissingUserProfilesWithDatabase(db);
}
