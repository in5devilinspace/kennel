import pg from 'pg';

export type Db = pg.Pool;

let pool: pg.Pool | undefined;

export function getPool(url = process.env.DATABASE_URL): pg.Pool {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!pool) pool = new pg.Pool({ connectionString: url, max: 8 });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Invariant 3: every tenant-scoped query runs inside a transaction that has
 * `app.tenant_id` set. Without it RLS returns nothing, which is the point.
 */
export async function withTenant<T>(db: pg.Pool, tenantId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    // Superusers and owners bypass RLS; the runtime always drops to the app role first.
    await client.query('set local role kennel_app');
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
