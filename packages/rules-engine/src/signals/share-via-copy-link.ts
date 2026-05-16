import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, hasListShape, URL_REGEX } from './_helpers';

export const COPY_LINK_SHARE_MAX = 4;

export function predictShareViaCopyLink(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'share_via_copy_link',
    type: 'positive',
    bucket: 'engagement',
    max: COPY_LINK_SHARE_MAX,
    rules: [
      {
        name: 'framework_or_list',
        weight: 2,
        test: (c) => hasListShape(c.text),
      },
      {
        name: 'evergreen_reference',
        weight: 1,
        test: (c) =>
          /\b(framework|playbook|template|cheat ?sheet|guide|checklist|principles?)\b/i.test(
            c.text,
          ),
      },
      {
        name: 'tool_or_resource',
        weight: 1,
        test: (c) =>
          URL_REGEX.test(c.text) ||
          /\b(I use|I built|free tool|open source|github\.com|figma\.com)\b/i.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a framework, list, or reference resource for save-and-share value.',
  });
}
