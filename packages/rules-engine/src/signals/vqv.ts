import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const VQV_MAX = 3;

export function predictVqv(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'vqv',
    type: 'positive',
    bucket: 'engagement',
    max: VQV_MAX,
    applicable: ctx.hasVideo,
    rules: [
      {
        // X's published vqv weight dropped to 0 (Oct 2026), so video presence
        // keeps only a small baseline credit.
        name: 'video_present',
        weight: 1,
        test: (c) => c.hasVideo,
      },
      {
        name: 'video_caption_hook',
        weight: 1,
        test: (c) =>
          /\b(watch (this|until)|sound on|wait for it|don'?t miss|the moment)\b/i.test(c.text),
      },
      {
        name: 'length_promise_match',
        weight: 1,
        test: (c) =>
          /\b(\d+)\s*(sec|second|min|minute)/i.test(c.text) ||
          /\b(in \d+ seconds|quick demo|short clip)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a caption hook so the video starts a quality view.',
  });
}
