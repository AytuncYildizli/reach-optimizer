import { describe, it, expect } from 'vitest';
import { ScoreEngine } from '../engine';
import { allClientRules } from '../all-client-rules';

describe('allClientRules registry', () => {
  it('contains 15 rules', () => {
    expect(allClientRules).toHaveLength(15);
  });

  it('every rule has required fields', () => {
    for (const rule of allClientRules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.category).toBeTruthy();
      expect(typeof rule.evaluate).toBe('function');
    }
  });

  it('has no duplicate rule ids', () => {
    const ids = allClientRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ScoreEngine with all client rules', () => {
  const engine = new ScoreEngine(allClientRules);

  it('plain "Hello world" scores base 50 (negative categories clamped to 0)', () => {
    const result = engine.evaluate({
      text: 'Hello world',
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // Short text: hookLength -2 (structure, clamped to 0), charLength -2 (structure, clamped to 0),
    // no CTA -3 (engagement, clamped to 0). All negative per-category values clamp to 0.
    // Final = 50 + 0 + 0 + 0 + 0 + 0 = 50
    expect(result.reachScore).toBe(50);
    expect(result.tier).toBe('below_average');
  });

  it('heavily penalized tweet: generic hook + link + engagement bait', () => {
    const text =
      "Here's why you should check this https://example.com Like if you agree";
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // Generic hook -4 (hook, clamped to 0), link -10 (penalty), engagement bait -6 (penalty)
    // Penalties = -16, clamped to max -30 -> -16
    // Score = 50 + penalties(-16) = 34 + any positive categories
    expect(result.reachScore).toBeLessThanOrEqual(45);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('well-optimized tweet: first person + number + good length + CTA', () => {
    const text =
      "I spent 6 months building this and went from $0 to $50k ARR. Here's what I learned — what's your biggest challenge with building in public?";
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // firstPerson +4 (bonus), numberData +4 (hook), CTA +6 (engagement),
    // questionType +3 (engagement), good char length (101-280 = +2 structure),
    // hookLength 41-100 = +4 (structure), bookmarkValue possibly triggered
    // Score should be well above base 50
    expect(result.reachScore).toBeGreaterThanOrEqual(60);
  });

  it('thread with good length gets structure bonus', () => {
    const result = engine.evaluate({
      text: 'A great thread about building startups and scaling revenue',
      platform: 'x',
      isThread: true,
      threadLength: 8,
      hasMedia: false,
    });
    // threadLength 7-12 -> +4 structure
    expect(result.breakdown.structure).toBeGreaterThan(0);
  });

  it('returns zero critical suggestions for a well-crafted tweet', () => {
    const text =
      "I made $300k in 6 months doing this one thing differently. What's your experience?";
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    const criticals = result.suggestions.filter(
      (s) => s.severity === 'critical',
    );
    expect(criticals.length).toBe(0);
  });

  it('penalizes hashtag spam', () => {
    const text = 'Great content #one #two #three #four';
    const result = engine.evaluate({
      text,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    expect(result.breakdown.penalties).toBeLessThan(0);
  });

  it('penalizes text wall (long text, no thread, no line breaks)', () => {
    const longText = 'A'.repeat(300);
    const result = engine.evaluate({
      text: longText,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    // textWall -4 (penalty), charLength -3 (structure, clamped to 0)
    expect(result.breakdown.penalties).toBeLessThan(0);
  });
});
