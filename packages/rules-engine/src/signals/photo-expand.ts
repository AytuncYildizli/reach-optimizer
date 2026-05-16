import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const PHOTO_EXPAND_MAX = 4;

export function predictPhotoExpand(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'photo_expand',
    type: 'positive',
    bucket: 'engagement',
    max: PHOTO_EXPAND_MAX,
    applicable: ctx.hasImage,
    rules: [
      {
        name: 'image_teaser_text',
        weight: 2,
        test: (c) =>
          /\b(look at this|check this out|see (what|how)|spot the|guess what)\b/i.test(c.text) ||
          /(→|👇|⬇️)\s*$/.test(c.text.trim()),
      },
      {
        name: 'partial_visual_hint',
        weight: 2,
        test: (c) =>
          /\b(zoom in|notice|details|in the (corner|background)|hidden|easter egg)\b/i.test(
            c.text,
          ),
      },
    ],
    suggestionWhenLow:
      'Tease the image in text so readers tap to expand it.',
  });
}
