import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const QUOTED_VQV_MAX = 4;

export function predictQuotedVqv(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'quoted_vqv',
    type: 'positive',
    bucket: 'engagement',
    max: QUOTED_VQV_MAX,
    // vqv on the quoted post fires only when the *quoted* tweet has a video.
    // Falls back to inactive if the caller can't detect quoted media (e.g. the
    // server-side analyze route runs with only the composing text).
    applicable: ctx.isQuoteTweet && ctx.quotedHasVideo,
    rules: [
      {
        // Baseline credit — quoting a video post inherits part of X's
        // video-first push even before clever commentary.
        name: 'quoted_video_present',
        weight: 2,
        test: (c) => c.quotedHasVideo,
      },
      {
        name: 'commentary_teases_video',
        weight: 2,
        test: (c) =>
          /\b(watch|see this|the moment|0:\d+|at \d+:\d+|sound on|wait for it)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Reference a specific moment in the quoted video so readers press play.',
  });
}
