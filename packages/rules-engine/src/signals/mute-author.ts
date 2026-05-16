import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, repeatedWordsSpam } from './_helpers';

export const MUTE_AUTHOR_PENALTY = -7;

export function predictMuteAuthor(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'mute_author',
    type: 'negative',
    bucket: 'risk',
    max: MUTE_AUTHOR_PENALTY,
    rules: [
      {
        name: 'high_cadence_cues',
        weight: -3,
        test: (c) =>
          /\b(my (\d+)(?:th|st|nd|rd) post today|posting every (?:hour|day)|daily (?:post|tweet))\b/i.test(
            c.text,
          ),
      },
      {
        name: 'repetitive_thread_spam',
        weight: -4,
        test: (c) => repeatedWordsSpam(c.text),
      },
    ],
    suggestionWhenLow:
      'Repetition triggers mutes. Vary phrasing and reduce cadence-bragging.',
  });
}
