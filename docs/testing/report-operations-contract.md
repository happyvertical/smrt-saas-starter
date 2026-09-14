# Report operations acceptance and test design

Issue #101 completes the reports-scoped operation demonstration under #87.
The starter owns user-facing operation state and authenticated human decisions;
SMRT Data Surface Actions, its SQL state store, and SMRT Jobs own confirmation,
idempotency and job delivery. This is a synthetic report example, with no
financial action or external posting.

Ordinary preparation captures a bounded immutable activity-report view without
approval. The separately labelled approval demonstration waits for a human
request before capturing the same neutral result. An agent may request the
demonstration and inspect or cancel its own operation; it has no approval tool.
An authenticated human may prepare and approve the same demonstration.

Submission identity is tenant-scoped: the durable unique key is
`(tenant_id, request_id)`. A same-tenant retry must resolve its original
operation and reject a changed payload, while a different tenant may use the
same request ID for its own operation.

The authoritative effect is the stored report result. An operation-row lock
serializes cancellation with the transaction that stores that result. After
commit, cancellation returns the completed state. An uncertain result cannot be
reported as cancelled or automatically retried as a fresh effect. Framework
idempotency recovery requires live authorization and concrete terminal evidence.

## Behavior-to-test matrix

| Invariant | Trigger and positive case | Denial/failure case | Actor and context | Executor / transaction | Runtime / edge | Test and evidence command |
| --- | --- | --- | --- | --- | --- | --- |
| Operation ownership | Current authorized member prepares and reads own operation | Missing/inactive/revoked member; other tenant; same-tenant other owner; forged actor | Human session and agent principal, selected tenant | Actual membership query and tenant/owner-scoped operation reads | Node, PostgreSQL; authenticated HTTP and principal tool API | Native PG service/route proof; full web tests |
| Immutable result policy | Ordinary prepare queues and stores allowed report fields without approval | Unknown query fields, malformed or oversized input; cross-tenant results | Submitting principal re-resolved by worker | Report read plus result and terminal state in one PostgreSQL transaction | Same public report query/descriptor field policy as report page | Native PG field/parity proof; unit validation tests |
| Human-only decision and resume | Labelled demo waits; authenticated submitter approves exact payload; if enqueue fails after durable approval, that same human resubmits the known operation ID and fingerprint to resume it | Agent approval tool absent; missing or foreign human session; stale or modified payload; a different decision; already-jobbed or terminal operation | Human session at form boundary; agent submit/read/cancel only | Decision tied to immutable operation version and principal, checked again on effect; the retry may only enqueue an approved queued row with no job | Browser form CSRF/session contract; visible **Resume approved demo** form after reload; no assertion that generic preview token proves human intent | Native PG injected post-decision enqueue-fault proof; production browser approval flow |
| Tenant-scoped submission identity | Two tenants create jobs with the same valid stable request ID; same-tenant retry returns its original operation | Changed same-tenant payload conflicts; cross-tenant owner cannot read the other operation | Authorized owner in each tenant | SMRT `(tenant_id, request_id)` unique index and tenant-scoped lookup | PostgreSQL normal migration from the supported pre-operation schema | Native PG operation proof and migrated-schema index inspection |
| Cancellation ordering | Cancellation wins row lock before effect and prevents snapshot | Commit wins first: cancel returns committed outcome; denied caller cannot cancel | Current owner in selected tenant, and worker principal | Same operation row lock for cancel and effect/result commit | PostgreSQL concurrent transactions | Native concurrent cancellation/commit proof, rollback proof |
| Retry and restart | Registered worker consumes durable signed envelope after restart | Tampering, revoked authority, duplicate delivery, crash after effect before acknowledgment | Re-resolved actor/profile/tenant from signed reference | Framework SQL action state and jobs; authoritative operation/result evidence for reconciliation | Public SMRT Jobs, at-least-once delivery | Native PG restart/duplicate/reconciliation proof |
| Interface parity | UI and agent/browser tools prepare/read/cancel through common command authority | Tool input cannot select actor/tenant or approve; stale/unmounted UI cannot claim visible completion | Human UI, WebMCP host, agent principal | Shared server command facade; visible UI acknowledgment after state update | Browser WebMCP and server APIs | Production browser tests plus server/tool integration tests |
| Result durability | Completed result survives process restart and later report changes | No overwritten result or token/secret leakage in status responses | Current authorized owner only | Immutable result persisted with terminal operation | PostgreSQL; bounded JSON payload | Native PG result/fingerprint and response-shape tests |

Only PostgreSQL is supported by this starter deployment. Other SQL dialects are
outside this application integration. No external financial/provider effect is
introduced. Executable evidence and exact commands are recorded before review;
this design document alone is not proof that the feature passes.
