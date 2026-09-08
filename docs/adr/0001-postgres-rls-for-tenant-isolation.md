# ADR-0001: Tenant isolation with Postgres row-level security
Date: 2026-09-08. Status: accepted.

**Context.** Kennel is multi-tenant from day one (Onyx, Bloodhound, then strangers). App-level
`where tenant_id = ?` filters are forgotten exactly once. **Decision.** Every tenant-scoped
table gets RLS with `force row level security`; the app role sets `app.tenant_id` per
transaction. **Consequences.** Slightly more ceremony per query; a missing setting returns
zero rows instead of everyone's rows. Tests in phase 2 assert cross-tenant reads return nothing.
