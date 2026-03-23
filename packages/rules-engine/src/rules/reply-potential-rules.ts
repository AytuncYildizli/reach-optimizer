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
        points: 10,
        severity: 'positive',
        suggestion:
          'Choice question — generates low-effort replies that create conversation chains (replies = 27x algorithm weight).',
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

// engagement-direct-address REMOVED — merged into cta-presence

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
    const hasQuestionAnywhere = /\?/.test(text);
    const hasCtaAnywhere = CTA_KEYWORDS.test(text);
    if (hasQuestionAnywhere || hasCtaAnywhere) return notTriggered;

    return {
      ruleId: 'penalty-dead-ending',
      triggered: true,
      points: -4,
      severity: 'warning',
      suggestion:
        'Dead ending — add a question or open loop to invite replies (replies = 27x a like).',
    };
  },
};

const COMBATIVE_WORDS =
  /\b(idiot|stupid|dumb|moron|trash|garbage|shut up|stfu|gtfo|brain ?dead|clown)\b/i;

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
        points: -10,
        severity: 'critical',
        suggestion:
          "Combative tone — Grok's sentiment analysis penalizes aggressive content. Blocks/reports are -148x to -738x a like.",
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

// bonus-specific-number REMOVED — merged into hook-number-data

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
        points: 4,
        severity: 'positive',
        suggestion: 'Media attached — confirmed 2x Earlybird boost in the algorithm.',
      };
    }
    // Suggest adding media for longer content, but don't penalize heavily
    // Research: text-only outperforms video by 30% on X because text drives more replies
    if (input.text.length > 100) {
      return {
        ruleId: 'bonus-media-present',
        triggered: true,
        points: 0,
        severity: 'info',
        suggestion: 'Consider adding an image — 2x algorithmic boost. But text-only can work well on X if it drives replies.',
      };
    }
    return { ruleId: 'bonus-media-present', triggered: false, points: 0, severity: 'info' };
  },
};

// Common grammar/typo patterns that hurt credibility on X
// Algorithm gives 0.01x (99% reduction) for unknown language/misspellings
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
      points: -Math.min(issues.length * 3, 9), // -3 per issue, max -9
      severity: issues.length >= 3 ? 'critical' : 'warning',
      suggestion: `Grammar: ${issues.join(', ')}. Fix for credibility — the algorithm penalizes poor language quality.`,
    };
  },
};

// NEW: Hashtag Placement — penalizes tweet starting with hashtag
export const hashtagPlacementRule: RuleDefinition = {
  id: 'penalty-hashtag-placement',
  name: 'Hashtag Placement',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (/^#\w+/.test(input.text)) {
      return {
        ruleId: 'penalty-hashtag-placement',
        triggered: true,
        points: -4,
        severity: 'warning',
        suggestion: 'Starting with a hashtag wastes your hook — algorithmic penalty confirmed.',
      };
    }

    return { ruleId: 'penalty-hashtag-placement', triggered: false, points: 0, severity: 'info' };
  },
};

// NEW: All-Caps Spam Detection
export const allCapsSpamRule: RuleDefinition = {
  id: 'penalty-all-caps-spam',
  name: 'All-Caps Spam',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const words = input.text.split(/\s+/).filter(w => w.length >= 3);
    if (words.length === 0) {
      return { ruleId: 'penalty-all-caps-spam', triggered: false, points: 0, severity: 'info' };
    }

    const capsWords = words.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w));
    const capsRatio = capsWords.length / words.length;

    if (capsRatio > 0.3 && capsWords.length >= 3) {
      return {
        ruleId: 'penalty-all-caps-spam',
        triggered: true,
        points: -4,
        severity: 'warning',
        suggestion: 'Too much ALL CAPS — confirmed algorithmic penalty. Use caps sparingly for emphasis.',
      };
    }

    return { ruleId: 'penalty-all-caps-spam', triggered: false, points: 0, severity: 'info' };
  },
};
