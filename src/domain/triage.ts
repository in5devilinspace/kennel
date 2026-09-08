/**
 * Triage proposals.
 *
 * Invariant 2: every AI decision is logged with model, prompt hash, inputs hash and time.
 * Invariant 1 restated: a proposal can move a ticket to "triaged" and nothing further.
 */
import { transition, type Actor, type Ticket, type TriageProposal } from './ticket.ts';

export class InvalidProposal extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidProposal'; }
}

export type ProposalInput = Omit<TriageProposal, 'at' | 'actor'>;

export function recordProposal(ticket: Ticket, input: ProposalInput, actor: Actor, now: Date = new Date()): Ticket {
  for (const key of ['model', 'promptHash', 'inputsHash', 'category', 'priority'] as const) {
    if (!input[key]) throw new InvalidProposal(`invariant 2: proposal is missing ${key}`);
  }
  if (!(input.confidence >= 0 && input.confidence <= 1)) {
    throw new InvalidProposal('invariant 2: confidence must be within [0, 1]');
  }
  // Whatever the model suggested about status is discarded on purpose.
  const { category, priority, runbookId, confidence, model, promptHash, inputsHash, evalScore } = input;
  const proposal: TriageProposal = { category, priority, runbookId, confidence, model, promptHash, inputsHash, evalScore, at: now, actor };
  const withProposal: Ticket = { ...ticket, proposals: [...ticket.proposals, proposal] };
  return ticket.status === 'new' ? transition(withProposal, 'triaged', actor, now) : withProposal;
}
