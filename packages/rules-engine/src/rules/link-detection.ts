import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const LINK_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

export const linkDetectionRule: RuleDefinition = {
  id: 'penalty-link-external',
  name: 'External Link Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const match = LINK_REGEX.exec(input.text);
    // Reset lastIndex for global regex
    LINK_REGEX.lastIndex = 0;

    if (!match) {
      return {
        ruleId: 'penalty-link-external',
        triggered: false,
        points: 0,
        severity: 'critical',
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
