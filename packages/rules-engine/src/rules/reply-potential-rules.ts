import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

const CHOICE_QUESTION =
  /\b(which|what'?s your|A or B|choose|pick one|team \w+ or team \w+)\b.*\?/i;

export const choiceQuestionRule: RuleDefinition = {
  id: 'engagement-choice-question',
  name: 'Choice Question',
  category: 'engagement',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (CHOICE_QUESTION.test(input.text)) {
      return {
        ruleId: 'engagement-choice-question',
        triggered: true,
        points: 8,
        severity: 'positive',
        suggestion:
          'Choice question detected — low-effort replies drive conversation chains (150x algorithm weight).',
      };
    }

    return {
      ruleId: 'engagement-choice-question',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const DIRECT_ADDRESS =
  /\b(what do you think|tell me|share your|drop your|reply with|tag someone)\b/i;

export const directAddressRule: RuleDefinition = {
  id: 'engagement-direct-address',
  name: 'Direct Address CTA',
  category: 'engagement',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    // Check last 50% of text (tweets are short, so 30% can be too narrow)
    const lastThird = text.slice(Math.floor(text.length * 0.5));

    if (DIRECT_ADDRESS.test(lastThird)) {
      return {
        ruleId: 'engagement-direct-address',
        triggered: true,
        points: 6,
        severity: 'positive',
        suggestion:
          'Direct address CTA — explicitly asks for replies.',
      };
    }

    return {
      ruleId: 'engagement-direct-address',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const CTA_KEYWORDS =
  /(\?|what do you think|tell me|share your|drop your|reply with|tag someone|here'?s (what|how|why)|\.\.\.)/i;

export const deadEndingRule: RuleDefinition = {
  id: 'penalty-dead-ending',
  name: 'Dead Ending Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;

    // Short punchy tweets don't need a CTA
    if (text.length < 71) {
      return {
        ruleId: 'penalty-dead-ending',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    const trimmed = text.trimEnd();
    const lastChar = trimmed.charAt(trimmed.length - 1);

    // Check if ends with question mark, colon, or ellipsis — those are fine
    if (lastChar === '?' || lastChar === ':' || trimmed.endsWith('...')) {
      return {
        ruleId: 'penalty-dead-ending',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    // Check last portion for CTA keywords
    const lastPortion = text.slice(-120);
    if (CTA_KEYWORDS.test(lastPortion)) {
      return {
        ruleId: 'penalty-dead-ending',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    return {
      ruleId: 'penalty-dead-ending',
      triggered: true,
      points: -3,
      severity: 'warning',
      suggestion:
        'Tweet ends flat — add a question or open loop to invite replies.',
    };
  },
};

const COMBATIVE_WORDS =
  /\b(idiot|stupid|dumb|moron|trash|garbage|shut up|stfu|gtfo)\b/i;

export const combativeToneRule: RuleDefinition = {
  id: 'penalty-combative-tone',
  name: 'Combative Tone Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (COMBATIVE_WORDS.test(input.text)) {
      return {
        ruleId: 'penalty-combative-tone',
        triggered: true,
        points: -6,
        severity: 'critical',
        suggestion:
          "Combative tone detected — Grok's tone analysis throttles aggressive content.",
      };
    }

    return {
      ruleId: 'penalty-combative-tone',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const SPECIFIC_NUMBER = /\$[\d,]+|\d+%|\d{3,}[+ ]|#?\d+\/\d+/;

export const specificNumberRule: RuleDefinition = {
  id: 'bonus-specific-number',
  name: 'Specific Number Bonus',
  category: 'bonus',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (SPECIFIC_NUMBER.test(input.text)) {
      return {
        ruleId: 'bonus-specific-number',
        triggered: true,
        points: 3,
        severity: 'positive',
        suggestion:
          'Specific numbers add credibility and stop the scroll.',
      };
    }

    return {
      ruleId: 'bonus-specific-number',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

export const mediaPresenceRule: RuleDefinition = {
  id: 'bonus-media-present',
  name: 'Media Presence',
  category: 'bonus',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (input.hasMedia) {
      return {
        ruleId: 'bonus-media-present',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion: 'Media attached — images/videos get 2-10x more distribution.',
      };
    }
    // Only suggest adding media if tweet is long enough to be real content
    if (input.text.length > 50) {
      return {
        ruleId: 'bonus-media-present',
        triggered: true,
        points: 0,
        severity: 'warning',
        suggestion: 'No image or video. Adding media boosts reach by 150-1000%. Consider a screenshot, chart, or short video.',
      };
    }
    return { ruleId: 'bonus-media-present', triggered: false, points: 0, severity: 'info' };
  },
};
