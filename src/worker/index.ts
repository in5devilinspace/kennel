/** Worker: intake pollers (email, Discord) and the triage loop land here in phase 2. */
export async function tick(now: Date = new Date()): Promise<{ at: string; polled: string[] }> {
  return { at: now.toISOString(), polled: [] };
}
if (import.meta.main) {
  tick().then(r => console.log('[kennel] worker tick', r));
}
