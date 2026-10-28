import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  repeatedCharsSpam,
} from './_helpers';

export const REPORT_PENALTY = -15;

const POLICY_VIOLATION = /\b(buy followers|free crypto|airdrop here|click my bio|dm for|onlyfans link|scam|nigerian prince|massive giveaway|f4f|follow for follow)\b/i;

// Shouted runs are case-sensitive. An `/i` flag on `[A-Z]` matches any two
// ordinary words of 6+ letters ("building something"), which penalised most
// normal posts. The other alternatives stay case-insensitive.
const SHOUTED_WORDS = /(?:\b[A-Z]{6,}\b\s+){1,}\b[A-Z]{6,}\b/;
const MULTI_EMAIL = /\b\w+@\w+\.\w+\b.*\b\w+@\w+\.\w+\b/i;
const RT_FOLLOW = /\b(?:retweet|rt)\s*\+\s*(?:follow|like)\b/i;
const BANG_RUN = /!{5,}/;

export function hasAutomatedSpamMarkers(text: string): boolean {
  return (
    SHOUTED_WORDS.test(text) ||
    MULTI_EMAIL.test(text) ||
    RT_FOLLOW.test(text) ||
    BANG_RUN.test(text)
  );
}

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
        test: (c) => hasAutomatedSpamMarkers(c.text),
      },
    ],
    suggestionWhenLow:
      'Spam-shaped content. Remove repeated chars, mass tags, or solicitation patterns.',
  });
}
