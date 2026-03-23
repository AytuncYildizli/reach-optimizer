/**
 * Simple language detection for tweet text.
 * Returns 'tr' for Turkish, 'en' for English (default).
 * Used to ensure AI suggestions match the tweet's language.
 */

// Turkish-specific characters (not found in English)
const TR_CHARS = /[ğüşıöçĞÜŞİÖÇ]/;

// Common Turkish words (high-frequency, low-ambiguity)
const TR_WORDS = new Set([
  'bir', 'bu', 've', 'ile', 'için', 'ama', 'çok', 'da', 'de', 'ne',
  'var', 'yok', 'gibi', 'olan', 'daha', 'ben', 'sen', 'biz', 'onlar',
  'ki', 'ise', 'kadar', 'sonra', 'önce', 'çünkü', 'ama', 'fakat',
  'nasıl', 'neden', 'niye', 'hangi', 'bence', 'aslında', 'yani',
  'bile', 'hala', 'artık', 'zaten', 'sadece', 'hem', 'ya', 'mi',
  'mı', 'mu', 'mü', 'değil', 'olarak', 'böyle', 'şey', 'herkes',
  'hiç', 'her', 'kendi', 'biri', 'şu', 'en', 'çoğu', 'bazı',
  'oldu', 'olmuş', 'yapıyor', 'diyor', 'ediyor', 'geliyor', 'gidiyor',
]);

export type DetectedLanguage = 'tr' | 'en';

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.length < 3) return 'en';

  // Check for Turkish-specific characters
  const hasTurkishChars = TR_CHARS.test(text);

  // Count Turkish word matches
  const words = text.toLowerCase().split(/\s+/);
  let turkishWordCount = 0;
  for (const word of words) {
    // Strip punctuation from edges
    const clean = word.replace(/^[^a-zA-ZğüşıöçĞÜŞİÖÇ]+|[^a-zA-ZğüşıöçĞÜŞİÖÇ]+$/g, '');
    if (TR_WORDS.has(clean)) turkishWordCount++;
  }

  const turkishWordRatio = words.length > 0 ? turkishWordCount / words.length : 0;

  // Turkish if: has Turkish chars OR >15% Turkish words
  if (hasTurkishChars || turkishWordRatio > 0.15) return 'tr';

  return 'en';
}

/**
 * Returns a language instruction for AI prompts.
 */
export function getLanguageInstruction(lang: DetectedLanguage): string {
  if (lang === 'tr') {
    return 'CRITICAL: The original tweet is in TURKISH. You MUST write ALL suggestions in TURKISH. Do NOT translate to English. Keep Turkish characters (ğ, ü, ş, ı, ö, ç) correct.';
  }
  return 'The original tweet is in English. Write all suggestions in English.';
}
