import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

// Expanded AI slop words — frequency multipliers from research (vs human text)
// delve=48x, tapestry=35x, "it's worth noting"=31x, multifaceted=28x, etc.
const AI_SLOP_WORDS =
  /\b(delve|tapestry|landscape|labyrinth|crucible|beacon|embark|unveil|leverage|synergy|holistic|paramount|endeavor|utilize|facilitate|aforementioned|henceforth|comprehensive|multifaceted|paradigm|ever-evolving|realm|harness|vibrant|robust|compelling|navigate|crucial)\b/gi;

const AI_SLOP_PHRASES =
  /it's worth noting|in today's digital age|in the realm of|at the end of the day|it goes without saying|dive (deep )?into/gi;

export const aiSlopWordsRule: RuleDefinition = {
  id: 'penalty-ai-slop-words',
  name: 'AI Slop Word Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const wordMatches = input.text.match(AI_SLOP_WORDS);
    const phraseMatches = input.text.match(AI_SLOP_PHRASES);
    const wordCount = wordMatches ? wordMatches.length : 0;
    const phraseCount = phraseMatches ? phraseMatches.length : 0;
    const count = wordCount + phraseCount;

    if (count >= 4) {
      return {
        ruleId: 'penalty-ai-slop-words',
        triggered: true,
        points: -14,
        severity: 'critical',
        suggestion: `Heavy AI writing patterns detected (${count} markers). Rewrite in your natural voice — AI text kills engagement velocity.`,
      };
    }

    if (count >= 2) {
      return {
        ruleId: 'penalty-ai-slop-words',
        triggered: true,
        points: -7,
        severity: 'warning',
        suggestion: `AI writing patterns detected (${count} markers). Rewrite in your natural voice.`,
      };
    }

    return {
      ruleId: 'penalty-ai-slop-words',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const EM_DASH_REGEX = /\u2014/g;
const STRUCTURAL_OPENER =
  /^(Furthermore|Moreover|Additionally|In conclusion|It's worth noting)/im;

export const aiSlopStructureRule: RuleDefinition = {
  id: 'penalty-ai-slop-structure',
  name: 'AI Slop Structure Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;
    let penalty = 0;

    const emDashMatches = text.match(EM_DASH_REGEX);
    const emDashCount = emDashMatches ? emDashMatches.length : 0;
    if (emDashCount >= 3) {
      penalty -= 4;
    }

    if (STRUCTURAL_OPENER.test(text)) {
      penalty -= 4;
    }

    if (penalty === 0) {
      return {
        ruleId: 'penalty-ai-slop-structure',
        triggered: false,
        points: 0,
        severity: 'info',
      };
    }

    const capped = Math.max(-8, penalty);

    return {
      ruleId: 'penalty-ai-slop-structure',
      triggered: true,
      points: capped,
      severity: 'warning',
      suggestion:
        'Structural AI patterns detected. Use shorter sentences and natural transitions.',
    };
  },
};

const STALE_FORMULA =
  /^(Unpopular opinion:|Hot take:|Here's the thing:|Let that sink in|Read that again|This\.|Thread \u{1F9F5})/iu;

export const staleFormulaRule: RuleDefinition = {
  id: 'penalty-stale-formula',
  name: 'Stale Formula Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (STALE_FORMULA.test(input.text)) {
      return {
        ruleId: 'penalty-stale-formula',
        triggered: true,
        points: -5,
        severity: 'warning',
        suggestion:
          'Overused formula — these patterns now signal low quality. Find a fresh hook.',
      };
    }

    return {
      ruleId: 'penalty-stale-formula',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};

const HEDGING_OPENER =
  /^(I think (maybe|perhaps)|It might be|Could be worth|Not sure (if|but)|Honest(ly)?,?\s)/i;

export const hedgingOpenerRule: RuleDefinition = {
  id: 'penalty-hedging-opener',
  name: 'Hedging Opener Detection',
  category: 'penalty',
  runOn: 'client',
  evaluate: (input: TweetInput): RuleResult => {
    if (HEDGING_OPENER.test(input.text)) {
      return {
        ruleId: 'penalty-hedging-opener',
        triggered: true,
        points: -5,
        severity: 'warning',
        suggestion:
          'Hedging opener weakens your hook. State your claim boldly — bold claims get 2x engagement.',
      };
    }

    return {
      ruleId: 'penalty-hedging-opener',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};
