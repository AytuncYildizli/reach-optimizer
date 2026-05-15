import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  repeatedCharsSpam,
} from './_helpers';

export const REPORT_PENALTY = -15;

const POLICY_VIOLATION = /\b(buy followers|free crypto|airdrop here|click my bio|dm for|onlyfans link|scam|nigerian prince|massive giveaway|f4f|follow for follow)\b/i;
const AUTOMATED_SPAM = /(?:[A-Z]{6,}\s*){2,}|\b\w+@\w+\.\w+\b.*\b\w+@\w+\.\w+\b|(retweet|RT)\s*\+\s*(follow|like)|!{5,}/i;

export function predictReport(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'report',
    type: 'negative',
    bucket: 'risk',
    max: REPORT_PENALTY,
    rules: [
      {
        name: 'spam_chars',
        weight: -5,
        test: (c) => repeatedCharsSpam(c.text),
      },
      {
        name: 'policy_violation_pattern',
        weight: -5,
        test: (c) => POLICY_VIOLATION.test(c.text),
      },
      {
        name: 'automated_spam_markers',
        weight: -5,
        test: (c) => AUTOMATED_SPAM.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Spam-shaped content. Remove repeated chars, mass tags, or solicitation patterns.',
  });
}
