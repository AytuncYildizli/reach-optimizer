/**
 * Learned weights: per-signal point adjustments the API's learn-weights cron
 * derives from how the user's tracked tweets actually performed. Signed-in
 * users fetch them from /api/weights; the composer engine applies them so the
 * local score matches the server's (which applies the same adjustments).
 *
 * X-Ray scores other people's tweets, so it keeps a plain engine.
 */
import { ScoreEngine, type WeightAdjustments } from "@reach/rules-engine";

/** Engine for the user's own drafts (composer score + auto-optimize). */
export const composerEngine = new ScoreEngine();

const CACHE_KEY = "learnedWeights";
// The cron runs daily; refresh a few times a day at most.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface CachedWeights {
  adjustments: WeightAdjustments;
  fetchedAt: number;
}

function isAdjustments(value: unknown): value is WeightAdjustments {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "number")
  );
}

function refresh(): void {
  chrome.runtime.sendMessage(
    { type: "API_REQUEST", endpoint: "/api/weights", method: "GET" },
    (response) => {
      if (chrome.runtime.lastError) return;
      const adjustments = response?.ok ? response.data?.adjustments : undefined;
      if (!isAdjustments(adjustments)) return;
      composerEngine.setAdjustments(adjustments);
      const cached: CachedWeights = { adjustments, fetchedAt: Date.now() };
      void chrome.storage.local.set({ [CACHE_KEY]: cached });
    },
  );
}

/** Apply cached weights now and refresh them in the background when stale. */
export function initLearnedWeights(): void {
  try {
    chrome.storage.local.get([CACHE_KEY, "authToken"], (result) => {
      if (chrome.runtime.lastError) return;
      if (!result.authToken) {
        composerEngine.setAdjustments(null);
        return;
      }
      const cached = result[CACHE_KEY] as CachedWeights | undefined;
      if (cached && isAdjustments(cached.adjustments)) {
        composerEngine.setAdjustments(cached.adjustments);
      }
      if (!cached || Date.now() - cached.fetchedAt > MAX_AGE_MS) refresh();
    });

    // Signing out drops the learned weights; signing in fetches them.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !("authToken" in changes)) return;
      if (changes.authToken.newValue) {
        refresh();
      } else {
        composerEngine.setAdjustments(null);
        void chrome.storage.local.remove(CACHE_KEY);
      }
    });
  } catch {
    // Extension context lost: keep default weights.
  }
}
