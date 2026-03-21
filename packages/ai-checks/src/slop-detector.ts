import { SLOP_PATTERNS } from './slop-patterns';

export interface SlopMatch {
  pattern: string;
  category: string;
  weight: number;
  position: number;
}

export type SlopVerdict = 'natural' | 'mild' | 'moderate' | 'high' | 'obvious';

export interface SlopResult {
  score: number;
  verdict: SlopVerdict;
  matches: SlopMatch[];
}

/**
 * Map a raw weight sum to a 0-100 score using bracket-based linear interpolation.
 *
 *   0-3  total weight  ->  0-20  score  (natural)
 *   4-8                ->  21-40         (mild)
 *   9-15               ->  41-60         (moderate)
 *  16-25               ->  61-80         (high)
 *  26+                 ->  81-100        (obvious)
 */
function weightToScore(totalWeight: number): number {
  if (totalWeight <= 0) return 0;

  const brackets: Array<{ minW: number; maxW: number; minS: number; maxS: number }> = [
    { minW: 0, maxW: 3, minS: 0, maxS: 20 },
    { minW: 4, maxW: 8, minS: 21, maxS: 40 },
    { minW: 9, maxW: 15, minS: 41, maxS: 60 },
    { minW: 16, maxW: 25, minS: 61, maxS: 80 },
    { minW: 26, maxW: 50, minS: 81, maxS: 100 },
  ];

  for (const b of brackets) {
    if (totalWeight <= b.maxW) {
      const t = (totalWeight - b.minW) / (b.maxW - b.minW);
      return Math.round(b.minS + t * (b.maxS - b.minS));
    }
  }

  return 100;
}

function scoreToVerdict(score: number): SlopVerdict {
  if (score <= 20) return 'natural';
  if (score <= 40) return 'mild';
  if (score <= 60) return 'moderate';
  if (score <= 80) return 'high';
  return 'obvious';
}

/**
 * Detect AI "slop" patterns in text and return a heuristic score.
 */
export function detectSlopHeuristic(text: string): SlopResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, verdict: 'natural', matches: [] };
  }

  const matches: SlopMatch[] = [];

  for (const entry of SLOP_PATTERNS) {
    // Special handling for em dash counting: only trigger if >= 3 occurrences
    if (entry.label === 'excessive em dashes') {
      const emDashMatches = text.match(/\u2014/g);
      if (emDashMatches && emDashMatches.length >= 3) {
        const firstIndex = text.indexOf('\u2014');
        matches.push({
          pattern: entry.label,
          category: entry.category,
          weight: entry.weight,
          position: firstIndex,
        });
      }
      continue;
    }

    const match = entry.pattern.exec(text);
    if (match) {
      matches.push({
        pattern: entry.label,
        category: entry.category,
        weight: entry.weight,
        position: match.index,
      });
    }
  }

  const totalWeight = matches.reduce((sum, m) => sum + m.weight, 0);
  const score = weightToScore(totalWeight);
  const verdict = scoreToVerdict(score);

  return { score, verdict, matches };
}
