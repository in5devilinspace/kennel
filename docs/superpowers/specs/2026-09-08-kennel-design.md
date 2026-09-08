# Kennel — design spec (draft v0, 2026-09-08)

Linear: project The-Kennel, epic THE-833 (see phases there). Plan origin: THE-832.

## One sentence
Kennel is an open-source support desk and incident console for teams that run fleets of AI agents: tickets in, AI-triaged, SLA-tracked, escalated to a human, with runbooks and post-mortems attached, deployed on Kubernetes with SSO and SLO dashboards.

## Users
- Operator (Matt): runs Onyx + Bloodhound, wants one queue for everything that breaks.
- Tenant admin: a team that adopts Kennel for their own agents; signs in through their IdP.
- Requester: a human or an agent that files a ticket (email, Discord, HTTP).

## Invariants (architecture contract, enforced in code + tests)
1. No ticket is auto-closed by the AI; triage proposes, a human disposes. (approval-gate signature)
2. Every AI triage decision is logged with model, prompt hash, inputs, and eval score.
3. Tenant isolation at the Postgres row level (RLS), never in app code alone.
4. Secrets only via Kubernetes secrets / env; nothing in the repo.
5. SLO breach = alert; no silent failure paths (every swallowed error is a bug).
6. Seizure-safe UI: no strobe, animations >= 2 s, no audio.

## Stack (chosen for the gap list, in order)
Postgres 16 + RLS · Node 22 (TypeScript) API + worker · React UI · Discord bot + IMAP intake ·
LLM triage (OpenRouter, fallback list) + eval harness (pytest or node --test, fixture tickets) ·
k3s on RackNerd VPS · Helm · GitHub Actions → GHCR → rolling deploy · Keycloak (IdP) with SAML SP +
OIDC client in Kennel, Okta developer tenant as 2nd IdP · Prometheus + Grafana + Loki + Alertmanager ·
ntfy pager · Docs: Mintlify or ReadMe project · public changelog.

## Phases (Linear sub-issues)
1. Spec + contract + repo skeleton + CI green on hello-world (wk 1–2)
2. Schema, intake, AI triage + evals (wk 3–4)
3. k3s + Helm + CI/CD (wk 5–6)
4. SSO (wk 7)
5. Observability + on-call (wk 8)
6. Public surface (wk 9–10)

## Not in v1
Billing, multi-region, mobile app, marketplace integrations beyond email/Discord/HTTP.

## Open questions for Matt
- Name/logo (Kokonut gate before any UI code).
- Public from day 1 (yes recommended) or private until phase 3?
- Discord vs Slack first (Discord recommended: free, Onyx already has a bot).
