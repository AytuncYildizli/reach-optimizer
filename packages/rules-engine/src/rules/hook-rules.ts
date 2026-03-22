import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const GENERIC_PATTERNS = [
  "here's why",
  'let me explain',
  'i think that',
  'in this thread',
  'a thread on',
  'thread:',
  "let's talk about",
];

export const genericHookRule: RuleDefinition = {
  id: 'hook-generic-pattern',
  name: 'Generic Hook Pattern',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const first50 = input.text.slice(0, 50).toLowerCase();
    const matched = GENERIC_PATTERNS.some((pattern) => first50.includes(pattern));

    if (matched) {
      return {
        ruleId: 'hook-generic-pattern',
        triggered: true,
        points: -5,
        severity: 'warning',
        suggestion:
          'Generic hook detected. Try opening with a specific number, bold claim, or question.',
      };
    }

    return {
      ruleId: 'hook-generic-pattern',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

export const hookLengthRule: RuleDefinition = {
  id: 'hook-length-check',
  name: 'Hook Length Check',
  category: 'structure',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const firstLine = input.text.split('\n')[0];
    const len = firstLine.length;

    if (len <= 40) {
      return {
        ruleId: 'hook-length-check',
        triggered: true,
        points: -2,
        severity: 'warning',
        suggestion: 'Hook too short — expand with specifics',
      };
    }

    if (len <= 100) {
      return {
        ruleId: 'hook-length-check',
        triggered: true,
        points: +3,
        severity: 'positive',
        suggestion: 'Good hook length',
      };
    }

    // Long hook is less of an issue with media (video provides context)
    return {
      ruleId: 'hook-length-check',
      triggered: true,
      points: input.hasMedia ? -1 : -3,
      severity: 'warning',
      suggestion: 'Hook too long — trim to under 100 characters',
    };
  },
};

const NUMBER_REGEX = /\$[\d,]+|\d+%|\b\d{2,}\b/;

export const numberDataHookRule: RuleDefinition = {
  id: 'hook-number-data',
  name: 'Number/Data in Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const first80 = input.text.slice(0, 80);
    const hasNumber = NUMBER_REGEX.test(first80);

    if (hasNumber) {
      return {
        ruleId: 'hook-number-data',
        triggered: true,
        points: +5,
        severity: 'positive',
        suggestion: 'Data point in hook — this drives +20-40% more engagement',
      };
    }

    return {
      ruleId: 'hook-number-data',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

export const multiSentenceHookRule: RuleDefinition = {
  id: 'hook-multi-sentence',
  name: 'Multi-Sentence Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const firstLine = input.text.split('\n')[0];
    const sentences = firstLine.split(/[.!?]\s+/).filter((s) => s.length > 0);

    if (sentences.length > 1) {
      return {
        ruleId: 'hook-multi-sentence',
        triggered: true,
        points: -3,
        severity: 'warning',
        suggestion:
          'Hook has multiple sentences. One powerful sentence is more effective.',
      };
    }

    return {
      ruleId: 'hook-multi-sentence',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const FIRST_PERSON_REGEX = /\bI\s|\bI'/;

export const firstPersonVoiceRule: RuleDefinition = {
  id: 'bonus-first-person',
  name: 'First-Person Voice',
  category: 'bonus',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const hasFirstPerson = FIRST_PERSON_REGEX.test(input.text);

    if (hasFirstPerson) {
      return {
        ruleId: 'bonus-first-person',
        triggered: true,
        points: +5,
        severity: 'positive',
        suggestion:
          'First-person voice detected — this drives +23% more engagement. Keep it!',
      };
    }

    return {
      ruleId: 'bonus-first-person',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};
