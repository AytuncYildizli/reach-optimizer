import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

// ─────────────────────────────────────────────────────────────────────────────
// Rule: Sentiment/Tone Analysis (Grok 2026 signal)
// Research: Grok rewards positive/constructive tone, penalizes negativity
// even when engagement is high. Blocks=-148x, Reports=-738x.
// ─────────────────────────────────────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
  'love', 'amazing', 'incredible', 'awesome', 'great', 'excellent', 'fantastic',
  'brilliant', 'beautiful', 'wonderful', 'perfect', 'excited', 'thrilled',
  'grateful', 'thankful', 'proud', 'inspired', 'inspiring', 'helpful',
  'valuable', 'powerful', 'impressive', 'remarkable', 'outstanding',
  'game-changer', 'breakthrough', 'milestone', 'achievement', 'win',
  'congrats', 'congratulations', 'bravo', 'well done', 'appreciate',
  'recommend', 'learned', 'growth', 'progress', 'opportunity',
  'celebrate', 'happy', 'joy', 'hope', 'optimistic', 'best',
]);

const NEGATIVE_WORDS = new Set([
  'hate', 'terrible', 'awful', 'horrible', 'disgusting', 'pathetic',
  'useless', 'worthless', 'worst', 'toxic', 'disaster', 'failure',
  'ruined', 'destroyed', 'broken', 'annoying', 'frustrating',
  'disappointed', 'depressing', 'miserable', 'nightmare', 'scam',
  'fraud', 'stealing', 'lying', 'corrupt', 'incompetent', 'clueless',
  'embarrassing', 'shameful', 'disgraceful', 'ridiculous', 'absurd',
  'outrageous', 'unacceptable', 'never', 'nobody', 'nothing',
]);

// Constructive framing patterns — signal value-adding content
const CONSTRUCTIVE_PATTERNS =
  /\b(here'?s how|how to|my advice|lesson|takeaway|what I learned|pro tip|the key is|try this|instead of|better way|tip:|insight:)\b/i;

// Cynical/dismissive patterns — signal low-value negativity
const CYNICAL_PATTERNS =
  /\b(wake up|sheep|sheeple|clown world|cope|copium|mid|L take|ratio|cry about it|seethe|stay mad|die mad)\b/i;

export const sentimentToneRule: RuleDefinition = {
  id: 'quality-sentiment-tone',
  name: 'Sentiment & Tone',
  category: 'bonus',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const words = input.text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      const clean = word.replace(/[^a-z-]/g, '');
      if (POSITIVE_WORDS.has(clean)) positiveCount++;
      if (NEGATIVE_WORDS.has(clean)) negativeCount++;
    }

    const hasConstructive = CONSTRUCTIVE_PATTERNS.test(input.text);
    const hasCynical = CYNICAL_PATTERNS.test(input.text);

    // Net sentiment
    const netSentiment = positiveCount - negativeCount;

    // Cynical patterns override — always penalty
    if (hasCynical) {
      return {
        ruleId: 'quality-sentiment-tone',
        triggered: true,
        points: -5,
        severity: 'warning',
        suggestion: 'Cynical/dismissive tone detected — Grok penalizes negativity even with high engagement.',
      };
    }

    // Strong negative tone
    if (netSentiment <= -2 && negativeCount >= 3) {
      return {
        ruleId: 'quality-sentiment-tone',
        triggered: true,
        points: -4,
        severity: 'warning',
        suggestion: 'Negative tone detected — positive/constructive content gets wider distribution under Grok.',
      };
    }

    // Constructive + positive = reward
    if (hasConstructive && netSentiment >= 1) {
      return {
        ruleId: 'quality-sentiment-tone',
        triggered: true,
        points: 5,
        severity: 'positive',
        suggestion: 'Constructive, positive tone — Grok rewards this with wider distribution.',
      };
    }

    // Just positive
    if (netSentiment >= 2 && positiveCount >= 2) {
      return {
        ruleId: 'quality-sentiment-tone',
        triggered: true,
        points: 3,
        severity: 'positive',
        suggestion: 'Positive tone detected — this helps with Grok sentiment scoring.',
      };
    }

    return { ruleId: 'quality-sentiment-tone', triggered: false, points: 0, severity: 'info' };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Rule: Readability Score
// Research: 6th-7th grade reading level gets highest engagement.
// Simpler = more people read completely = higher dwell time = algorithmic boost.
// Uses simplified Flesch-Kincaid approximation (no syllable dictionary needed).
// ─────────────────────────────────────────────────────────────────────────────

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 2) return 1;

  // Count vowel groups
  const vowelGroups = w.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Silent e at end
  if (w.endsWith('e') && count > 1) count--;
  // -le ending adds a syllable
  if (w.endsWith('le') && w.length > 2 && !/[aeiouy]/.test(w.charAt(w.length - 3))) count++;

  return Math.max(1, count);
}

function fleschKincaidGradeLevel(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0);

  if (sentences.length === 0 || words.length === 0) return 8; // default to average

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  // Flesch-Kincaid Grade Level formula
  const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(1, Math.min(16, grade));
}

export const readabilityRule: RuleDefinition = {
  id: 'quality-readability',
  name: 'Readability Score',
  category: 'structure',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;

    // Skip very short tweets — not enough text for meaningful readability score
    if (text.length < 50) {
      return { ruleId: 'quality-readability', triggered: false, points: 0, severity: 'info' };
    }

    const grade = fleschKincaidGradeLevel(text);

    // Tweets naturally score low on FK because they're short with simple words.
    // Sweet spot for tweets: grade 1-8 (simple, accessible = good for Twitter)
    if (grade <= 8) {
      return {
        ruleId: 'quality-readability',
        triggered: true,
        points: 4,
        severity: 'positive',
        suggestion: `Clear, readable language — optimal for engagement`,
      };
    }

    // Slightly above: 9th-10th grade (still acceptable)
    if (grade <= 10) {
      return {
        ruleId: 'quality-readability',
        triggered: true,
        points: 1,
        severity: 'info',
      };
    }

    // Too complex: 11+ grade (academic/jargon-heavy)
    return {
      ruleId: 'quality-readability',
      triggered: true,
      points: -3,
      severity: 'warning',
      suggestion: `Reading level: Grade ${Math.round(grade)} — too complex. Simplify language for wider reach.`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Rule: Contrast/Surprise Detection
// Research: Before/after, high vs low, expectation subversion drives engagement.
// Example: "$47M ARR. 0 employees." — the contrast between big number and zero
// is what makes this hook irresistible.
// ─────────────────────────────────────────────────────────────────────────────

// Contrast patterns: big vs small, before vs after, expectation vs reality
const CONTRAST_PATTERNS = [
  // Number contrast: big number near small/zero (e.g., "$47M ARR. 0 employees")
  /\$[\d,]+[MKBmkb]?.{0,30}\b0\b/,
  /\b0\b.{0,30}\$[\d,]+[MKBmkb]?/,
  // Large number near zero/none
  /\b\d{3,}[MKBmkb]?.{0,30}\b(zero|none|nothing|0)\b/i,
  /\b(zero|none|nothing|0)\b.{0,30}\b\d{3,}[MKBmkb]?/i,
  // Before/After pattern
  /\b(months?|years?|weeks?) ago.{0,40}(now|today)/i,
  /\b(before|was).{0,40}\b(after|now|today|became)/i,
  // Expectation subversion
  /\b(everyone|they all|most people)\s+(say|think|believe).{0,40}\b(but|except|wrong|actually|reality)/i,
  // Time contrast
  /\b\d+\s*(years?|months?|weeks?|days?|hours?).{0,30}(minutes?|seconds?|instantly|overnight)/i,
];

export const contrastSurpriseRule: RuleDefinition = {
  id: 'hook-contrast-surprise',
  name: 'Contrast/Surprise Hook',
  category: 'hook',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const firstPart = input.text.slice(0, 150); // Check first few lines

    for (const pattern of CONTRAST_PATTERNS) {
      if (pattern.test(firstPart)) {
        return {
          ruleId: 'hook-contrast-surprise',
          triggered: true,
          points: 6,
          severity: 'positive',
          suggestion: 'Contrast/surprise detected — expectation subversion drives high dwell time and shares.',
        };
      }
    }

    return { ruleId: 'hook-contrast-surprise', triggered: false, points: 0, severity: 'info' };
  },
};
