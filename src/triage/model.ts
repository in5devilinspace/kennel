/** Model client. OpenRouter with a fallback list; stub for tests and offline evals. */
export type ChatFn = (system: string, user: string) => Promise<{ text: string; model: string }>;

export function openRouterChat(opts: { apiKey: string; models: string[]; timeoutMs?: number }): ChatFn {
  return async (system, user) => {
    let lastErr: unknown;
    for (const model of opts.models) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 30_000);
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: ctl.signal,
          headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json', 'x-title': 'Kennel' },
          body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        });
        const j: any = await res.json();
        if (!res.ok || j.error) throw new Error(`openrouter ${model}: ${res.status} ${j.error?.message ?? ''}`);
        return { text: j.choices?.[0]?.message?.content ?? '', model: j.model ?? model };
      } catch (err) { lastErr = err; console.warn('[kennel] triage model failed, trying next', model, (err as Error).message); }
      finally { clearTimeout(timer); }
    }
    throw new Error(`all triage models failed: ${(lastErr as Error)?.message}`);
  };
}

/** Deterministic keyword stub: good enough to test the pipeline and to run evals offline. */
export const stubChat: ChatFn = async (_system, user) => {
  const t = user.toLowerCase();
  const category = /invoice|charge|refund|stripe|billing/.test(t) ? 'billing'
    : /login|sso|saml|password|permission|access|403|401/.test(t) ? 'access'
    : /webhook|oauth|api key|integration|sync/.test(t) ? 'integration'
    : /hallucinat|wrong answer|agent (said|did)|loop|tool call/.test(t) ? 'agent-behavior'
    : /down|502|503|timeout|crash|outage|disk|cpu|memory/.test(t) ? 'infra'
    : /feature|could you add|would be nice/.test(t) ? 'feature' : 'question';
  const priority = /down|outage|data loss|all users|production/.test(t) ? 'p1'
    : /degraded|slow|intermittent|workaround|twice|refund|burned|loop|403|401|crash|cannot access/.test(t) ? 'p2'
    : /cosmetic|typo|minor|would be nice/.test(t) ? 'p4' : 'p3';
  return { text: JSON.stringify({ category, priority, runbook: null, confidence: 0.6, reason: 'keyword stub' }), model: 'stub/keywords' };
};
