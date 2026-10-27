import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, hasListShape, SPECIFIC_NUMBER_REGEX, stripUrls } from './_helpers';

export const CONT_DWELL_MAX = 8;

export function predictContDwellTime(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'cont_dwell_time',
    type: 'positive',
    bucket: 'dwell',
    max: CONT_DWELL_MAX,
    rules: [
      {
        name: 'sustained_value',
        weight: 2,
        test: (c) =>
          c.charCount > 200 &&
          /\b(here'?s how|step \d+|first|then|finally|the key is|the trick is)\b/i.test(c.text),
      },
      {
        name: 'second_paragraph_payoff',
        weight: 1,
        test: (c) => {
          const paragraphs = c.text.split(/\n\s*\n/).filter(Boolean);
          return paragraphs.length >= 2 && paragraphs[1]!.trim().length > 60;
        },
      },
      {
        name: 'longer_form_value',
        weight: 1,
        test: (c) =>
          c.isThread ||
          c.charCount > 400 ||
          /\b(thread|breakdown|deep dive|long post)\b/i.test(c.text),
      },
      {
        name: 'concrete_specifics',
        weight: 2,
        test: (c) => c.charCount > 140 && SPECIFIC_NUMBER_REGEX.test(stripUrls(c.text)),
      },
      {
        name: 'scannable_structure',
        weight: 2,
        test: (c) => c.charCount > 140 && hasListShape(c.text),
      },
    ],
    suggestionWhenLow:
      'Add concrete numbers or a short list so time spent on the post keeps accumulating.',
  });
}
