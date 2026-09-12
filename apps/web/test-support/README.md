# Neutral tenant acceptance fixture

`createNeutralTenantFixture(db, namespace)` creates test-only identity and RBAC
rows in a normally migrated and seeded disposable PostgreSQL database. Pass an
explicit UUID namespace and a public SDK database with transaction support.
It does not migrate, connect implicitly, create sessions or use demo auth.

The fixture returns tenant A/B IDs; shared, A-only, A/B admin, viewer, inactive
membership and service-intended actor IDs; and an owned cleanup function.
Every actor is an ordinary SMRT User with a global Person profile. The
service-intended actor has explicit tenant A membership and a descriptor in the
published agents `PrincipalBinding` shape. This is **not** service-credential,
Bot-profile or human-approval evidence. Integration callers still authenticate
and bind their actual principal through public APIs.

Roles retain starter `admin`, `member`, `viewer` slugs in fixture-owned contexts.
The public PermissionResolver resolves explicit neutral `fixture.report.read`
and `fixture.report.prepare` grants; viewer cannot prepare and inactive or
nonmember actors receive none. These neutral grants do not claim to implement
report permissions or full production authorization. Production starter role
mapping and framework permission resolution are distinct contracts to exercise
in the later combined suite.

All inserts run in one transaction. A namespace advisory lock serializes setup
and cleanup; existing namespaces are rejected, never overwritten. UUIDs derive
from the namespace. Each creation has a distinct ownership generation, so an old
cleanup handle cannot remove a recreated fixture. Cleanup validates and locks ownership before deleting only
recorded IDs in dependency order. Repeated cleanup is safe. Clean dependent
records added by a consuming suite before fixture cleanup; this helper does not
cascade through arbitrary jobs, sessions, subscriptions or report assets.

Use the owning integration worker's dedicated PostgreSQL port/project. Never
point this helper at real data or reuse an ambient database. For an example dedicated
local fixture database, after ordinary install/object build:

```sh
DATABASE_URL=postgres://smrt_saas:localdev@127.0.0.1:55510/smrt_saas pnpm db:seed
NEUTRAL_FIXTURE_DATABASE_URL=postgres://smrt_saas:localdev@127.0.0.1:55510/smrt_saas node apps/web/test-support/neutral-tenant-fixture.proof.mjs
```

The proof checks actual PostgreSQL rows and the published PermissionResolver:
actor/tenant grants, duplicate and malformed namespace rejection, concurrent
setup, insertion rollback, ownership-change refusal, independent fixture
isolation, cleanup and deterministic recreation. It makes no browser, report
refresh, durable job, session or end-to-end acceptance claim. This support is
outside the web package's published `files` list and has no production import.

API inspection: public SMRT users/profiles0.49.2 model schemas and agents0.49.2
`PrincipalBinding`; public SQL0.89.8 transaction/insert/query interface. Direct
seed rows follow existing `scripts/smrt-db-seed.mjs` and transactional onboarding
conventions, with insert-only behavior to avoid replacing existing identities.
