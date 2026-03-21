export interface SlopPattern {
  pattern: RegExp;
  weight: number;
  category: string;
  label: string;
}

export const SLOP_PATTERNS: SlopPattern[] = [
  // ── Word choice (weight 2-3) ──
  { pattern: /\bdelve\b/i, weight: 3, category: 'word-choice', label: 'delve' },
  { pattern: /\blandscape\b/i, weight: 2, category: 'word-choice', label: 'landscape' },
  { pattern: /\btapestry\b/i, weight: 3, category: 'word-choice', label: 'tapestry' },
  { pattern: /\blabyrinth\b/i, weight: 3, category: 'word-choice', label: 'labyrinth' },
  { pattern: /\bcrucible\b/i, weight: 3, category: 'word-choice', label: 'crucible' },
  { pattern: /\bbeacon\b/i, weight: 2, category: 'word-choice', label: 'beacon' },
  { pattern: /\btestament to\b/i, weight: 3, category: 'word-choice', label: 'testament to' },
  { pattern: /\bembark\b/i, weight: 2, category: 'word-choice', label: 'embark' },
  { pattern: /\bunveil/i, weight: 2, category: 'word-choice', label: 'unveil' },
  { pattern: /\bleverage\b/i, weight: 2, category: 'word-choice', label: 'leverage' },
  { pattern: /\bsynergy\b/i, weight: 3, category: 'word-choice', label: 'synergy' },
  { pattern: /\bholistic\b/i, weight: 2, category: 'word-choice', label: 'holistic' },

  // ── Structure (weight 2-4) ──
  { pattern: /\u2014/g, weight: 4, category: 'structure', label: 'excessive em dashes' },
  { pattern: /\bnot only\b.*\bbut also\b/i, weight: 3, category: 'structure', label: 'not only...but also' },
  { pattern: /^(Furthermore|Moreover|Additionally),/im, weight: 3, category: 'structure', label: 'formulaic sentence starter' },
  { pattern: /\bIn conclusion\b/i, weight: 4, category: 'structure', label: 'In conclusion' },

  // ── Tone (weight 2-3) ──
  { pattern: /\bprofound impact\b/i, weight: 3, category: 'tone', label: 'profound impact' },
  { pattern: /\btransformative\b/i, weight: 2, category: 'tone', label: 'transformative' },
  { pattern: /\bgame[- ]changing\b/i, weight: 2, category: 'tone', label: 'game-changing' },
  { pattern: /\bit's worth noting\b/i, weight: 3, category: 'tone', label: "it's worth noting" },
  { pattern: /\bgroundbreaking\b/i, weight: 2, category: 'tone', label: 'groundbreaking' },
  { pattern: /\bseamless(ly)?\b/i, weight: 2, category: 'tone', label: 'seamless(ly)' },
  { pattern: /\brobust\b/i, weight: 2, category: 'tone', label: 'robust' },

  // ── Format (weight 3-4) ──
  { pattern: /\bstands as a testament\b/i, weight: 4, category: 'format', label: 'stands as a testament' },
  { pattern: /\bit is important to note\b/i, weight: 3, category: 'format', label: 'it is important to note' },
  { pattern: /\bI'm excited to announce\b/i, weight: 3, category: 'format', label: "I'm excited to announce" },
  { pattern: /\bin today's.*world\b/i, weight: 3, category: 'format', label: "in today's...world" },

  // ── Vague attribution (weight 2-3) ──
  { pattern: /\bmany experts agree\b/i, weight: 3, category: 'vague-attribution', label: 'many experts agree' },
  { pattern: /\bstudies show\b/i, weight: 2, category: 'vague-attribution', label: 'studies show' },
  { pattern: /\bresearch suggests\b/i, weight: 2, category: 'vague-attribution', label: 'research suggests' },
];
