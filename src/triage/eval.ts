/**
 * Eval harness: fixture tickets with the human's final disposition.
 * Reports category accuracy, priority accuracy, and escalation precision/recall
 * (escalation = the model proposes p1/p2). Runs offline with the stub, or against
 * OpenRouter when OPENROUTER_API_KEY is set.
 */
import { readFile } from 'node:fs/promises';
import { buildPrompt, parseTriageJson } from './prompt.ts';
import { openRouterChat, stubChat, type ChatFn } from './model.ts';

export type Fixture = { id: string; source: 'email' | 'discord' | 'http'; title: string; body: string; human: { category: string; priority: string } };
export type EvalReport = { n: number; categoryAccuracy: number; priorityAccuracy: number; escalation: { precision: number; recall: number }; invalid: number; model: string; perTicket: { id: string; category: string; priority: string; ok: boolean }[] };

export async function runEval(fixtures: Fixture[], chat: ChatFn): Promise<EvalReport> {
  let cat = 0, pri = 0, invalid = 0, tp = 0, fp = 0, fn = 0; let model = '';
  const perTicket: EvalReport['perTicket'] = [];
  for (const f of fixtures) {
    const { system, user } = buildPrompt(f, []);
    const r = await chat(system, user); model = r.model;
    const p = parseTriageJson(r.text);
    if (!p) { invalid++; perTicket.push({ id: f.id, category: '?', priority: '?', ok: false }); continue; }
    const okC = p.category === f.human.category, okP = p.priority === f.human.priority;
    if (okC) cat++; if (okP) pri++;
    const predEsc = p.priority === 'p1' || p.priority === 'p2', trueEsc = f.human.priority === 'p1' || f.human.priority === 'p2';
    if (predEsc && trueEsc) tp++; else if (predEsc && !trueEsc) fp++; else if (!predEsc && trueEsc) fn++;
    perTicket.push({ id: f.id, category: p.category, priority: p.priority, ok: okC && okP });
  }
  const n = fixtures.length;
  return { n, categoryAccuracy: cat / n, priorityAccuracy: pri / n, escalation: { precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1 }, invalid, model, perTicket };
}

if (import.meta.main) {
  const fixtures: Fixture[] = JSON.parse(await readFile(new URL('../../test/fixtures/tickets.json', import.meta.url), 'utf8'));
  const chat = process.env.OPENROUTER_API_KEY
    ? openRouterChat({ apiKey: process.env.OPENROUTER_API_KEY, models: (process.env.KENNEL_TRIAGE_MODELS ?? 'anthropic/claude-sonnet-5,openai/gpt-5-mini').split(',') })
    : stubChat;
  const r = await runEval(fixtures, chat);
  console.log(JSON.stringify({ model: r.model, n: r.n, categoryAccuracy: r.categoryAccuracy.toFixed(2), priorityAccuracy: r.priorityAccuracy.toFixed(2), escalation: r.escalation, invalid: r.invalid }, null, 2));
}
