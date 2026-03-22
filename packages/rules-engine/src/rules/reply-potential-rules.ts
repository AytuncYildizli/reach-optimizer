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
    const notTriggered: RuleResult = {
      ruleId: 'penalty-dead-ending',
      triggered: false,
      points: 0,
      severity: 'info',
    };

    // Short punchy tweets don't need a CTA
    if (text.length < 71) return notTriggered;

    const trimmed = text.trimEnd();
    const lastChar = trimmed.charAt(trimmed.length - 1);

    // Check if ends with question mark, colon, or ellipsis — those are fine
    if (lastChar === '?' || lastChar === ':' || trimmed.endsWith('...')) {
      return notTriggered;
    }

    // Check last portion for CTA keywords
    const lastPortion = text.slice(-120);
    if (CTA_KEYWORDS.test(lastPortion)) return notTriggered;

    // Check if there are ANY engagement signals anywhere in the tweet
    // (question anywhere, CTA pattern anywhere) — if so, don't penalize
    const hasQuestionAnywhere = /\?/.test(text);
    const hasCtaAnywhere = CTA_KEYWORDS.test(text);
    if (hasQuestionAnywhere || hasCtaAnywhere) return notTriggered;

    return {
      ruleId: 'penalty-dead-ending',
      triggered: true,
      points: -2,
      severity: 'warning',
      suggestion:
        'Consider adding a question or open loop to invite replies.',
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
        points: -3,
        severity: 'critical',
        suggestion: 'ADD AN IMAGE OR VIDEO! Media gets 2-10x more reach. Screenshot, chart, meme, or short clip.',
      };
    }
    return { ruleId: 'bonus-media-present', triggered: false, points: 0, severity: 'info' };
  },
};

// Common grammar/typo patterns that hurt credibility on X
const GRAMMAR_PATTERNS: { pattern: RegExp; fix: string; label: string }[] = [
  { pattern: /\bi (am|was|have|had|will|would|can|could|should|want|need|think|know|like|love|hate|did|do)\b/g, fix: "I", label: "lowercase 'i'" },
  { pattern: /\byou're\s+(a\s+)?(right|wrong|correct|the\s+best)/i, fix: "", label: "" }, // valid usage, skip
  { pattern: /\byour\s+(a\s+|going|welcome|the\s+one\s+who|doing|right|wrong)/i, fix: "you're", label: "your → you're" },
  { pattern: /\byou're\s+(own|company|team|product|app|site|tool|brand|business|account)/i, fix: "your", label: "you're → your" },
  { pattern: /\btheir\s+(is|are|was|were|going|doing|coming)\b/i, fix: "there", label: "their → there" },
  { pattern: /\bthere\s+(own|company|team|product|idea|fault|problem)\b/i, fix: "their", label: "there → their" },
  { pattern: /\bshould of\b/i, fix: "should have", label: "should of → should have" },
  { pattern: /\bcould of\b/i, fix: "could have", label: "could of → could have" },
  { pattern: /\bwould of\b/i, fix: "would have", label: "would of → would have" },
  { pattern: /\balot\b/i, fix: "a lot", label: "alot → a lot" },
  { pattern: /\bdefinate(ly)?\b/i, fix: "definite$1", label: "definate → definite" },
  { pattern: /\bseperate\b/i, fix: "separate", label: "seperate → separate" },
  { pattern: /\brecieve\b/i, fix: "receive", label: "recieve → receive" },
  { pattern: /\boccur(r)?ance\b/i, fix: "occurrence", label: "spelling: occurrence" },
  { pattern: /\bthe\s+the\b/i, fix: "the", label: "repeated 'the the'" },
  { pattern: /\b(a)\s+\1\b/i, fix: "$1", label: "repeated word" },
];

export const grammarCheckRule: RuleDefinition = {
  id: 'penalty-grammar',
  name: 'Grammar Check',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    const issues: string[] = [];

    for (const { pattern, label } of GRAMMAR_PATTERNS) {
      if (!label) continue; // skip valid-usage patterns
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        issues.push(label);
      }
    }

    if (issues.length === 0) {
      return { ruleId: 'penalty-grammar', triggered: false, points: 0, severity: 'info' };
    }

    return {
      ruleId: 'penalty-grammar',
      triggered: true,
      points: -Math.min(issues.length * 2, 6), // -2 per issue, max -6
      severity: issues.length >= 3 ? 'critical' : 'warning',
      suggestion: `Grammar: ${issues.join(', ')}. Fix these for credibility.`,
    };
  },
};
