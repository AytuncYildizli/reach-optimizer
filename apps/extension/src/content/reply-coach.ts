/**
 * Reply Coach monitors the user's tweet pages for incoming replies
 * and nudges them to respond (reply-to-reply = 150x algorithm boost).
 */

export function setupReplyCoach() {
  // Only activate on user's own tweet pages or home timeline
  // Watch for reply count changes on user's recent tweets

  // Strategy: periodically check for new replies via the API
  // Show a subtle notification in the score overlay panel

  let coachInterval: ReturnType<typeof setInterval> | null = null;

  function checkForReplies() {
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: '/api/tweets/metrics', method: 'GET' },
      (response) => {
        if (response?.ok && response.data?.success) {
          const tweets = response.data.data || [];
          // Find tweets with replies that user hasn't responded to
          const needsReply = tweets.filter((t: any) => {
            const metrics = t.metrics?.[0];
            return metrics && metrics.replies > 0;
          });

          if (needsReply.length > 0) {
            // Notify the overlay
            const total = needsReply.reduce(
              (sum: number, t: any) => sum + (t.metrics?.[0]?.replies || 0),
              0,
            );
            window.dispatchEvent(
              new CustomEvent('reachos-reply-coach', {
                detail: { count: total, tweets: needsReply.length },
              }),
            );
          }
        }
      },
    );
  }

  function startCoaching() {
    // Check every 2 minutes for new replies on tracked tweets
    coachInterval = setInterval(checkForReplies, 120000);

    // Also check immediately on load (with a small delay)
    setTimeout(checkForReplies, 5000);
  }

  startCoaching();

  return () => {
    if (coachInterval) clearInterval(coachInterval);
  };
}
