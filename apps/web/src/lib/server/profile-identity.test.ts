import { beforeEach, describe, expect, it, vi } from "vitest";

const personMetaType = "@happyvertical/smrt-profiles:Person";
const createdProfileId = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  createProfileCollection: vi.fn(),
  findUniqueGlobalPersonByEmail: vi.fn(),
  requireCanonicalGlobalPerson: vi.fn(),
  reserveCanonicalIdentityEmail: vi.fn(),
  createProfileTypeCollection: vi.fn(),
  getOrCreateGlobalBySlug: vi.fn(),
  personInitialize: vi.fn(),
  personSave: vi.fn(),
  personOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@happyvertical/smrt-profiles", () => ({
  normalizeIdentityEmail: (email: string) => email.trim().toLowerCase(),
  ProfileCollection: { create: mocks.createProfileCollection },
  ProfileTypeCollection: { create: mocks.createProfileTypeCollection },
  Person: class Person {
    id = createdProfileId;
    private options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocks.personOptions.push(options);
    }

    initialize = mocks.personInitialize;
    save = async () => {
      await mocks.personSave();
      const db = this.options.db as TestDatabase;
      db.__state.profiles.push({
        id: this.id,
        email: String(this.options.email),
        tenantId: null,
        metaType: personMetaType,
      });
    };
  },
}));

vi.mock("@happyvertical/smrt-tenancy", () => ({
  withSystemContext: (callback: () => unknown) => callback(),
}));

vi.mock("$lib/server/db", () => ({ getAppDatabase: vi.fn() }));

import {
  backfillMissingUserProfiles,
  ensureUserProfile,
  type ProfileIdentityDatabase,
} from "$lib/server/profile-identity";

const userId = "11111111-1111-4111-8111-111111111111";
const existingProfileId = "22222222-2222-4222-8222-222222222222";

interface TestUser {
  id: string;
  email: string;
  profileId: string | null;
}

interface TestProfile {
  id: string;
  email: string;
  tenantId: string | null;
  metaType: string;
}

interface TestState {
  users: TestUser[];
  profiles: TestProfile[];
  backfillUsers?: Array<{ id: string; email: string }>;
  profileOwnedByOther?: boolean;
  reservations: Array<{ profileId: string; email: string }>;
}

type TestDatabase = ProfileIdentityDatabase & { __state: TestState };

describe("starter profile identity reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personOptions.length = 0;
    mocks.createProfileCollection.mockImplementation(async ({ db }: { db: TestDatabase }) => ({
      findUniqueGlobalPersonByEmail: (email: string) =>
        mocks.findUniqueGlobalPersonByEmail(db, email),
      requireCanonicalGlobalPerson: (profileId: string, email?: string) =>
        mocks.requireCanonicalGlobalPerson(db, profileId, email),
      reserveCanonicalIdentityEmail: (profileId: string, email?: string) =>
        mocks.reserveCanonicalIdentityEmail(db, profileId, email),
    }));
    mocks.findUniqueGlobalPersonByEmail.mockImplementation(
      async (db: TestDatabase, email: string) => findCanonicalProfile(db.__state, email),
    );
    mocks.requireCanonicalGlobalPerson.mockImplementation(
      async (db: TestDatabase, profileId: string, email?: string) => {
        const profile = db.__state.profiles.find((candidate) => candidate.id === profileId);
        if (!profile) {
          throw new Error(`Profile ${profileId} does not exist`);
        }
        const canonical = findCanonicalProfile(db.__state, email ?? profile.email);
        if (!canonical || canonical.id !== profileId) {
          throw new Error(`Profile ${profileId} is not the unique global Person for ${email}`);
        }
        return canonical;
      },
    );
    mocks.reserveCanonicalIdentityEmail.mockImplementation(
      async (db: TestDatabase, profileId: string, email?: string) => {
        const profile = await mocks.requireCanonicalGlobalPerson(db, profileId, email);
        db.__state.reservations = [{ profileId, email: email ?? profile.email }];
        return profile;
      },
    );
    mocks.createProfileTypeCollection.mockResolvedValue({
      getOrCreateGlobalBySlug: mocks.getOrCreateGlobalBySlug,
    });
    mocks.getOrCreateGlobalBySlug.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("creates and reserves one global Person, then becomes a no-op", async () => {
    const state = createState();
    const db = createDatabase(state);

    await expect(
      ensureUserProfile({ userId, email: "IGNORED@example.com", name: " Starter Person " }, { db }),
    ).resolves.toEqual({
      profileId: createdProfileId,
      created: true,
      repairedDanglingLink: false,
    });

    expect(mocks.getOrCreateGlobalBySlug).toHaveBeenCalledWith("person", {
      name: "Person",
      description: "Individual person profile",
    });
    expect(mocks.personOptions).toEqual([
      expect.objectContaining({
        tenantId: null,
        email: "person@example.com",
        name: "Starter Person",
        slug: `starter-person-${userId}`,
      }),
    ]);
    expect(state.reservations).toEqual([
      { profileId: createdProfileId, email: "person@example.com" },
    ]);

    await expect(
      ensureUserProfile({ userId, email: "person@example.com" }, { db }),
    ).resolves.toEqual({
      profileId: createdProfileId,
      created: false,
      repairedDanglingLink: false,
    });
    expect(mocks.personSave).toHaveBeenCalledOnce();
  });

  it("requires a verified boundary before adopting an existing unowned Person", async () => {
    const state = createState({ profiles: [person(existingProfileId, "person@example.com")] });
    const db = createDatabase(state);

    await expect(
      ensureUserProfile({ userId, email: "person@example.com" }, { db }),
    ).rejects.toThrow("requires a verified identity or operator backfill");
    expect(state.users[0]?.profileId).toBeNull();

    await expect(
      ensureUserProfile(
        { userId, email: "person@example.com", reuseExistingProfile: true },
        { db },
      ),
    ).resolves.toMatchObject({ profileId: existingProfileId, created: false });
    expect(mocks.personSave).not.toHaveBeenCalled();
  });

  it("repairs a dangling legacy profile link only at a trusted boundary", async () => {
    const state = createState({
      users: [{ id: userId, email: "person@example.com", profileId: "missing-profile" }],
      profiles: [person(existingProfileId, "person@example.com")],
    });

    await expect(
      ensureUserProfile(
        { userId, email: "person@example.com", reuseExistingProfile: true },
        { db: createDatabase(state) },
      ),
    ).resolves.toEqual({
      profileId: existingProfileId,
      created: false,
      repairedDanglingLink: true,
    });
  });

  it("fails closed for ambiguous, tenant-scoped, and incompatible email matches", async () => {
    for (const profiles of [
      [person(existingProfileId, "person@example.com"), person("other", "person@example.com")],
      [{ ...person(existingProfileId, "person@example.com"), tenantId: "tenant-1" }],
      [{ ...person(existingProfileId, "person@example.com"), metaType: "Organization" }],
    ]) {
      await expect(
        ensureUserProfile(
          { userId, email: "person@example.com", reuseExistingProfile: true },
          { db: createDatabase(createState({ profiles })) },
        ),
      ).rejects.toThrow();
    }
    expect(mocks.personSave).not.toHaveBeenCalled();
  });

  it("fails closed when a linked Person belongs to another User", async () => {
    const state = createState({
      users: [{ id: userId, email: "person@example.com", profileId: existingProfileId }],
      profiles: [person(existingProfileId, "person@example.com")],
      profileOwnedByOther: true,
    });

    await expect(
      ensureUserProfile({ userId, email: "person@example.com" }, { db: createDatabase(state) }),
    ).rejects.toThrow("already belongs to another User");
  });

  it("uses distinct natural keys for users with the same display name", async () => {
    const secondUserId = "77777777-7777-4777-8777-777777777777";
    await ensureUserProfile(
      { userId, email: "one@example.com", name: "Same Name" },
      {
        db: createDatabase(
          createState({ users: [{ id: userId, email: "one@example.com", profileId: null }] }),
        ),
      },
    );
    await ensureUserProfile(
      { userId: secondUserId, email: "two@example.com", name: "Same Name" },
      {
        db: createDatabase(
          createState({ users: [{ id: secondUserId, email: "two@example.com", profileId: null }] }),
        ),
      },
    );

    expect(mocks.personOptions.map((options) => options.slug)).toEqual([
      `starter-person-${userId}`,
      `starter-person-${secondUserId}`,
    ]);
  });

  it("runs the operator backfill in one transaction and rolls everything back on conflict", async () => {
    const secondUserId = "77777777-7777-4777-8777-777777777777";
    const state = createState({
      users: [
        { id: userId, email: "one@example.com", profileId: null },
        { id: secondUserId, email: "two@example.com", profileId: null },
      ],
      profiles: [{ ...person(existingProfileId, "two@example.com"), tenantId: "tenant-1" }],
      backfillUsers: [
        { id: userId, email: "one@example.com" },
        { id: secondUserId, email: "two@example.com" },
      ],
    });
    const db = createDatabase(state);

    await expect(backfillMissingUserProfiles({ db })).rejects.toThrow("tenant-scoped");
    expect(state.users.every((user) => user.profileId === null)).toBe(true);
    expect(state.profiles).toEqual([
      expect.objectContaining({ id: existingProfileId, tenantId: "tenant-1" }),
    ]);
    expect(db.transaction).toHaveBeenCalledOnce();
  });
});

function createState(overrides: Partial<TestState> = {}): TestState {
  return {
    users: [{ id: userId, email: "Person@Example.com", profileId: null }],
    profiles: [],
    reservations: [],
    ...overrides,
  };
}

function person(id: string, email: string): TestProfile {
  return { id, email, tenantId: null, metaType: personMetaType };
}

function findCanonicalProfile(state: TestState, email: string): TestProfile | null {
  const normalized = email.trim().toLowerCase();
  const matches = state.profiles.filter(
    (profile) => profile.email.trim().toLowerCase() === normalized,
  );
  if (matches.some((profile) => profile.tenantId)) {
    throw new Error(`Profile for ${normalized} is tenant-scoped`);
  }
  if (matches.some((profile) => profile.metaType !== personMetaType)) {
    throw new Error(`Profile for ${normalized} is not a Person`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple profiles use ${normalized}`);
  }
  return matches[0] ?? null;
}

function createDatabase(state: TestState): TestDatabase {
  const query = vi.fn(async (sql: string, ...values: unknown[]) => {
    if (sql.includes("WHERE users.status = 'active'")) {
      return { rows: state.backfillUsers ?? [] };
    }
    if (sql.includes("FROM users") && sql.includes("FOR UPDATE")) {
      const user = state.users.find((candidate) => candidate.id === values[0]);
      if (!user) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            id: user.id,
            email: user.email,
            profile_id: user.profileId,
            linked_profile_id: state.profiles.some((profile) => profile.id === user.profileId)
              ? user.profileId
              : null,
          },
        ],
      };
    }
    if (sql.includes("FROM profiles") && sql.includes("slug = ?")) {
      return { rows: [] };
    }
    if (sql.includes("FROM users") && sql.includes("profile_id = ?")) {
      return { rows: state.profileOwnedByOther ? [{ id: "other-user" }] : [] };
    }
    if (sql.includes("UPDATE users")) {
      const user = state.users.find((candidate) => candidate.id === values[2]);
      if (user) {
        user.profileId = values[0] as string;
      }
      return { rows: [], rowCount: user ? 1 : 0 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const db = {
    __state: state,
    query,
    transaction: vi.fn(async <T>(callback: (tx: ProfileIdentityDatabase) => Promise<T>) => {
      const snapshot = structuredClone(state);
      try {
        return await callback(db as unknown as ProfileIdentityDatabase);
      } catch (error) {
        state.users = snapshot.users;
        state.profiles = snapshot.profiles;
        state.reservations = snapshot.reservations;
        throw error;
      }
    }),
  };
  return db as unknown as TestDatabase;
}
