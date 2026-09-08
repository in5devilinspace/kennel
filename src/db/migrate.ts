import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool, closePool } from './pool.ts';

const dir = path.resolve(import.meta.dirname, '../../db/migrations');

export async function migrate(url = process.env.DATABASE_URL): Promise<string[]> {
  const db = getPool(url);
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const applied = new Set((await db.query('select name from schema_migrations')).rows.map(r => r.name));
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = await readFile(path.join(dir, f), 'utf8');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('insert into schema_migrations (name) values ($1)', [f]);
      await c.query('commit');
      done.push(f);
    } catch (err) {
      await c.query('rollback');
      throw new Error(`migration ${f} failed: ${(err as Error).message}`);
    } finally { c.release(); }
  }
  return done;
}

if (import.meta.main) {
  migrate().then(d => { console.log('[kennel] migrated', d.length ? d : '(nothing new)'); return closePool(); })
    .catch(e => { console.error(e); process.exit(1); });
}
