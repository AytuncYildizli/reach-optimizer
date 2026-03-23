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
        points: 10,
        severity: 'positive',
        suggestion:
          'Open loop detected — creates curiosity gap. The #1 viral hook pattern.',
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
  /\b(overrated|underrated|wrong about|nobody talks about|unpopular|controversial|against the grain|myth|lie|truth is)\b/i;

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
        points: 7,
        severity: 'positive',
        suggestion:
          'Contrarian claim detected — drives debate and replies (27x algorithm weight).',
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
  /^(Last (week|month|year)|Yesterday|2 (months|years|weeks) ago|I (just|recently|spent|built|quit|lost|made|earned|saved|launched|shipped|failed)|Back in 20\d{2}|When I was|True story:|A few (months|weeks|years) ago)/i;

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
        points: 6,
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

// NEW: Pattern Interrupt Hook
const PATTERN_INTERRUPT = /^(Stop |Never |Don't |Quit |Forget |Avoid |Skip |Delete |Remove |Ditch )/i;

export const patternInterruptRule: RuleDefinition = {
  id: 'hook-pattern-interrupt',
  name: 'Pattern Interrupt Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (PATTERN_INTERRUPT.test(input.text)) {
      return {
        ruleId: 'hook-pattern-interrupt',
        triggered: true,
        points: 7,
        severity: 'positive',
        suggestion: 'Pattern interrupt — breaks the scroll pattern. Strong hook.',
      };
    }

    return { ruleId: 'hook-pattern-interrupt', triggered: false, points: 0, severity: 'info' };
  },
};

// NEW: Bold Claim Hook
const BOLD_CLAIM =
  /^(The (best|worst|biggest|fastest|most|only|single|real|true|#1)|No one|Everyone|Every single|There is no|Nothing beats|This is the|The entire)/i;

export const boldClaimRule: RuleDefinition = {
  id: 'hook-bold-claim',
  name: 'Bold Claim Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const first80 = input.text.slice(0, 80);

    if (BOLD_CLAIM.test(first80)) {
      return {
        ruleId: 'hook-bold-claim',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion: 'Bold claim — strong declarative statements drive engagement.',
      };
    }

    return { ruleId: 'hook-bold-claim', triggered: false, points: 0, severity: 'info' };
  },
};

// NEW: List Promise Hook
const LIST_PROMISE =
  /\b\d+\s*(things|ways|tips|lessons|rules|steps|mistakes|reasons|habits|secrets|signs|tools|strategies|methods|principles|frameworks|hacks|takeaways)\b/i;

export const listPromiseRule: RuleDefinition = {
  id: 'hook-list-promise',
  name: 'List Promise Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const firstLine = input.text.split('\n')[0];

    if (LIST_PROMISE.test(firstLine)) {
      return {
        ruleId: 'hook-list-promise',
        triggered: true,
        points: 6,
        severity: 'positive',
        suggestion: 'List promise detected — highly bookmarkable format (bookmarks = 20x a like).',
      };
    }

    return { ruleId: 'hook-list-promise', triggered: false, points: 0, severity: 'info' };
  },
};

// NEW: Compound Hook Quality — fires when 2+ hook signals are present
const COMPOUND_NUMBER = /\$[\d,]+|\d+%|\b\d{2,}\b/;
const COMPOUND_OPEN_LOOP = /:\s*$|—\s*$|\.\.\.\s*$|here'?s (what|how|why)/i;
const COMPOUND_CONTRARIAN = /\b(overrated|underrated|wrong about|nobody talks about|unpopular|controversial|myth|lie)\b/i;
const COMPOUND_STORY = /^(Last |Yesterday|I (just|recently|spent|built|quit|lost|made)|Back in 20|When I was|True story:)/i;
const COMPOUND_INTERRUPT = /^(Stop |Never |Don't |Quit |Forget |Avoid |Skip )/i;
const COMPOUND_BOLD = /^(The (best|worst|biggest|fastest|most|only|single)|No one|Everyone|Every single)/i;

export const compoundHookRule: RuleDefinition = {
  id: 'hook-compound-quality',
  name: 'Compound Hook Quality',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const first80 = input.text.slice(0, 80);
    const firstLine = input.text.split('\n')[0];
    let signals = 0;

    if (COMPOUND_NUMBER.test(first80)) signals++;
    if (COMPOUND_OPEN_LOOP.test(firstLine)) signals++;
    if (COMPOUND_CONTRARIAN.test(first80)) signals++;
    if (COMPOUND_STORY.test(first80)) signals++;
    if (COMPOUND_INTERRUPT.test(input.text)) signals++;
    if (COMPOUND_BOLD.test(first80)) signals++;
    if (LIST_PROMISE.test(firstLine)) signals++;

    if (signals >= 2) {
      return {
        ruleId: 'hook-compound-quality',
        triggered: true,
        points: 7,
        severity: 'positive',
        suggestion: 'Multiple hook signals — compound hooks are the most viral pattern.',
      };
    }

    return { ruleId: 'hook-compound-quality', triggered: false, points: 0, severity: 'info' };
  },
};
