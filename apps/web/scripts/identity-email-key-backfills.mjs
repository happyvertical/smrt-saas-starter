import { backfillProfileEmailKeys } from "@happyvertical/smrt-profiles";
import { backfillUserEmailKeys } from "@happyvertical/smrt-users";

/**
 * Run identity-key backfills in the only safe deployment order. User keys are
 * never attempted when Profile validation fails.
 *
 * @param {import("@happyvertical/smrt-core/migrations").DatabaseInterface} db
 * @param {{
 *   backfillProfiles?: typeof backfillProfileEmailKeys,
 *   backfillUsers?: typeof backfillUserEmailKeys,
 * }} [implementations]
 */
export async function backfillIdentityEmailKeys(db, implementations = {}) {
  const backfillProfiles = implementations.backfillProfiles ?? backfillProfileEmailKeys;
  const backfillUsers = implementations.backfillUsers ?? backfillUserEmailKeys;
  const profileEmailKeys = await backfillProfiles(db);
  const userEmailKeys = await backfillUsers(db);
  return { profileEmailKeys, userEmailKeys };
}
