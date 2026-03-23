import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const ENGAGEMENT_BAIT_PATTERNS = [
  /like if/i,
  /rt if/i,
  /retweet this/i,
  /retweet if/i,
  /follow for more/i,
  /follow me for/i,
  /comment .* if/i,
  /who else/i,
  /share if/i,
  /share this/i,
];

export const engagementBaitRule: RuleDefinition = {
  id: 'penalty-engagement-bait',
  name: 'Engagement Bait',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;

    for (const pattern of ENGAGEMENT_BAIT_PATTERNS) {
      const match = pattern.exec(text);
      if (match) {
        return {
          ruleId: 'penalty-engagement-bait',
          triggered: true,
          points: -12,
          severity: 'critical',
          suggestion:
            'Engagement bait detected — confirmed algorithmic penalty + shadow ban risk. Convert to organic question.',
          highlight: {
            start: match.index,
            end: match.index + match[0].length,
            severity: 'critical',
          },
        };
      }
    }

    return {
      ruleId: 'penalty-engagement-bait',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

export const textWallRule: RuleDefinition = {
  id: 'penalty-text-wall',
  name: 'Text Wall',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    const isLong = text.length > 280;
    const isThread = input.isThread;
    const hasLineBreaks = text.includes('\n') || text.includes('\r');

    // Media tweets get a pass on length — video/image context justifies longer text
    if (input.hasMedia) {
      return { ruleId: 'penalty-text-wall', triggered: false, points: 0, severity: 'info' };
    }

    // Has line breaks = structured, not a wall
    if (isLong && !isThread && !hasLineBreaks) {
      return {
        ruleId: 'penalty-text-wall',
        triggered: true,
        points: -7,
        severity: 'warning',
        suggestion: 'Wall of text — break into paragraphs or thread. Line breaks boost engagement 20-30%.',
      };
    }

    return { ruleId: 'penalty-text-wall', triggered: false, points: 0, severity: 'info' };
  },
};
