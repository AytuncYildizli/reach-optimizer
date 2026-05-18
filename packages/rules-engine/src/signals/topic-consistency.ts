import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const TOPIC_CONSISTENCY_MAX = 5;

// Tokens we never want to count as "topic" — high-frequency English plus the
// posting-specific function words that appear in every tweet regardless of
// subject matter.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on',
  'for', 'with', 'at', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'he',
  'she', 'it', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'me', 'us',
  'them', 'as', 'just', 'now', 'then', 'than', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'should', 'could', 'can', 'about', 'how',
  'what', 'when', 'where', 'why', 'who', 'which', 'not', 'no', 'yes', 'one',
  'two', 'first', 'thread', 'post', 'tweet', 'rt', 'hot', 'take', 'new',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Strip URLs, mentions, hashes — we want the noun-level subject, not link tokens.
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\w+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/**
 * Microniche reward. Compares the post's content tokens against
 * `recentTopics` (extension-supplied keyword bag from the author's last
 * ~20 posts). Higher overlap → bigger bonus, on the premise that topical
 * consistency is what trains X's topic graph to surface the author.
 *
 * Non-applicable when the extension hasn't supplied history (empty array).
 */
export function predictTopicConsistency(ctx: PostContext): SignalScore {
  const recent = new Set(ctx.recentTopics.map((t) => t.toLowerCase()));
  const tokens = tokenize(ctx.text);
  const tokenSet = new Set(tokens);
  const overlap = [...tokenSet].filter((t) => recent.has(t)).length;

  return buildSignalScore(ctx, {
    signal: 'topic_consistency',
    type: 'positive',
    bucket: 'curiosity',
    max: TOPIC_CONSISTENCY_MAX,
    applicable: ctx.recentTopics.length > 0 && tokens.length > 0,
    rules: [
      {
        // Strong overlap — at least 3 distinct recent-topic tokens reappear.
        name: 'strong_microniche_overlap',
        weight: 3,
        test: () => overlap >= 3,
      },
      {
        // Some overlap — 1-2 tokens, the post stays on-brand.
        name: 'partial_topic_overlap',
        weight: 2,
        test: () => overlap === 1 || overlap === 2,
      },
    ],
    suggestionWhenLow:
      'This post drifts from your usual topics. Microniches compound — stay on theme.',
    suggestionWhenHigh:
      'On-brand for your microniche — the topic graph will keep amplifying you.',
  });
}
