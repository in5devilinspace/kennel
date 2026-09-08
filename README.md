# Kennel

**An open-source support desk and incident console for teams that run fleets of AI agents.**

Tickets come in from email, Discord, or HTTP. An AI triage agent proposes a category, a
priority, and a runbook, and records exactly which model and prompt said so. A human accepts,
edits, or overrides. SLAs are tracked, breaches page someone, incidents collect their tickets
and end in a written post-mortem. Multi-tenant with row-level security, deployed on
Kubernetes, signed in through SAML or OIDC, watched by Prometheus.

Kennel is being built in public, ten weeks, by [Matthew Dundore](https://www.linkedin.com/in/matthewdundore),
with Claude Code as the pair. Its first two tenants are the systems that needed it:
[Onyx](https://github.com/in5devilinspace) (a self-hosted 556-node agent assistant) and
Bloodhound (an approval-gated job-application control plane).

## Status

Phase 1 of 6: architecture contract, schema, domain model with tests, API skeleton, CI.
See `docs/architecture.md` for the six invariants and `docs/adr/` for decisions.
Roadmap: Linear project *The-Kennel*.

| phase | weeks | what |
|---|---|---|
| 1 | 1–2 | contract, schema, domain + tests, CI |
| 2 | 3–4 | Postgres RLS live, email + Discord intake, AI triage + eval harness |
| 3 | 5–6 | k3s, Helm, GitHub Actions → GHCR → rolling deploy |
| 4 | 7 | Keycloak SAML/OIDC, Okta as second IdP |
| 5 | 8 | Prometheus/Grafana/Loki, SLOs, on-call pager |
| 6 | 9–10 | docs site, changelog, demo, post-mortem |

## Run it

```sh
node --version        # 24 or newer, TypeScript runs natively
npm test              # node --test test/*.test.ts
npm run typecheck     # tsc --noEmit
node src/api/server.ts   # :8080 → /healthz /readyz /metrics
```

Postgres: `psql -f db/schema.sql` creates the tables, the `kennel_app` role and the RLS
policies. The app sets `app.tenant_id` per transaction; without it every query sees nothing.

## The rules the code keeps

1. AI proposes, a human disposes. Agents never resolve or close.
2. Every AI decision is stored with model, prompt hash, inputs hash.
3. Tenant isolation is a database policy, not an app filter.
4. No secrets in the repo.
5. No silent failures.
6. Seizure-safe UI: nothing flashes, animations take 2 s or more, no audio.

## License

MIT. See `LICENSE`.
