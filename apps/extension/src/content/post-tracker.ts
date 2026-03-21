/**
 * PostTracker — detects when the user clicks the "Post" button on X.com
 * and sends tracking data (tweet text + ReachOS score) to the API.
 */

export function setupPostTracker(
  getCurrentText: () => string,
  getCurrentScore: () => number,
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

          if (text && text.length > 5) {
            chrome.runtime.sendMessage({
              type: "API_REQUEST",
              endpoint: "/api/tweets/track",
              method: "POST",
              body: {
                content: text,
                reachScore: score,
                optimized: true,
                tweetUrl: window.location.href,
              },
            });
            console.log("[ReachOS] Tweet tracked:", {
              score,
              textLength: text.length,
            });
          }
        });
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
