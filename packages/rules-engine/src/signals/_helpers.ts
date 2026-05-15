import type {
  PostContext,
  SignalBucket,
  SignalName,
  SignalScore,
  SignalType,
  SubRule,
} from '@reach/shared-types';

export interface SubRuleDef {
  name: string;
  weight: number;
  test: (ctx: PostContext) => boolean | string;
}

export interface ScoreOpts {
  signal: SignalName;
  type: SignalType;
  bucket: SignalBucket;
  max: number;
  applicable?: boolean;
  rules: SubRuleDef[];
  suggestionWhenLow?: string;
  suggestionWhenHigh?: string;
}

export function buildSignalScore(ctx: PostContext, opts: ScoreOpts): SignalScore {
  const applicable = opts.applicable ?? true;
  const subRules: SubRule[] = [];

  if (!applicable) {
    return {
      signal: opts.signal,
      type: opts.type,
      bucket: opts.bucket,
      score: 0,
      max: opts.max,
      applicable: false,
      firedRules: [],
      subRules: [],
    };
  }

  let raw = 0;
  for (const r of opts.rules) {
    const result = r.test(ctx);
    const fired = Boolean(result);
    const evidence = typeof result === 'string' ? result : undefined;
    if (fired) raw += r.weight;
    subRules.push({ name: r.name, weight: r.weight, fired, evidence });
  }

  let score: number;
  if (opts.type === 'positive') {
    score = Math.max(0, Math.min(opts.max, raw));
  } else {
    score = Math.max(opts.max, Math.min(0, raw));
  }

  const firedRules = subRules.filter((r) => r.fired).map((r) => r.name);

  let suggestion: string | undefined;
  if (opts.type === 'positive') {
    if (score < opts.max * 0.4 && opts.suggestionWhenLow) suggestion = opts.suggestionWhenLow;
    else if (score >= opts.max * 0.7 && opts.suggestionWhenHigh) suggestion = opts.suggestionWhenHigh;
  } else {
    if (score < 0 && opts.suggestionWhenLow) suggestion = opts.suggestionWhenLow;
  }

  return {
    signal: opts.signal,
    type: opts.type,
    bucket: opts.bucket,
    score,
    max: opts.max,
    applicable: true,
    firedRules,
    subRules,
    suggestion,
  };
}

// Reusable predicate helpers --------------------------------------------------

export const URL_REGEX = /https?:\/\/\S+/i;
export const QUESTION_REGEX = /\?[\s)\]]*$/;
export const SECOND_PERSON_REGEX = /\b(you|your|you're|yourself)\b/i;
export const FIRST_PERSON_REGEX = /\bI(?:'m|'ve| )/;
export const NUMBER_REGEX = /\$[\d,]+|\d+%|\b\d{2,}\b/;

export function startsWithAny(text: string, prefixes: string[]): boolean {
  const lower = text.trimStart().toLowerCase();
  return prefixes.some((p) => lower.startsWith(p));
}

export function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function hasOpinionMarker(text: string): boolean {
  return /\b(I think|in my opinion|hot take|unpopular opinion|truth is|the reality is|here'?s the truth|controversial|nobody talks about|change my mind)\b/i.test(
    text,
  );
}

export function hasControversyMarker(text: string): boolean {
  return /\b(actually|wrong|overrated|underrated|hate to say|controversial|disagree|but actually)\b/i.test(
    text,
  );
}

export function hasAphoristicShape(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 200) return false;
  if (trimmed.length < 20) return false;
  // Short, single-sentence, declarative, no questions
  const sentences = trimmed.split(/[.!?]\s+/).filter(Boolean);
  return sentences.length <= 2 && !trimmed.includes('?');
}

export function hasListShape(text: string): boolean {
  // numbered or bulleted list
  return /(^|\n)\s*(\d+[.)]\s|[-*•]\s)/.test(text) || /\b(\d+)\s+(ways|reasons|things|tips|lessons|rules|steps|examples)\b/i.test(text);
}

export function hasInsiderFraming(text: string): boolean {
  return /\b(the trick|the secret|nobody tells you|what (they|nobody) won'?t tell you|hidden|insider|behind the scenes|the real reason|truth (about|behind))\b/i.test(
    text,
  );
}

export function hasNicheTargeting(text: string): boolean {
  return /\b(every (designer|engineer|founder|PM|marketer|writer|dev|developer|manager|CEO|CTO|CMO|recruiter|teacher|parent|student) should|if you'?re a)\b/i.test(
    text,
  );
}

export function hasParagraphBreaks(text: string): boolean {
  return /\n\s*\n/.test(text);
}

export function isWallOfText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 300 && !hasParagraphBreaks(trimmed);
}

export function hasGenericOpener(text: string): boolean {
  const openers = [
    'so today',
    'let me explain',
    "here's why",
    "let's talk about",
    'i want to talk',
    'in this thread',
    'a thread on',
    'thread:',
    'nobody asked',
    'can we talk about',
    "i'm going to share",
  ];
  return startsWithAny(text, openers);
}

const AI_SLOP_WORDS = [
  'delve into',
  'navigate the',
  'tapestry',
  'in the realm of',
  'leverage',
  'paradigm',
  'unleash',
  'embark on',
  'utilize',
  'seamless',
  "it's important to note",
];

export function hasAiSlopWords(text: string): boolean {
  return containsAny(text, AI_SLOP_WORDS);
}

export function repeatedCharsSpam(text: string): boolean {
  return /(.)\1{6,}/.test(text);
}

export function repeatedWordsSpam(text: string): boolean {
  return /\b(\w{3,})\b(?:\s+\1\b){3,}/i.test(text);
}

export function aggressiveTone(text: string): boolean {
  return /\b(idiot|moron|stupid|garbage|trash|kys|loser|pathetic|braindead|delusional)\b/i.test(
    text,
  );
}

export function adHominem(text: string): boolean {
  return /\byou(?:'re| are)\s+(an?\s+)?(idiot|moron|stupid|delusional|pathetic|loser|braindead)\b/i.test(
    text,
  );
}

export function selfPromoRatio(text: string): number {
  const links = (text.match(/https?:\/\/\S+/g) ?? []).length;
  const ownProductMarkers = (text.match(/\b(my (?:app|tool|product|book|course|newsletter|startup|company)|check out my|signup|sign up|buy now|order now)\b/gi) ?? []).length;
  const words = wordCount(text);
  if (words === 0) return 0;
  return (links + ownProductMarkers) / Math.max(1, words / 10);
}
