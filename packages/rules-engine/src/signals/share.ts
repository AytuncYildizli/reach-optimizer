import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, NUMBER_REGEX } from './_helpers';

export const SHARE_MAX = 5;

export function predictShare(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'share',
    type: 'positive',
    bucket: 'engagement',
    max: SHARE_MAX,
    rules: [
      {
        name: 'surprising_fact',
        weight: 2,
        test: (c) =>
          /\b(turns out|did you know|surprisingly|counterintuitive|believe it or not|breaking|just in)\b/i.test(
            c.text,
          ),
      },
      {
        name: 'news_shaped',
        weight: 2,
        test: (c) =>
          /\b(announced|launched|released|reports|study|research|report shows|according to)\b/i.test(
            c.text,
          ),
      },
      {
        name: 'data_point',
        weight: 1,
        test: (c) => NUMBER_REGEX.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a surprising data point or news-shaped framing to drive broadcast shares.',
  });
}
