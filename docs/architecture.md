# Kennel architecture contract

This file is binding. A change that breaks an invariant is a bug even if every test passes.
Spec: `docs/superpowers/specs/2026-09-08-kennel-design.md`. Decisions: `docs/adr/`.

## Invariants

1. **AI proposes, a human disposes.** No actor of kind `agent` can move a ticket to `resolved`
   or `closed`. Enforced in `src/domain/ticket.ts` (throws `InvariantViolation`) and in
   Postgres (`ticket_transitions.agent_never_disposes` check).
2. **Every AI decision carries provenance.** A triage proposal without `model`, `promptHash`
   and `inputsHash` is rejected (`src/domain/triage.ts`, `triage_proposals` NOT NULL + checks).
   Eval scores attach to the proposal, never replace it.
3. **Tenant isolation lives in the database.** Every tenant-scoped table has row-level
   security keyed on `app.tenant_id`; the app role cannot bypass it (`force row level
   security`). Application-level filters are a convenience, not the boundary.
4. **Secrets never enter the repo or Linear.** Configuration comes from environment /
   Kubernetes secrets. CI fails on committed secrets (gitleaks, phase 3).
5. **No silent failures.** Every error path is either handled and logged with context or
   propagates. SLO breaches alert. A swallowed error is a bug.
6. **Seizure-safe UI.** No element flashes above 3 Hz, animations run 2 s or longer, no
   autoplaying audio. Reduced-motion is honored.

## Shape

- `src/domain/` pure TypeScript, no I/O: tickets, triage, SLA. All invariants testable here.
- `src/api/` HTTP surface (Node stdlib in phase 1; framework decision is ADR-0003).
- `src/worker/` pollers and the triage loop.
- `db/schema.sql` the schema and RLS policies; migrations arrive in phase 2.
- `test/` `node --test`, TypeScript run natively (Node ≥ 24, type stripping).

## Runtime rules

- Node 24+, TypeScript with erasable syntax only (no enums, no namespaces, no decorators).
- Zero runtime dependencies until phase 2 adds `pg` and the Discord client. Every added
  dependency gets one line in ADR-0004 saying why.
- Atomic writes for any file the app owns. Idempotent intake: the same email or Discord
  message never creates two tickets (dedupe key = source + external id).

## Tenants 1 and 2

Onyx and Bloodhound file tickets over HTTP; their runbooks are imported from their repos.
