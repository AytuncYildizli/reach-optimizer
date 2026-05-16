import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasAphoristicShape,
  NUMBER_REGEX,
} from './_helpers';

export const RETWEET_MAX = 7;

export function predictRetweet(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'retweet',
    type: 'positive',
    bucket: 'engagement',
    max: RETWEET_MAX,
    rules: [
      {
        name: 'aphoristic_quotable',
        weight: 3,
        test: (c) => hasAphoristicShape(c.text),
      },
      {
        name: 'everyone_should_know',
        weight: 2,
        test: (c) =>
          /\b(everyone should|nobody talks about|underrated|overlooked|surprising|fact:|did you know|truth is)\b/i.test(
            c.text,
          ),
      },
      {
        name: 'succinct_under_200',
        weight: 1,
        test: (c) => c.charCount > 30 && c.charCount <= 200,
      },
      {
        name: 'reference_data',
        weight: 1,
        test: (c) => NUMBER_REGEX.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Tighten the message and make it quotable to drive retweets.',
  });
}
