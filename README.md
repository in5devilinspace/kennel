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

Phase 2 of 6 in progress: Postgres with row-level security live, HTTP + Discord + email intake,
AI triage with provenance, an offline eval harness. CI runs the RLS tests against a real Postgres.
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
node --version                 # 24 or newer, TypeScript runs natively
npm run db:up                  # Postgres 16 on 127.0.0.1:5433 (docker compose)
cp .env.example .env           # then export DATABASE_URL=postgres://kennel:kennel@127.0.0.1:5433/kennel
npm run migrate                # applies db/migrations/*.sql
npm run seed -- onyx "Onyx"    # prints a tenant id and an API key, once
npm test                       # 27 tests; RLS tests run when DATABASE_URL is set
npm run eval                   # triage eval over test/fixtures/tickets.json (stub or OpenRouter)
npm start                      # API on :8080
npm run worker                 # maildir poll + triage loop
```

File a ticket:

```sh
curl -s -X POST localhost:8080/v1/tickets -H "authorization: Bearer kn_…" \
  -H "content-type: application/json" -d '{"title":"Voice room 502","body":"all users, production","priority":"p1"}'
```

Intake paths: `POST /v1/tickets` (API key), `POST /discord/interactions` (Discord app with the
`/ticket` slash command; requests are Ed25519-verified), and a maildir drop (`KENNEL_MAILDIR`,
any MTA that writes raw `.eml` into `new/`). Every path dedupes on the external id.

Triage: the worker asks the model (OpenRouter, fallback list) for a category, priority, runbook
and confidence, stores the proposal with model + prompt hash + inputs hash, and moves the ticket
to `triaged`. It cannot go further; a human resolves. `npm run eval` scores a model against the
fixture set: category accuracy, priority accuracy, escalation precision/recall.

## Eval numbers

`npm run eval` on the 10-ticket fixture set (`test/fixtures/tickets.json`), 2026-09-08:

| model | category acc | priority acc | escalation precision | escalation recall | invalid |
|---|---|---|---|---|---|
| stub/keywords (offline) | 1.00 | 0.90 | 0.83 | 1.00 | 0 |
| anthropic/claude-sonnet-5 via OpenRouter | 0.90 | 0.60 | 0.71 | 1.00 | 0 |

The stub is tuned to the fixtures, so its numbers are an upper bound on the harness, not a
model result. The real model over-escalates (recall 1.0, precision 0.71): it calls p2 where the
human said p3. That is the right failure direction for a support desk and the first thing the
prompt work in phase 2 will tune, against a larger fixture set.

## The rules the code keeps

1. AI proposes, a human disposes. Agents never resolve or close.
2. Every AI decision is stored with model, prompt hash, inputs hash.
3. Tenant isolation is a database policy, not an app filter.
4. No secrets in the repo.
5. No silent failures.
6. Seizure-safe UI: nothing flashes, animations take 2 s or more, no audio.

## License

MIT. See `LICENSE`.
