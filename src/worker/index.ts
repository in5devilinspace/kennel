/**
 * Worker: polls the maildir (if configured) and runs triage over every `new`
 * ticket of every tenant it knows about. One tick = one pass; the loop is a
 * setInterval so a slow model never overlaps with itself (ticks skip while busy).
 */
import { loadConfig, type Config } from '../config.ts';
import type { Repo } from '../db/repo.ts';
import { pollMaildir } from '../intake/maildir.ts';
import { triageNewTickets } from '../triage/service.ts';
import { openRouterChat, stubChat, type ChatFn } from '../triage/model.ts';

export async function tick(repo: Repo, chat: ChatFn, cfg: Pick<Config, 'maildir'>, tenantIds: string[], now: Date = new Date()) {
  const out: Record<string, unknown> = { at: now.toISOString() };
  if (cfg.maildir) out.maildir = await pollMaildir(repo, cfg.maildir.dir, cfg.maildir.tenantId);
  out.triage = Object.fromEntries(await Promise.all(tenantIds.map(async id => [id, await triageNewTickets(repo, chat, id)])));
  return out;
}

if (import.meta.main) {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) { console.error('[kennel] worker needs DATABASE_URL'); process.exit(1); }
  const { getPool } = await import('../db/pool.ts');
  const { PgRepo } = await import('../db/repo.ts');
  const pool = getPool(cfg.databaseUrl);
  const repo = new PgRepo(pool);
  const chat = cfg.openRouterKey ? openRouterChat({ apiKey: cfg.openRouterKey, models: cfg.triageModels }) : stubChat;
  if (!cfg.openRouterKey) console.warn('[kennel] OPENROUTER_API_KEY unset: triage uses the keyword stub');
  let busy = false;
  const run = async () => {
    if (busy) return; busy = true;
    try {
      const tenants = (await pool.query('select id from tenants')).rows.map(r => r.id);
      console.log('[kennel] tick', JSON.stringify(await tick(repo, chat, cfg, tenants)));
    } catch (err) { console.error('[kennel] tick failed', err); }
    finally { busy = false; }
  };
  await run();
  setInterval(run, cfg.workerIntervalMs);
}
