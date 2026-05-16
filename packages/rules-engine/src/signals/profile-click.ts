import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  FIRST_PERSON_REGEX,
  hasControversyMarker,
} from './_helpers';

export const PROFILE_CLICK_MAX = 7;

const SPECIFIC_ACHIEVEMENT = /\bI\s+(?:built|launched|shipped|founded|sold|raised|grew|scaled|wrote|coded|hired)\b/i;
const CREDENTIAL = /\b(ex[- ]|former)\s*\w+|\b\d+\+?\s*(years?|months?)\s+(in|at|of)\s+\w+|\b(CEO|CTO|CMO|founder|head of)\b\s+(at|of)\s+\w+/i;
const PERSPECTIVE = /\b(I'?ve (?:seen|learned|noticed|tried)|in my (\d+\s+)?(years?|months?)|after (?:building|running|launching)|every time I)\b/i;

export function predictProfileClick(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'profile_click',
    type: 'positive',
    bucket: 'curiosity',
    max: PROFILE_CLICK_MAX,
    rules: [
      {
        name: 'specific_achievement',
        weight: 3,
        test: (c) => SPECIFIC_ACHIEVEMENT.test(c.text),
      },
      {
        name: 'named_credentials',
        weight: 2,
        test: (c) => CREDENTIAL.test(c.text),
      },
      {
        name: 'unusual_perspective',
        weight: 1,
        test: (c) => PERSPECTIVE.test(c.text),
      },
      {
        name: 'contrarian_pov',
        weight: 1,
        test: (c) => FIRST_PERSON_REGEX.test(c.text) && hasControversyMarker(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a specific achievement or credential so readers want to know who you are.',
  });
}
