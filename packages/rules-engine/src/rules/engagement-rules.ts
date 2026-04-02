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
  'tag someone',
];

const RHETORICAL_PATTERNS = [
  'right?',
  "isn't it?",
  "don't you think?",
  "wouldn't you?",
  "isn't that",
  "don't we all",
];

// Open-loop patterns that serve as implicit engagement drivers
const OPEN_LOOP_ENDING = /:\s*$|—\s*$|\.\.\.\s*$/;
const OPEN_LOOP_CONTENT = /here'?s (what|how|why)/i;

const BOOKMARK_PATTERNS = /\d+[.)]\s|step |how to |guide|framework|checklist|template|tips for|lesson|rule|playbook|roadmap|system|process|blueprint|formula/i;

export const ctaPresenceRule: RuleDefinition = {
  id: 'engagement-cta-presence',
  name: 'CTA Presence',
  category: 'engagement',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    const tail = text.slice(-120);
    const lowerTail = tail.toLowerCase();
    const lowerText = text.toLowerCase();

    const hasQuestionMark = tail.includes('?');
    const hasCtaPattern = CTA_PATTERNS.some((pattern) => lowerTail.includes(pattern));

    // Check for rhetorical questions (penalty instead of reward)
    if (hasQuestionMark) {
      const isRhetorical = RHETORICAL_PATTERNS.some((p) => lowerText.includes(p));
      if (isRhetorical) {
        return {
          ruleId: 'engagement-cta-presence',
          triggered: true,
          points: -3,
          severity: 'warning',
          suggestion: 'Rhetorical question detected. Answerable questions drive more replies (27x algorithm weight).',
        };
      }
    }

    if (hasQuestionMark || hasCtaPattern) {
      return {
        ruleId: 'engagement-cta-presence',
        triggered: true,
        points: 8,
        severity: 'positive',
        suggestion: 'Reply-triggering CTA detected — replies are 27x more valuable than likes',
      };
    }

    // If an open loop is present, don't penalize for no CTA
    // Open loops serve as implicit engagement drivers
    const lastLine = text.split('\n').filter(l => l.trim()).pop() || '';
    if (OPEN_LOOP_ENDING.test(lastLine) || OPEN_LOOP_CONTENT.test(text)) {
      return {
        ruleId: 'engagement-cta-presence',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    return {
      ruleId: 'engagement-cta-presence',
      triggered: true,
      points: -6,
      severity: 'warning',
      suggestion:
        'No call-to-action. Add a question to trigger replies (replies are 27x more valuable than likes).',
    };
  },
};

// engagement-question-type REMOVED — merged into cta-presence above

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
        points: 8,
        severity: 'positive',
        suggestion: 'Bookmarkable content detected — bookmarks are 20x more valuable than likes',
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
