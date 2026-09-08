import { createHash } from 'node:crypto';
import type { Ticket } from '../domain/ticket.ts';

export const CATEGORIES = ['infra', 'integration', 'agent-behavior', 'billing', 'access', 'question', 'feature'] as const;
export type Category = typeof CATEGORIES[number];

export const PROMPT_VERSION = 'triage-v1';

export function buildPrompt(ticket: Pick<Ticket, 'title' | 'body' | 'source'>, runbookSlugs: string[]): { system: string; user: string; promptHash: string; inputsHash: string } {
  const system = [
    `You are Kennel's triage assistant (${PROMPT_VERSION}). You propose; a human decides.`,
    `Categories: ${CATEGORIES.join(', ')}. Priorities: p1 (production down / data loss), p2 (degraded, workaround exists), p3 (normal), p4 (low / cosmetic).`,
    runbookSlugs.length ? `Known runbooks: ${runbookSlugs.join(', ')}. Name one only if it clearly applies.` : 'No runbooks are known.',
    'Answer with JSON only: {"category": string, "priority": "p1"|"p2"|"p3"|"p4", "runbook": string|null, "confidence": number 0..1, "reason": string (one sentence)}.',
    'Never claim the issue is resolved. Never suggest closing.',
  ].join('\n');
  const user = `Source: ${ticket.source}\nTitle: ${ticket.title}\n\n${ticket.body}`;
  const sha = (s: string) => 'sha256:' + createHash('sha256').update(s).digest('hex');
  return { system, user, promptHash: sha(system), inputsHash: sha(user) };
}

export function parseTriageJson(text: string): { category: Category; priority: 'p1' | 'p2' | 'p3' | 'p4'; runbook: string | null; confidence: number; reason: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!CATEGORIES.includes(j.category) || !['p1', 'p2', 'p3', 'p4'].includes(j.priority)) return null;
    const confidence = Math.max(0, Math.min(1, Number(j.confidence ?? 0.5)));
    return { category: j.category, priority: j.priority, runbook: j.runbook ?? null, confidence, reason: String(j.reason ?? '') };
  } catch { return null; }
}
