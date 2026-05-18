/**
 * Tracks how many posts the author has made today (UTC), persisted in
 * chrome.storage.local. Used by the v4 `post_frequency` signal so the
 * server/client engine can penalise timeline-spamming behaviour.
 *
 * The storage entry is reset implicitly by the date key: each new UTC day
 * gets a fresh counter. We don't bother garbage-collecting old keys —
 * chrome.storage.local has ~10MB and we'd add ~365 bytes/year.
 */
const STORAGE_PREFIX = 'reachos:postsToday:';

function todayKey(): string {
  // YYYY-MM-DD in UTC. Stable boundary that matches how X's daily
  // distribution windows are reported.
  return STORAGE_PREFIX + new Date().toISOString().slice(0, 10);
}

let cached = 0;
// Track the *date key* the cache was primed for, not just a boolean. If the
// user leaves X open across a UTC midnight boundary, comparing this to a
// freshly computed todayKey() catches the rollover so we don't carry
// yesterday's count into a new day's storage entry.
let primedKey: string | null = null;

/** Load today's count from storage into the in-memory cache. */
export async function primePostsToday(): Promise<void> {
  const key = todayKey();
  if (primedKey === key) return;
  const stored = await chrome.storage.local.get(key);
  cached = typeof stored[key] === 'number' ? stored[key] : 0;
  primedKey = key;
}

/**
 * Read the cached count synchronously. Detects UTC-day rollover: if the
 * cache was primed for a previous day, return 0 and trigger an async
 * re-prime so the next read picks up the new day's stored count.
 */
export function getPostsToday(): number {
  if (primedKey !== null && primedKey !== todayKey()) {
    cached = 0;
    primedKey = null;
    void primePostsToday();
  }
  return cached;
}

/** Bump the count after a successful Post click. */
export async function incrementPostsToday(): Promise<number> {
  // primePostsToday() now also handles day rollover, so increments after
  // midnight start the new day from the correct (zero or stored) baseline.
  await primePostsToday();
  cached += 1;
  await chrome.storage.local.set({ [todayKey()]: cached });
  return cached;
}
