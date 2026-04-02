import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const LINK_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/i;

// X/Twitter internal links — these don't penalize reach because users stay on platform
const INTERNAL_LINK = /^https?:\/\/(www\.)?(x\.com|twitter\.com)(\/|$)/i;

// pic.twitter.com / pic.x.com are media URLs injected by the platform, not user links
const MEDIA_LINK = /^https?:\/\/pic\.(x\.com|twitter\.com)\//i;

export const linkDetectionRule: RuleDefinition = {
  id: 'penalty-link-external',
  name: 'External Link Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const match = LINK_REGEX.exec(input.text);

    if (!match) {
      return {
        ruleId: 'penalty-link-external',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    const url = match[0];

    // Skip X/Twitter internal links (quote tweets, thread links, profile links)
    if (INTERNAL_LINK.test(url)) {
      return {
        ruleId: 'penalty-link-external',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    // Skip pic.x.com / pic.twitter.com (platform media URLs)
    if (MEDIA_LINK.test(url)) {
      return {
        ruleId: 'penalty-link-external',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    return {
      ruleId: 'penalty-link-external',
      triggered: true,
      points: -8,
      severity: 'critical',
      suggestion: 'Move the link to the first reply. External links reduce reach 30-50% (free accounts get near-zero engagement on link posts).',
      highlight: {
        start: match.index,
        end: match.index + match[0].length,
        severity: 'critical',
      },
    };
  },
};
