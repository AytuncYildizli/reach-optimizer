import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const VQV_MAX = 8;

export function predictVqv(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'vqv',
    type: 'positive',
    bucket: 'engagement',
    max: VQV_MAX,
    applicable: ctx.hasVideo,
    rules: [
      {
        // X has been explicit since 2024 that video gets distribution priority.
        // Mirror that bias with a flat baseline credit so any video post
        // starts ahead of an equivalent text-only post.
        name: 'video_present',
        weight: 4,
        test: (c) => c.hasVideo,
      },
      {
        name: 'video_caption_hook',
        weight: 2,
        test: (c) =>
          /\b(watch (this|until)|sound on|wait for it|don'?t miss|the moment)\b/i.test(c.text),
      },
      {
        name: 'length_promise_match',
        weight: 2,
        test: (c) =>
          /\b(\d+)\s*(sec|second|min|minute)/i.test(c.text) ||
          /\b(in \d+ seconds|quick demo|short clip)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a caption hook so the video starts a quality view.',
  });
}
