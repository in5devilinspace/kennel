# ADR-0003: Node stdlib first, TypeScript run natively, no framework in phase 1
Date: 2026-09-08. Status: accepted.

**Context.** Bloodhound proved that zero runtime dependencies keeps the surface small and the
tests fast. Node 24+ runs TypeScript directly. **Decision.** `node:http` for the API, `node:test`
for tests, erasable-syntax TypeScript, no build step. Revisit at phase 2 if routing gets ugly;
candidates: Hono (tiny) or Fastify. **Consequences.** Hand-rolled routing for now; every
dependency added later is logged in ADR-0004.
