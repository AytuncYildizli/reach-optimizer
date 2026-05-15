import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const FOLLOW_AUTHOR_MAX = 5;

const SERIES_MARKER = /\b(\d+\s*\/\s*\d+|part\s+\d+|thread\s*\d+|day\s+\d+\b|chapter\s+\d+)\b/i;
const NICHE_OWNERSHIP = /\b(every day I post|I share daily|I tweet about|building in public|I document)\b/i;

export function predictFollowAuthor(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'follow_author',
    type: 'positive',
    bucket: 'curiosity',
    max: FOLLOW_AUTHOR_MAX,
    rules: [
      {
        name: 'series_marker',
        weight: 2,
        test: (c) => SERIES_MARKER.test(c.text),
      },
      {
        name: 'niche_ownership',
        weight: 2,
        test: (c) => NICHE_OWNERSHIP.test(c.text),
      },
      {
        name: 'distinctive_voice',
        weight: 1,
        test: (c) =>
          /(\.\.\.\s*$|—\s*$|^\s*[a-z])/i.test(c.firstLine) ||
          /\b(I always|I never|my rule|my take|my advice)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Signal continuity (series marker, daily cadence) so readers expect more from you.',
  });
}
