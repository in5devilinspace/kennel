/**
 * Kennel ticket state machine.
 *
 * Invariant 1 (architecture.md): an agent may propose, a human disposes.
 * No actor of kind "agent" can move a ticket to resolved or closed.
 */
export type TicketStatus = 'new' | 'triaged' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type Priority = 'p1' | 'p2' | 'p3' | 'p4';
export type Source = 'email' | 'discord' | 'http';
export type Actor = { kind: 'human' | 'agent'; id: string };

export type Transition = { from: TicketStatus | null; to: TicketStatus; actor: Actor; at: Date };

export type TriageProposal = {
  category: string;
  priority: Priority;
  runbookId?: string;
  confidence: number;
  model: string;
  promptHash: string;
  inputsHash: string;
  evalScore?: number;
  at: Date;
  actor: Actor;
};

export type Ticket = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  source: Source;
  priority: Priority;
  status: TicketStatus;
  createdAt: Date;
  firstHumanResponseAt?: Date;
  history: Transition[];
  proposals: TriageProposal[];
};

export class InvariantViolation extends Error {
  constructor(message: string) { super(message); this.name = 'InvariantViolation'; }
}

const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  new: ['triaged', 'in_progress'],
  triaged: ['in_progress', 'waiting', 'resolved'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
};

const HUMAN_ONLY: ReadonlySet<TicketStatus> = new Set(['resolved', 'closed']);

const SYSTEM: Actor = { kind: 'human', id: 'system' };

export function createTicket(input: {
  tenantId: string; title: string; body: string; source: Source; priority?: Priority; now?: Date; id?: string;
}): Ticket {
  const now = input.now ?? new Date();
  return {
    id: input.id ?? `tk_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    tenantId: input.tenantId,
    title: input.title,
    body: input.body,
    source: input.source,
    priority: input.priority ?? 'p3',
    status: 'new',
    createdAt: now,
    history: [{ from: null, to: 'new', actor: SYSTEM, at: now }],
    proposals: [],
  };
}

export function transition(ticket: Ticket, to: TicketStatus, actor: Actor, now: Date = new Date()): Ticket {
  if (actor.kind === 'agent' && HUMAN_ONLY.has(to)) {
    throw new InvariantViolation(`invariant 1: agent ${actor.id} may not move ticket ${ticket.id} to ${to}`);
  }
  if (!ALLOWED[ticket.status].includes(to)) {
    throw new InvariantViolation(`illegal transition ${ticket.status} -> ${to} on ${ticket.id}`);
  }
  return {
    ...ticket,
    status: to,
    history: [...ticket.history, { from: ticket.status, to, actor, at: now }],
  };
}
