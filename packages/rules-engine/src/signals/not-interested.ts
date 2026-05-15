import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, selfPromoRatio } from './_helpers';

export const NOT_INTERESTED_PENALTY = -8;

const RANT_MARKERS = /\b(rant|venting|sick of|fed up|so done|nobody cares|disgusting|hate when)\b/i;

export function predictNotInterested(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'not_interested',
    type: 'negative',
    bucket: 'risk',
    max: NOT_INTERESTED_PENALTY,
    rules: [
      {
        name: 'pure_rant_without_insight',
        weight: -3,
        test: (c) =>
          RANT_MARKERS.test(c.text) &&
          !/\b(here'?s why|the reason|fix|solution|instead)\b/i.test(c.text),
      },
      {
        name: 'excessive_self_promotion',
        weight: -3,
        test: (c) => selfPromoRatio(c.text) > 0.6,
      },
      {
        name: 'low_value_density',
        weight: -2,
        test: (c) =>
          c.charCount < 40 &&
          !/\?|!|\d/.test(c.text) &&
          !/\b(I|you|we)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a takeaway or fix so readers don\'t mark this as "not interested".',
  });
}
