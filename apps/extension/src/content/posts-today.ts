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
let primed = false;

/** Load today's count from storage into the in-memory cache. */
export async function primePostsToday(): Promise<void> {
  if (primed) return;
  const key = todayKey();
  const stored = await chrome.storage.local.get(key);
  cached = typeof stored[key] === 'number' ? stored[key] : 0;
  primed = true;
}

/** Read the cached count synchronously. Returns 0 if not yet primed. */
export function getPostsToday(): number {
  return cached;
}

/** Bump the count after a successful Post click. */
export async function incrementPostsToday(): Promise<number> {
  await primePostsToday();
  cached += 1;
  await chrome.storage.local.set({ [todayKey()]: cached });
  return cached;
}
