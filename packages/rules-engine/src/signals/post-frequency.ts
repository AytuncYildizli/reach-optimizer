import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const POST_FREQUENCY_PENALTY = -8;

/**
 * Diminishing-returns penalty for the Nth post in a single day. X's algorithm
 * applies an author-fatigue dampener after the first ~2-3 posts: subsequent
 * posts in the same session get distributed to a smaller share of the
 * author's reach pool. We model that as a step function on `postsToday`.
 *
 * Treat `postsToday < 0` as "extension didn't report", so the signal stays
 * non-applicable rather than penalising every analyse() call that omits it.
 */
export function predictPostFrequency(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'post_frequency',
    type: 'negative',
    bucket: 'risk',
    max: POST_FREQUENCY_PENALTY,
    applicable: ctx.postsToday >= 0,
    rules: [
      {
        // Posts 3-4 in a day: gentle reminder, modest penalty.
        name: 'third_or_fourth_post_today',
        weight: -3,
        test: (c) => c.postsToday >= 2 && c.postsToday <= 3,
      },
      {
        // Post 5+: timeline-spam territory.
        name: 'fifth_plus_post_today',
        weight: -5,
        test: (c) => c.postsToday >= 4,
      },
    ],
    suggestionWhenLow:
      'You\'ve posted a lot today. Each extra post gets less distribution — let this one breathe.',
  });
}
