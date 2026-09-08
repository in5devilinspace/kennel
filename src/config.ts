/** All configuration from the environment (invariant 4). */
export type Config = {
  port: number;
  databaseUrl?: string;
  openRouterKey?: string;
  triageModels: string[];
  discord?: { publicKeyHex: string; tenantByGuild: Record<string, string> };
  maildir?: { dir: string; tenantId: string };
  workerIntervalMs: number;
};

export function loadConfig(env = process.env): Config {
  const tenantByGuild: Record<string, string> = {};
  for (const pair of (env.KENNEL_DISCORD_GUILDS ?? '').split(',').filter(Boolean)) {
    const [guild, tenant] = pair.split('=');
    if (guild && tenant) tenantByGuild[guild.trim()] = tenant.trim();
  }
  return {
    port: Number(env.PORT ?? 8080),
    databaseUrl: env.DATABASE_URL,
    openRouterKey: env.OPENROUTER_API_KEY,
    triageModels: (env.KENNEL_TRIAGE_MODELS ?? 'anthropic/claude-sonnet-5,openai/gpt-5-mini').split(',').map(s => s.trim()).filter(Boolean),
    discord: env.KENNEL_DISCORD_PUBLIC_KEY ? { publicKeyHex: env.KENNEL_DISCORD_PUBLIC_KEY, tenantByGuild } : undefined,
    maildir: env.KENNEL_MAILDIR && env.KENNEL_MAILDIR_TENANT ? { dir: env.KENNEL_MAILDIR, tenantId: env.KENNEL_MAILDIR_TENANT } : undefined,
    workerIntervalMs: Number(env.KENNEL_WORKER_INTERVAL_MS ?? 30_000),
  };
}
