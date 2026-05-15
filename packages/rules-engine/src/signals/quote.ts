import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasControversyMarker,
  hasOpinionMarker,
} from './_helpers';

export const QUOTE_MAX = 6;

export function predictQuote(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'quote',
    type: 'positive',
    bucket: 'engagement',
    max: QUOTE_MAX,
    rules: [
      {
        name: 'contrarian_or_polarizing',
        weight: 3,
        test: (c) => hasControversyMarker(c.text),
      },
      {
        name: 'confident_declarative',
        weight: 2,
        test: (c) =>
          /\b(is|are|will|always|never)\b.+[.!]/i.test(c.text) && hasOpinionMarker(c.text),
      },
      {
        name: 'invites_commentary',
        weight: 1,
        test: (c) =>
          /\b(thoughts\??|disagree\??|change my mind|fight me|tell me I'?m wrong)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Take a confident position people can react to with their own commentary.',
  });
}
