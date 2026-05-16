import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasAiSlopWords,
  hasGenericOpener,
  isWallOfText,
} from './_helpers';

export const NOT_DWELLED_PENALTY = -12;

export function predictNotDwelled(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'not_dwelled',
    type: 'negative',
    bucket: 'risk',
    max: NOT_DWELLED_PENALTY,
    rules: [
      {
        name: 'wall_of_text',
        weight: -4,
        test: (c) => isWallOfText(c.text),
      },
      {
        name: 'generic_opener',
        weight: -4,
        test: (c) => hasGenericOpener(c.text),
      },
      {
        name: 'weak_first_line',
        weight: -2,
        test: (c) => c.firstLine.trim().length > 0 && c.firstLine.trim().length < 15,
      },
      {
        name: 'ai_slop_patterns',
        weight: -2,
        test: (c) => hasAiSlopWords(c.text),
      },
    ],
    suggestionWhenLow:
      'Reduce scroll-past risk: break up the wall of text and replace the generic opener.',
  });
}
