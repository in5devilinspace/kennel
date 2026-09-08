import type { Repo } from '../db/repo.ts';
import type { Ticket } from '../domain/ticket.ts';
import { recordProposal } from '../domain/triage.ts';
import { buildPrompt, parseTriageJson } from './prompt.ts';
import type { ChatFn } from './model.ts';

export const TRIAGE_ACTOR = { kind: 'agent', id: 'kennel-triage' } as const;

export async function triageTicket(repo: Repo, chat: ChatFn, ticket: Ticket, runbookSlugs: string[] = []): Promise<Ticket> {
  const { system, user, promptHash, inputsHash } = buildPrompt(ticket, runbookSlugs);
  const { text, model } = await chat(system, user);
  const parsed = parseTriageJson(text);
  if (!parsed) throw new Error(`triage: model ${model} returned no valid JSON for ticket ${ticket.id}`);
  const proposal = { category: parsed.category, priority: parsed.priority, runbookId: parsed.runbook ?? undefined, confidence: parsed.confidence, model, promptHash, inputsHash };
  const next = recordProposal(ticket, proposal, TRIAGE_ACTOR);           // domain invariants apply
  await repo.saveProposal(ticket.tenantId, ticket.id, next.proposals.at(-1)!);
  if (next.status !== ticket.status) await repo.saveTransition(ticket.tenantId, ticket.id, ticket.status, next.status, TRIAGE_ACTOR);
  return next;
}

/** One pass over every `new` ticket of a tenant. */
export async function triageNewTickets(repo: Repo, chat: ChatFn, tenantId: string): Promise<{ triaged: number; failed: number }> {
  let triaged = 0, failed = 0;
  for (const t of await repo.listTickets(tenantId, 'new')) {
    try { await triageTicket(repo, chat, t); triaged++; }
    catch (err) { failed++; console.error('[kennel] triage failed', t.id, (err as Error).message); }
  }
  return { triaged, failed };
}
