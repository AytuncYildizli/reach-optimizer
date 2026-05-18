import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const AD_DISCLOSURE_PENALTY = -10;

// Promo signals — affiliate links, discount codes, "I partnered with",
// referral framing. These are not banned; they just need disclosure.
const PROMO_LANGUAGE =
  /\b(discount code|promo code|use code|coupon|affiliate (?:link|of)|my link|link in bio|partnered with|in partnership with|brought to you by|check ?out (?:my|this) (?:product|app|tool|store)|grab (?:yours|it) (?:here|now)|sign ?up (?:and|to) (?:get|earn))\b/i;
const REFERRAL_LINK =
  /\b(?:ref(?:err?al)?[=:_/]|aff(?:iliate)?[=:_/]|utm_source=|\?ref=|\/ref\/)/i;

// Acceptable disclosure markers — case-insensitive, but the marker must be in
// *label position*, not bare narrative. We accept:
//   - hashtagged: #ad #ads #sponsored #partner #partnership #advert
//   - parenthesised: (ad) (sponsored) (paid)
//   - prefix label: "Ad:" / "Sponsored:" at start of a line or sentence
//   - explicit phrase: "sponsored by", "paid partnership with", "in partnership with"
// "I had ads running" is NOT disclosure; "(sponsored)" IS.
const DISCLOSURE_MARKERS = new RegExp(
  [
    String.raw`#(ad|ads|sponsored|sponsor|partner(?:ship)?|advert(?:isement)?|paid)\b`,
    String.raw`\((ad|ads|sponsored|sponsor|paid|paid partnership|paid promo)\)`,
    String.raw`(?:^|[.!?\n]\s*)(ad|sponsored)\s*:`,
    String.raw`\b(sponsored by|paid partnership with|in partnership with|brought to you by|paid promo)\b`,
  ].join('|'),
  'i',
);

export function predictAdDisclosure(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'ad_disclosure',
    type: 'negative',
    bucket: 'risk',
    max: AD_DISCLOSURE_PENALTY,
    rules: [
      {
        name: 'promo_language_without_disclosure',
        weight: -6,
        test: (c) => PROMO_LANGUAGE.test(c.text) && !DISCLOSURE_MARKERS.test(c.text),
      },
      {
        name: 'referral_link_without_disclosure',
        weight: -4,
        test: (c) => REFERRAL_LINK.test(c.text) && !DISCLOSURE_MARKERS.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Looks like a promo. Add #ad or "(sponsored)" — undisclosed ads tank reach on X.',
  });
}
