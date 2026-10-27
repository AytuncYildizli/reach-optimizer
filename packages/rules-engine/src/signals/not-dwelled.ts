import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasAiSlopWords,
  hasGenericOpener,
  hasHookWithoutPayoff,
  isWallOfText,
} from './_helpers';

export const NOT_DWELLED_PENALTY = -6;

export function predictNotDwelled(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'not_dwelled',
    type: 'negative',
    bucket: 'risk',
    max: NOT_DWELLED_PENALTY,
    rules: [
      {
        name: 'wall_of_text',
        weight: -2,
        test: (c) => isWallOfText(c.text),
      },
      {
        name: 'generic_opener',
        weight: -2,
        test: (c) => hasGenericOpener(c.text),
      },
      {
        name: 'weak_first_line',
        weight: -1,
        test: (c) => c.firstLine.trim().length > 0 && c.firstLine.trim().length < 15,
      },
      {
        name: 'ai_slop_patterns',
        weight: -1,
        test: (c) => hasAiSlopWords(c.text),
      },
      {
        name: 'hook_without_payoff',
        weight: -2,
        test: (c) => hasHookWithoutPayoff(c.text),
      },
    ],
    suggestionWhenLow:
      'Reduce scroll-past risk: break up the wall of text, replace the generic opener, and pay off your hook.',
  });
}
