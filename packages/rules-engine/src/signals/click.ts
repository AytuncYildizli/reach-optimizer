import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, URL_REGEX } from './_helpers';

export const CLICK_MAX = 8;

// X's published algorithm scores URL clicks as a POSITIVE signal. Links are no
// longer penalized. This predictor rewards posts that include a link with a
// descriptive anchor and a curiosity gap.
export function predictClick(ctx: PostContext): SignalScore {
  const text = ctx.text;
  const hasUrl = URL_REGEX.test(text);
  const beforeUrlMatch = text.match(/^([\s\S]*?)https?:\/\//i);
  const beforeUrl = beforeUrlMatch ? beforeUrlMatch[1] : text;
  const afterUrlMatch = text.match(/https?:\/\/\S+\s*([\s\S]*)$/i);
  const afterUrl = afterUrlMatch ? afterUrlMatch[1] : '';

  return buildSignalScore(ctx, {
    signal: 'click',
    type: 'positive',
    bucket: 'engagement',
    max: CLICK_MAX,
    rules: [
      {
        name: 'has_link',
        weight: 3,
        test: () => hasUrl,
      },
      {
        name: 'descriptive_anchor',
        weight: 2,
        test: () =>
          hasUrl &&
          (afterUrl.trim().length > 0 ||
            /\b(I (wrote|made|built|just shipped)|new post|read here|read more|read why|full thread|case study)\b/i.test(
              beforeUrl,
            )),
      },
      {
        name: 'curiosity_gap',
        weight: 2,
        test: () =>
          hasUrl &&
          /(\?$|\.\.\.\s*$|→\s*$|here'?s why|the reason|what happened|find out|you won'?t believe)/i.test(
            beforeUrl.trim(),
          ),
      },
      {
        name: 'value_promise',
        weight: 1,
        test: () =>
          hasUrl &&
          /\b(free|template|guide|playbook|checklist|study|analysis|breakdown|walkthrough|deep dive)\b/i.test(
            beforeUrl,
          ),
      },
    ],
    suggestionWhenLow: hasUrl
      ? 'Frame the link with a curiosity gap and a value promise to drive clicks.'
      : 'Adding a link with a descriptive anchor is now a positive signal in X v4.',
  });
}
