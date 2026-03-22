import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const OPEN_LOOP_PATTERN =
  /:\s*$|—\s*$|\.\.\.\s*$|here'?s (what|how|why)|let me explain/i;

export const openLoopRule: RuleDefinition = {
  id: 'hook-open-loop',
  name: 'Open Loop Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const firstLine = input.text.split('\n')[0];

    if (OPEN_LOOP_PATTERN.test(firstLine)) {
      return {
        ruleId: 'hook-open-loop',
        triggered: true,
        points: 6,
        severity: 'positive',
        suggestion:
          'Open loop detected — creates curiosity gap. Strong hook!',
      };
    }

    return {
      ruleId: 'hook-open-loop',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const CONTRARIAN_PATTERN =
  /\b(overrated|underrated|wrong about|nobody talks about|unpopular|controversial|against the grain)\b/i;

export const contrarianClaimRule: RuleDefinition = {
  id: 'hook-contrarian-claim',
  name: 'Contrarian Claim Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const first80 = input.text.slice(0, 80);

    if (CONTRARIAN_PATTERN.test(first80)) {
      return {
        ruleId: 'hook-contrarian-claim',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion:
          'Contrarian claim detected — drives debate and replies.',
      };
    }

    return {
      ruleId: 'hook-contrarian-claim',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const STORY_OPENER =
  /^(Last (week|month|year)|Yesterday|2 (months|years|weeks) ago|I (just|recently)|Back in 20\d{2}|When I was|True story:)/i;

export const storyOpenerRule: RuleDefinition = {
  id: 'hook-story-opener',
  name: 'Story Opener Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const first80 = input.text.slice(0, 80);

    if (STORY_OPENER.test(first80)) {
      return {
        ruleId: 'hook-story-opener',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion:
          'Story opener — personal narratives drive 2-3x more engagement.',
      };
    }

    return {
      ruleId: 'hook-story-opener',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};
