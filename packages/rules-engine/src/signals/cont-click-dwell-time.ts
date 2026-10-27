import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, hasCuriosityHook, NUMBER_REGEX, URL_REGEX } from './_helpers';

export const CONT_CLICK_DWELL_MAX = 6;

export function predictContClickDwellTime(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'cont_click_dwell_time',
    type: 'positive',
    bucket: 'dwell',
    max: CONT_CLICK_DWELL_MAX,
    applicable: ctx.hasClickable,
    rules: [
      {
        name: 'value_promise_behind_click',
        weight: 2,
        test: (c) =>
          URL_REGEX.test(c.text) &&
          /\b(full (?:post|article|thread)|read more|case study|breakdown|free template|playbook|guide|walkthrough)\b/i.test(
            c.text,
          ),
      },
      {
        name: 'show_more_promise',
        weight: 1,
        test: (c) =>
          c.charCount > 280 &&
          /\b(below|keep reading|more in the (?:thread|reply)|continued)\b/i.test(c.text),
      },
      {
        name: 'specific_payoff_behind_click',
        weight: 2,
        test: (c) => URL_REGEX.test(c.text) && NUMBER_REGEX.test(c.text),
      },
      {
        // Bait links get a click and an instant bounce; X now weights the
        // seconds spent after the click, not the click itself.
        name: 'no_bait_link',
        weight: 1,
        test: (c) => URL_REGEX.test(c.text) && !hasCuriosityHook(c.text),
      },
    ],
    suggestionWhenLow:
      'Promise concrete value behind the click or "Show more" expand.',
  });
}
