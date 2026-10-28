/**
 * Extra compose-time features for the reach ablation.
 * Keyword lists are fixed before any holdout is scored. A thread position
 * counts only earlier posts in the same burst. The finished thread length
 * is not used: it is not known when the earlier posts are written.
 */

export const TOPIC_FEATURE_KEYS = [
  'topic_ai',
  'topic_crypto',
  'topic_turkey',
  'topic_build',
  'topic_personal',
  'text_tr',
] as const;

export const HOOK_FEATURE_KEYS = [
  'hook_question',
  'hook_number',
  'hook_fun_fact',
  'hook_one_word',
  'hook_emoji_only',
] as const;

export const LENGTH_FEATURE_KEYS = ['chars_over_200', 'thread_pos'] as const;

/** GIF is split out from the image flag. Video is already `has_video`. */
export const MEDIA_FEATURE_KEYS = ['has_gif'] as const;

export const REACH_EXTRA_KEYS = [
  ...TOPIC_FEATURE_KEYS,
  ...HOOK_FEATURE_KEYS,
  ...LENGTH_FEATURE_KEYS,
  ...MEDIA_FEATURE_KEYS,
] as const;

const TOPIC_WORDS: Record<(typeof TOPIC_FEATURE_KEYS)[number], string[]> = {
  topic_ai: ['ai', 'agent', 'agents', 'llm', 'gpt', 'claude', 'grok', 'prompt', 'yapay', 'zeka'],
  topic_crypto: ['crypto', 'bitcoin', 'ethereum', 'solana', '0g', 'defi', 'token', 'blockchain', 'web3'],
  topic_turkey: ['turkey', 'turkish', 'istanbul', 'ankara', 'izmir', 'türkiye', 'turkiye', 'türk', 'anadolu'],
  topic_build: ['kahve', 'tabela', 'katman', 'ship', 'launch', 'product'],
  topic_personal: ['benim', 'bugün', 'bugun', 'birthday', 'aile'],
  text_tr: [],
};

const TR_WORDS = ['ve', 'bir', 'için', 'icin', 'değil', 'degil', 'ama', 'çok', 'cok', 'bu', 'şu', 'su'];
const EMOJI = /\p{Extended_Pictographic}/u;

function fold(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/i̇/g, 'i');
}

function hasWord(text: string, word: string): boolean {
  const escaped = fold(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(fold(text));
}

export function textLooksTurkish(text: string, lang: string): boolean {
  if (lang.toLowerCase() === 'tr') return true;
  if (/[ğüşıöç]/i.test(text)) return true;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const word of TR_WORDS) if (hasWord(lower, word)) hits++;
  return hits >= 2;
}

export function hookParts(text: string): {
  question: boolean;
  number: boolean;
  funFact: boolean;
  oneWord: boolean;
  emojiOnly: boolean;
} {
  const first = (text.split('\n')[0] ?? '').trim();
  const withoutEmoji = first.replace(/\p{Extended_Pictographic}/gu, ' ').replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
  const words = withoutEmoji.split(/\s+/).filter(Boolean);
  const emojiOnly = first.length > 0 && withoutEmoji.length === 0 && EMOJI.test(first);
  return {
    question: first.includes('?'),
    number: /\d/.test(first),
    funFact: /fun\s+fact/i.test(first) || /ilgin[cç]\s+bilgi/i.test(first),
    oneWord: words.length === 1 && !emojiOnly,
    emojiOnly,
  };
}

/** How many earlier self-replies sit in the open burst. Known at compose time. */
export function threadPosition(isSelfReply: boolean, previousCreatedAt: number | null, createdAt: number, previousPos: number): number {
  if (!isSelfReply || previousCreatedAt == null) return 0;
  if (createdAt - previousCreatedAt > 6 * 60 * 60 * 1000) return 0;
  return previousPos + 1;
}

export function reachFeatureRecord(input: {
  text: string;
  lang: string;
  mediaType: 'image' | 'video' | 'gif' | null;
  threadPos: number;
}): Record<string, number> {
  const lower = fold(input.text);
  const hook = hookParts(input.text);
  const rec: Record<string, number> = {
    topic_ai: 0,
    topic_crypto: 0,
    topic_turkey: 0,
    topic_build: 0,
    topic_personal: 0,
    text_tr: textLooksTurkish(input.text, input.lang) ? 1 : 0,
    hook_question: hook.question ? 1 : 0,
    hook_number: hook.number ? 1 : 0,
    hook_fun_fact: hook.funFact ? 1 : 0,
    hook_one_word: hook.oneWord ? 1 : 0,
    hook_emoji_only: hook.emojiOnly ? 1 : 0,
    chars_over_200: input.text.length > 200 ? 1 : 0,
    thread_pos: input.threadPos,
    has_gif: input.mediaType === 'gif' ? 1 : 0,
  };
  for (const key of TOPIC_FEATURE_KEYS) {
    if (key === 'text_tr') continue;
    rec[key] = TOPIC_WORDS[key].some((word) => hasWord(lower, word)) ? 1 : 0;
  }
  return rec;
}
