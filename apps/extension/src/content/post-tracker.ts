/**
 * PostTracker — detects when the user clicks the "Post" button on X.com
 * and, for signed-in users only, sends tracking data (tweet text + ReachOS
 * score) to the API.
 */

import { incrementPostsToday } from './posts-today';

export function setupPostTracker(
  getCurrentText: () => string,
  getCurrentScore: () => number,
  getPredictedReach: () => number,
  onPosted?: (text: string, score: number) => void,
): void {
  const observer = new MutationObserver(() => {
    const postButtons = document.querySelectorAll<HTMLElement>(
      '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
    );

    postButtons.forEach((btn) => {
      if (!btn.hasAttribute("data-reachos-tracked")) {
        btn.setAttribute("data-reachos-tracked", "true");
        btn.addEventListener("click", () => {
          const text = getCurrentText();
          const score = getCurrentScore();
          const predictedReach = getPredictedReach();

          if (text && text.length > 5) {
            // Bump the local "posts today" counter so the next analyse()
            // request can apply the post_frequency penalty. Fire-and-forget;
            // a failed storage write just means the next score is unaffected.
            void incrementPostsToday();

            // Only signed-in users opted into server tracking. Signed-out
            // users stay local: the tweet text never leaves the device.
            void sendTrackingIfSignedIn({
              content: text,
              reachScore: score,
              predictedReach: predictedReach > 0 ? predictedReach : undefined,
              optimized: true,
              tweetUrl: window.location.href,
            });
            // Lock score for X-Ray consistency
            if (onPosted) onPosted(text, score);

            console.log("[ReachOS] Tweet tracked:", {
              score,
              predictedReach,
              textLength: text.length,
            });
          }
        });
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function sendTrackingIfSignedIn(body: Record<string, unknown>): Promise<void> {
  try {
    const { authToken } = await chrome.storage.local.get("authToken");
    if (!authToken) return;
    chrome.runtime.sendMessage({
      type: "API_REQUEST",
      endpoint: "/api/tweets/track",
      method: "POST",
      body,
    });
  } catch {
    // Extension context lost: skip tracking.
  }
}
