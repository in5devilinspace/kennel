# ADR-0004: Dependency ledger
Date: 2026-09-08. Status: living.

| package | since | why | owner |
|---|---|---|---|
| typescript (dev) | phase 1 | `tsc --noEmit` type check in CI | claude |
| @types/node (dev) | phase 1 | types for the stdlib | claude |
| pg | phase 2 | Postgres client; RLS-scoped transactions in `src/db/pool.ts` | claude |
| @types/pg (dev) | phase 2 | types | claude |
