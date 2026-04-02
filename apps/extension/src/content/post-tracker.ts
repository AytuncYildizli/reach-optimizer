/**
 * PostTracker — detects when the user clicks the "Post" button on X.com
 * and sends tracking data (tweet text + ReachOS score) to the API.
 */

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
            chrome.runtime.sendMessage({
              type: "API_REQUEST",
              endpoint: "/api/tweets/track",
              method: "POST",
              body: {
                content: text,
                reachScore: score,
                predictedReach: predictedReach > 0 ? predictedReach : undefined,
                optimized: true,
                tweetUrl: window.location.href,
              },
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
