import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasParagraphBreaks,
  hasReadThroughPayoff,
  isWallOfText,
} from './_helpers';

export const DWELL_MAX = 10;

export function predictDwell(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'dwell',
    type: 'positive',
    bucket: 'dwell',
    max: DWELL_MAX,
    rules: [
      {
        name: 'optimal_length',
        weight: 3,
        test: (c) => c.charCount >= 80 && c.charCount <= 280,
      },
      {
        name: 'paragraph_breaks',
        weight: 2,
        test: (c) => hasParagraphBreaks(c.text) && c.charCount > 140,
      },
      {
        name: 'no_wall_of_text',
        weight: 2,
        // Only credit "not a wall of text" when there's substantive content to dwell on.
        // A 4-char "lol" trivially isn't a wall but doesn't earn a dwell bonus.
        test: (c) => c.charCount >= 80 && !isWallOfText(c.text),
      },
      {
        name: 'vertical_readability',
        weight: 1,
        test: (c) => c.lineCount >= 3 && c.charCount > 200,
      },
      {
        name: 'read_through_payoff',
        weight: 2,
        test: (c) => hasReadThroughPayoff(c.text),
      },
    ],
    suggestionWhenLow:
      'Break the post with line gaps and land a takeaway on the last line so readers finish it.',
  });
}
