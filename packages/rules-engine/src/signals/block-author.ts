import type { PostContext, SignalScore } from '@reach/shared-types';
import { adHominem, aggressiveTone, buildSignalScore } from './_helpers';

export const BLOCK_AUTHOR_PENALTY = -8;

export function predictBlockAuthor(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'block_author',
    type: 'negative',
    bucket: 'risk',
    max: BLOCK_AUTHOR_PENALTY,
    rules: [
      {
        name: 'ad_hominem',
        weight: -4,
        test: (c) => adHominem(c.text),
      },
      {
        name: 'aggressive_tone',
        weight: -3,
        test: (c) => aggressiveTone(c.text),
      },
      {
        name: 'harassment_pattern',
        weight: -1,
        test: (c) =>
          /\b(everyone block|mass block|let'?s ratio|piling on|cancel (this|him|her|them))\b/i.test(
            c.text,
          ),
      },
    ],
    suggestionWhenLow:
      'Tone is hostile. Replace attacks with a critique of ideas to avoid block-triggering language.',
  });
}
