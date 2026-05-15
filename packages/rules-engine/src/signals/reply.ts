import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasControversyMarker,
  hasOpinionMarker,
  QUESTION_REGEX,
  SECOND_PERSON_REGEX,
} from './_helpers';

export const REPLY_MAX = 12;

// Detect "X or Y" framing. The em-dash variant is lifted out of the \b...\b
// group because — is a non-word char and word-boundaries don't anchor to it.
const CHOICE_REGEX = /\b(this or that|which one|team\s+\w+)\b|a\)\s.*b\)|\bor\s+[-—]/i;

export function predictReply(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'reply',
    type: 'positive',
    bucket: 'engagement',
    max: REPLY_MAX,
    rules: [
      {
        name: 'ends_with_question',
        weight: 4,
        test: (c) => QUESTION_REGEX.test(c.text.trim()),
      },
      {
        name: 'uses_second_person',
        weight: 2,
        test: (c) => SECOND_PERSON_REGEX.test(c.text),
      },
      {
        name: 'takes_a_position',
        weight: 3,
        test: (c) => hasOpinionMarker(c.text),
      },
      {
        name: 'choice_framing',
        weight: 2,
        test: (c) => CHOICE_REGEX.test(c.text),
      },
      {
        name: 'controversy_marker',
        weight: 1,
        test: (c) => hasControversyMarker(c.text),
      },
    ],
    suggestionWhenLow:
      'Replies are the king signal. End with a question or take a stance.',
  });
}
