import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const QUOTED_CLICK_MAX = 3;

export function predictQuotedClick(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'quoted_click',
    type: 'positive',
    bucket: 'engagement',
    max: QUOTED_CLICK_MAX,
    applicable: ctx.isQuoteTweet,
    rules: [
      {
        name: 'commentary_refers_to_quoted',
        weight: 2,
        test: (c) =>
          /\b(this|that take|exactly this|the (claim|point|tweet) below)\b/i.test(c.text) ||
          /(?:^|\s)(?:↓|👇|⬇️)/.test(c.text) ||
          /^reply\b/im.test(c.text),
      },
      {
        name: 'adds_context_to_quote',
        weight: 1,
        test: (c) => c.charCount > 40 && c.text.trim().length < c.quotedText.length * 1.5,
      },
    ],
    suggestionWhenLow:
      'Frame the commentary so readers want to read the quoted post too.',
  });
}
