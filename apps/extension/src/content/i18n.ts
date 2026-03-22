type Locale = 'en' | 'tr';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    reachScore: 'REACH SCORE',
    breakdown: 'BREAKDOWN',
    hook: 'Hook',
    structure: 'Structure',
    engagement: 'Engagement',
    penalties: 'Penalties',
    bonuses: 'Bonuses',
    suggestions: 'SUGGESTIONS',
    suggestion: 'suggestion',
    suggestions_plural: 'suggestions',
    autoOptimize: 'Auto-Optimize (iterative AI rewriting)',
    autoOptimizing: 'AUTO-OPTIMIZING...',
    autoOptResults: 'AUTO-OPTIMIZE RESULTS',
    rounds: 'rounds',
    variations: 'variations',
    improvement: 'improvement',
    vsYours: 'vs yours',
    copy: 'Copy',
    copied: 'Copied!',
    runAgain: 'Run Again',
    generating: 'Generating...',
    selfReplyStrategy: 'SELF-REPLY STRATEGY',
    generateSelfReply: 'Generate Self-Reply (starts conversation)',
    selfReplyInstruction: 'Copied! Post your tweet first, then paste this as your first reply:',
    copyAgain: 'Copy again',
    aiCheck: 'AI Check',
    typeMore: 'Type more to analyze',
    natural: 'Natural — Human-written',
    aiEnhanced: 'AI Enhanced',
    startTyping: 'Start typing in the tweet composer...',
    goodTimeNow: 'Good time to post now!',
    betterAt: 'Better at',
    replyCoach: 'replies',
    replyCoachBoost: 'reply back for 150x boost!',
    getReplyIdeas: 'Get Reply Ideas',
    addMedia: 'ADD AN IMAGE OR VIDEO! Media gets 2-10x more reach.',
    noIssues: 'No issues found — looking good!',
    serverUnavailable: 'Server unavailable — showing local analysis only',
    trendingBoost: 'Trending Topic Boost',
  },
  tr: {
    reachScore: 'ERISIM SKORU',
    breakdown: 'DETAY',
    hook: 'Hook',
    structure: 'Yapi',
    engagement: 'Etkilesim',
    penalties: 'Cezalar',
    bonuses: 'Bonuslar',
    suggestions: 'ONERILER',
    suggestion: 'oneri',
    suggestions_plural: 'oneri',
    autoOptimize: 'Oto-Optimize (yinelemeli AI yeniden yazma)',
    autoOptimizing: 'OTO-OPTIMIZE EDILIYOR...',
    autoOptResults: 'OTO-OPTIMIZE SONUCLARI',
    rounds: 'tur',
    variations: 'varyasyon',
    improvement: 'iyilestirme',
    vsYours: 'seninkine gore',
    copy: 'Kopyala',
    copied: 'Kopyalandi!',
    runAgain: 'Tekrar Calistir',
    generating: 'Uretiliyor...',
    selfReplyStrategy: 'KENDI-YANIT STRATEJISI',
    generateSelfReply: 'Kendi-Yanit Uret (sohbet baslatir)',
    selfReplyInstruction: 'Kopyalandi! Once tweetini at, sonra bunu yanit olarak yapistir:',
    copyAgain: 'Tekrar kopyala',
    aiCheck: 'AI Kontrol',
    typeMore: 'Analiz icin daha fazla yaz',
    natural: 'Dogal — Insan yazimi',
    aiEnhanced: 'AI Gelistirilmis',
    startTyping: 'Tweet yazma alanina yazmaya basla...',
    goodTimeNow: 'Simdi paylasim icin iyi zaman!',
    betterAt: 'Daha iyi saat',
    replyCoach: 'yanit',
    replyCoachBoost: 'yanitla — 150x algoritma artisi!',
    getReplyIdeas: 'Yanit Fikirleri Al',
    addMedia: 'GORSEL VEYA VIDEO EKLE! Medya 2-10x daha fazla erisim saglar.',
    noIssues: 'Sorun bulunamadi — guzel gorunuyor!',
    serverUnavailable: 'Sunucu ulasilamiyor — sadece yerel analiz gosteriliyor',
    trendingBoost: 'Trend Konu Artisi',
  },
};

function detectLocale(): Locale {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('tr')) return 'tr';
  return 'en';
}

const currentLocale = detectLocale();

export function t(key: string): string {
  return translations[currentLocale]?.[key] ?? translations.en[key] ?? key;
}

export function getLocale(): Locale {
  return currentLocale;
}
