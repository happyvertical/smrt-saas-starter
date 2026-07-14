import type { DatabaseInterface } from "@happyvertical/smrt-core/migrations";
import {
  normalizeIdentityEmail,
  Person,
  ProfileCollection,
  ProfileTypeCollection,
} from "@happyvertical/smrt-profiles";
import { withSystemContext } from "@happyvertical/smrt-tenancy";

export type ProfileIdentityDatabase = DatabaseInterface;

const personMetaType = "@happyvertical/smrt-profiles:Person";

export interface EnsureUserProfileInput {
  userId: string;
  email?: string | null;
  name?: string | null;
  /**
   * Permit adoption of an existing unowned canonical Person. This is reserved
   * for boundaries that have already proved control of the email (verified
   * magic link/mobile provider) and the explicit operator backfill.
   */
  reuseExistingProfile?: boolean;
}

export interface EnsureUserProfileResult {
  profileId: string;
  created: boolean;
  repairedDanglingLink: boolean;
}

/** Provision or bind a canonical global Person using an existing database. */
export async function ensureUserProfileWithDatabase(
  db: ProfileIdentityDatabase,
  input: EnsureUserProfileInput,
): Promise<EnsureUserProfileResult> {
  return await withSystemContext(() =>
    db.transaction
      ? db.transaction((tx) => ensureUserProfileInTransaction(tx, input))
      : ensureUserProfileInTransaction(db, input),
  );
}

/**
 * Repair every active legacy User whose Profile link is absent or invalid.
 * This is intentionally an explicit operator/deployment operation, never
 * request-triggered work.
 */
export async function backfillMissingUserProfiles(db: ProfileIdentityDatabase): Promise<number> {
  const transaction = db.transaction?.bind(db);
  if (!transaction) {
    throw new Error("Profile identity backfill requires transaction support");
  }
  return await withSystemContext(() =>
    transaction(async (tx) => {
      const result = await tx.query(
        `
          SELECT users.id, users.email
          FROM users
          LEFT JOIN profiles ON profiles.id = users.profile_id
          WHERE users.status = 'active'
            AND (
              users.profile_id IS NULL
              OR profiles.id IS NULL
              OR profiles.tenant_id IS NOT NULL
              OR profiles._meta_type IS DISTINCT FROM ?
              OR profiles.email_key IS DISTINCT FROM users.email_key
              OR EXISTS (
                SELECT 1
                FROM profiles AS email_profiles
                WHERE email_profiles.email_key = users.email_key
                  AND email_profiles.id <> users.profile_id
              )
              OR EXISTS (
                SELECT 1
                FROM users AS other_users
                WHERE other_users.profile_id = users.profile_id
                  AND other_users.id <> users.id
              )
            )
          ORDER BY users.created_at ASC, users.id ASC
        `,
        personMetaType,
      );

      for (const user of result.rows) {
        await ensureUserProfileInTransaction(tx, {
          userId: readRequiredString(user, "id"),
          email: readString(user, "email"),
          reuseExistingProfile: true,
        });
      }
      return result.rows.length;
    }),
  );
}

/**
 * Transaction-aware variant for account flows that already own the database
 * transaction. The User row lock makes repeated/concurrent reconciliation for
 * the same account idempotent.
 */
export async function ensureUserProfileInTransaction(
  db: ProfileIdentityDatabase,
  input: EnsureUserProfileInput,
): Promise<EnsureUserProfileResult> {
  return await withSystemContext(async () => {
    const userResult = await db.query(
      `
        SELECT
          users.id,
          users.email,
          users.profile_id,
          profiles.id AS linked_profile_id
        FROM users
        LEFT JOIN profiles ON profiles.id = users.profile_id
        WHERE users.id = ? AND users.status = 'active'
        LIMIT 1
        FOR UPDATE OF users
      `,
      input.userId,
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new Error(`Cannot provision a profile for missing active user ${input.userId}`);
    }

    const linkedProfileId = readString(user, "linked_profile_id");
    const emailValue = readString(user, "email") ?? input.email;
    if (!emailValue?.trim()) {
      throw new Error(`Cannot provision a profile for user ${input.userId} without an email`);
    }
    const email = normalizeIdentityEmail(emailValue);
    const profiles = await ProfileCollection.create({ db });

    if (linkedProfileId) {
      await profiles.requireCanonicalGlobalPerson(linkedProfileId, email);
      await assertProfileHasNoOtherOwner(db, linkedProfileId, input.userId);
      await profiles.reserveCanonicalIdentityEmail(linkedProfileId, email);
      return {
        profileId: linkedProfileId,
        created: false,
        repairedDanglingLink: false,
      };
    }

    const currentProfileId = readString(user, "profile_id");
    const existingProfile = await profiles.findUniqueGlobalPersonByEmail(email);
    if (existingProfile && !input.reuseExistingProfile) {
      throw new Error(
        `Cannot safely bind user ${input.userId}: an existing canonical Person for ${email} requires a verified identity or operator backfill`,
      );
    }

    let profileId = existingProfile ? readRequiredId(existingProfile.id, "Existing Person") : null;
    let created = false;
    if (!profileId) {
      profileId = await createPersonProfile(db, {
        userId: input.userId,
        email,
        name: normalizeName(input.name) ?? displayNameFromEmail(email),
      });
      created = true;
    }

    await assertProfileHasNoOtherOwner(db, profileId, input.userId);
    await profiles.reserveCanonicalIdentityEmail(profileId, email);

    const now = new Date().toISOString();
    await db.query(
      `
        UPDATE users
        SET profile_id = ?, updated_at = ?
        WHERE id = ?
      `,
      profileId,
      now,
      input.userId,
    );

    return {
      profileId,
      created,
      repairedDanglingLink: Boolean(currentProfileId),
    };
  });
}

async function assertProfileHasNoOtherOwner(
  db: ProfileIdentityDatabase,
  profileId: string,
  userId: string,
): Promise<void> {
  const existingOwner = await db.query(
    `
      SELECT id
      FROM users
      WHERE profile_id = ? AND id <> ?
      LIMIT 1
    `,
    profileId,
    userId,
  );
  if (existingOwner.rows[0]) {
    throw new Error(
      `Cannot safely bind user ${userId}: profile ${profileId} already belongs to another User`,
    );
  }
}

async function createPersonProfile(
  db: ProfileIdentityDatabase,
  input: { userId: string; email: string; name: string },
): Promise<string> {
  const profileTypes = await ProfileTypeCollection.create({ db });
  const personType = await profileTypes.getOrCreateGlobalBySlug("person", {
    name: "Person",
    description: "Individual person profile",
  });
  const slug = `starter-person-${input.userId.toLowerCase()}`;
  const slugMatch = await db.query(
    `
      SELECT id
      FROM profiles
      WHERE slug = ? AND context = '' AND _meta_type = ?
      LIMIT 1
    `,
    slug,
    personMetaType,
  );
  if (slugMatch.rows[0]) {
    throw new Error(
      `Cannot safely create a Person for user ${input.userId}: profile slug ${slug} already exists`,
    );
  }
  const profile = new Person({
    db,
    slug,
    tenantId: null,
    typeId: readRequiredId(personType.id, "Person profile type"),
    email: input.email,
    name: input.name,
  });
  await profile.initialize();
  await profile.save();
  return readRequiredId(profile.id, "Person profile");
}

function normalizeName(value: string | null | undefined): string | null {
  const name = value?.trim().replace(/\s+/g, " ");
  return name || null;
}

function displayNameFromEmail(email: string): string {
  return email.split("@", 1)[0] || "Starter user";
}

function readRequiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} did not produce an id`);
  }
  return value;
}

function readRequiredString(row: Record<string, unknown>, key: string): string {
  const value = readString(row, key);
  if (!value) {
    throw new Error(`Profile identity query is missing ${key}`);
  }
  return value;
}

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
