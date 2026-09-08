# ADR-0002: The AI may triage, only a human resolves or closes
Date: 2026-09-08. Status: accepted.

**Context.** The point of Kennel is trustworthy AI in the support loop. Auto-closing is where
support bots lose trust. **Decision.** Agents may create proposals and move `new -> triaged`.
`resolved` and `closed` require a human actor, enforced in code and in a database check.
**Consequences.** Deflection is measured as "human accepted the proposal unchanged", not as
"bot closed it". Evals score proposals against human dispositions.
