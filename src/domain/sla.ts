/** SLA policy: minutes to first human response per priority. */
import type { Priority, Ticket } from './ticket.ts';

export type SlaPolicy = Record<Priority, { firstResponseMinutes: number }>;

export const DEFAULT_POLICY: SlaPolicy = {
  p1: { firstResponseMinutes: 30 },
  p2: { firstResponseMinutes: 4 * 60 },
  p3: { firstResponseMinutes: 24 * 60 },
  p4: { firstResponseMinutes: 3 * 24 * 60 },
};

export function firstResponseDue(ticket: Ticket, policy: SlaPolicy): Date {
  return new Date(ticket.createdAt.getTime() + policy[ticket.priority].firstResponseMinutes * 60_000);
}

export function isBreached(ticket: Ticket, policy: SlaPolicy, now: Date = new Date()): boolean {
  if (ticket.firstHumanResponseAt) return false;
  return now.getTime() > firstResponseDue(ticket, policy).getTime();
}
