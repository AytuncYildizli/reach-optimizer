import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  FIRST_PERSON_REGEX,
  hasAphoristicShape,
  hasOpinionMarker,
} from './_helpers';

export const FAVORITE_MAX = 7;

export function predictFavorite(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'favorite',
    type: 'positive',
    bucket: 'engagement',
    max: FAVORITE_MAX,
    rules: [
      {
        name: 'identifiable_emotion',
        weight: 2,
        test: (c) =>
          /\b(love|hate|excited|frustrated|angry|grateful|proud|scared|relieved|amazed)\b/i.test(
            c.text,
          ),
      },
      {
        name: 'broad_appeal_claim',
        weight: 2,
        test: (c) => hasOpinionMarker(c.text) || /\b(everyone|nobody|always|never)\b/i.test(c.text),
      },
      {
        name: 'first_person_voice',
        weight: 1,
        test: (c) => FIRST_PERSON_REGEX.test(c.text),
      },
      {
        name: 'aphoristic_shape',
        weight: 2,
        test: (c) => hasAphoristicShape(c.text),
      },
    ],
    suggestionWhenLow:
      'Add an identifiable emotion or take a clear stance to drive likes.',
  });
}
