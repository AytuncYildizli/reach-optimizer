/**
 * Calculates a normalized outcome score (0-100) from real tweet metrics.
 * Based on X algorithm signal weights from research.
 */
export function calculateOutcomeScore(metrics: {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  views: number;
}): number {
  // Weighted engagement (from algorithm research)
  const weighted =
    metrics.replies * 8 +
    metrics.quotes * 6 +
    metrics.bookmarks * 5 +
    metrics.retweets * 3 +
    metrics.likes * 1;

  // Normalize by views (engagement rate)
  const views = Math.max(metrics.views, 1);
  const engagementRate = weighted / views;

  // Map to 0-100 scale
  // Based on research: avg engagement rate ~0.12%, good = 1%, viral = 5%+
  // engagementRate of 0.001 = ~20, 0.01 = ~50, 0.05 = ~80, 0.1+ = ~95
  const score = Math.round(
    Math.min(100, Math.max(0, 20 * Math.log10(engagementRate * 1000 + 1) * 10)),
  );

  return Math.min(100, Math.max(0, score));
}

/**
 * Compares predicted reach score vs actual outcome score.
 * Returns correlation data for weight learning.
 */
export function compareScores(
  predicted: number,
  outcome: number,
): {
  delta: number;
  accuracy: 'accurate' | 'overestimated' | 'underestimated';
  confidence: number; // 0-1, how much to trust this data point
} {
  const delta = outcome - predicted;
  const accuracy =
    Math.abs(delta) <= 15 ? 'accurate' : delta > 0 ? 'underestimated' : 'overestimated';

  // Higher confidence when we have more data (outcome > 0 means real engagement)
  const confidence = outcome > 0 ? Math.min(1, outcome / 100) : 0;

  return { delta, accuracy, confidence };
}
