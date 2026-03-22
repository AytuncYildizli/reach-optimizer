import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const CTA_PATTERNS = [
  'what do you think',
  'have you',
  'which one',
  'tell me',
  'share your',
  "what's your",
  'how do you',
  'drop your',
  'reply with',
];

const RHETORICAL_PATTERNS = [
  'right?',
  "isn't it?",
  "don't you think?",
  "wouldn't you?",
  "isn't that",
  "don't we all",
];

const BOOKMARK_PATTERNS = /\d+[.)]\s|step |how to |guide|framework|checklist|template|tips for|lesson|rule/i;

export const ctaPresenceRule: RuleDefinition = {
  id: 'engagement-cta-presence',
  name: 'CTA Presence',
  category: 'engagement',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    const tail = text.slice(-120);
    const lowerTail = tail.toLowerCase();

    const hasQuestionMark = tail.includes('?');
    const hasCtaPattern = CTA_PATTERNS.some((pattern) => lowerTail.includes(pattern));

    if (hasQuestionMark || hasCtaPattern) {
      return {
        ruleId: 'engagement-cta-presence',
        triggered: true,
        points: 7,
        severity: 'positive',
        suggestion: 'Reply-triggering CTA detected — this drives conversations',
      };
    }

    return {
      ruleId: 'engagement-cta-presence',
      triggered: true,
      points: -4,
      severity: 'warning',
      suggestion:
        'No call-to-action. Add a question to trigger replies (replies are 27x more valuable than likes).',
    };
  },
};

export const questionTypeRule: RuleDefinition = {
  id: 'engagement-question-type',
  name: 'Question Type',
  category: 'engagement',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;

    if (!text.includes('?')) {
      return {
        ruleId: 'engagement-question-type',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    const lowerText = text.toLowerCase();
    const isRhetorical = RHETORICAL_PATTERNS.some((pattern) => lowerText.includes(pattern));

    if (isRhetorical) {
      return {
        ruleId: 'engagement-question-type',
        triggered: true,
        points: -3,
        severity: 'warning',
        suggestion: 'Rhetorical question detected. Answerable questions drive more replies.',
      };
    }

    return {
      ruleId: 'engagement-question-type',
      triggered: true,
      points: 4,
      severity: 'positive',
      suggestion: 'Good — answerable question encourages replies',
    };
  },
};

export const bookmarkValueRule: RuleDefinition = {
  id: 'engagement-bookmark-value',
  name: 'Bookmark Value',
  category: 'engagement',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    const match = BOOKMARK_PATTERNS.test(text);

    if (match) {
      return {
        ruleId: 'engagement-bookmark-value',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion: 'Bookmarkable content detected — bookmarks are 10-20x more valuable than likes',
      };
    }

    return {
      ruleId: 'engagement-bookmark-value',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};
